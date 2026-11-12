import { Module } from '@nestjs/common';
import { EventsService } from '../events/application/events.service';
import { DatabasePublicationUnitOfWork } from './infrastructure/persistence/publication-unit-of-work';
import { PUBLICATION_EVENTS, PUBLICATION_REPOSITORY, PUBLICATION_UNIT_OF_WORK } from './application/ports/publication-dependencies.port';
import { ReleaseAssemblerService } from './application/release-assembler.service';
import { PublishingRepository } from './infrastructure/persistence/publishing.repository';
import { ScheduleArtifactProvider } from './infrastructure/providers/schedule-artifact.provider';
import { FormsArtifactProvider } from '../forms/infrastructure/forms-artifact.provider';
import { EventsModule } from '../events/events.module';
import { SCHEDULE_ARTIFACT_PROVIDER } from './application/ports/schedule-artifact-provider.interface';
import { FORM_ARTIFACT_PROVIDER } from './application/ports/form-artifact-provider.interface';
import { PublishingController } from './presentation/publishing.controller';

@Module({
  imports: [EventsModule],
  controllers: [PublishingController],
  providers: [
    ReleaseAssemblerService,
    PublishingRepository,
    DatabasePublicationUnitOfWork,
    { provide: PUBLICATION_EVENTS, useExisting: EventsService },
    { provide: PUBLICATION_REPOSITORY, useExisting: PublishingRepository },
    { provide: PUBLICATION_UNIT_OF_WORK, useExisting: DatabasePublicationUnitOfWork },
    ScheduleArtifactProvider,
    FormsArtifactProvider,
    { provide: SCHEDULE_ARTIFACT_PROVIDER, useExisting: ScheduleArtifactProvider },
    { provide: FORM_ARTIFACT_PROVIDER, useExisting: FormsArtifactProvider },
  ],
  exports: [
    ReleaseAssemblerService,
    PublishingRepository,
    ScheduleArtifactProvider,
    FormsArtifactProvider,
  ],
})
export class PublishingModule {}

