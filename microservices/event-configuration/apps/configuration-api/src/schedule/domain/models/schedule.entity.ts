export type VenueKind = 'venue' | 'room';
export type SessionStatus = 'draft' | 'scheduled' | 'cancelled' | 'completed';

export interface VenueLocation {
  address: string;
  locality?: string;
  region?: string;
  country_code?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
}

export interface VenueEntity {
  id: string;
  organization_id: string;
  kind: VenueKind;
  parent_venue_id: string | null;
  name: string;
  location: VenueLocation;
  capacity: number | null;
  exclusive: boolean;
  accessibility: string[];
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ProgramEntity {
  id: string;
  organization_id: string;
  event_id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
  color: string | null;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface SessionEntity {
  id: string;
  organization_id: string;
  event_id: string;
  program_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_id: string;
  speaker_ids: string[];
  status: SessionStatus;
  status_reason: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
