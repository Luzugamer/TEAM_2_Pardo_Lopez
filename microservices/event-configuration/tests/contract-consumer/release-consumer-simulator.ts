import { randomUUID } from 'node:crypto';
import Ajv2020, { AnySchema } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import releasePublishedSchema from '../../contracts/configuration/schemas/configuration.event.release_published.v1.json';
import { computeSha256 } from '../../apps/configuration-api/src/shared/crypto/canonical-json';

export type ReleaseArtifactKind = 'event' | 'schedule' | 'forms';
export type InboxStatus = 'pending' | 'active' | 'failed' | 'superseded';

export interface ReleaseEnvelope {
  message_id: string;
  domain_event_id: string;
  topic: 'configuration.event.release_published.v1';
  schema_version: 1;
  producer: 'configuration';
  organization_id: string;
  business_event_id: string;
  occurred_at: string;
  published_at: string;
  actor: { type: 'user'; id: string };
  traceparent?: string | null;
  correlation_id: string;
  causation_id?: string | null;
  aggregate: { type: 'release'; id: string; version: number };
  partition_key: string;
  data: {
    publication_id: string;
    release_version: number;
    manifest_ref: string;
    manifest_hash: string;
    effective_at: string;
  };
}

export interface ManifestArtifactReference {
  kind: ReleaseArtifactKind;
  version: string;
  ref: string;
  sha256: string;
}

export interface ReleaseManifest {
  validation_mode: string;
  organization_id: string;
  business_event_id: string;
  publication_id: string;
  release_version: number;
  effective_at: string;
  manifest_ref: string;
  manifest_hash: string;
  artifacts: Record<ReleaseArtifactKind, ManifestArtifactReference>;
}

export interface ResolvedArtifact {
  kind: ReleaseArtifactKind;
  version: string;
  ref: string;
  sha256: string;
  body: Record<string, unknown>;
}

export interface ResolvedRelease {
  manifest: ReleaseManifest;
  artifacts: ResolvedArtifact[];
}

export interface ManifestResolver {
  resolve(organizationId: string, eventId: string, manifestRef: string): Promise<ResolvedRelease | null>;
}

export interface InboxEntry {
  consumer_name: string;
  domain_event_id: string;
  domain_fact_hash: string;
  partition_key: string;
  release_version: number;
  publication_id: string;
  status: InboxStatus;
  reason_code: string | null;
}

export interface ReleaseProjection {
  partition_key: string;
  organization_id: string;
  business_event_id: string;
  active_release_version: number;
  publication_id: string;
  manifest_hash: string;
  artifacts: Record<ReleaseArtifactKind, Record<string, unknown>>;
}

interface StoredDelivery {
  entry: InboxEntry;
  envelope: ReleaseEnvelope;
  headers: Record<string, string | undefined>;
}

export class InMemoryInboxStore {
  private readonly deliveries = new Map<string, StoredDelivery>();
  private readonly projections = new Map<string, ReleaseProjection>();
  private readonly replayRequests = new Map<string, Set<number>>();

  get(consumerName: string, domainEventId: string): StoredDelivery | undefined {
    return this.deliveries.get(this.inboxKey(consumerName, domainEventId));
  }

  getInboxEntry(consumerName: string, domainEventId: string): InboxEntry | undefined {
    return this.get(consumerName, domainEventId)?.entry;
  }

  save(delivery: StoredDelivery): void {
    this.deliveries.set(this.inboxKey(delivery.entry.consumer_name, delivery.entry.domain_event_id), delivery);
  }

  listPending(partitionKey: string): StoredDelivery[] {
    return [...this.deliveries.values()]
      .filter(({ entry }) => entry.partition_key === partitionKey && entry.status === 'pending')
      .sort((left, right) => left.entry.release_version - right.entry.release_version);
  }

  getProjection(partitionKey: string): ReleaseProjection | undefined {
    return this.projections.get(partitionKey);
  }

