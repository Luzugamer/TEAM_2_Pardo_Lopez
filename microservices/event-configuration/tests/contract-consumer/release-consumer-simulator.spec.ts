import { describe, expect, it } from 'vitest';
import releasePublishedExample from '../../contracts/configuration/examples/configuration.event.release_published.v1.json';
import { computeSha256 } from '../../apps/configuration-api/src/shared/crypto/canonical-json';
import {
  InMemoryInboxStore,
  ManifestResolver,
  ReleaseConsumerSimulator,
  ReleaseEnvelope,
  ReleaseManifest,
  ResolvedArtifact,
  ResolvedRelease,
} from './release-consumer-simulator';

const organizationId = '0194eb00-0000-7000-8000-000000000001';
const eventId = '0194eb00-0000-7000-8000-000000000002';
const partitionKey = `${organizationId}:${eventId}`;

class FixtureResolver implements ManifestResolver {
  readonly releases = new Map<string, ResolvedRelease>();

  async resolve(_organizationId: string, _eventId: string, manifestRef: string): Promise<ResolvedRelease | null> {
    return this.releases.get(manifestRef) ?? null;
  }
}

function createRelease(releaseVersion: number, overrides: { omitKind?: 'forms' } = {}) {
  const currentPublicationId = `0194eb00-0000-7000-8000-${String(100 + releaseVersion).padStart(12, '0')}`;
  const manifestRef = `/configuration/v1/events/${eventId}/releases/${currentPublicationId}/manifest`;
  const completeArtifacts: ResolvedArtifact[] = (['event', 'schedule', 'forms'] as const).map((kind) => {
      const body = { kind, event_id: eventId, revision: releaseVersion };
      return {
        kind,
        version: kind === 'event' ? `rev-${releaseVersion}` : '1.0.0',
        ref: `${manifestRef}/artifacts/${kind}`,
        sha256: computeSha256(body),
        body,
      };
    });
  const artifacts = completeArtifacts.filter((artifact) => artifact.kind !== overrides.omitKind);
  const manifestPayload: Omit<ReleaseManifest, 'manifest_hash'> = {
    validation_mode: 'development_fixture',
    organization_id: organizationId,
    business_event_id: eventId,
    publication_id: currentPublicationId,
    release_version: releaseVersion,
    effective_at: '2026-11-01T00:00:00Z',
    manifest_ref: manifestRef,
    artifacts: Object.fromEntries(completeArtifacts.map((artifact) => [artifact.kind, {
      kind: artifact.kind,
      version: artifact.version,
      ref: artifact.ref,
      sha256: artifact.sha256,
    }])) as ReleaseManifest['artifacts'],
  };
  const manifest: ReleaseManifest = {
    ...manifestPayload,
    manifest_hash: computeSha256(manifestPayload),
  };
  const envelope: ReleaseEnvelope = {
    message_id: `1194eb00-0000-7000-8000-${String(releaseVersion).padStart(12, '0')}`,
    domain_event_id: `2194eb00-0000-7000-8000-${String(releaseVersion).padStart(12, '0')}`,
    topic: 'configuration.event.release_published.v1',
    schema_version: 1,
    producer: 'configuration',
    organization_id: organizationId,
    business_event_id: eventId,
    occurred_at: '2026-11-01T00:00:00Z',
    published_at: '2026-11-01T00:00:01Z',
    actor: { type: 'user', id: 'organizer-1' },
    correlation_id: `correlation-${releaseVersion}`,
    causation_id: null,
    aggregate: { type: 'release', id: currentPublicationId, version: releaseVersion },
    partition_key: partitionKey,
    data: {
      publication_id: currentPublicationId,
      release_version: releaseVersion,
      manifest_ref: manifestRef,
      manifest_hash: manifest.manifest_hash,
      effective_at: manifest.effective_at,
    },
  };
  return { envelope, resolved: { manifest, artifacts } satisfies ResolvedRelease };
}

function createSimulator(resolver: FixtureResolver, inbox = new InMemoryInboxStore()) {
  return new ReleaseConsumerSimulator('contract-test-consumer', resolver, inbox);
}

