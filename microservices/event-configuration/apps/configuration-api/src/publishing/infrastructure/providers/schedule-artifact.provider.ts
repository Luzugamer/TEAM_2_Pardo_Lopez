import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DatabaseService } from '../../../shared/database/database.service';
import { DatabaseSchema } from '../../../shared/database/types';
import { computeSha256 } from '../../../shared/crypto/canonical-json';
import { validateScheduleCandidates } from '../../../schedule/domain/schedule-validation';
import { PublicationContext } from '../../application/ports/publication-context.interface';
import { ArtifactResult } from '../../application/ports/artifact-provider.interface';
import { ScheduleArtifactProviderContract } from '../../application/ports/schedule-artifact-provider.interface';

interface ProgramSnapshot {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
  color: string | null;
}

interface VenueSnapshot {
  id: string;
  kind: 'venue' | 'room';
  name: string;
  location: Record<string, unknown>;
  capacity: number | null;
  accessibility: string[];
  exclusive: boolean;
}

interface SpeakerSnapshot {
  id: string;
  display_name: string;
  bio: string | null;
  media_ref: string | null;
  exclusive: boolean;
  public_consent: boolean;
  public_consent_at: Date | null;
  public_consent_version: string | null;
  archived_at: Date | null;
}

interface ScheduleSnapshot {
  programs: ProgramSnapshot[];
  programIds: Set<string>;
  venues: VenueSnapshot[];
  venuesById: Map<string, VenueSnapshot>;
  sessions: Array<{
    id: string;
    program_id: string;
    venue_id: string;
    title: string;
    description: string | null;
    starts_at: Date;
    ends_at: Date;
    status: 'draft' | 'scheduled' | 'cancelled' | 'completed';
  }>;
  scheduledSessions: ScheduleSnapshot['sessions'];
  speakers: SpeakerSnapshot[];
  speakerIdsBySession: Map<string, string[]>;
  speakersBySession: Map<string, SpeakerSnapshot[]>;
}

@Injectable()
export class ScheduleArtifactProvider implements ScheduleArtifactProviderContract {
  constructor(private readonly databaseService: DatabaseService) {}

  async validateSchedule(context: PublicationContext): Promise<{ errors: string[]; warnings: string[] }> {
    const data = await this.load(context);
    return this.validateLoadedSchedule(data, context);
  }

  private validateLoadedSchedule(data: ScheduleSnapshot, context: PublicationContext) {
    if (!context.event_starts_at || !context.event_ends_at) {
      return { errors: ['Event window is missing from the publication snapshot.'], warnings: [] };
    }
    const result = validateScheduleCandidates(data.scheduledSessions.map((session) => {
      const speakers = data.speakersBySession.get(session.id) ?? [];
      return {
        venue_id: session.venue_id,
        speaker_ids: data.speakerIdsBySession.get(session.id) ?? [],
        starts_at: session.starts_at.toISOString(),
        ends_at: session.ends_at.toISOString(),
        program_valid: data.programIds.has(session.program_id),
        venue_valid: data.venuesById.has(session.venue_id),
        venue_exclusive: data.venuesById.get(session.venue_id)?.exclusive ?? false,
        active_speakers: new Map(speakers.filter((speaker) => speaker.archived_at === null)
          .map((speaker) => [speaker.id, speaker.exclusive])),
      };
    }), [], context.event_starts_at, context.event_ends_at);
    const conflictErrors = result.conflicts.map((conflict) =>
      `Schedule conflict: ${conflict.resource_type} ${conflict.resource_id} overlaps during ${conflict.starts_at}–${conflict.ends_at}.`,
    );
    return { errors: [...result.errors, ...conflictErrors], warnings: [] };
  }

