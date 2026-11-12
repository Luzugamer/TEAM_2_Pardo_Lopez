import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { IncomingHttpHeaders } from 'node:http';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';
import { TenantClaims } from './tenant-claims.interface';
import { ProblemDetailsException } from '../errors/problem-details.exception';
import { validateTenantClaims } from './validate-tenant-claims';

// The implementation must derive claims from verified credentials; only the local mock reads x-dev-actor.
export interface ClaimsRequest {
  headers: IncomingHttpHeaders;
  ip?: string;
}
export interface ClaimsProvider {
  resolve(request: ClaimsRequest): TenantClaims | Promise<TenantClaims>;
}
export const CLAIMS_PROVIDER = 'CLAIMS_PROVIDER';

const actors: Record<string, Pick<TenantClaims, 'sub' | 'organization_id' | 'roles' | 'scopes'>> = {
  'org-a-manager': {
    sub: '0194eb00-0000-7000-9000-000000000001',
    organization_id: '0194eb00-0000-7000-8000-000000000001',
    roles: ['event_manager'],
    scopes: ['events:write', 'events:publish', 'events:read'],
  },
  'org-a-reader': {
    sub: '0194eb00-0000-7000-9000-000000000002',
    organization_id: '0194eb00-0000-7000-8000-000000000001',
    roles: ['report_viewer'],
    scopes: ['events:read'],
  },
  'org-b-manager': {
    sub: '0194eb00-0000-7000-9000-000000000010',
    organization_id: '0194eb00-0000-7000-8000-000000000002',
    roles: ['event_manager'],
    scopes: ['events:write', 'events:publish', 'events:read'],
  },
};

@Injectable()
export class MockClaimsProvider implements ClaimsProvider {
  resolve(request: ClaimsRequest): TenantClaims {
    const actorId = request.headers['x-dev-actor'];
    const actor = typeof actorId === 'string' && Object.prototype.hasOwnProperty.call(actors, actorId) ? actors[actorId] : undefined;
    if (!actor) {
      throw ProblemDetailsException.unauthorized('Unknown development actor.');
    }
    return {
      ...actor,
      request_id: request.headers['x-request-id'] as string | undefined,
      client_ip: request.ip,
      user_agent: request.headers['user-agent'] as string | undefined,
    };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Inject(CLAIMS_PROVIDER) private readonly claimsProvider: ClaimsProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const claims = validateTenantClaims(await this.claimsProvider.resolve(request));
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredScopes?.length || !requiredScopes.some((scope) => claims.scopes.includes(scope))) {
      throw ProblemDetailsException.forbidden('Insufficient permissions.');
    }
    request.user = claims;
    return true;
  }
}
