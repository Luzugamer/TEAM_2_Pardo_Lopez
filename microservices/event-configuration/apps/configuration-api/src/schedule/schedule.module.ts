import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { IdempotencyModule } from '../shared/idempotency/idempotency.module';
import { ScheduleController } from './presentation/schedule.controller';
import { ScheduleRepository } from './infrastructure/persistence/schedule.repository';
import { ScheduleService } from './application/schedule.service';
import { SpeakersController } from './presentation/speakers.controller';
import { SpeakersService } from './application/speakers.service';
import { EventsService } from '../events/application/events.service';
import { DatabaseService } from '../shared/database/database.service';
import { SCHEDULE_REPOSITORY } from './domain/ports/schedule-repository.port';
import { EVENT_SNAPSHOT_READER } from './application/ports/event-snapshot-reader.port';
import { SERIALIZABLE_TRANSACTION } from '../shared/application/serializable-transaction.port';
import { TENANT_TRANSACTION } from '../shared/application/tenant-transaction.port';
import { SPEAKER_REPOSITORY } from './domain/ports/speaker-repository.port';
import { CONSENT_NOTICE_READER } from './application/ports/consent-notice-reader.port';
import { SpeakerRepository } from './infrastructure/persistence/speaker.repository';
import { EnvConsentNoticeReader } from './infrastructure/config/env-consent-notice.reader';

@Module({
  imports: [EventsModule, IdempotencyModule],
  controllers: [ScheduleController, SpeakersController],
  providers: [
    ScheduleService,
    ScheduleRepository,
    SpeakersService,
    SpeakerRepository,
    EnvConsentNoticeReader,
    { provide: SCHEDULE_REPOSITORY, useExisting: ScheduleRepository },
    { provide: EVENT_SNAPSHOT_READER, useExisting: EventsService },
    { provide: SERIALIZABLE_TRANSACTION, useExisting: DatabaseService },
    { provide: TENANT_TRANSACTION, useExisting: DatabaseService },
    { provide: SPEAKER_REPOSITORY, useExisting: SpeakerRepository },
    { provide: CONSENT_NOTICE_READER, useExisting: EnvConsentNoticeReader },
  ],
})
export class ScheduleModule {}
