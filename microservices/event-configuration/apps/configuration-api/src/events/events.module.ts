import { Module } from '@nestjs/common';
import { EventsController } from './presentation/events.controller';
import { EventsService } from './application/events.service';
import { EventsRepository } from './infrastructure/persistence/events.repository';
import { MembershipAdapter } from './infrastructure/adapters/membership.adapter';
import { AuthGuard, CLAIMS_PROVIDER, MockClaimsProvider } from '../shared/auth/auth.guard';
import { EVENTS_REPOSITORY } from './domain/ports/events-repository.port';
import { MEMBERSHIP_READER } from './domain/ports/membership-reader.port';
import { selectMembershipReader } from './infrastructure/adapters/membership-selection';
import { selectClaimsProvider } from '../shared/auth/claims-selection';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, MembershipAdapter, AuthGuard, MockClaimsProvider,
    { provide: EVENTS_REPOSITORY, useExisting: EventsRepository },
    { provide: MEMBERSHIP_READER, useFactory: (mock: MembershipAdapter) => selectMembershipReader(process.env, mock), inject: [MembershipAdapter] },
    { provide: CLAIMS_PROVIDER, useFactory: (mock: MockClaimsProvider) => selectClaimsProvider(process.env, mock), inject: [MockClaimsProvider] }],
  exports: [EventsService, EventsRepository, MembershipAdapter, AuthGuard, CLAIMS_PROVIDER],
})
export class EventsModule {}

