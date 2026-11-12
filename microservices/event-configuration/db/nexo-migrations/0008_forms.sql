CREATE TABLE form_definitions (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, name varchar(180) NOT NULL,
 purpose varchar(20) NOT NULL CHECK (purpose IN ('registration','application','feedback')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT uq_form_definitions_org_id UNIQUE (organization_id,id)
);
CREATE INDEX idx_form_definitions_tenant ON form_definitions (organization_id,created_at,id);
CREATE TABLE form_versions (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, form_definition_id uuid NOT NULL,
 version_number integer NOT NULL CHECK (version_number > 0), revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
 schema jsonb NOT NULL, ui_schema jsonb NOT NULL, consent jsonb NOT NULL, field_policies jsonb NOT NULL,
 schema_hash char(64), ui_hash char(64), consent_hash char(64), published_at timestamptz,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT uq_form_versions_org_id UNIQUE (organization_id,id),
 CONSTRAINT uq_form_version_number UNIQUE (organization_id,form_definition_id,version_number),
 CONSTRAINT fk_form_version_definition FOREIGN KEY (organization_id,form_definition_id) REFERENCES form_definitions(organization_id,id),
 CONSTRAINT chk_form_published_hashes CHECK (status='draft' OR (schema_hash IS NOT NULL AND ui_hash IS NOT NULL AND consent_hash IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX idx_form_versions_tenant ON form_versions(organization_id,form_definition_id,version_number);
CREATE TABLE form_bindings (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, event_id uuid NOT NULL, form_version_id uuid NOT NULL,
 purpose varchar(20) NOT NULL CHECK (purpose IN ('registration','application','feedback')),
 status varchar(20) NOT NULL CHECK (status IN ('scheduled','open','closed','cancelled')),
 opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 close_reason text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT uq_form_bindings_org_id UNIQUE (organization_id,id), CONSTRAINT chk_form_binding_window CHECK (opens_at < closes_at),
 CONSTRAINT fk_form_binding_event FOREIGN KEY (organization_id,event_id) REFERENCES events(organization_id,id),
 CONSTRAINT fk_form_binding_version FOREIGN KEY (organization_id,form_version_id) REFERENCES form_versions(organization_id,id)
);
CREATE UNIQUE INDEX uq_form_binding_open ON form_bindings(organization_id,event_id,purpose) WHERE status='open';
CREATE INDEX idx_form_bindings_event ON form_bindings(organization_id,event_id,purpose);
CREATE FUNCTION protect_form_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'form version deletion is prohibited' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('published','retired') THEN
  IF OLD.status <> 'published' OR NEW.status <> 'retired' OR ROW(NEW.id,NEW.organization_id,NEW.form_definition_id,NEW.version_number,NEW.schema,NEW.ui_schema,NEW.consent,NEW.field_policies,NEW.schema_hash,NEW.ui_hash,NEW.consent_hash,NEW.published_at,NEW.created_by,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.form_definition_id,OLD.version_number,OLD.schema,OLD.ui_schema,OLD.consent,OLD.field_policies,OLD.schema_hash,OLD.ui_hash,OLD.consent_hash,OLD.published_at,OLD.created_by,OLD.created_at) THEN
   RAISE EXCEPTION 'published form versions are immutable' USING ERRCODE='23514';
  END IF;
 ELSIF OLD.status='draft' AND NEW.status NOT IN ('draft','published') THEN
  RAISE EXCEPTION 'invalid form version transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_form_version_immutable BEFORE UPDATE OR DELETE ON form_versions FOR EACH ROW EXECUTE FUNCTION protect_form_version();
CREATE FUNCTION protect_form_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_state text; form_purpose text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'binding deletion is prohibited' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status NOT IN ('scheduled','open') THEN RAISE EXCEPTION 'invalid initial binding status' USING ERRCODE='23514'; END IF;
  SELECT v.status,d.purpose INTO version_state,form_purpose FROM form_versions v JOIN form_definitions d ON d.organization_id=v.organization_id AND d.id=v.form_definition_id WHERE v.organization_id=NEW.organization_id AND v.id=NEW.form_version_id;
  IF version_state IS DISTINCT FROM 'published' OR form_purpose IS DISTINCT FROM NEW.purpose THEN RAISE EXCEPTION 'binding requires published compatible form' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.id,NEW.organization_id,NEW.event_id,NEW.form_version_id,NEW.purpose,NEW.opens_at,NEW.closes_at,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.event_id,OLD.form_version_id,OLD.purpose,OLD.opens_at,OLD.closes_at,OLD.created_by,OLD.created_at)
    OR NOT ((OLD.status='scheduled' AND NEW.status IN ('open','cancelled')) OR (OLD.status='open' AND NEW.status IN ('closed','cancelled'))) THEN
   RAISE EXCEPTION 'invalid binding transition' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_form_binding_guard BEFORE INSERT OR UPDATE OR DELETE ON form_bindings FOR EACH ROW EXECUTE FUNCTION protect_form_binding();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['form_definitions','form_versions','form_bindings'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = current_app_organization_id()) WITH CHECK (organization_id = current_app_organization_id())',table_name || '_tenant_isolation',table_name);
 END LOOP;
END $$;