describe('EC-032 release consumer simulator', () => {
  it('accepts the versioned example from the contracts directory', async () => {
    const simulator = createSimulator(new FixtureResolver());
    const result = await simulator.receive(releasePublishedExample);

    expect(result).toMatchObject({ status: 'pending', reason_code: 'MANIFEST_NOT_AVAILABLE' });
  });

  it('validates the canonical envelope and activates a complete hash-verified bundle', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);

    const result = await simulator.receive(release.envelope);

    expect(result.status).toBe('active');
    const projection = simulator.getInboxStore().getProjection(partitionKey);
    expect(projection?.active_release_version).toBe(1);
    expect(Object.keys(projection?.artifacts ?? {}).sort()).toEqual(['event', 'forms', 'schedule']);
  });

  it('rejects a body with an incorrect artifact hash without partial activation', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    release.resolved.artifacts[1].body.title = 'tampered';
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);

    const result = await simulator.receive(release.envelope);

    expect(result).toMatchObject({ status: 'failed', reason_code: 'ARTIFACT_HASH_MISMATCH' });
    expect(simulator.getInboxStore().getProjection(partitionKey)).toBeUndefined();
  });

  it('rejects a manifest whose canonical hash no longer matches its body', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    release.resolved.manifest.effective_at = '2026-12-01T00:00:00Z';
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);

    expect(await simulator.receive(release.envelope)).toMatchObject({ status: 'failed', reason_code: 'MANIFEST_HASH_MISMATCH' });
    expect(simulator.getInboxStore().getProjection(partitionKey)).toBeUndefined();
  });

  it('retries a failed fact only when a replay delivery repairs the artifact source', async () => {
    const resolver = new FixtureResolver();
    const invalid = createRelease(1);
    invalid.resolved.artifacts[1].body.title = 'tampered';
    resolver.releases.set(invalid.envelope.data.manifest_ref, invalid.resolved);
    const simulator = createSimulator(resolver);

    expect(await simulator.receive(invalid.envelope)).toMatchObject({ status: 'failed', reason_code: 'ARTIFACT_HASH_MISMATCH' });
    const repaired = createRelease(1);
    resolver.releases.set(repaired.envelope.data.manifest_ref, repaired.resolved);
    const replay = simulator.createReplayDelivery(invalid.envelope, '2026-11-02T00:00:00Z');

    expect(await simulator.receive(replay.envelope, replay.headers)).toMatchObject({ status: 'active' });
  });

  it('treats a duplicate domain event as idempotent, including a delivery replay', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);
    await simulator.receive(release.envelope);

    const replay = simulator.createReplayDelivery(release.envelope, '2026-11-02T00:00:00Z');
    const result = await simulator.receive(replay.envelope, replay.headers);

    expect(replay.envelope.domain_event_id).toBe(release.envelope.domain_event_id);
    expect(replay.envelope.occurred_at).toBe(release.envelope.occurred_at);
    expect(replay.envelope.message_id).not.toBe(release.envelope.message_id);
    expect(replay.envelope.published_at).not.toBe(release.envelope.published_at);
    expect(result).toMatchObject({ status: 'active', duplicate: true });
  });

  it('serializes concurrent duplicate deliveries so only one applies the effect', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);

    const results = await Promise.all([
      simulator.receive(release.envelope),
      simulator.receive(release.envelope),
    ]);

    expect(results.map((result) => result.status)).toEqual(['active', 'active']);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect(simulator.getInboxStore().getProjection(partitionKey)?.active_release_version).toBe(1);
  });

  it('rejects reuse of a domain_event_id with changed domain content', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);
    await simulator.receive(release.envelope);

    const changed = { ...release.envelope, data: { ...release.envelope.data, effective_at: '2026-12-01T00:00:00Z' } };
    const result = await simulator.receive(changed);

    expect(result).toMatchObject({ status: 'failed', reason_code: 'DOMAIN_EVENT_ID_COLLISION' });
    expect(simulator.getInboxStore().getProjection(partitionKey)?.active_release_version).toBe(1);
  });

  it('holds a version gap pending and activates releases consecutively when the missing version arrives', async () => {
    const resolver = new FixtureResolver();
    const release1 = createRelease(1);
    const release2 = createRelease(2);
    const release3 = createRelease(3);
    for (const release of [release1, release2, release3]) {
      resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    }
    const simulator = createSimulator(resolver);

    const gap = await simulator.receive(release3.envelope);
    expect(gap).toMatchObject({ status: 'pending', reason_code: 'RELEASE_GAP', missing_versions: [1, 2] });
    expect(simulator.getInboxStore().getReplayRequests(partitionKey)).toEqual([1, 2]);
    const first = await simulator.receive(release1.envelope);
    expect(first).toEqual({ status: 'active', domain_event_id: release1.envelope.domain_event_id });
    expect(await simulator.receive(release2.envelope)).toMatchObject({ status: 'active' });
    expect(simulator.getInboxStore().getProjection(partitionKey)?.active_release_version).toBe(3);
    expect(simulator.getInboxStore().getInboxEntry('contract-test-consumer', release3.envelope.domain_event_id)?.status).toBe('active');
  });

  it('does not let an older release replace the active projection', async () => {
    const resolver = new FixtureResolver();
    const release1 = createRelease(1);
    const release2 = createRelease(2);
    resolver.releases.set(release1.envelope.data.manifest_ref, release1.resolved);
    resolver.releases.set(release2.envelope.data.manifest_ref, release2.resolved);
    const simulator = createSimulator(resolver);
    await simulator.receive(release1.envelope);
    await simulator.receive(release2.envelope);
    const delayedDuplicate = {
      ...release1.envelope,
      message_id: '4194eb00-0000-7000-8000-000000000001',
      domain_event_id: '5194eb00-0000-7000-8000-000000000001',
    };

    expect(await simulator.receive(delayedDuplicate)).toMatchObject({ status: 'superseded' });
    expect(simulator.getInboxStore().getProjection(partitionKey)?.active_release_version).toBe(2);
  });

  it('keeps an incomplete release pending, then completes the same fact after replay', async () => {
    const resolver = new FixtureResolver();
    const incomplete = createRelease(1, { omitKind: 'forms' });
    resolver.releases.set(incomplete.envelope.data.manifest_ref, incomplete.resolved);
    const simulator = createSimulator(resolver);

    expect(await simulator.receive(incomplete.envelope)).toMatchObject({ status: 'pending', reason_code: 'ARTIFACTS_INCOMPLETE' });
    const complete = createRelease(1);
    resolver.releases.set(complete.envelope.data.manifest_ref, complete.resolved);
    const replay = simulator.createReplayDelivery(incomplete.envelope, '2026-11-03T00:00:00Z');

    expect(await simulator.receive(replay.envelope, replay.headers)).toMatchObject({ status: 'active' });
    expect(simulator.getInboxStore().getProjection(partitionKey)?.active_release_version).toBe(1);
  });

  it('rejects tenant/event partition mismatches and known PII fields', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    resolver.releases.set(release.envelope.data.manifest_ref, release.resolved);
    const simulator = createSimulator(resolver);

    const wrongPartition = { ...release.envelope, partition_key: 'another-tenant:another-event' };
    expect(await simulator.receive(wrongPartition)).toMatchObject({ status: 'failed', reason_code: 'PARTITION_KEY_MISMATCH' });

    const withPii = {
      ...release.envelope,
      domain_event_id: '3194eb00-0000-7000-8000-000000000001',
      data: { ...release.envelope.data, email: 'person@example.invalid' },
    };
    expect(await simulator.receive(withPii)).toMatchObject({ status: 'failed', reason_code: 'PII_NOT_ALLOWED' });
    expect(simulator.getInboxStore().getProjection(partitionKey)).toBeUndefined();
  });

  it('marks schema-invalid envelopes as failed without exposing validation payloads', async () => {
    const resolver = new FixtureResolver();
    const release = createRelease(1);
    const simulator = createSimulator(resolver);
    const invalid = { ...release.envelope, topic: 'wrong.topic.v1' };

    const result = await simulator.receive(invalid);

    expect(result).toMatchObject({ status: 'failed', reason_code: 'INVALID_ENVELOPE' });
    expect(JSON.stringify(result)).not.toContain('wrong.topic.v1');
  });
});
