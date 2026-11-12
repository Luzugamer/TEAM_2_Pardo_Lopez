import { PublicationContext } from './publication-context.interface';
import { ArtifactResult } from './artifact-provider.interface';

export const FORM_ARTIFACT_PROVIDER = Symbol('FORM_ARTIFACT_PROVIDER');

export interface FormArtifactProviderContract {
  validateBindings(context: PublicationContext): Promise<{ errors: string[]; warnings: string[] }>;
  buildFormArtifact(context: PublicationContext): Promise<ArtifactResult>;
}
