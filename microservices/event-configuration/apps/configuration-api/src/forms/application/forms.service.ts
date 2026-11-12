import { Inject, Injectable } from '@nestjs/common';
import {
  FORMS_REPOSITORY,
  FormsRepository,
  FormDraft,
  FormVersion,
  BindingInput,
} from '../domain/ports/forms-repository.port';
import { FORM_VALIDATOR, FormValidator } from './form-validator.port';
import { computeSha256 } from '../../shared/crypto/canonical-json';
import { DomainException } from '../../shared/errors/domain.exception';
import {
  SERIALIZABLE_TRANSACTION,
  SerializableTransaction,
} from '../../shared/application/serializable-transaction.port';
import { TenantClaims } from '../../shared/auth/tenant-claims.interface';

@Injectable()
export class FormsService {
  constructor(
    @Inject(FORMS_REPOSITORY) private readonly repo: FormsRepository,
    @Inject(FORM_VALIDATOR) private readonly validator: FormValidator,
    @Inject(SERIALIZABLE_TRANSACTION)
    private readonly transaction: SerializableTransaction,
  ) {}

  createForm(c: TenantClaims, dto: { name: string; purpose: string }) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.createFormInTransaction(c, dto),
    );
  }

  createVersion(c: TenantClaims, id: string, dto: FormDraft) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.createVersionInTransaction(c, id, dto),
    );
  }

  updateVersion(c: TenantClaims, id: string, rev: number, dto: FormDraft) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.updateVersionInTransaction(c, id, rev, dto),
    );
  }

  publish(c: TenantClaims, id: string, rev: number, hash: string) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.publishInTransaction(c, id, rev, hash),
    );
  }

  createBinding(c: TenantClaims, id: string, dto: BindingInput) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.createBindingInTransaction(c, id, dto),
    );
  }

  transition(
    c: TenantClaims,
    id: string,
    rev: number,
    target: 'open' | 'cancelled',
    reason?: string,
  ) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.transitionInTransaction(c, id, rev, target, reason),
    );
  }

  close(c: TenantClaims, id: string, rev: number, reason: string) {
    return this.transaction.withSerializableTransaction(c.organization_id, () =>
      this.closeInTransaction(c, id, rev, reason),
    );
  }

  private missing<T>(value: T | undefined, label: string): T {
    if (!value) {
      throw DomainException.notFound(`${label} not found.`);
    }
    return value;
  }

  private ensureDraft(version: FormVersion, revision: number) {
    if (version.status !== 'draft') {
      throw DomainException.conflict('Form version is not a draft.', 'invalid_state_transition');
    }
    if (Number(version.revision) !== revision) {
      throw DomainException.preconditionFailed('Form revision is stale.');
    }
  }

  private ensureSize(payload: unknown) {
    if (JSON.stringify(payload).length > 65536) {
      throw DomainException.badRequest('Form draft is too large.');
    }
  }

  private checks(payload: FormDraft) {
    return this.validator.validate(payload);
  }

  private async audit(c: TenantClaims, entity: string, id: string, action: string) {
    await this.repo.audit(c.organization_id, c.sub, c.roles, entity, id, action);
  }

  private async createFormInTransaction(c: TenantClaims, dto: { name: string; purpose: string }) {
    if (!dto.name.trim()) {
      throw DomainException.badRequest('Name is required.');
    }
    const row = this.missing(
      await this.repo.createDefinition(c.organization_id, c.sub, dto.name.trim(), dto.purpose),
      'Form',
    );
    await this.audit(c, 'form_definition', row.id, 'FORM_CREATED');
    return row;
  }

  listForms(c: TenantClaims) {
    return this.repo.listDefinitions(c.organization_id);
  }

  async getForm(c: TenantClaims, id: string) {
    return this.missing(await this.repo.getDefinition(c.organization_id, id), 'Form');
  }

  private async createVersionInTransaction(c: TenantClaims, id: string, dto: FormDraft) {
    this.ensureSize(dto);
    await this.getForm(c, id);
    const row = this.missing(
      await this.repo.createVersion(c.organization_id, c.sub, id, dto),
      'Form version',
    );
    await this.audit(c, 'form_version', row.id, 'FORM_VERSION_CREATED');
    return row;
  }

  async listVersions(c: TenantClaims, id: string) {
    await this.getForm(c, id);
    return this.repo.listVersions(c.organization_id, id);
  }

  async getVersion(c: TenantClaims, id: string) {
    return this.missing(await this.repo.getVersion(c.organization_id, id), 'Form version');
  }

  private async updateVersionInTransaction(
    c: TenantClaims,
    id: string,
    rev: number,
    dto: FormDraft,
  ) {
    this.ensureSize(dto);
    const current = await this.getVersion(c, id);
    this.ensureDraft(current, rev);
    const row = await this.repo.updateVersion(c.organization_id, id, rev, dto);
    if (!row) {
      throw DomainException.preconditionFailed('Form revision is stale.');
    }
    await this.audit(c, 'form_version', row.id, 'FORM_VERSION_UPDATED');
    return row;
  }

  async validate(c: TenantClaims, id: string) {
    const row = await this.getVersion(c, id);
    const errors = this.checks(row);
    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
      expected_hash: computeSha256({
        schema: row.schema,
        ui_schema: row.ui_schema,
        consent: row.consent,
        field_policies: row.field_policies,
      }),
    };
  }

  private async publishInTransaction(
    c: TenantClaims,
    id: string,
    rev: number,
    expectedHash: string,
  ) {
    const current = await this.getVersion(c, id);
    this.ensureDraft(current, rev);
    const result = await this.validate(c, id);
    if (!result.valid) {
      throw DomainException.unprocessable(
        'Form validation failed.',
        result.errors.map((reason) => ({ name: 'schema', reason })),
      );
    }
    if (result.expected_hash !== expectedHash) {
      throw DomainException.preconditionFailed('Form hash does not match the validated draft.');
    }
    const row = await this.repo.publishVersion(c.organization_id, id, rev, {
      schema: computeSha256(current.schema),
      ui: computeSha256(current.ui_schema),
      consent: computeSha256(current.consent),
    });
    if (!row) {
      throw DomainException.preconditionFailed('Form revision is stale.');
    }
    await this.audit(c, 'form_version', id, 'FORM_VERSION_PUBLISHED');
    return row;
  }

  private async createBindingInTransaction(c: TenantClaims, eventId: string, dto: BindingInput) {
    if (Date.parse(dto.opens_at) >= Date.parse(dto.closes_at)) {
      throw DomainException.badRequest('Binding window must have start before end.');
    }
    const replacementRequested =
      dto.replace_binding_id !== undefined ||
      dto.replace_revision !== undefined ||
      dto.replace_reason !== undefined;
    if (replacementRequested) {
      if (
        !dto.replace_binding_id ||
        !dto.replace_revision ||
        !dto.replace_reason?.trim() ||
        dto.status !== 'open'
      ) {
        throw DomainException.badRequest(
          'Replacement requires an open binding, revision and reason.',
        );
      }
      const prior = this.missing(
        await this.repo.getBinding(c.organization_id, dto.replace_binding_id),
        'Binding',
      );
      if (prior.event_id !== eventId || prior.purpose !== dto.purpose || prior.status !== 'open') {
        throw DomainException.conflict(
          'Replacement binding does not match event and purpose.',
          'invalid_state_transition',
        );
      }
      if (Number(prior.revision) !== dto.replace_revision) {
        throw DomainException.preconditionFailed('Binding revision is stale.');
      }
      const closed = await this.repo.closeBinding(
        c.organization_id,
        prior.id,
        dto.replace_revision,
        dto.replace_reason,
      );
      if (!closed) {
        throw DomainException.preconditionFailed('Binding revision is stale.');
      }
      await this.audit(c, 'form_binding', prior.id, 'FORM_BINDING_CLOSED');
    }
    try {
      const row = await this.repo.createBinding(c.organization_id, c.sub, eventId, dto);
      if (!row) {
        throw DomainException.unprocessable(
          'Event or published form version not found, or purpose mismatch.',
        );
      }
      await this.audit(c, 'form_binding', row.id, 'FORM_BINDING_CREATED');
      return row;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'uq_form_binding_open'
      ) {
        throw DomainException.conflict('An open binding already exists for this purpose.');
      }
      throw error;
    }
  }

  listBindings(c: TenantClaims, eventId: string) {
    return this.repo.listBindings(c.organization_id, eventId);
  }

  private async transitionInTransaction(
    c: TenantClaims,
    id: string,
    revision: number,
    target: 'open' | 'cancelled',
    reason?: string,
  ) {
    const current = this.missing(await this.repo.getBinding(c.organization_id, id), 'Binding');
    if (Number(current.revision) !== revision) {
      throw DomainException.preconditionFailed('Binding revision is stale.');
    }
    if (!(
      current.status === 'scheduled' ||
      (current.status === 'open' && target === 'cancelled')
    )) {
      throw DomainException.conflict('Invalid binding transition.', 'invalid_state_transition');
    }
    try {
      const row = await this.repo.transitionBinding(
        c.organization_id,
        id,
        revision,
        current.status,
        target,
        reason || null,
      );
      if (!row) {
        throw DomainException.preconditionFailed('Binding revision is stale.');
      }
      await this.audit(
        c,
        'form_binding',
        id,
        target === 'open' ? 'FORM_BINDING_OPENED' : 'FORM_BINDING_CANCELLED',
      );
      return row;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'uq_form_binding_open'
      ) {
        throw DomainException.conflict('An open binding already exists for this purpose.');
      }
      throw error;
    }
  }

  private async closeInTransaction(c: TenantClaims, id: string, revision: number, reason: string) {
    const current = this.missing(await this.repo.getBinding(c.organization_id, id), 'Binding');
    if (Number(current.revision) !== revision) {
      throw DomainException.preconditionFailed('Binding revision is stale.');
    }
    if (current.status !== 'open') {
      throw DomainException.conflict('Binding is not open.', 'invalid_state_transition');
    }
    const row = await this.repo.closeBinding(c.organization_id, id, revision, reason);
    if (!row) {
      throw DomainException.conflict(
        'Binding is missing, stale or not open.',
        'invalid_state_transition',
      );
    }
    await this.audit(c, 'form_binding', row.id, 'FORM_BINDING_CLOSED');
    return row;
  }
}
