import { readLocale } from '../../core/i18n';

export interface RecordLocation {
  address?: string;
  locality?: string;
}

export interface PageInfo {
  next_cursor?: string | null;
}

export interface RecordData extends Record<string, unknown> {
  id?: string;
  title?: string;
  name?: string;
  display_name?: string;
  slug?: string;
  status?: string;
  kind?: string;
  site_id?: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  description?: string | null;
  revision?: number;
  revision_number?: number;
  public_consent?: boolean;
  public_consent_version?: string;
  version?: string;
  text?: string;
  release_id?: string;
  view?: string;
  assignment_id?: string;
  scopes?: string | string[];
  address?: string;
  locality?: string;
  location?: RecordLocation;
  next_cursor?: string | null;
  page_info?: PageInfo;
  items?: RecordData[];
}

export interface PaginatedList<T = RecordData> {
  items?: T[];
  next_cursor?: string | null;
  page_info?: PageInfo;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface EventsRequestOptions {
  method?: string;
  body?: unknown;
  revision?: number;
}

/** Implemented by the shell-approved authenticated client when its contract exists. */
export interface EventsTransport {
  request<T = RecordData>(
    path: string,
    options?: EventsRequestOptions,
  ): Promise<T>;
}

export type EventsRequest = <T = RecordData>(
  actor: string,
  path: string,
  options?: EventsRequestOptions,
) => Promise<T>;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createEventsTransport(config: {
  baseUrl: string;
  mode: 'demo' | 'unavailable';
  development: boolean;
  actor: string;
}): EventsTransport {
  if (config.mode !== 'demo' || !config.development) {
    return {
      request: async <T = RecordData>(): Promise<T> => {
        throw new Error(
          'La conexión autenticada con Configuration está pendiente.',
        );
      },
    };
  }
  return {
    async request<T = RecordData>(
      path: string,
      options: EventsRequestOptions = {},
    ): Promise<T> {
      const method = options.method ?? 'GET';
      const headers: Record<string, string> = {
        'x-dev-actor': config.actor,
        Accept: 'application/json',
      };
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (method === 'POST' || method === 'DELETE') {
        headers['Idempotency-Key'] = crypto.randomUUID();
      }
      if (options.revision !== undefined) {
        headers['If-Match'] = `"${options.revision}"`;
      }
      const response = await fetch(
        `${config.baseUrl.replace(/\/$/, '')}/configuration/v1${path}`,
        {
          method,
          headers,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
        },
      );
      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        const detail = isRecordObject(payload)
          ? (payload.detail ?? payload.message)
          : undefined;
        const message = Array.isArray(detail)
          ? detail.join('; ')
          : detail !== undefined
            ? String(detail)
            : `Error HTTP ${response.status}`;
        throw new ApiError(message, response.status);
      }
      return payload as T;
    },
  };
}

export function items(
  value: PaginatedList<RecordData> | RecordData[] | RecordData | null | undefined,
): RecordData[];
export function items<T>(
  value: PaginatedList<T> | T[] | null | undefined,
): T[];
export function items<T = RecordData>(
  value: T[] | PaginatedList<T> | RecordData | null | undefined,
): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecordObject(value) && Array.isArray(value.items)) {
    return value.items as T[];
  }
  return [];
}

export function displayDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(readLocale() === 'en' ? 'en-US' : 'es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
