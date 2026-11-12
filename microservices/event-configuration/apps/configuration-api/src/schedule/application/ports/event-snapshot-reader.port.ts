export const EVENT_SNAPSHOT_READER = Symbol('EVENT_SNAPSHOT_READER');

export interface EventSnapshotReader {
  readEventSnapshot(organizationId: string, eventId: string, expectedRevision?: number): Promise<{
    snapshot: { status: string; starts_at: string; ends_at: string; timezone: string };
    hash: string;
  }>;
}
