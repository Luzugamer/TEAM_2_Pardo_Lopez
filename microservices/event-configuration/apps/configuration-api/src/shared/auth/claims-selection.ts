import { ClaimsProvider, NexoJwtClaimsProvider } from './auth.guard';

/** Selects either the verified Nexo HS256 JWT provider or the explicit local mock adapter. */
export function selectClaimsProvider(env: NodeJS.ProcessEnv, mock: ClaimsProvider): ClaimsProvider {
  if (env.AUTH_MODE === 'nexo_jwt') {
    return new NexoJwtClaimsProvider(env.NEXO_JWT_SECRET || '');
  }
  if (env.AUTH_MODE === 'mock' && (env.NODE_ENV === 'development' || env.NODE_ENV === 'test')) return mock;
  if (env.AUTH_MODE === 'mock') throw new Error('AUTH_MODE=mock is restricted to development or test.');
  throw new Error('A verified identity provider is not configured.');
}
