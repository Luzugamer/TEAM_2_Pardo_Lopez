-- SOLO DESARROLLO: carga un conjunto ficticio para org-a-manager.
-- No es una migración, no se ejecuta automáticamente y evita modificar datos existentes.
-- Requiere las migraciones 0001 a 0007. Las sesiones se crean en borrador;
-- prográmalas mediante la API para generar sus reservas y auditoría normales.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path TO events, public;
SELECT set_config('app.current_organization_id', '0194eb00-0000-7000-8000-000000000001', true);

DO $seed$
DECLARE
  org constant uuid := '0194eb00-0000-7000-8000-000000000001';
  actor constant uuid := '0194eb00-0000-7000-9000-000000000001';
  event_id constant uuid := '0194eb11-1000-7000-8000-000000000001';
  revision_id constant uuid := '0194eb11-2000-7000-8000-000000000001';
  site_id constant uuid := '0194eb11-3000-7000-8000-000000000001';
  venue_id constant uuid := '0194eb11-4000-7000-8000-000000000001';
  room_id constant uuid := '0194eb11-4000-7000-8000-000000000002';
  program_id constant uuid := '0194eb11-5000-7000-8000-000000000001';
  speaker_id constant uuid := '0194eb11-6000-7000-8000-000000000001';
  session_id constant uuid := '0194eb11-7000-7000-8000-000000000001';
  starts timestamptz := date_trunc('day', now()) + interval '30 days 14 hours';
  ends timestamptz := starts + interval '8 hours';
BEGIN
  IF EXISTS (SELECT 1 FROM events e WHERE e.organization_id = org AND e.id = event_id) THEN
    RAISE NOTICE 'Los datos de demostración ya existen; no se modificaron.';
    RETURN;
  END IF;

  INSERT INTO events (id, organization_id, site_id, slug, kind, title, description, timezone, starts_at, ends_at, status, current_revision_id, revision_number, policy, metadata)
  VALUES (event_id, org, site_id, 'encuentro-demostracion-grupo2', 'conference', 'Encuentro de innovación — demostración',
    'Evento ficticio para explorar las funciones del servicio.', 'America/Lima', starts, ends, 'draft', revision_id, 1, '{}'::jsonb, '{"demo":true}'::jsonb);

  INSERT INTO event_revisions (id, organization_id, event_id, revision_number, snapshot, change_summary, created_by)
  VALUES (revision_id, org, event_id, 1, jsonb_build_object(
    'id', event_id, 'site_id', site_id, 'slug', 'encuentro-demostracion-grupo2', 'kind', 'conference',
    'title', 'Encuentro de innovación — demostración', 'description', 'Evento ficticio para explorar las funciones del servicio.',
    'timezone', 'America/Lima', 'starts_at', starts, 'ends_at', ends, 'status', 'draft', 'policy', '{}'::jsonb, 'metadata', '{"demo":true}'::jsonb),
    'Creación de datos ficticios de demostración.', actor::text);

  INSERT INTO venues (id, organization_id, kind, parent_venue_id, name, location, capacity, exclusive, accessibility, created_by, updated_by)
  VALUES (venue_id, org, 'venue', NULL, 'Centro de eventos de demostración', '{"address":"Dirección ficticia 123","locality":"Tingo María","country_code":"PE"}'::jsonb, 300, false, '["acceso sin escalones"]'::jsonb, actor, actor),
         (room_id, org, 'room', venue_id, 'Sala principal de demostración', '{"address":"Dirección ficticia 123","locality":"Tingo María","country_code":"PE"}'::jsonb, 100, true, '[]'::jsonb, actor, actor);

  INSERT INTO programs (id, organization_id, event_id, slug, name, description, display_order, created_by, updated_by)
  VALUES (program_id, org, event_id, 'programa-principal-demo', 'Programa principal', 'Programa ficticio de demostración.', 0, actor, actor);

  -- Sin consentimiento público: no se presupone la aceptación de un aviso real.
  INSERT INTO speakers (id, organization_id, display_name, bio, public_consent, exclusive, created_by, updated_by)
  VALUES (speaker_id, org, 'Ponente de demostración', 'Perfil ficticio para pruebas.', false, false, actor, actor);

  INSERT INTO sessions (id, organization_id, event_id, program_id, venue_id, title, description, starts_at, ends_at, status, created_by, updated_by)
  VALUES (session_id, org, event_id, program_id, room_id, 'Sesión de apertura', 'Sesión ficticia en borrador.', starts + interval '1 hour', starts + interval '2 hours', 'draft', actor, actor),
         ('0194eb11-7000-7000-8000-000000000002', org, event_id, program_id, room_id, 'Taller de innovación', 'Segunda sesión ficticia en borrador.', starts + interval '3 hours', starts + interval '4 hours', 'draft', actor, actor);

  INSERT INTO session_speakers (id, organization_id, event_id, session_id, speaker_id, display_order, created_by)
  VALUES ('0194eb11-8000-7000-8000-000000000001', org, event_id, session_id, speaker_id, 0, actor);

  INSERT INTO audit (organization_id, entity_type, entity_id, action, actor_id, actor_roles, revision_number, diff)
  VALUES (org, 'event', event_id, 'created', actor::text, ARRAY['event_manager'], 1, '{"source":"development_seed"}'::jsonb);
  RAISE NOTICE 'Datos de demostración creados para la organización A.';
END
$seed$;
COMMIT;
