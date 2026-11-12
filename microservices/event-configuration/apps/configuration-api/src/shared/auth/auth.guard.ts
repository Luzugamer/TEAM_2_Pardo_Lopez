import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_NEXO_JWT_SCOPES = ['events:write', 'events:publish', 'events:read'];

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

function readBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const authHeader = headers.authorization;
  if (typeof authHeader !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim() || undefined;
}

function verifyNexoHs256Jwt(
  token: string,
  secret: string,
): { sub: string; sid?: string; exp: number; roles?: string[]; scopes?: string[] } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw ProblemDetailsException.unauthorized('Invalid bearer token format.');
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const expectedSig = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(signaturePart, 'base64url');
  } catch {
    throw ProblemDetailsException.unauthorized('Invalid bearer token signature.');
  }
  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    throw ProblemDetailsException.unauthorized('Invalid bearer token signature.');
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw ProblemDetailsException.unauthorized('Invalid bearer token payload.');
  }
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
    throw ProblemDetailsException.unauthorized('Incomplete bearer token claims.');
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw ProblemDetailsException.unauthorized('Bearer token has expired.');
  }
  return {
    sub: payload.sub,
    sid: typeof payload.sid === 'string' ? payload.sid : undefined,
    exp: payload.exp,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : undefined,
    scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : undefined,
  };
}

@Injectable()
export class NexoJwtClaimsProvider implements ClaimsProvider {
  constructor(private readonly secret: string) {
    if (!secret) {
      throw new Error('NEXO_JWT_SECRET is required when AUTH_MODE=nexo_jwt.');
    }
  }

  resolve(request: ClaimsRequest): TenantClaims {
    const token = readBearerToken(request.headers);
    if (!token) {
      throw ProblemDetailsException.unauthorized('Missing bearer token.');
    }
    const jwtClaims = verifyNexoHs256Jwt(token, this.secret);
    const tenantId = request.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || !UUID.test(tenantId)) {
      throw ProblemDetailsException.unauthorized('Missing or invalid X-Tenant-Id header.');
    }
    return {
      sub: jwtClaims.sub,
      organization_id: tenantId,
      roles: jwtClaims.roles ?? ['owner'],
      scopes: jwtClaims.scopes ?? DEFAULT_NEXO_JWT_SCOPES,
      request_id: request.headers['x-request-id'] as string | undefined,
      client_ip: request.ip,
      user_agent: request.headers['user-agent'] as string | undefined,
    };
  }
}

@Injectable()
export class MockClaimsProvider implements ClaimsProvider {
  resolve(request: ClaimsRequest): TenantClaims {
    const bearer = readBearerToken(request.headers);
    if (bearer) {
      const secret = process.env.NEXO_JWT_SECRET || 'nexo-local-development-secret-change-me';
      if (bearer.split('.').length === 3) {
        return new NexoJwtClaimsProvider(secret).resolve(request);
      }
      if (bearer === 'test') {
        const tenantHeader = request.headers['x-tenant-id'];
        const orgId = typeof tenantHeader === 'string' && UUID.test(tenantHeader)
          ? tenantHeader
          : actors['org-a-manager'].organization_id;
        return {
          ...actors['org-a-manager'],
          organization_id: orgId,
          request_id: request.headers['x-request-id'] as string | undefined,
          client_ip: request.ip,
          user_agent: request.headers['user-agent'] as string | undefined,
        };
      }
      throw ProblemDetailsException.unauthorized('Invalid bearer token.');
    }
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
