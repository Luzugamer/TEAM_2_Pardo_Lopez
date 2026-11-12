export interface ValidationCandidate {
  venue_id: string;
  speaker_ids: string[];
  starts_at: string;
  ends_at: string;
  program_valid: boolean;
  venue_valid: boolean;
  venue_exclusive: boolean;
  active_speakers: Map<string, boolean>;
}

export interface ReservedInterval {
  session_id?: string;
  resource_type: 'venue' | 'speaker';
  resource_id: string;
  starts_at: string;
  ends_at: string;
}

export interface ScheduleValidationResult {
  is_valid: boolean;
  conflicts: Array<ReservedInterval & { candidate_index?: number; conflicting_candidate_index?: number }>;
  errors: string[];
  warnings: string[];
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

export function validateScheduleCandidates(
  candidates: ValidationCandidate[],
  existing: ReservedInterval[],
  eventStartsAt: string,
  eventEndsAt: string,
): ScheduleValidationResult {
  const errors: string[] = [];
  const conflicts: ScheduleValidationResult['conflicts'] = [];
  const eventStart = Date.parse(eventStartsAt);
  const eventEnd = Date.parse(eventEndsAt);
  const occupied: Array<ReservedInterval & { candidate_index?: number }> = [...existing];

  candidates.forEach((candidate, index) => {
    const start = Date.parse(candidate.starts_at);
    const end = Date.parse(candidate.ends_at);
    if (!candidate.program_valid) errors.push(`candidate_sessions[${index}]: program_not_available`);
    if (!candidate.venue_valid) errors.push(`candidate_sessions[${index}]: venue_not_available`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      errors.push(`candidate_sessions[${index}]: invalid_time_range`);
      return;
    }
    if (start < eventStart || end > eventEnd) errors.push(`candidate_sessions[${index}]: event_window_violation`);
    for (const speakerId of candidate.speaker_ids) {
      if (!candidate.active_speakers.has(speakerId)) errors.push(`candidate_sessions[${index}]: speaker_not_available`);
    }

    const resources: Array<{ type: 'venue' | 'speaker'; id: string }> = [];
    if (candidate.venue_exclusive && candidate.venue_id) resources.push({ type: 'venue', id: candidate.venue_id });
    for (const [speakerId, exclusive] of candidate.active_speakers) {
      if (exclusive && candidate.speaker_ids.includes(speakerId)) resources.push({ type: 'speaker', id: speakerId });
    }
    for (const resource of resources) {
      for (const occupiedInterval of occupied) {
        if (occupiedInterval.resource_type !== resource.type || occupiedInterval.resource_id !== resource.id) continue;
        const otherStart = Date.parse(occupiedInterval.starts_at);
        const otherEnd = Date.parse(occupiedInterval.ends_at);
        if (overlaps(start, end, otherStart, otherEnd)) {
          conflicts.push({ ...occupiedInterval, candidate_index: index,
            ...(occupiedInterval.candidate_index !== undefined ? { conflicting_candidate_index: occupiedInterval.candidate_index } : {}) });
        }
      }
      occupied.push({ resource_type: resource.type, resource_id: resource.id,
        starts_at: candidate.starts_at, ends_at: candidate.ends_at, candidate_index: index });
    }
  });
  return { is_valid: errors.length === 0 && conflicts.length === 0, conflicts, errors, warnings: [] };
}
