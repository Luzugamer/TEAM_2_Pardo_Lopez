import { PublicationContext } from './publication-context.interface';
import { ArtifactResult } from './artifact-provider.interface';

export const SCHEDULE_ARTIFACT_PROVIDER = Symbol('SCHEDULE_ARTIFACT_PROVIDER');

export interface ScheduleArtifactProviderContract {
  validateSchedule(context: PublicationContext): Promise<{ errors: string[]; warnings: string[] }>;
  buildScheduleArtifact(context: PublicationContext): Promise<ArtifactResult>;
}
