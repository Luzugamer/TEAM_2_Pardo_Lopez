import { computeSha256 } from '../../../shared/crypto/canonical-json';
import { ArtifactResult } from '../../application/ports/artifact-provider.interface';
import { PublicationContext } from '../../application/ports/publication-context.interface';
import { ScheduleArtifactProviderContract } from '../../application/ports/schedule-artifact-provider.interface';

/** Test fixture used by integration-style unit tests that do not open PostgreSQL. */
export class FixtureScheduleArtifactProvider implements ScheduleArtifactProviderContract {
  private mockErrors: string[] = [];
  private mockWarnings: string[] = [];
  private customBody: Record<string, unknown> | null = null;

  setMockErrors(errors: string[]): void { this.mockErrors = errors; }
  setMockWarnings(warnings: string[]): void { this.mockWarnings = warnings; }
  setCustomBody(body: Record<string, unknown> | null): void { this.customBody = body; }
  reset(): void {
    this.mockErrors = [];
    this.mockWarnings = [];
    this.customBody = null;
  }

  async validateSchedule(_context: PublicationContext): Promise<{ errors: string[]; warnings: string[] }> {
    return { errors: [...this.mockErrors], warnings: [...this.mockWarnings] };
  }

  async buildScheduleArtifact(context: PublicationContext): Promise<ArtifactResult> {
    const validation = await this.validateSchedule(context);
    const body = this.customBody ?? {
      schema_version: '1.0.0-fixture',
      event_id: context.event_id,
      programs: [],
      venues: [],
      sessions: [],
    };
    return {
      kind: 'schedule',
      version: '1.0.0-fixture',
      body,
      hash: computeSha256(body),
      ...validation,
    };
  }
}
