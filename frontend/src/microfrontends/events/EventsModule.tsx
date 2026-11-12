import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Plus, RefreshCw, X } from "lucide-react";
import {
  items,
  createEventsTransport,
  type EventsRequest,
  type EventsRequestOptions,
  type EventsTransport,
  type RecordData,
} from "./api";
import type { ModuleContext } from "../../platform/microfrontends/contracts";
import { Alert, Card, PageHeading } from "../../design-system";
import "./events.css";
import { translateEvents as tr } from "../../core/events-i18n";
import { useI18n } from "../../core/i18n";
import { readSession } from "../../core/session";
import { eventPermissions } from "./capabilities";
import { FormsPanel } from "./forms/FormsPanel";
import {
  Badge,
  Empty,
  FormDialog,
  Panel,
  type Dialog,
  type Field,
} from "./components";
import {
  NAV_ITEMS,
  cleanPayload,
  dateField,
  selectOption,
  textField,
  type Section,
} from "./sections/shared";
import { OverviewSection } from "./sections/OverviewSection";
import { EventsSection } from "./sections/EventsSection";
import { VenuesSection } from "./sections/VenuesSection";
import { SpeakersSection } from "./sections/SpeakersSection";
import { AgendaSection } from "./sections/AgendaSection";
import { PublicationSection } from "./sections/PublicationSection";
import { ActivitySection } from "./sections/ActivitySection";

