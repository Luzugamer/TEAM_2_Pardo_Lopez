import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

describe('serializable transaction retries', () => {
  it.each([{ code: '40001' }, { code: '40P01' }, { code: '23505', constraint: 'uq_idempotency_actor_operation_key' }, { code: '23505', constraint: 'uq_form_version_number' }])('retries only recognized database conflicts %#', async (error) => {
    const db = new DatabaseService(new ConfigService());
    const tx = vi.spyOn(db, 'withTenantTransaction').mockRejectedValueOnce(error).mockResolvedValueOnce('ok');
    await expect(db.withSerializableTransaction('tenant', async () => 'ok')).resolves.toBe('ok');
    expect(tx).toHaveBeenCalledTimes(2);
  });
  it('does not retry unrelated uniqueness violations', async () => {
    const db = new DatabaseService(new ConfigService());
    const error = { code: '23505', constraint: 'uq_events_slug' };
    const tx = vi.spyOn(db, 'withTenantTransaction').mockRejectedValue(error);
    await expect(db.withSerializableTransaction('tenant', async () => 'ok')).rejects.toBe(error);
    expect(tx).toHaveBeenCalledTimes(1);
  });
  it('stops after the configured retry budget', async () => {
    const db = new DatabaseService(new ConfigService());
    const error = { code: '40001' };
    const tx = vi.spyOn(db, 'withTenantTransaction').mockRejectedValue(error);
    await expect(db.withSerializableTransaction('tenant', async () => 'ok', 2)).rejects.toBe(error);
    expect(tx).toHaveBeenCalledTimes(2);
  });
});
