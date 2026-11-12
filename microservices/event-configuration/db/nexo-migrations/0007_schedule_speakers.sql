-- Etapa 2: speaker profiles, session association and exclusive speaker reservations.
CREATE TABLE speakers (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    display_name VARCHAR(180) NOT NULL,
    bio TEXT,
    media_ref VARCHAR(500),
    public_consent BOOLEAN NOT NULL DEFAULT FALSE,
    public_consent_at TIMESTAMPTZ,
    public_consent_version VARCHAR(80),
    exclusive BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    CONSTRAINT uq_speakers_org_id UNIQUE (organization_id, id),
    CONSTRAINT chk_speakers_revision CHECK (revision > 0),
    CONSTRAINT chk_speakers_consent CHECK (
      (public_consent = FALSE AND public_consent_at IS NULL AND public_consent_version IS NULL)
      OR (public_consent = TRUE AND public_consent_at IS NOT NULL AND public_consent_version IS NOT NULL)
    )
);
CREATE INDEX idx_speakers_org_active_name ON speakers (organization_id, display_name, id) WHERE archived_at IS NULL;
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE speakers FORCE ROW LEVEL SECURITY;
CREATE POLICY speakers_tenant_isolation ON speakers FOR ALL
  USING (organization_id = current_app_organization_id())
  WITH CHECK (organization_id = current_app_organization_id());

CREATE TABLE speaker_consent_history (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    speaker_id UUID NOT NULL,
    consent BOOLEAN NOT NULL,
    notice_version VARCHAR(80) NOT NULL,
    actor_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_speaker_consent_history_speaker FOREIGN KEY (organization_id, speaker_id)
      REFERENCES speakers (organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_speaker_consent_history_org_speaker ON speaker_consent_history (organization_id, speaker_id, occurred_at DESC);
ALTER TABLE speaker_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_consent_history FORCE ROW LEVEL SECURITY;
CREATE POLICY speaker_consent_history_tenant_isolation ON speaker_consent_history FOR ALL
  USING (organization_id = current_app_organization_id())
  WITH CHECK (organization_id = current_app_organization_id());

CREATE TABLE session_speakers (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    event_id UUID NOT NULL,
    session_id UUID NOT NULL,
    speaker_id UUID NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL,
    CONSTRAINT uq_session_speakers_org_session_speaker UNIQUE (organization_id, session_id, speaker_id),
    CONSTRAINT uq_session_speakers_org_id UNIQUE (organization_id, id),
    CONSTRAINT chk_session_speakers_order CHECK (display_order >= 0),
    CONSTRAINT fk_session_speakers_session FOREIGN KEY (organization_id, event_id, session_id)
      REFERENCES sessions (organization_id, event_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_session_speakers_speaker FOREIGN KEY (organization_id, speaker_id)
      REFERENCES speakers (organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_session_speakers_org_event_session ON session_speakers (organization_id, event_id, session_id, display_order);
ALTER TABLE session_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_speakers FORCE ROW LEVEL SECURITY;
CREATE POLICY session_speakers_tenant_isolation ON session_speakers FOR ALL
  USING (organization_id = current_app_organization_id())
  WITH CHECK (organization_id = current_app_organization_id());

DROP INDEX uq_resource_reservations_active_session;
ALTER TABLE resource_reservations ALTER COLUMN venue_id DROP NOT NULL;
ALTER TABLE resource_reservations ADD COLUMN speaker_id UUID;
ALTER TABLE resource_reservations ADD CONSTRAINT chk_resource_reservations_resource_xor
  CHECK ((venue_id IS NOT NULL)::integer + (speaker_id IS NOT NULL)::integer = 1);
ALTER TABLE resource_reservations ADD CONSTRAINT fk_resource_reservations_speaker
  FOREIGN KEY (organization_id, speaker_id) REFERENCES speakers (organization_id, id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX uq_resource_reservations_active_session_venue
  ON resource_reservations (organization_id, session_id) WHERE released_at IS NULL AND venue_id IS NOT NULL;
CREATE UNIQUE INDEX uq_resource_reservations_active_session_speaker
  ON resource_reservations (organization_id, session_id, speaker_id) WHERE released_at IS NULL AND speaker_id IS NOT NULL;
ALTER TABLE resource_reservations ADD CONSTRAINT ex_resource_reservations_speaker_range EXCLUDE USING gist (
  organization_id WITH =, speaker_id WITH =, reserved_range WITH &&
) WHERE (released_at IS NULL AND speaker_id IS NOT NULL);
CREATE INDEX idx_resource_reservations_org_speaker
  ON resource_reservations (organization_id, speaker_id) WHERE released_at IS NULL AND speaker_id IS NOT NULL;
