import { AuditContext, ListPage } from './schedule-repository.port';

export const SPEAKER_REPOSITORY = Symbol('SPEAKER_REPOSITORY');

export interface SpeakerEntity {
  id: string;
  organization_id: string;
  display_name: string;
  bio: string | null;
  media_ref: string | null;
  public_consent: boolean;
  public_consent_at: string | null;
  public_consent_version: string | null;
  exclusive: boolean;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface SpeakerWrite {
  display_name: string;
  bio?: string | null;
  media_ref?: string | null;
  public_consent: boolean;
  public_consent_version?: string;
  exclusive?: boolean;
}

export type SpeakerPatch = Partial<SpeakerWrite>;

export interface SpeakerRepositoryPort {
  list(organizationId: string, limit: number, cursor?: string): Promise<ListPage<SpeakerEntity>>;
  findActive(organizationId: string, id: string): Promise<SpeakerEntity | null>;
  hasActiveReservation(organizationId: string, id: string): Promise<boolean>;
  insert(organizationId: string, actorId: string, input: SpeakerWrite, consentVersion: string | null): Promise<SpeakerEntity>;
  update(organizationId: string, actorId: string, id: string, revision: number, input: SpeakerPatch, consentVersion: string | null | undefined): Promise<SpeakerEntity | null>;
  archive(organizationId: string, actorId: string, id: string, revision: number): Promise<boolean>;
  appendAudit(organizationId: string, actor: AuditContext, id: string, action: string, revision: number, diff: Record<string, unknown>): Promise<void>;
  appendConsent(organizationId: string, actorId: string, speakerId: string, accepted: boolean, version: string): Promise<void>;
}
