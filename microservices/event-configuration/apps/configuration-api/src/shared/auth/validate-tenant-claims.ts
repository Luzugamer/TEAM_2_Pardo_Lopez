import { TenantClaims } from './tenant-claims.interface';
import { ProblemDetailsException } from '../errors/problem-details.exception';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0 && item.trim() === item)
    && new Set(value).size === value.length;
}

/** Validate the internal provider contract before authorization or database use. */
export function validateTenantClaims(value: unknown): TenantClaims {
  if (!value || typeof value !== 'object') throw ProblemDetailsException.unauthorized('Invalid identity claims.');
  const claims = value as Partial<TenantClaims>;
  if (typeof claims.sub !== 'string' || !UUID.test(claims.sub)
    || typeof claims.organization_id !== 'string' || !UUID.test(claims.organization_id)
    || !validStrings(claims.roles) || !validStrings(claims.scopes)
    || (claims.site_id !== undefined && (typeof claims.site_id !== 'string' || !UUID.test(claims.site_id)))) {
    throw ProblemDetailsException.unauthorized('Invalid identity claims.');
  }
  return claims as TenantClaims;
}
