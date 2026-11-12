export const FORMS_REPOSITORY = Symbol('FORMS_REPOSITORY');
export interface FormDraft { schema: Record<string, unknown>; ui_schema: Record<string, unknown>; consent: Record<string, unknown>; field_policies: Record<string, unknown>; }
export interface FormDefinition { id: string; organization_id: string; name: string; purpose: string; revision: number; }
export interface FormVersion extends FormDraft { id: string; organization_id: string; form_definition_id: string; version_number: number; revision: number; status: 'draft' | 'published' | 'retired'; }
export interface FormBinding { id: string; organization_id: string; event_id: string; form_version_id: string; purpose: string; revision: number; status: 'scheduled' | 'open' | 'closed' | 'cancelled'; }
export interface BindingInput { form_version_id: string; purpose: string; status: string; opens_at: string; closes_at: string; replace_binding_id?: string; replace_revision?: number; replace_reason?: string; }
export interface FormsRepository {
  createDefinition(org: string, actor: string, name: string, purpose: string): Promise<FormDefinition | undefined>;
  listDefinitions(org: string): Promise<FormDefinition[]>;
  getDefinition(org: string, id: string): Promise<FormDefinition | undefined>;
  createVersion(org: string, actor: string, definitionId: string, payload: FormDraft): Promise<FormVersion | undefined>;
  getVersion(org: string, id: string): Promise<FormVersion | undefined>;
  listVersions(org: string, definitionId: string): Promise<FormVersion[]>;
  getBinding(org: string, id: string): Promise<FormBinding | undefined>;
  updateVersion(org: string, id: string, revision: number, payload: FormDraft): Promise<FormVersion | undefined>;
  publishVersion(org: string, id: string, revision: number, hashes: { schema: string; ui: string; consent: string }): Promise<FormVersion | undefined>;
  createBinding(org: string, actor: string, eventId: string, payload: BindingInput): Promise<FormBinding | undefined>;
  listBindings(org: string, eventId: string): Promise<FormBinding[]>;
  transitionBinding(org: string, id: string, revision: number, from: string, to: string, reason: string | null): Promise<FormBinding | undefined>;
  closeBinding(org: string, id: string, revision: number, reason: string): Promise<FormBinding | undefined>;
  audit(org: string, actor: string, roles: string[], entity: string, id: string, action: string): Promise<void>;
}
