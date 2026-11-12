import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from '../../shared/database/database.service';
import { computeSha256 } from '../../shared/crypto/canonical-json';
import { PublicationContext } from '../../publishing/application/ports/publication-context.interface';
import { EventStatus } from '../../events/domain/models/event-status.enum';
import { FormArtifactProviderContract } from '../../publishing/application/ports/form-artifact-provider.interface';

interface BindingSnapshotRow {
  binding_id: string; purpose: string; status: string; opens_at: Date; closes_at: Date; revision: number;
  definition_id: string; name: string; form_version_id: string; version_number: number; version_status: string;
  schema: Record<string, unknown>; ui_schema: Record<string, unknown>; consent: Record<string, unknown>;
  field_policies: Record<string, unknown>; schema_hash: string; ui_hash: string; consent_hash: string;
}
@Injectable()
export class FormsArtifactProvider implements FormArtifactProviderContract {
  constructor(private readonly database: DatabaseService) {}
  private async snapshot(context: PublicationContext) {
    return this.database.withTenantTransaction(context.organization_id, async trx => {
      const result = await sql<BindingSnapshotRow>`SELECT b.id AS binding_id,b.purpose,b.status,b.opens_at,b.closes_at,b.revision,
        d.id AS definition_id,d.name,v.id AS form_version_id,v.version_number,v.status AS version_status,
        v.schema,v.ui_schema,v.consent,v.field_policies,v.schema_hash,v.ui_hash,v.consent_hash
        FROM events.form_bindings b JOIN events.form_versions v ON v.organization_id=b.organization_id AND v.id=b.form_version_id
        JOIN events.form_definitions d ON d.organization_id=v.organization_id AND d.id=v.form_definition_id
        WHERE b.organization_id=${context.organization_id} AND b.event_id=${context.event_id}::uuid AND b.status IN ('scheduled','open','closed')
        ORDER BY b.purpose,b.opens_at,b.id`.execute(trx);
      return result.rows.map(row => ({ ...row, status: (context.target_status === EventStatus.CLOSED || context.target_status === EventStatus.CANCELLED) && row.status !== 'closed' ? 'closed' : row.status, opens_at: new Date(row.opens_at).toISOString(), closes_at: new Date(row.closes_at).toISOString() }));
    });
  }
  async validateBindings(context: PublicationContext) {
    const bindings = await this.snapshot(context);
    const errors = bindings.filter(b => b.status !== 'closed' && b.version_status !== 'published').map(b => `Binding ${b.binding_id} does not reference a published version.`);
    return { errors, warnings: ['Required form purposes depend on an event policy that is not yet defined.'] };
  }
  async buildFormArtifact(context: PublicationContext) {
    const bindings = await this.snapshot(context);
    const errors = bindings.filter(b => b.status !== 'closed' && b.version_status !== 'published').map(b => `Binding ${b.binding_id} does not reference a published version.`);
    const body = { event_id: context.event_id, schema_version: '1.0.0', bindings };
    const hash = computeSha256(body);
    return { kind: 'forms' as const, version: `v1-${hash.slice(0, 32)}`, body, hash, errors, warnings: [] };
  }
}
