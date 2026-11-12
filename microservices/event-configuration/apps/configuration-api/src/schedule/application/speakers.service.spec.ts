import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeakerRepositoryPort } from '../domain/ports/speaker-repository.port';
import { SpeakersService } from './speakers.service';

const claims = { sub: 'actor', organization_id: 'tenant', roles: ['event_manager'], scopes: [] };
const speaker = {
  id: 'speaker', organization_id: 'tenant', display_name: 'Ana', bio: null, media_ref: null,
  public_consent: true, public_consent_at: null, public_consent_version: 'v1', exclusive: false,
  archived_at: null, revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

describe('SpeakersService', () => {
  let repository: { [K in keyof SpeakerRepositoryPort]: ReturnType<typeof vi.fn> };
  let service: SpeakersService;

  beforeEach(() => {
    repository = {
      list: vi.fn(), findActive: vi.fn().mockResolvedValue(speaker), hasActiveReservation: vi.fn().mockResolvedValue(false),
      insert: vi.fn().mockResolvedValue(speaker), update: vi.fn().mockResolvedValue({ ...speaker, revision: 2 }),
      archive: vi.fn().mockResolvedValue(true), appendAudit: vi.fn(), appendConsent: vi.fn(),
    };
    service = new SpeakersService(repository as unknown as SpeakerRepositoryPort,
      { withTenantTransaction: async (_organizationId, action) => action() },
      { getNotice: () => ({ text: 'Notice', version: 'v1' }) });
  });

  it('rejects stale consent before writing', async () => {
    await expect(service.create(claims, { display_name: 'Ana', public_consent: true, public_consent_version: 'old' })).rejects.toThrow();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('records audit and consent for creation within the tenant', async () => {
    await service.create(claims, { display_name: 'Ana', public_consent: true, public_consent_version: 'v1' });
    expect(repository.appendAudit).toHaveBeenCalledWith('tenant', expect.objectContaining({ actorId: 'actor' }), 'speaker', 'created', 1, { display_name: 'Ana' });
    expect(repository.appendConsent).toHaveBeenCalledWith('tenant', 'actor', 'speaker', true, 'v1');
  });

  it('records the previous notice version when consent is revoked', async () => {
    await service.update(claims, 'speaker', 1, { public_consent: false });
    expect(repository.appendConsent).toHaveBeenCalledWith('tenant', 'actor', 'speaker', false, 'v1');
    expect(repository.appendAudit).toHaveBeenCalledWith('tenant', expect.anything(), 'speaker', 'consent_revoked', 2, expect.anything());
  });

  it('does not archive a speaker with an active reservation', async () => {
    repository.hasActiveReservation.mockResolvedValue(true);
    await expect(service.archive(claims, 'speaker', 1)).rejects.toThrow();
    expect(repository.archive).not.toHaveBeenCalled();
  });
});
