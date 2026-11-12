import { describe, expect, it } from 'vitest';
import { selectMembershipReader } from './membership-selection';
import { MembershipAdapter } from './membership.adapter';

const org = '0194eb00-0000-7000-8000-000000000001';
const active = '0194eb00-0000-7000-9000-000000000001';
const inactive = '0194eb00-0000-7000-9000-000000000003';

describe('membership provider selection', () => {
  it('uses explicitly selected local mock and rejects inactive or cross-tenant members', async () => {
    const reader = selectMembershipReader({ NODE_ENV: 'development', MEMBERSHIP_MODE: 'mock' }, new MembershipAdapter());
    expect((await reader.validateActiveMembership(org, active)).isValid).toBe(true);
    expect((await reader.validateActiveMembership(org, inactive)).isValid).toBe(false);
    expect((await reader.validateActiveMembership('0194eb00-0000-7000-8000-000000000002', active)).isValid).toBe(false);
  });
  it('fails closed if the real provider is missing', async () => {
    const reader = selectMembershipReader({ NODE_ENV: 'production' }, new MembershipAdapter());
    await expect(reader.validateActiveMembership(org, active)).rejects.toMatchObject({ status: 503 });
  });
  it('rejects mock selection outside development and test', () => {
    expect(() => selectMembershipReader({ NODE_ENV: 'production', MEMBERSHIP_MODE: 'mock' }, new MembershipAdapter())).toThrow();
    expect(() => selectMembershipReader({ NODE_ENV: 'development', MEMBERSHIP_MODE: 'other' }, new MembershipAdapter())).toThrow();
  });
});
