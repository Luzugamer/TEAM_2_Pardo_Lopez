import { Injectable } from '@nestjs/common';
import Ajv2020 from 'ajv/dist/2020';
import { validateForm } from '../domain/form-validation';
@Injectable()
export class FormsSchemaValidator {
  private readonly ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  validate(payload: { schema: unknown; ui_schema: unknown; consent: unknown; field_policies: unknown }): string[] {
    const errors = validateForm(payload.schema, payload.ui_schema, payload.consent, payload.field_policies);
    if (!errors.length && !this.ajv.validateSchema(payload.schema as object)) errors.push('schema is not valid JSON Schema 2020-12');
    return errors;
  }
}
