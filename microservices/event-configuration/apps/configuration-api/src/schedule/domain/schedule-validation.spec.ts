import { describe, expect, it } from 'vitest';
import { validateScheduleCandidates } from './schedule-validation';

const candidate = (starts_at: string, ends_at: string) => ({
  venue_id: 'venue-1', speaker_ids: ['speaker-1'], starts_at, ends_at,
  program_valid: true, venue_valid: true, venue_exclusive: true,
  active_speakers: new Map([['speaker-1', true]]),
});
const window = ['2026-12-01T10:00:00Z', '2026-12-01T18:00:00Z'] as const;

describe('validateScheduleCandidates', () => {
  it('allows adjacent half-open intervals for venue and speaker', () => {
    const result = validateScheduleCandidates([
      candidate('2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z'),
      candidate('2026-12-01T12:00:00Z', '2026-12-01T13:00:00Z'),
    ], [], ...window);
    expect(result.is_valid).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('reports an overlap against a persisted reservation without exposing profile data', () => {
    const result = validateScheduleCandidates([candidate('2026-12-01T11:30:00Z', '2026-12-01T12:30:00Z')], [{
      session_id: 'session-1', resource_type: 'speaker', resource_id: 'speaker-1',
      starts_at: '2026-12-01T11:00:00Z', ends_at: '2026-12-01T12:00:00Z',
    }], ...window);
    expect(result.is_valid).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ resource_type: 'speaker', resource_id: 'speaker-1', session_id: 'session-1' });
  });

  it('reports bad references and intervals outside the event window', () => {
    const invalid = { ...candidate('2026-12-01T09:00:00Z', '2026-12-01T19:00:00Z'), program_valid: false, venue_valid: false };
    const result = validateScheduleCandidates([invalid], [], ...window);
    expect(result.is_valid).toBe(false);
    expect(result.errors).toContain('candidate_sessions[0]: program_not_available');
    expect(result.errors).toContain('candidate_sessions[0]: venue_not_available');
    expect(result.errors).toContain('candidate_sessions[0]: event_window_violation');
  });

  it('detects collisions among proposed candidates', () => {
    const first = candidate('2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z');
    const second = { ...candidate('2026-12-01T11:30:00Z', '2026-12-01T12:30:00Z'), active_speakers: new Map<string, boolean>() };
    const result = validateScheduleCandidates([first, second], [], ...window);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ resource_type: 'venue', candidate_index: 1, conflicting_candidate_index: 0 });
  });

  it('allows overlapping sessions on non-exclusive resources', () => {
    const first = { ...candidate('2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z'), speaker_ids: [], venue_exclusive: false, active_speakers: new Map<string, boolean>() };
    const second = { ...first, starts_at: '2026-12-01T11:30:00Z', ends_at: '2026-12-01T12:30:00Z' };
    expect(validateScheduleCandidates([first, second], [], ...window).is_valid).toBe(true);
  });
});
