import { HttpException, HttpStatus } from '@nestjs/common';
import { MembershipReader } from '../../domain/ports/membership-reader.port';

class UnavailableMembershipReader implements MembershipReader {
  async validateActiveMembership(): Promise<never> {
    throw new HttpException('Membership provider is not configured.', HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/** Mock membership is available only when explicitly selected in local development. */
export function selectMembershipReader(env: NodeJS.ProcessEnv, mock: MembershipReader): MembershipReader {
  if (env.MEMBERSHIP_MODE === 'mock') {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      throw new Error('MEMBERSHIP_MODE=mock is restricted to development or test.');
    }
    return mock;
  }
  if (env.MEMBERSHIP_MODE && env.MEMBERSHIP_MODE !== 'unconfigured') {
    throw new Error('Unknown MEMBERSHIP_MODE.');
  }
  return new UnavailableMembershipReader();
}
