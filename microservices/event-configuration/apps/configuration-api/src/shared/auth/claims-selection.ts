import { ClaimsProvider } from './auth.guard';

/** Only the explicit development adapter is available until a verified provider is integrated. */
export function selectClaimsProvider(env: NodeJS.ProcessEnv, mock: ClaimsProvider): ClaimsProvider {
  if (env.AUTH_MODE === 'mock' && (env.NODE_ENV === 'development' || env.NODE_ENV === 'test')) return mock;
  if (env.AUTH_MODE === 'mock') throw new Error('AUTH_MODE=mock is restricted to development or test.');
  throw new Error('A verified identity provider is not configured.');
}
