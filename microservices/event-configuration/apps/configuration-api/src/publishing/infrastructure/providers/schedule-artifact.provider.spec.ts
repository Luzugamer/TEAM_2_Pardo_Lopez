import { describe, expect, it } from 'vitest';
import { Kysely } from 'kysely';
import { DatabaseService } from '../../../shared/database/database.service';
import { DatabaseSchema } from '../../../shared/database/types';
import { computeSha256 } from '../../../shared/crypto/canonical-json';
import { PublicationContext } from '../../application/ports/publication-context.interface';
import { ScheduleArtifactProvider } from './schedule-artifact.provider';

const organizationId = 'org-1';
const eventId = 'event-1';
const dataset = (reverse = false): Record<string, unknown[]> => {
  const rows: Record<string, unknown[]> = {
    programs: [
      { id: 'program-b', slug: 'b', name: 'Track B', description: null, display_order: 2, color: null },
      { id: 'program-a', slug: 'a', name: 'Track A', description: null, display_order: 1, color: null },
    ],
    venues: [
      { id: 'venue-1', kind: 'room', name: 'Room 1', location: { city: 'Arequipa' }, capacity: 40, accessibility: ['ramp', 'hearing-loop'], exclusive: true },
    ],
    sessions: [
      { id: 'session-2', program_id: 'program-b', venue_id: 'venue-1', title: 'Second', description: null, starts_at: new Date('2026-12-01T11:00:00Z'), ends_at: new Date('2026-12-01T12:00:00Z'), status: 'scheduled' },
      { id: 'session-1', program_id: 'program-a', venue_id: 'venue-1', title: 'First', description: null, starts_at: new Date('2026-12-01T09:00:00Z'), ends_at: new Date('2026-12-01T10:00:00Z'), status: 'scheduled' },
    ],
    session_speakers: [
      { session_id: 'session-1', speaker_id: 'speaker-public', display_order: 1 },
      { session_id: 'session-1', speaker_id: 'speaker-private', display_order: 2 },
    ],
    speakers: [
      { id: 'speaker-public', display_name: 'Public Speaker', bio: 'Public bio', media_ref: 'media/public', exclusive: false, public_consent: true, public_consent_at: new Date('2026-10-01T00:00:00Z'), public_consent_version: 'notice-1', archived_at: null },
      { id: 'speaker-private', display_name: 'Private Speaker', bio: 'Private bio', media_ref: 'media/private', exclusive: false, public_consent: false, public_consent_at: null, public_consent_version: null, archived_at: null },
    ],
  };
  return Object.fromEntries(Object.entries(rows).map(([table, tableRows]) => [table, reverse ? [...tableRows].reverse() : tableRows]));
};

function makeProvider(rows: Record<string, unknown[]>): ScheduleArtifactProvider {
  const db = {
    selectFrom(table: string) {
      const builder = {
        select() { return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        async execute() { return rows[table] ?? []; },
      };
      return builder;
    },
  } as unknown as Kysely<DatabaseSchema>;
  const database = {
    async withTenantTransaction(_orgId: string, callback: (transaction: Kysely<DatabaseSchema>) => Promise<unknown>) {
      return callback(db);
    },
  } as unknown as DatabaseService;
  return new ScheduleArtifactProvider(database);
}

const context: PublicationContext = {
  organization_id: organizationId,
  event_id: eventId,
  expected_event_revision: 7,
  effective_at: '2026-11-01T00:00:00Z',
  event_timezone: 'America/Lima',
  event_starts_at: '2026-12-01T08:00:00Z',
  event_ends_at: '2026-12-01T18:00:00Z',
};

describe('ScheduleArtifactProvider', () => {
  it('builds deterministic public artifacts and excludes profiles without current consent', async () => {
    const first = await makeProvider(dataset()).buildScheduleArtifact(context);
    const reordered = await makeProvider(dataset(true)).buildScheduleArtifact(context);
    const body = first.body as { programs: Array<{ id: string }>; sessions: Array<{ id: string; speakers: Array<{ id: string }> }> };

    expect(body.programs.map((program) => program.id)).toEqual(['program-a', 'program-b']);
    expect(body.sessions.map((session) => session.id)).toEqual(['session-1', 'session-2']);
    expect(body.sessions[0].speakers.map((speaker) => speaker.id)).toEqual(['speaker-public']);
    expect(JSON.stringify(first.body)).not.toContain('speaker-private');
    expect(JSON.stringify(first.body)).not.toContain('Private Speaker');
    expect(first.hash).toBe(computeSha256(first.body));
    expect(reordered.hash).toBe(first.hash);
    expect(first.errors).toEqual([]);
  });
});
