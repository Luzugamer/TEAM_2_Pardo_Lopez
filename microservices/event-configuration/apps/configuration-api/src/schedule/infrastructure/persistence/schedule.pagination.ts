import { ProblemDetailsException } from '../../../shared/errors/problem-details.exception';

export type CursorKind = 'venues' | 'programs' | 'sessions' | 'speakers';
export type CursorValues = [string, string] | [number, string] | [string, number, string];

interface CursorPayload {
  kind: CursorKind;
  values: CursorValues;
}

export function encodeCursor(kind: CursorKind, values: CursorValues): string {
  return Buffer.from(JSON.stringify({ kind, values } satisfies CursorPayload)).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
  expectedKind: CursorKind,
): CursorValues | null {
  if (!cursor) return null;

  try {
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid cursor encoding.');
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!isCursorPayload(decoded) || decoded.kind !== expectedKind || !validCursorValues(expectedKind, decoded.values)) {
      throw new Error('Invalid cursor shape.');
    }
    return decoded.values;
  } catch {
    throw ProblemDetailsException.badRequest('The pagination cursor is invalid.', [
      { name: 'cursor', reason: 'Must be an opaque cursor returned by this collection.' },
    ]);
  }
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.kind === 'string' && Array.isArray(payload.values);
}

function validCursorValues(kind: CursorKind, values: unknown[]): values is CursorValues {
  const isUuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (kind === 'venues' || kind === 'speakers') return values.length === 2 && typeof values[0] === 'string' && isUuid(values[1]);
  if (kind === 'programs') return values.length === 2 && Number.isSafeInteger(values[0]) && isUuid(values[1]);
  return values.length === 3
    && typeof values[0] === 'string'
    && !Number.isNaN(Date.parse(values[0]))
    && Number.isSafeInteger(values[1])
    && isUuid(values[2]);
}
