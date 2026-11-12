import { Injectable } from '@nestjs/common';
import { sql, RawBuilder } from 'kysely';
import { DatabaseService } from '../../shared/database/database.service';
import { generateUuidV7 } from '../../shared/crypto/uuidv7';
import { FormsRepository, FormDefinition, FormVersion, FormBinding, FormDraft, BindingInput } from '../domain/ports/forms-repository.port';

@Injectable()
export class FormsPgRepository implements FormsRepository {
  constructor(private readonly db: DatabaseService) {}
  private async one<T>(org: string, query: RawBuilder<T>): Promise<T | undefined> {
    return this.db.withTenantTransaction(org, async trx => (await query.execute(trx)).rows[0]);
  }
  private async many<T>(org: string, query: RawBuilder<T>): Promise<T[]> {
    return this.db.withTenantTransaction(org, async trx => (await query.execute(trx)).rows);
  }
  createDefinition(org: string, actor: string, name: string, purpose: string) {
    return this.one(org, sql<FormDefinition>`INSERT INTO events.form_definitions (id,organization_id,name,purpose,created_by) VALUES (${generateUuidV7()},${org},${name},${purpose},${actor}) RETURNING *`);
  }
  listDefinitions(org: string) { return this.many(org, sql<FormDefinition>`SELECT * FROM events.form_definitions WHERE organization_id=${org} ORDER BY created_at,id LIMIT 100`); }
  getDefinition(org: string, id: string) { return this.one(org, sql<FormDefinition>`SELECT * FROM events.form_definitions WHERE organization_id=${org} AND id=${id}::uuid`); }
  createVersion(org: string, actor: string, definitionId: string, payload: FormDraft) {
    return this.one(org, sql<FormVersion>`INSERT INTO events.form_versions (id,organization_id,form_definition_id,version_number,schema,ui_schema,consent,field_policies,created_by)
      SELECT ${generateUuidV7()},${org},${definitionId}::uuid,COALESCE(MAX(v.version_number),0)+1,${JSON.stringify(payload.schema)}::jsonb,${JSON.stringify(payload.ui_schema)}::jsonb,${JSON.stringify(payload.consent)}::jsonb,${JSON.stringify(payload.field_policies)}::jsonb,${actor}
      FROM events.form_versions v WHERE v.organization_id=${org} AND v.form_definition_id=${definitionId}::uuid RETURNING *`);
  }
  listVersions(org: string, definitionId: string) { return this.many(org, sql<FormVersion>`SELECT * FROM events.form_versions WHERE organization_id=${org} AND form_definition_id=${definitionId}::uuid ORDER BY version_number`); }
  getBinding(org: string, id: string) { return this.one(org, sql<FormBinding>`SELECT * FROM events.form_bindings WHERE organization_id=${org} AND id=${id}::uuid`); }
  getVersion(org: string, id: string) { return this.one(org, sql<FormVersion>`SELECT * FROM events.form_versions WHERE organization_id=${org} AND id=${id}::uuid`); }
  updateVersion(org: string, id: string, revision: number, payload: FormDraft) {
    return this.one(org, sql<FormVersion>`UPDATE events.form_versions SET schema=${JSON.stringify(payload.schema)}::jsonb,ui_schema=${JSON.stringify(payload.ui_schema)}::jsonb,consent=${JSON.stringify(payload.consent)}::jsonb,field_policies=${JSON.stringify(payload.field_policies)}::jsonb,revision=revision+1,updated_at=clock_timestamp()
      WHERE organization_id=${org} AND id=${id}::uuid AND status='draft' AND revision=${revision} RETURNING *`);
  }
  publishVersion(org: string, id: string, revision: number, hashes: { schema: string; ui: string; consent: string }) {
    return this.one(org, sql<FormVersion>`UPDATE events.form_versions SET status='published',schema_hash=${hashes.schema},ui_hash=${hashes.ui},consent_hash=${hashes.consent},published_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 WHERE organization_id=${org} AND id=${id}::uuid AND status='draft' AND revision=${revision} RETURNING *`);
  }
  createBinding(org: string, actor: string, eventId: string, payload: BindingInput) {
    return this.one(org, sql<FormBinding>`INSERT INTO events.form_bindings (id,organization_id,event_id,form_version_id,purpose,status,opens_at,closes_at,created_by)
      SELECT ${generateUuidV7()},${org},e.id,v.id,${payload.purpose},${payload.status},${payload.opens_at}::timestamptz,${payload.closes_at}::timestamptz,${actor}
      FROM events.events e JOIN events.form_versions v ON v.organization_id=e.organization_id JOIN events.form_definitions d ON d.organization_id=v.organization_id AND d.id=v.form_definition_id
      WHERE e.organization_id=${org} AND e.id=${eventId}::uuid AND v.id=${payload.form_version_id}::uuid AND v.status='published' AND d.purpose=${payload.purpose} RETURNING *`);
  }
  listBindings(org: string, eventId: string) { return this.many(org, sql<FormBinding>`SELECT * FROM events.form_bindings WHERE organization_id=${org} AND event_id=${eventId}::uuid ORDER BY created_at,id LIMIT 100`); }
  transitionBinding(org: string, id: string, revision: number, from: string, to: string, reason: string | null) { return this.one(org, sql<FormBinding>`UPDATE events.form_bindings SET status=${to},close_reason=${reason},revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=${org} AND id=${id}::uuid AND status=${from} AND revision=${revision} RETURNING *`); }
  closeBinding(org: string, id: string, revision: number, reason: string) { return this.one(org, sql<FormBinding>`UPDATE events.form_bindings SET status='closed',close_reason=${reason},revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=${org} AND id=${id}::uuid AND status='open' AND revision=${revision} RETURNING *`); }
  async audit(org: string, actor: string, roles: string[], entity: string, id: string, action: string) {
    await this.db.withTenantTransaction(org, trx => sql`INSERT INTO events.audit (organization_id,entity_type,entity_id,action,actor_id,actor_roles) VALUES (${org},${entity},${id}::uuid,${action},${actor},${roles})`.execute(trx));
  }
}
