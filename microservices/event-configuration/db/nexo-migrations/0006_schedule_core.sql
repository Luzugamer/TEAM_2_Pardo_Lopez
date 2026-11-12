-- Integrante B: tenant-scoped venues, programs, sessions, and exclusive venue reservations.
-- Forward-only migration. Published history is retained through soft archival and audit.

-- La extensión la provisiona Platform o el bootstrap local.
CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    kind VARCHAR(16) NOT NULL,
    parent_venue_id UUID,
    name VARCHAR(180) NOT NULL,
    location JSONB NOT NULL,
    capacity INTEGER,
    exclusive BOOLEAN NOT NULL,
    accessibility JSONB NOT NULL DEFAULT '[]'::jsonb,
    archived_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    CONSTRAINT chk_venues_kind CHECK (kind IN ('venue', 'room')),
    CONSTRAINT chk_venues_parent_kind CHECK (
        (kind = 'venue' AND parent_venue_id IS NULL)
        OR (kind = 'room' AND parent_venue_id IS NOT NULL)
    ),
    CONSTRAINT chk_venues_capacity CHECK (capacity IS NULL OR capacity > 0),
    CONSTRAINT chk_venues_location_object CHECK (jsonb_typeof(location) = 'object'),
    CONSTRAINT chk_venues_accessibility_array CHECK (jsonb_typeof(accessibility) = 'array'),
    CONSTRAINT chk_venues_revision CHECK (revision > 0),
    CONSTRAINT uq_venues_org_id UNIQUE (organization_id, id),
    CONSTRAINT fk_venues_parent FOREIGN KEY (organization_id, parent_venue_id)
        REFERENCES venues (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_venues_org_active_name
    ON venues (organization_id, name, id)
    WHERE archived_at IS NULL;
CREATE INDEX idx_venues_parent
    ON venues (organization_id, parent_venue_id)
    WHERE parent_venue_id IS NOT NULL;

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues FORCE ROW LEVEL SECURITY;
CREATE POLICY venues_tenant_isolation ON venues
    FOR ALL
    USING (organization_id = current_app_organization_id())
    WITH CHECK (organization_id = current_app_organization_id());

CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    event_id UUID NOT NULL,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL,
    color VARCHAR(7),
    archived_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    CONSTRAINT chk_programs_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT chk_programs_order CHECK (display_order >= 0),
    CONSTRAINT chk_programs_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT chk_programs_revision CHECK (revision > 0),
    CONSTRAINT uq_programs_org_id UNIQUE (organization_id, id),
    CONSTRAINT uq_programs_org_event_id UNIQUE (organization_id, event_id, id),
    CONSTRAINT uq_programs_org_event_slug UNIQUE (organization_id, event_id, slug),
    CONSTRAINT fk_programs_event FOREIGN KEY (organization_id, event_id)
        REFERENCES events (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_programs_org_event_order
    ON programs (organization_id, event_id, display_order, id)
    WHERE archived_at IS NULL;

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs FORCE ROW LEVEL SECURITY;
CREATE POLICY programs_tenant_isolation ON programs
    FOR ALL
    USING (organization_id = current_app_organization_id())
    WITH CHECK (organization_id = current_app_organization_id());

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    event_id UUID NOT NULL,
    program_id UUID NOT NULL,
    venue_id UUID NOT NULL,
    title VARCHAR(220) NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    status_reason TEXT,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    CONSTRAINT chk_sessions_time_range CHECK (starts_at < ends_at),
    CONSTRAINT chk_sessions_status CHECK (status IN ('draft', 'scheduled', 'cancelled', 'completed')),
    CONSTRAINT chk_sessions_revision CHECK (revision > 0),
    CONSTRAINT uq_sessions_org_id UNIQUE (organization_id, id),
    CONSTRAINT uq_sessions_org_event_id UNIQUE (organization_id, event_id, id),
    CONSTRAINT fk_sessions_event FOREIGN KEY (organization_id, event_id)
        REFERENCES events (organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_program_same_event FOREIGN KEY (organization_id, event_id, program_id)
        REFERENCES programs (organization_id, event_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_sessions_venue FOREIGN KEY (organization_id, venue_id)
        REFERENCES venues (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_sessions_org_event_start
    ON sessions (organization_id, event_id, starts_at, program_id, id);
CREATE INDEX idx_sessions_org_program
    ON sessions (organization_id, program_id);
CREATE INDEX idx_sessions_org_venue
    ON sessions (organization_id, venue_id);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_tenant_isolation ON sessions
    FOR ALL
    USING (organization_id = current_app_organization_id())
    WITH CHECK (organization_id = current_app_organization_id());

CREATE TABLE resource_reservations (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    organization_id UUID NOT NULL,
    event_id UUID NOT NULL,
    session_id UUID NOT NULL,
    venue_id UUID NOT NULL,
    reserved_range TSTZRANGE NOT NULL,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by UUID NOT NULL,
    CONSTRAINT chk_resource_reservations_nonempty CHECK (NOT isempty(reserved_range)),
    CONSTRAINT chk_resource_reservations_half_open CHECK (
        lower_inc(reserved_range) AND NOT upper_inc(reserved_range)
    ),
    CONSTRAINT uq_resource_reservations_org_id UNIQUE (organization_id, id),
    CONSTRAINT fk_resource_reservations_session FOREIGN KEY (organization_id, event_id, session_id)
        REFERENCES sessions (organization_id, event_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_resource_reservations_venue FOREIGN KEY (organization_id, venue_id)
        REFERENCES venues (organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT ex_resource_reservations_venue_range EXCLUDE USING gist (
        organization_id WITH =,
        venue_id WITH =,
        reserved_range WITH &&
    ) WHERE (released_at IS NULL)
);

CREATE UNIQUE INDEX uq_resource_reservations_active_session
    ON resource_reservations (organization_id, session_id)
    WHERE released_at IS NULL;
CREATE INDEX idx_resource_reservations_org_event
    ON resource_reservations (organization_id, event_id, venue_id)
    WHERE released_at IS NULL;

ALTER TABLE resource_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_reservations_tenant_isolation ON resource_reservations
    FOR ALL
    USING (organization_id = current_app_organization_id())
    WITH CHECK (organization_id = current_app_organization_id());
