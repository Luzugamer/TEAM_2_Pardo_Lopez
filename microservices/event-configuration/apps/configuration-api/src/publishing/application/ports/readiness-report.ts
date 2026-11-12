export interface ReadinessReport {
  is_ready: boolean;
  event_id: string;
  organization_id: string;
  expected_revision: number;
  errors: string[];
  warnings: string[];
  checked_at: string;
}
