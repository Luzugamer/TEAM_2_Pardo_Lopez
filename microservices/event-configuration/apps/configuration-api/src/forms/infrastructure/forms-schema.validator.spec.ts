import { describe, expect, it } from 'vitest';
import { computeSha256 } from '../../shared/crypto/canonical-json';
import { FormsSchemaValidator } from './forms-schema.validator';
const valid = () => ({ schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { name: { type: 'string', minLength: 1 } }, required: ['name'] }, ui_schema: { order: ['name'] }, consent: { text: 'Texto ficticio', version: 'demo' }, field_policies: { name: { purpose: 'registro', classification: 'interna', retention: 'policy', export_allowlist: [] } } });
describe('form schema validation', () => {
  const validator = new FormsSchemaValidator();
  it('keeps hashes stable when object keys are reordered', () => { expect(computeSha256({ nombre: 'José', limite: 1.5 })).toBe(computeSha256({ limite: 1.5, nombre: 'José' })); });
  it('accepts the documented declarative subset', () => expect(validator.validate(valid())).toEqual([]));
  it('rejects remote references and executable UI', () => { const value: any = valid(); value.schema.properties.name.$ref = 'https://evil.test/schema'; value.ui_schema.script = 'alert(1)'; expect(validator.validate(value).length).toBeGreaterThan(0); });
  it('requires a field privacy policy and consent', () => { const value: any = valid(); value.field_policies = {}; value.consent.text = ''; expect(validator.validate(value)).toContain('missing or invalid policy: name'); });
  it('rejects dangerous or unapproved patterns and malformed schemas', () => { const value: any = valid(); value.schema.properties.name.pattern = '(a+)+$'; value.schema.properties.name.minLength = -1; expect(validator.validate(value).length).toBeGreaterThan(0); });
});
