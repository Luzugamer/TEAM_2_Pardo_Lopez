export const FORM_VALIDATOR = Symbol('FORM_VALIDATOR');
export interface FormValidator { validate(payload: { schema: unknown; ui_schema: unknown; consent: unknown; field_policies: unknown }): string[]; }
