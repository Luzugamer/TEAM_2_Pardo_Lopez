import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard, ClaimsProvider, MockClaimsProvider } from './auth.guard';
import { selectClaimsProvider } from './claims-selection';
import { TenantClaims } from './tenant-claims.interface';

const valid: TenantClaims = { sub: '0194eb00-0000-7000-9000-000000000001', organization_id: '0194eb00-0000-7000-8000-000000000001', roles: ['event_manager'], scopes: ['events:write'] };
function setup(provider: ClaimsProvider, scopes?: string[]) {
  const request: { headers: Record<string, string>; user?: TenantClaims } = { headers: { 'x-dev-actor': 'org-a-manager', 'x-organization-id': '0194eb00-0000-7000-8000-000000000002' } };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => function handler() {}, getClass: () => class Controller {} } as unknown as ExecutionContext;
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(scopes);
  return { guard: new AuthGuard(reflector, provider), ctx, request };
}
const status = (code: number) => expect.objectContaining({ status: code });

describe('claims provider selection', () => {
  const mock = new MockClaimsProvider();
  it('requires explicit mock in development or test', () => {
    expect(selectClaimsProvider({ AUTH_MODE: 'mock', NODE_ENV: 'development' }, mock)).toBe(mock);
    expect(selectClaimsProvider({ AUTH_MODE: 'mock', NODE_ENV: 'test' }, mock)).toBe(mock);
    for (const env of [{}, { NODE_ENV: 'production', AUTH_MODE: 'mock' }, { NODE_ENV: 'development', AUTH_MODE: 'unknown' }]) {
      expect(() => selectClaimsProvider(env, mock)).toThrow();
    }
  });
  it('rejects unknown actor names including inherited object keys', () => {
    expect(() => mock.resolve({ headers: { 'x-dev-actor': 'constructor' } })).toThrow();
  });
});

describe('authorization guard', () => {
  it('accepts asynchronous claims, uses OR scopes, and ignores an untrusted tenant header', async () => {
    const { guard, ctx, request } = setup({ resolve: async () => valid }, ['events:read', 'events:write']);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user?.organization_id).toBe(valid.organization_id);
  });
  it('denies missing scope and missing or empty policy metadata', async () => {
    for (const scopes of [['events:publish'], undefined, []]) {
      const { guard, ctx } = setup({ resolve: () => valid }, scopes);
      await expect(guard.canActivate(ctx)).rejects.toEqual(status(403));
    }
  });
  it('denies missing, malformed or ambiguous identity claims', async () => {
    for (const claims of [null, {}, { ...valid, sub: 'bad' }, { ...valid, organization_id: 'bad' }, { ...valid, scopes: ['events:write', 'events:write'] }, { ...valid, roles: 'owner' }, { ...valid, scopes: [''] }]) {
      const { guard, ctx } = setup({ resolve: async () => claims as TenantClaims }, ['events:write']);
      await expect(guard.canActivate(ctx)).rejects.toEqual(status(401));
    }
  });
  it('propagates provider failure without falling back to the development actor', async () => {
    const failure = new Error('provider unavailable');
    const { guard, ctx, request } = setup({ resolve: async () => { throw failure; } }, ['events:write']);
    await expect(guard.canActivate(ctx)).rejects.toBe(failure);
    expect(request.user).toBeUndefined();
  });
  it('does not grant write access to the fixed reader', async () => {
    const provider = new MockClaimsProvider();
    const { guard, ctx, request } = setup(provider, ['events:write']);
    request.headers['x-dev-actor'] = 'org-a-reader';
    await expect(guard.canActivate(ctx)).rejects.toEqual(status(403));
  });
});
