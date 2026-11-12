import { ProgramEntity, SessionEntity, VenueEntity, VenueKind, VenueLocation } from '../models/schedule.entity';
import { ReservedInterval } from '../schedule-validation';

export const SCHEDULE_REPOSITORY = Symbol('SCHEDULE_REPOSITORY');

export interface AuditContext {
  actorId: string;
  actorRoles: string[];
  requestId?: string;
  idempotencyKey?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface VenueWrite {
  kind: VenueKind;
  parent_venue_id?: string;
  name: string;
  location: VenueLocation;
  capacity?: number;
  exclusive: boolean;
  accessibility?: string[];
}

export interface VenuePatch {
  kind?: VenueKind;
  parent_venue_id?: string | null;
  name?: string;
  location?: VenueLocation;
  capacity?: number | null;
  exclusive?: boolean;
  accessibility?: string[];
}

export interface ProgramWrite {
  slug: string;
  name: string;
  description?: string;
  display_order: number;
  color?: string;
}

export interface ProgramPatch {
  slug?: string;
  name?: string;
  description?: string | null;
  display_order?: number;
  color?: string | null;
}

export interface SessionWrite {
  program_id: string;
  venue_id: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  speaker_ids?: string[];
}

export interface ScheduleListQuery {
  limit: number;
  cursor?: string;
  program_id?: string;
  venue_id?: string;
  starts_after?: string;
  ends_before?: string;
}

export interface ScheduleValidationRequest {
  expected_event_revision: number;
  candidate_sessions: SessionWrite[];
}

export interface ListPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ScheduleValidationResources {
  programIds: Set<string>;
  venues: Map<string, boolean>;
  speakers: Map<string, boolean>;
  reservations: ReservedInterval[];
}

export interface ScheduleRepositoryPort {
  listVenues(organizationId: string, limit: number, cursor?: string): Promise<ListPage<VenueEntity>>;
  createVenue(organizationId: string, actor: AuditContext, input: VenueWrite): Promise<VenueEntity>;
  findActiveVenue(organizationId: string, venueId: string): Promise<VenueEntity | null>;
  findVenueParent(organizationId: string, venueId: string): Promise<VenueEntity | null>;
  updateVenue(organizationId: string, id: string, revision: number, actor: AuditContext, input: VenuePatch): Promise<VenueEntity>;
  archiveVenue(organizationId: string, id: string, revision: number, actor: AuditContext): Promise<void>;
  listPrograms(organizationId: string, eventId: string, limit: number, cursor?: string): Promise<ListPage<ProgramEntity>>;
  createProgram(organizationId: string, eventId: string, actor: AuditContext, input: ProgramWrite): Promise<ProgramEntity>;
  findActiveProgram(organizationId: string, eventId: string, programId: string): Promise<ProgramEntity | null>;
  updateProgram(organizationId: string, eventId: string, id: string, revision: number, actor: AuditContext, input: ProgramPatch): Promise<ProgramEntity>;
  archiveProgram(organizationId: string, eventId: string, id: string, revision: number, actor: AuditContext): Promise<void>;
  findActiveSpeakers(organizationId: string, speakerIds: string[]): Promise<Array<{ id: string; exclusive: boolean }>>;
  getValidationResources(organizationId: string, eventId: string, programIds: string[], venueIds: string[], speakerIds: string[]): Promise<ScheduleValidationResources>;
  listSessions(organizationId: string, eventId: string, limit: number, cursor?: string, filters?: { program_id?: string; venue_id?: string; starts_after?: Date; ends_before?: Date }): Promise<ListPage<SessionEntity>>;
  createDraftSession(organizationId: string, eventId: string, actor: AuditContext, input: SessionWrite, timezone: string): Promise<SessionEntity>;
  findSession(organizationId: string, eventId: string, sessionId: string): Promise<SessionEntity | null>;
  markSessionScheduled(organizationId: string, eventId: string, sessionId: string, expectedRevision: number, actor: AuditContext, timezone: string): Promise<SessionEntity | null>;
  listSessionSpeakerIds(organizationId: string, sessionIds: string[]): Promise<Map<string, string[]>>;
  reserveExclusiveSpeakers(organizationId: string, eventId: string, session: SessionEntity, speakerIds: string[], exclusiveIds: string[], actor: AuditContext): Promise<void>;
  createVenueReservation(organizationId: string, eventId: string, session: SessionEntity, actor: AuditContext): Promise<void>;
}