  async buildScheduleArtifact(context: PublicationContext): Promise<ArtifactResult> {
    const data = await this.load(context);
    const validation = this.validateLoadedSchedule(data, context);
    const publicSpeakers = new Map<string, SpeakerSnapshot>();
    for (const speaker of data.speakers) {
      if (speaker.archived_at === null && speaker.public_consent
        && speaker.public_consent_at !== null && speaker.public_consent_version !== null) {
        publicSpeakers.set(speaker.id, speaker);
      }
    }

    const sessions = data.sessions
      .filter((session) => session.status !== 'draft')
      .map((session) => {
        const speakerIds = (data.speakerIdsBySession.get(session.id) ?? [])
          .filter((speakerId) => publicSpeakers.has(speakerId));
        return {
          id: session.id,
          program_id: session.program_id,
          venue_id: session.venue_id,
          title: session.title,
          description: session.description,
          starts_at: session.starts_at.toISOString(),
          ends_at: session.ends_at.toISOString(),
          status: session.status,
          speaker_ids: speakerIds,
          speakers: speakerIds.map((speakerId) => {
            const speaker = publicSpeakers.get(speakerId)!;
            return { id: speaker.id, display_name: speaker.display_name, bio: speaker.bio, media_ref: speaker.media_ref };
          }),
        };
      });

    const usedVenueIds = new Set(sessions.map((session) => session.venue_id));
    const body: Record<string, unknown> = {
      schema_version: '1.0.0',
      event_id: context.event_id,
      event_revision: context.expected_event_revision,
      timezone: context.event_timezone ?? 'UTC',
      programs: [...data.programs].sort((a, b) => a.display_order - b.display_order || a.id.localeCompare(b.id))
        .map(({ id, slug, name, description, display_order, color }) =>
        ({ id, slug, name, description, display_order, color })),
      venues: data.venues.filter((venue) => usedVenueIds.has(venue.id))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(({ id, kind, name, location, capacity, accessibility }) =>
        ({ id, kind, name, location, capacity, accessibility: [...accessibility].sort() })),
      sessions: sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at)
        || a.program_id.localeCompare(b.program_id)
        || a.venue_id.localeCompare(b.venue_id)
        || a.id.localeCompare(b.id)),
    };

    return {
      kind: 'schedule',
      version: '1.0.0',
      body,
      hash: computeSha256(body),
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  private async load(context: PublicationContext) {
    const read = async (db: Kysely<DatabaseSchema>) => {
      const [programRows, venueRows, sessionRows] = await Promise.all([
        db.selectFrom('programs').select(['id', 'slug', 'name', 'description', 'display_order', 'color'])
          .where('organization_id', '=', context.organization_id).where('event_id', '=', context.event_id)
          .where('archived_at', 'is', null).orderBy('display_order').orderBy('id').execute(),
        db.selectFrom('venues').select(['id', 'kind', 'name', 'location', 'capacity', 'accessibility', 'exclusive'])
          .where('organization_id', '=', context.organization_id).where('archived_at', 'is', null)
          .orderBy('name').orderBy('id').execute(),
        db.selectFrom('sessions').select(['id', 'program_id', 'venue_id', 'title', 'description', 'starts_at', 'ends_at', 'status'])
          .where('organization_id', '=', context.organization_id).where('event_id', '=', context.event_id)
          .where('status', 'in', ['scheduled', 'cancelled', 'completed'])
          .orderBy('starts_at').orderBy('program_id').orderBy('venue_id').orderBy('id').execute(),
      ]);
      const sessionIds = sessionRows.map((session) => session.id);
      const speakerLinks = sessionIds.length ? await db.selectFrom('session_speakers')
        .select(['session_id', 'speaker_id', 'display_order'])
        .where('organization_id', '=', context.organization_id).where('event_id', '=', context.event_id)
        .where('session_id', 'in', sessionIds).orderBy('session_id').orderBy('display_order').orderBy('speaker_id').execute() : [];
      const speakerIds = [...new Set(speakerLinks.map((link) => link.speaker_id))];
      const speakerRows = speakerIds.length ? await db.selectFrom('speakers')
        .select(['id', 'display_name', 'bio', 'media_ref', 'exclusive', 'public_consent', 'public_consent_at', 'public_consent_version', 'archived_at'])
        .where('organization_id', '=', context.organization_id).where('id', 'in', speakerIds).execute() : [];

      const speakersById = new Map(speakerRows.map((speaker) => [speaker.id, speaker]));
      const speakersBySession = new Map<string, SpeakerSnapshot[]>();
      const speakerIdsBySession = new Map<string, string[]>();
      for (const link of speakerLinks) {
        speakerIdsBySession.set(link.session_id, [...(speakerIdsBySession.get(link.session_id) ?? []), link.speaker_id]);
        const speaker = speakersById.get(link.speaker_id);
        if (!speaker) continue;
        speakersBySession.set(link.session_id, [...(speakersBySession.get(link.session_id) ?? []), speaker]);
      }
      return {
        programs: programRows as ProgramSnapshot[],
        programIds: new Set(programRows.map((row) => row.id)),
        venues: venueRows as VenueSnapshot[],
        venuesById: new Map(venueRows.map((row) => [row.id, row as VenueSnapshot])),
        sessions: sessionRows,
        scheduledSessions: sessionRows.filter((session) => session.status === 'scheduled'),
        speakers: speakerRows as SpeakerSnapshot[],
        speakerIdsBySession,
        speakersBySession,
      };
    };

    return this.databaseService.withTenantTransaction(context.organization_id, read, 'REPEATABLE READ');
  }
}