export function EventsModule({
  context,
  transport: providedTransport,
}: {
  context: ModuleContext;
  transport?: EventsTransport;
}) {
  useI18n(); // Subscribe to the shell locale.
  const accessToken = readSession()?.access_token ?? "";
  const enabled = Boolean(
    providedTransport || (accessToken && context.tenantId),
  );
  const [section, setSection] = useState<Section>("overview");
  const transport = useMemo(
    () =>
      providedTransport ??
      createEventsTransport({
        baseUrl: context.apiBaseUrl,
        mode: accessToken && context.tenantId ? "authenticated" : "unavailable",
        development: import.meta.env.DEV,
        accessToken,
        tenantId: context.tenantId,
      }),
    [providedTransport, context.apiBaseUrl, accessToken, context.tenantId],
  );
  const request: EventsRequest = useCallback(
    (path: string, options?: EventsRequestOptions) =>
      transport.request(path, options),
    [transport],
  );
  const permissions = eventPermissions(context.capabilities);
  const currentContext = `${context.tenantId}:${[...context.capabilities].sort().join(",")}`;
  const contextRef = useRef(currentContext);
  contextRef.current = currentContext;

  const [events, setEvents] = useState<RecordData[]>([]);
  const [venues, setVenues] = useState<RecordData[]>([]);
  const [speakers, setSpeakers] = useState<RecordData[]>([]);
  const [programs, setPrograms] = useState<RecordData[]>([]);
  const [sessions, setSessions] = useState<RecordData[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);
  const [connection, setConnection] = useState<
    "loading" | "online" | "offline"
  >("loading");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<{
    title: string;
    data: unknown;
  } | null>(null);
  const [nextEventCursor, setNextEventCursor] = useState<string | null>(null);

  const selectionRef = useRef(selectedId);
  selectionRef.current = selectedId;

  const selected = events.find((event) => event.id === selectedId);
  const currentNav = NAV_ITEMS.find((item) => item.id === section)!;

  useEffect(() => {
    const segment = context.route?.split("/")[2];
    const target = NAV_ITEMS.find((item) => item.id === segment);
    setSection(target?.id ?? "overview");
  }, [context.route]);

  const showError = (error: unknown) =>
    setNotice({
      type: "error",
      text:
        error instanceof Error
          ? error.message
          : tr("Ocurrió un error inesperado."),
    });

  const loadEvents = useCallback(
    async (cursor?: string) => {
      const data = await request(
        `/events?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (contextRef.current !== currentContext) return;
      setEvents((previous) =>
        cursor
          ? [
              ...previous,
              ...items(data).filter(
                (row) => !previous.some((event) => event.id === row.id),
              ),
            ]
          : items(data),
      );
      setNextEventCursor(data?.page_info?.next_cursor ?? null);
    },
    [request, currentContext],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !permissions.read) {
      setConnection("offline");
      return;
    }
    setLoading(true);
    try {
      await loadEvents();
      if (contextRef.current !== currentContext) return;
      setConnection("online");
      if (permissions.write) {
        const [venueData, speakerData] = await Promise.all([
          loadAll(request, "/venues"),
          loadAll(request, "/speakers"),
        ]);
        if (contextRef.current !== currentContext) return;
        setVenues(venueData);
        setSpeakers(speakerData);
      } else {
        setVenues([]);
        setSpeakers([]);
      }
    } catch (error) {
      setConnection("offline");
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [
    loadEvents,
    request,
    enabled,
    currentContext,
    permissions.write,
    permissions.read,
  ]);

  useEffect(() => {
    setEvents([]);
    setVenues([]);
    setSpeakers([]);
    setSelectedId("");
    setPrograms([]);
    setSessions([]);
    setOutput(null);
    setDialog(null);
    setNotice(null);
    setNextEventCursor(null);
    void refresh();
  }, [refresh]);

  const refreshAgenda = useCallback(async () => {
    if (!selectedId || !permissions.write) {
      setPrograms([]);
      setSessions([]);
      return;
    }
    try {
      const [p, s] = await Promise.all([
        loadAll(request, `/events/${selectedId}/programs`),
        loadAll(request, `/events/${selectedId}/sessions`),
      ]);
      if (
        contextRef.current !== currentContext ||
        selectionRef.current !== selectedId
      ) {
        return;
      }
      setPrograms(p);
      setSessions(s);
    } catch (error) {
      showError(error);
    }
  }, [selectedId, request, currentContext, permissions.write]);

  useEffect(() => {
    void refreshAgenda();
  }, [refreshAgenda]);

  const run = async (
    path: string,
    method = "GET",
    body?: unknown,
    revision?: number,
    success = tr("Operación completada."),
  ) => {
    const needsPublish =
      /\/(?:closures|cancellations|publication-validations|releases)$/.test(
        path,
      );
    if (
      method !== "GET" &&
      !(needsPublish ? permissions.publish : permissions.write)
    ) {
      throw new Error(tr("No tienes permisos para esta operación."));
    }
    const result = await request(path, { method, body, revision });
    if (contextRef.current !== currentContext) return result;
    if (method !== "GET") setOutput(null);
    setNotice({ type: "success", text: success });
    await Promise.all([refresh(), refreshAgenda()]);
    return result;
  };

  const inspect = async (title: string, path: string) => {
    try {
      const data = await request(path);
      if (contextRef.current === currentContext) {
        setOutput({ title, data });
      }
    } catch (error) {
      if (contextRef.current === currentContext) {
        showError(error);
      }
    }
  };

  const command = (
    title: string,
    path: string,
    fields: Field[],
    initial: RecordData = {},
    revision?: number,
    method = "POST",
  ) =>
    setDialog({
      title,
      fields,
      initial,
      submit: async (body) => {
        const result = await run(path, method, cleanPayload(body), revision);
        if (result && path.includes("validations")) {
          setOutput({ title, data: result });
        }
      },
    });

  const selectedPath = selected ? `/events/${selected.id}` : "";

  const requireEvent = () => {
    if (!selected) {
      setNotice({
        type: "error",
        text: tr("Selecciona un evento para continuar."),
      });
      return false;
    }
    return true;
  };

  const isReader = !permissions.write;
  const canPublish = permissions.publish;

  const createEvent = () =>
    setDialog({
      title: tr("Crear nuevo evento"),
      description: tr(
        "Comienza con los datos principales. El evento se guardará como borrador.",
      ),
      fields: [
        textField("title", tr("Nombre del evento"), true),
        textField("slug", tr("Identificador (slug)"), true),
        textField("site_id", tr("ID del sitio (UUID)"), true),
        textField("kind", tr("Tipo de evento"), true),
        dateField("starts_at", tr("Fecha de inicio")),
        dateField("ends_at", tr("Fecha de fin")),
        textField("timezone", tr("Zona horaria"), true),
        { name: "description", label: tr("Descripción"), type: "textarea" },
      ],
      initial: { kind: "conference", timezone: "America/Lima" },
      submit: async (body) => {
        const result = await run(
          "/events",
          "POST",
          cleanPayload(body),
          undefined,
          tr("Evento creado correctamente."),
        );
        setSelectedId(result?.id ?? "");
        setSection("events");
      },
    });

  const editEvent = () => {
    if (!requireEvent()) return;
    setDialog({
      title: tr("Editar evento"),
      fields: [
        textField("title", tr("Nombre"), true),
        textField("slug", tr("Identificador"), true),
        textField("kind", tr("Tipo"), true),
        dateField("starts_at", tr("Fecha de inicio")),
        dateField("ends_at", tr("Fecha de fin")),
        textField("timezone", tr("Zona horaria"), true),
        { name: "description", label: tr("Descripción"), type: "textarea" },
      ],
      initial: selected,
      submit: async (body) => {
        await run(
          selectedPath,
          "PATCH",
          cleanPayload(body),
          selected!.revision_number,
        );
      },
    });
  };

  const createVenue = () =>
    setDialog({
      title: tr("Crear sede o sala"),
      description: tr("Una sala debe pertenecer a una sede existente."),
      fields: [
        {
          name: "kind",
          label: tr("Tipo"),
          type: "select",
          required: true,
          options: [
            { value: "venue", label: tr("Sede") },
            { value: "room", label: tr("Sala") },
          ],
        },
        textField("name", tr("Nombre"), true),
        {
          name: "parent_venue_id",
          label: tr("Sede principal (para salas)"),
          type: "select",
          options: venues
            .filter((v) => v.kind === "venue")
            .map((v) => selectOption(v, v.name)),
        },
        textField("address", tr("Dirección"), true),
        textField("locality", tr("Ciudad")),
        { name: "capacity", label: tr("Capacidad"), type: "number" },
        {
          name: "exclusive",
          label: tr("Recurso de uso exclusivo"),
          type: "checkbox",
        },
      ],
      initial: { kind: "venue", exclusive: true },
      submit: async (body) => {
        const { address, locality, ...rest } = body;
        await run("/venues", "POST", {
          ...cleanPayload(rest),
          location: cleanPayload({ address, locality }),
        });
      },
    });

  const createSpeaker = () =>
    setDialog({
      title: tr("Añadir ponente"),
      description: tr(
        "El consentimiento público se registra por separado con el aviso vigente.",
      ),
      fields: [
        textField("display_name", tr("Nombre completo"), true),
        { name: "bio", label: tr("Biografía"), type: "textarea" },
        textField("media_ref", tr("Referencia multimedia")),
        {
          name: "exclusive",
          label: tr("Ponente de disponibilidad exclusiva"),
          type: "checkbox",
        },
      ],
      initial: {},
      submit: async (body) => {
        await run("/speakers", "POST", {
          ...cleanPayload(body),
          public_consent: false,
        });
      },
    });

  const createProgram = () => {
    if (!requireEvent()) return;
    command(
      tr("Crear programa"),
      `${selectedPath}/programs`,
      [
        textField("name", tr("Nombre"), true),
        textField("slug", tr("Identificador (slug)"), true),
        {
          name: "display_order",
          label: tr("Orden"),
          type: "number",
          required: true,
        },
        textField("color", tr("Color (#RRGGBB)")),
        { name: "description", label: tr("Descripción"), type: "textarea" },
      ],
      { display_order: 0 },
    );
  };

  const createSession = () => {
    if (!requireEvent()) return;
    setDialog({
      title: tr("Crear sesión"),
      description: tr(
        "La sesión se crea como borrador; prográmala después para reservar recursos.",
      ),
      fields: [
        textField("title", tr("Título"), true),
        {
          name: "program_id",
          label: tr("Programa"),
          type: "select",
          required: true,
          options: programs.map((p) => selectOption(p, p.name)),
        },
        {
          name: "venue_id",
          label: tr("Sede o sala"),
          type: "select",
          required: true,
          options: venues.map((v) => selectOption(v, v.name)),
        },
        dateField("starts_at", tr("Inicio")),
        dateField("ends_at", tr("Fin")),
        { name: "description", label: tr("Descripción"), type: "textarea" },
        {
          name: "speaker_ids",
          label: tr("Ponentes (opcional)"),
          type: "multiselect",
          options: speakers.map((s) => selectOption(s, s.display_name)),
          hint: speakers.length
            ? tr("Mantén Ctrl para seleccionar varios ponentes.")
            : tr("Primero agrega ponentes en el directorio."),
        },
      ],
      initial: { speaker_ids: [] },
      submit: async (body) => {
        await run(`${selectedPath}/sessions`, "POST", cleanPayload(body));
      },
    });
  };

  const schedule = async (session: RecordData) => {
    if (!selected) return;
    try {
      await run(
        `${selectedPath}/sessions/${session.id}/schedules`,
        "POST",
        { expected_event_revision: selected.revision_number },
        session.revision,
        tr("Sesión programada."),
      );
    } catch (error) {
      showError(error);
    }
  };

  const archiveResource = async (path: string, row: RecordData) => {
    if (
      !window.confirm(
        tr(
          "¿Archivar este recurso? Esta acción puede afectar su disponibilidad.",
        ),
      )
    ) {
      return;
    }
    try {
      await run(
        path,
        "DELETE",
        undefined,
        row.revision,
        tr("Recurso archivado."),
      );
    } catch (error) {
      showError(error);
    }
  };

  const filtered = useMemo(
    () =>
      events.filter((e) =>
        `${e.title} ${e.slug} ${e.status}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [events, query],
  );

  const navigate = (id: Section) => {
    setSection(id);
    setOutput(null);
    window.history.pushState(
      {},
      "",
      id === "overview" ? "/events" : `/events/${id}`,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (!enabled) {
    return (
      <Card>
        <PageHeading
          title={tr("Configuración de eventos")}
          description={tr(
            "La conexión autenticada con Configuration está pendiente.",
          )}
        />
        <Alert tone="warning">
          {tr(
            "No se detectó una sesión y organización activas en Nexo para acceder a eventos.",
          )}
        </Alert>
      </Card>
    );
  }

  return (
    <div className="events-module">
      <div className="content">
        {notice && (
          <div className={`notice ${notice.type}`} role="status">
            <span>{notice.type === "success" ? <Check size={16} /> : "!"}</span>
            {notice.text}
            <button
              onClick={() => setNotice(null)}
              aria-label={tr("Cerrar aviso")}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="page-heading">
          <div>
            <div className="overline">
              <span className="overline-line" /> {tr("TU ESPACIO DE EVENTOS")}
            </div>
            <h1>
              {section === "overview"
                ? tr("Todo comienza aquí.")
                : tr(currentNav.label)}
            </h1>
            <p>
              {section === "overview"
                ? tr("Una vista clara de todo lo que estás preparando.")
                : (
                    {
                      events: tr(
                        "Crea y administra los eventos de tu organización.",
                      ),
                      agenda: tr(
                        "Organiza programas y sesiones para cada evento.",
                      ),
                      venues: tr("Administra los espacios donde sucede todo."),
                      speakers: tr(
                        "Gestiona las personas detrás de cada experiencia.",
                      ),
                      forms: tr(
                        "Diseña formularios y vínculos para tus eventos.",
                      ),
                      publication: tr(
                        "Prepara, valida y publica la configuración de tu evento.",
                      ),
                      activity: tr("Consulta la trazabilidad de tus eventos."),
                    } as Record<string, string>
                  )[section]}
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="button secondary"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />{" "}
              {tr("Actualizar")}
            </button>
            {!isReader && section !== "forms" && (
              <button
                className="button primary"
                onClick={
                  section === "venues"
                    ? createVenue
                    : section === "speakers"
                      ? createSpeaker
                      : section === "agenda"
                        ? createSession
                        : createEvent
                }
              >
                <Plus size={17} />
                {section === "venues"
                  ? tr("Nueva sede")
                  : section === "speakers"
                    ? tr("Nuevo ponente")
                    : section === "agenda"
                      ? tr("Nueva sesión")
                      : tr("Nuevo evento")}
              </button>
            )}
          </div>
        </div>

        {section === "overview" && (
          <OverviewSection
            events={events}
            venuesCount={venues.length}
            speakersCount={speakers.length}
            isReader={isReader}
            navigate={navigate}
            onSelectEvent={setSelectedId}
            onCreateEvent={createEvent}
          />
        )}

        {section === "events" && (
          <EventsSection
            query={query}
            onQueryChange={setQuery}
            filtered={filtered}
            selected={selected}
            selectedId={selectedId}
            selectedPath={selectedPath}
            nextEventCursor={nextEventCursor}
            isReader={isReader}
            canPublish={canPublish}
            onSelectEvent={setSelectedId}
            onLoadMore={loadEvents}
            onEditEvent={editEvent}
            command={command}
            run={run}
            showError={showError}
            navigate={navigate}
          />
        )}

        {section === "venues" && (
          <VenuesSection
            venues={venues}
            setDialog={setDialog}
            run={run}
            archiveResource={archiveResource}
          />
        )}

        {section === "speakers" && (
          <SpeakersSection
            speakers={speakers}
            request={request}
            inspect={inspect}
            setDialog={setDialog}
            run={run}
            archiveResource={archiveResource}
            showError={showError}
          />
        )}

        {(section === "agenda" ||
          section === "publication" ||
          section === "activity" ||
          section === "forms") && (
          <div className="event-picker">
            <div className="picker-icon">
              <CalendarDays size={18} />
            </div>
            <div>
              <strong>{tr("Evento de trabajo")}</strong>
              <span>{tr("Elige el evento que deseas gestionar")}</span>
            </div>
            <select
              aria-label={tr("Seleccionar evento")}
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setOutput(null);
              }}
            >
              <option value="">{tr("Seleccionar evento")}</option>
              {events.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
            {selected && <Badge status={selected.status} />}
          </div>
        )}

        {section === "agenda" && (
          <AgendaSection
            selected={selected}
            selectedPath={selectedPath}
            programs={programs}
            sessions={sessions}
            canWrite={permissions.write}
            isReader={isReader}
            onCreateProgram={createProgram}
            onCreateSession={createSession}
            onScheduleSession={schedule}
            setDialog={setDialog}
            run={run}
            command={command}
            archiveResource={archiveResource}
          />
        )}

        {section === "forms" && (
          <FormsPanel
            transport={transport}
            selectedEventId={selectedId || undefined}
            canWrite={permissions.write}
            canPublish={permissions.publish}
            contextKey={currentContext}
          />
        )}

        {section === "publication" && (
          <PublicationSection
            selected={selected}
            selectedPath={selectedPath}
            canPublish={canPublish}
            request={request}
            command={command}
            inspect={inspect}
            setDialog={setDialog}
            onShowArtifactOutput={(title, data) => {
              if (contextRef.current === currentContext) {
                setOutput({ title, data });
              }
            }}
          />
        )}

        {section === "activity" && (
          <ActivitySection
            selected={selected}
            selectedPath={selectedPath}
            isReader={isReader}
            inspect={inspect}
            setDialog={setDialog}
            run={run}
          />
        )}

        {output && (
          <Panel
            title={output.title}
            subtitle={tr("Respuesta de la API del entorno de desarrollo.")}
            action={
              <button
                className="icon-button"
                onClick={() => setOutput(null)}
                aria-label={tr("Cerrar resultado")}
              >
                <X size={17} />
              </button>
            }
          >
            <pre className="output">{JSON.stringify(output.data, null, 2)}</pre>
          </Panel>
        )}

        <footer>
          <span>{tr("© Grupo 2 · Configuración de eventos")}</span>
          <span role="status">
            {connection === "online"
              ? tr("API conectada")
              : connection === "loading"
                ? tr("Conectando")
                : tr("API no disponible")}{" "}
            <span className="footer-dot">●</span>
          </span>
        </footer>
      </div>

      {dialog && (
        <FormDialog
          key={dialog.title}
          dialog={dialog}
          close={() => setDialog(null)}
        />
      )}
    </div>
  );
}

async function loadAll(request: EventsRequest, path: string) {
  const result: RecordData[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: RecordData = await request(
      `${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    result.push(...items(page));
    cursor = page?.next_cursor ?? null;
    if (cursor && seen.has(cursor)) {
      throw new Error(tr("La API devolvió un cursor de paginación repetido."));
    }
    if (cursor) {
      seen.add(cursor);
    }
  } while (cursor);
  return result;
}
