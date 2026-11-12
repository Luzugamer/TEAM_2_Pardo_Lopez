export type RecordData = Record<string, any>;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function request(actor: string, path: string, options: { method?: string; body?: unknown; revision?: number } = {}) {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'x-dev-actor': actor, Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method === 'POST' || method === 'DELETE') headers['Idempotency-Key'] = crypto.randomUUID();
  if (options.revision !== undefined) headers['If-Match'] = `"${options.revision}"`;
  const response = await fetch(`/configuration/v1${path}`, {
    method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || `Error HTTP ${response.status}`;
    throw new ApiError(Array.isArray(detail) ? detail.join('; ') : String(detail), response.status);
  }
  return payload;
}

export function items(value: any): RecordData[] {
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}

export function displayDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
