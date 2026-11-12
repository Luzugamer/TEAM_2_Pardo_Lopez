export type JsonObject = Record<string, unknown>;
const own = (x: unknown): x is JsonObject => !!x && typeof x === 'object' && !Array.isArray(x);
const allowedTypes = new Set(['string', 'number', 'integer', 'boolean', 'array']);
const allowedPatterns = new Set(['^[A-Za-z0-9 _.-]+$', '^[0-9]+$']);
const fieldKeys = new Set(['type', 'title', 'description', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum', 'pattern', 'items']);
const classifications = new Set(['publica', 'interna', 'confidencial', 'restringida']);

/** A deliberately small declarative subset: no remote references or executable UI. */
export function validateForm(schema: unknown, ui: unknown, consent: unknown, policies: unknown): string[] {
  const errors: string[] = [];
  if (!own(schema) || JSON.stringify(schema).length > 32768) return ['schema must be an object of at most 32768 characters'];
  if (Object.keys(schema).some(k => !['$schema', 'type', 'properties', 'required', 'additionalProperties'].includes(k))) errors.push('unsupported schema keyword');
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' || schema.type !== 'object' || !own(schema.properties)) return [...errors, 'schema must declare draft 2020-12, object type and properties'];
  const names = Object.keys(schema.properties);
  if (!names.length || names.length > 50) errors.push('schema requires 1 to 50 fields');
  for (const name of names) {
    const field = schema.properties[name];
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(name) || !own(field) || !allowedTypes.has(String(field.type))) { errors.push(`invalid field: ${name}`); continue; }
    if (Object.keys(field).some(k => !fieldKeys.has(k))) errors.push(`unsupported keyword: ${name}`);
    if (field.pattern !== undefined && (typeof field.pattern !== 'string' || !allowedPatterns.has(field.pattern))) errors.push(`unsupported pattern: ${name}`);
    if (field.type === 'array' && (!own(field.items) || Object.keys(field.items).some(k => !['type','enum'].includes(k)) || field.items.type !== 'string' || !Array.isArray(field.items.enum) || !field.items.enum.length || field.items.enum.length > 50 || field.items.enum.some(v => typeof v !== 'string'))) errors.push(`invalid array options: ${name}`);
    if (field.type !== 'array' && field.items !== undefined) errors.push(`invalid items: ${name}`);
    for (const key of ['minLength','maxLength','minimum','maximum']) if (field[key] !== undefined && (typeof field[key] !== 'number' || !Number.isFinite(field[key]))) errors.push(`invalid ${key}: ${name}`);
    if (field.enum !== undefined && (!Array.isArray(field.enum) || field.enum.length < 1 || field.enum.length > 50 || field.enum.some(v => !['string','number','boolean'].includes(typeof v)))) errors.push(`invalid enum: ${name}`);
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(x => typeof x !== 'string' || !names.includes(x)) || new Set(schema.required).size !== schema.required.length)) errors.push('invalid required fields');
  if (!own(ui) || JSON.stringify(ui).length > 16384 || Object.keys(ui).some(k => k !== 'order') || (ui.order !== undefined && (!Array.isArray(ui.order) || ui.order.some(x => typeof x !== 'string' || !names.includes(x)) || new Set(ui.order).size !== ui.order.length))) errors.push('invalid ui schema');
  if (!own(consent) || typeof consent.text !== 'string' || !consent.text.trim() || consent.text.length > 10000 || typeof consent.version !== 'string' || !consent.version.trim() || consent.version.length > 100 || Object.keys(consent).some(k => !['text','version'].includes(k))) errors.push('consent text and version are required');
  if (!own(policies) || Object.keys(policies).some(k => !names.includes(k))) errors.push('invalid field policies');
  for (const name of names) {
    const policy = own(policies) ? policies[name] : undefined;
    if (!own(policy) || typeof policy.purpose !== 'string' || !policy.purpose.trim() || !classifications.has(String(policy.classification)) || typeof policy.retention !== 'string' || !policy.retention.trim() || !Array.isArray(policy.export_allowlist) || policy.export_allowlist.some(x => typeof x !== 'string' || !x.trim()) || Object.keys(policy).some(k => !['purpose','classification','retention','export_allowlist'].includes(k))) errors.push(`missing or invalid policy: ${name}`);
  }
  return errors;
}
