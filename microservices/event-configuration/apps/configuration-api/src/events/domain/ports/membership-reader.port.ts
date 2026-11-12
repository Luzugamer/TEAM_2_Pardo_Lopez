export const MEMBERSHIP_READER = Symbol('MEMBERSHIP_READER');

export interface MembershipReader {
  validateActiveMembership(organizationId: string, userId: string): Promise<{ isValid: boolean; reason?: string }>;
}