  /** Synchronous in-memory commit keeps the simulated inbox and active projection atomic. */
  activate(delivery: StoredDelivery, projection: ReleaseProjection): void {
    delivery.entry.status = 'active';
    delivery.entry.reason_code = null;
    this.save(delivery);
    this.projections.set(projection.partition_key, projection);
  }

  requestReplay(partitionKey: string, version: number): void {
    const versions = this.replayRequests.get(partitionKey) ?? new Set<number>();
    versions.add(version);
    this.replayRequests.set(partitionKey, versions);
  }

  resolveReplay(partitionKey: string, version: number): void {
    const versions = this.replayRequests.get(partitionKey);
    versions?.delete(version);
  }

  getReplayRequests(partitionKey: string): number[] {
    return [...(this.replayRequests.get(partitionKey) ?? [])].sort((a, b) => a - b);
  }

  private inboxKey(consumerName: string, domainEventId: string): string {
    return `${consumerName}:${domainEventId}`;
  }
}

export interface ConsumerResult {
  status: InboxStatus;
  domain_event_id: string | null;
  reason_code?: string;
  missing_versions?: number[];
  duplicate?: boolean;
}

const EXPECTED_ARTIFACT_KINDS: ReleaseArtifactKind[] = ['event', 'schedule', 'forms'];
const FORBIDDEN_PII_KEYS = new Set([
  'email', 'phone', 'full_name', 'registration_answers', 'answers', 'bio', 'media_ref',
  'access_token', 'refresh_token', 'participant_name', 'attendee_name',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REPLAY_REQUEST_WINDOW = 100;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateEnvelope = ajv.compile(releasePublishedSchema as AnySchema);

export class ReleaseConsumerSimulator {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly consumerName: string,
    private readonly resolver: ManifestResolver,
    private readonly inbox: InMemoryInboxStore = new InMemoryInboxStore(),
  ) {
    if (!consumerName.trim()) throw new Error('consumer_name is required.');
  }

  getInboxStore(): InMemoryInboxStore {
    return this.inbox;
  }

  async receive(
    rawEnvelope: unknown,
    headers: Record<string, string | undefined> = {},
  ): Promise<ConsumerResult> {
    return this.serialize(async () => this.receiveExclusive(rawEnvelope, headers));
  }

  /** Creates a contract-correct replay delivery without changing the domain fact. */
  createReplayDelivery(
    envelope: ReleaseEnvelope,
    publishedAt = new Date().toISOString(),
    messageId = randomUUID(),
  ): { envelope: ReleaseEnvelope; headers: Record<string, string> } {
    return {
      envelope: { ...envelope, message_id: messageId, published_at: publishedAt },
      headers: { replay: 'true' },
    };
  }

  private async receiveExclusive(
    rawEnvelope: unknown,
    headers: Record<string, string | undefined>,
  ): Promise<ConsumerResult> {
    const envelope = this.isRecord(rawEnvelope) ? rawEnvelope : null;
    const domainEventId = typeof envelope?.domain_event_id === 'string' ? envelope.domain_event_id : null;
    if (!envelope || !validateEnvelope(envelope)) {
      return this.recordInvalidEnvelope(envelope, domainEventId);
    }

    const event = envelope as unknown as ReleaseEnvelope;
    const domainFactHash = this.domainFactHash(event);
    const existing = this.inbox.get(this.consumerName, event.domain_event_id);
    if (existing && existing.entry.domain_fact_hash !== domainFactHash) {
      return this.result('failed', event.domain_event_id, 'DOMAIN_EVENT_ID_COLLISION');
    }
    if (existing?.entry.status === 'active') {
      return this.result('active', event.domain_event_id, undefined, true);
    }
    if (existing?.entry.status === 'superseded') {
      return this.result('superseded', event.domain_event_id, undefined, true);
    }
    if (existing?.entry.status === 'failed' && headers.replay !== 'true') {
      return this.result('failed', event.domain_event_id, existing.entry.reason_code ?? 'REPLAY_REQUIRED');
    }

    const delivery: StoredDelivery = existing ?? {
      envelope: event,
      headers: { ...headers },
      entry: {
        consumer_name: this.consumerName,
        domain_event_id: event.domain_event_id,
        domain_fact_hash: domainFactHash,
        partition_key: event.partition_key,
        release_version: event.data.release_version,
        publication_id: event.data.publication_id,
        status: 'pending',
        reason_code: null,
      },
    };
    delivery.envelope = event;
    delivery.headers = { ...headers };
    delivery.entry.status = 'pending';
    delivery.entry.reason_code = null;
    this.inbox.save(delivery);

    const identityError = this.validateEnvelopeIdentity(event);
    if (identityError) return this.fail(delivery, identityError);
    if (this.containsForbiddenPii(event)) return this.fail(delivery, 'PII_NOT_ALLOWED');

    const projection = this.inbox.getProjection(event.partition_key);
    const activeVersion = projection?.active_release_version ?? 0;
    const expectedVersion = activeVersion + 1;
    if (event.data.release_version > expectedVersion) {
      const missingVersions = this.requestMissingVersions(event.partition_key, expectedVersion, event.data.release_version);
      delivery.entry.reason_code = 'RELEASE_GAP';
      this.inbox.save(delivery);
      return { status: 'pending', domain_event_id: event.domain_event_id, reason_code: 'RELEASE_GAP', missing_versions: missingVersions };
    }

    const bundleResult = await this.resolveAndVerify(event);
    if (bundleResult.status === 'pending') {
      delivery.entry.reason_code = bundleResult.reasonCode;
      this.inbox.save(delivery);
      return this.result('pending', event.domain_event_id, bundleResult.reasonCode);
    }
    if (bundleResult.status === 'failed') return this.fail(delivery, bundleResult.reasonCode);

    if (event.data.release_version < expectedVersion) {
      delivery.entry.status = 'superseded';
      delivery.entry.reason_code = null;
      this.inbox.save(delivery);
      return this.result('superseded', event.domain_event_id);
    }

    this.activate(delivery, event, bundleResult.bundle);
    this.inbox.resolveReplay(event.partition_key, event.data.release_version);
    await this.drainContiguousPending(event.partition_key);
    return this.result('active', event.domain_event_id);
  }

  private async drainContiguousPending(partitionKey: string): Promise<void> {
    while (true) {
      const currentVersion = this.inbox.getProjection(partitionKey)?.active_release_version ?? 0;
      const next = this.inbox.listPending(partitionKey)
        .find(({ entry }) => entry.release_version === currentVersion + 1);
      if (!next) return;

      const { envelope } = next;
      const bundleResult = await this.resolveAndVerify(envelope);
      if (bundleResult.status === 'pending') {
        next.entry.reason_code = bundleResult.reasonCode;
        this.inbox.save(next);
        return;
      }
      if (bundleResult.status === 'failed') {
        this.fail(next, bundleResult.reasonCode);
        return;
      }
      this.activate(next, envelope, bundleResult.bundle);
      this.inbox.resolveReplay(partitionKey, envelope.data.release_version);
    }
  }

  private async resolveAndVerify(
    envelope: ReleaseEnvelope,
  ): Promise<
    | { status: 'valid'; bundle: ResolvedRelease }
    | { status: 'pending'; reasonCode: string }
    | { status: 'failed'; reasonCode: string }
  > {
    let resolved: ResolvedRelease | null;
    try {
      resolved = await this.resolver.resolve(
        envelope.organization_id,
        envelope.business_event_id,
        envelope.data.manifest_ref,
      );
    } catch {
      return { status: 'pending', reasonCode: 'MANIFEST_SOURCE_UNAVAILABLE' };
    }
    if (!resolved) return { status: 'pending', reasonCode: 'MANIFEST_NOT_AVAILABLE' };

    if (!this.isRecord(resolved)
      || !this.isRecord(resolved.manifest)
      || !Array.isArray(resolved.artifacts)) {
      return { status: 'failed', reasonCode: 'INVALID_RELEASE_BUNDLE' };
    }
    const manifest = resolved.manifest as unknown as ReleaseManifest;
    const artifacts = resolved.artifacts as ResolvedArtifact[];
    const { manifest_hash: manifestHash, ...manifestPayload } = manifest;
    if (typeof manifestHash !== 'string'
      || !/^[a-f0-9]{64}$/.test(manifestHash)
      || computeSha256(manifestPayload) !== manifestHash) {
      return { status: 'failed', reasonCode: 'MANIFEST_HASH_MISMATCH' };
    }
    if (manifest.organization_id !== envelope.organization_id
      || manifest.business_event_id !== envelope.business_event_id
      || manifest.publication_id !== envelope.data.publication_id
      || manifest.release_version !== envelope.data.release_version
      || manifest.manifest_ref !== envelope.data.manifest_ref
      || manifest.manifest_hash !== envelope.data.manifest_hash
      || envelope.aggregate.id !== manifest.publication_id
      || envelope.aggregate.version !== manifest.release_version) {
      return { status: 'failed', reasonCode: 'MANIFEST_ENVELOPE_MISMATCH' };
    }

    if (!this.isRecord(manifest.artifacts)) return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_REFERENCES' };
    const manifestKinds = Object.keys(manifest.artifacts).sort();
    if (manifestKinds.join(',') !== [...EXPECTED_ARTIFACT_KINDS].sort().join(',')) {
      return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_REFERENCES' };
    }
    if (artifacts.length !== EXPECTED_ARTIFACT_KINDS.length) {
      if (artifacts.length > EXPECTED_ARTIFACT_KINDS.length) {
        return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_BUNDLE' };
      }
    }

    const artifactByKind = new Map<string, ResolvedArtifact>();
    for (const rawArtifact of artifacts) {
      if (!this.isRecord(rawArtifact)) return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_BUNDLE' };
      const artifact = rawArtifact as unknown as ResolvedArtifact;
      if (typeof artifact.kind !== 'string' || !EXPECTED_ARTIFACT_KINDS.includes(artifact.kind as ReleaseArtifactKind)) {
        return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_BUNDLE' };
      }
      if (artifactByKind.has(artifact.kind)) return { status: 'failed', reasonCode: 'DUPLICATE_ARTIFACT_KIND' };
      artifactByKind.set(artifact.kind, artifact);
    }
    if (EXPECTED_ARTIFACT_KINDS.some((kind) => !artifactByKind.has(kind))) {
      return { status: 'pending', reasonCode: 'ARTIFACTS_INCOMPLETE' };
    }
    for (const kind of EXPECTED_ARTIFACT_KINDS) {
      const referenceValue = manifest.artifacts[kind];
      if (!this.isRecord(referenceValue)) return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_REFERENCES' };
      const reference = referenceValue as unknown as ManifestArtifactReference;
      if (typeof reference.kind !== 'string' || typeof reference.version !== 'string'
        || typeof reference.ref !== 'string' || typeof reference.sha256 !== 'string') {
        return { status: 'failed', reasonCode: 'INVALID_ARTIFACT_REFERENCES' };
      }
      const artifact = artifactByKind.get(kind);
      if (!artifact) return { status: 'pending', reasonCode: 'ARTIFACTS_INCOMPLETE' };
      if (reference.kind !== kind || artifact.kind !== kind
        || artifact.ref !== reference.ref
        || artifact.version !== reference.version
        || artifact.sha256 !== reference.sha256) {
        return { status: 'failed', reasonCode: 'ARTIFACT_REFERENCE_MISMATCH' };
      }
      if (typeof artifact.ref !== 'string'
        || typeof artifact.version !== 'string'
        || !this.isRecord(artifact.body)
        || !/^[a-f0-9]{64}$/.test(artifact.sha256)
        || computeSha256(artifact.body) !== artifact.sha256) {
        return { status: 'failed', reasonCode: 'ARTIFACT_HASH_MISMATCH' };
      }
    }
    return { status: 'valid', bundle: resolved };
  }

  private validateEnvelopeIdentity(envelope: ReleaseEnvelope): string | null {
    if (!UUID_PATTERN.test(envelope.organization_id)
      || !UUID_PATTERN.test(envelope.business_event_id)
      || !UUID_PATTERN.test(envelope.data.publication_id)) return 'INVALID_RELEASE_IDENTITY';
    if (envelope.partition_key !== `${envelope.organization_id}:${envelope.business_event_id}`) return 'PARTITION_KEY_MISMATCH';
    if (envelope.aggregate.type !== 'release'
      || envelope.aggregate.id !== envelope.data.publication_id
      || envelope.aggregate.version !== envelope.data.release_version) return 'AGGREGATE_VERSION_MISMATCH';
    return null;
  }

  private activate(delivery: StoredDelivery, envelope: ReleaseEnvelope, bundle: ResolvedRelease): void {
    const artifacts = Object.fromEntries(bundle.artifacts.map((artifact) => [artifact.kind, artifact.body])) as Record<ReleaseArtifactKind, Record<string, unknown>>;
    this.inbox.activate(delivery, {
      partition_key: envelope.partition_key,
      organization_id: envelope.organization_id,
      business_event_id: envelope.business_event_id,
      active_release_version: envelope.data.release_version,
      publication_id: envelope.data.publication_id,
      manifest_hash: envelope.data.manifest_hash,
      artifacts,
    });
  }

  private fail(delivery: StoredDelivery, reasonCode: string): ConsumerResult {
    delivery.entry.status = 'failed';
    delivery.entry.reason_code = reasonCode;
    this.inbox.save(delivery);
    return this.result('failed', delivery.entry.domain_event_id, reasonCode);
  }

  private recordInvalidEnvelope(envelope: Record<string, unknown> | null, domainEventId: string | null): ConsumerResult {
    if (!domainEventId || !UUID_PATTERN.test(domainEventId)) {
      return this.result('failed', domainEventId, 'INVALID_ENVELOPE');
    }
    const existing = this.inbox.get(this.consumerName, domainEventId);
    const domainFactHash = this.domainFactHash(envelope ?? {});
    if (existing && existing.entry.domain_fact_hash !== domainFactHash) {
      return this.result('failed', domainEventId, 'DOMAIN_EVENT_ID_COLLISION');
    }
    if (existing?.entry.status === 'active') {
      return this.result('failed', domainEventId, 'INVALID_ENVELOPE');
    }
    const entry: InboxEntry = existing?.entry ?? {
      consumer_name: this.consumerName,
      domain_event_id: domainEventId,
      domain_fact_hash: domainFactHash,
      partition_key: 'invalid',
      release_version: 0,
      publication_id: 'invalid',
      status: 'failed',
      reason_code: 'INVALID_ENVELOPE',
    };
    entry.status = 'failed';
    entry.reason_code = 'INVALID_ENVELOPE';
    this.inbox.save({ entry, envelope: envelope as unknown as ReleaseEnvelope, headers: {} });
    return this.result('failed', domainEventId, 'INVALID_ENVELOPE');
  }

  private containsForbiddenPii(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((item) => this.containsForbiddenPii(item));
    if (!this.isRecord(value)) return false;
    return Object.entries(value).some(([key, nested]) =>
      FORBIDDEN_PII_KEYS.has(key.toLowerCase()) || this.containsForbiddenPii(nested));
  }

  private domainFactHash(value: object): string {
    const { message_id: _messageId, published_at: _publishedAt, ...domainFact } = value as Record<string, unknown>;
    return computeSha256(domainFact);
  }

  private requestMissingVersions(partitionKey: string, first: number, before: number): number[] {
    const missing: number[] = [];
    const limit = Math.min(before, first + MAX_REPLAY_REQUEST_WINDOW);
    for (let version = first; version < limit; version += 1) {
      this.inbox.requestReplay(partitionKey, version);
      missing.push(version);
    }
    return missing;
  }

  private result(status: InboxStatus, domainEventId: string | null, reasonCode?: string, duplicate?: boolean): ConsumerResult {
    return {
      status,
      domain_event_id: domainEventId,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      ...(duplicate ? { duplicate: true } : {}),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => {};
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
