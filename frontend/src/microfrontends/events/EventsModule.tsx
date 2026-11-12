import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileCheck2,
  Layers3,
  MapPin,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  displayDate,
  items,
  createEventsTransport,
  type EventsRequest,
  type EventsRequestOptions,
  type EventsTransport,
  type RecordData,
} from "./api";
import type { ModuleContext } from "../../platform/microfrontends/contracts";
import { Alert, Card } from "../../design-system";
import { PageHeading } from "../../design-system";
import "./events.css";
import { translateEvents as tr } from "../../core/events-i18n";
import { useI18n } from "../../core/i18n";
import { eventPermissions } from "./capabilities";
import { FormsPanel } from "./forms/FormsPanel";
import {
  FormDialog,
  Badge,
  Empty,
  Panel,
  Stat,
  Step,
  Detail,
  EventList,
  ResourceList,
  type Field,
  type Dialog,
} from "./components";

type Section =
  | "overview"
  | "events"
  | "agenda"
  | "venues"
  | "speakers"
  | "forms"
  | "publication"
  | "activity";

const nav: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Resumen", icon: Layers3 },
  { id: "events", label: "Eventos", icon: CalendarDays },
  { id: "agenda", label: "Agenda y programas", icon: ClipboardList },
  { id: "venues", label: "Sedes y salas", icon: MapPin },
  { id: "speakers", label: "Ponentes", icon: Users },
  { id: "forms", label: "Formularios", icon: ClipboardList },
  { id: "publication", label: "Publicación", icon: FileCheck2 },
  { id: "activity", label: "Actividad", icon: Activity },
];

const text = (name: string, label: string, required = false): Field => ({
  name,
  label,
  required,
});

const date = (name: string, label: string, required = true): Field => ({
  name,
  label,
  type: "datetime-local",
  required,
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const clean = (body: RecordData) =>
  Object.fromEntries(
    Object.entries(body).filter(
      ([, value]) => value !== "" && value !== undefined,
    ),
  );

const option = (row: RecordData, label = "") => ({
  value: row.id ?? "",
  label,
});

export function EventsModule({
  context,
  transport: providedTransport,
}: {
  context: ModuleContext;
  transport?: EventsTransport;
}) {
  useI18n(); // Subscribe to the shell locale.
  const demo =
    !providedTransport &&
    import.meta.env.DEV &&
    import.meta.env.VITE_EVENTS_DEMO === "true";
  const enabled = demo || Boolean(providedTransport);
  const [section, setSection] = useState<Section>("overview");
  const [actor, setActor] = useState("org-a-manager");
  const transport = useMemo(
    () =>
      providedTransport ??
      createEventsTransport({
        baseUrl: context.apiBaseUrl,
        mode: demo ? "demo" : "unavailable",
        development: import.meta.env.DEV,
        actor,
      }),
    [providedTransport, context.apiBaseUrl, demo, actor],
  );
  const request: EventsRequest = useCallback(
    (_actor: string, path: string, options?: EventsRequestOptions) =>
      transport.request(path, options),
    [transport],
  );
  const permissions = eventPermissions(
    context.capabilities,
    demo ? actor : undefined,
  );
  const currentContext = `${context.tenantId}:${actor}:${[...context.capabilities].sort().join(",")}`;
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
  const currentNav = nav.find((item) => item.id === section)!;

  useEffect(() => {
    const segment = context.route?.split("/")[2];
    const target = nav.find((item) => item.id === segment);
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
        actor,
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
    [actor, request, currentContext],
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
          loadAll(request, actor, "/venues"),
          loadAll(request, actor, "/speakers"),
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
    actor,
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
        loadAll(request, actor, `/events/${selectedId}/programs`),
        loadAll(request, actor, `/events/${selectedId}/sessions`),
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
  }, [actor, selectedId, request, currentContext, permissions.write]);

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
    const result = await request(actor, path, { method, body, revision });
    if (contextRef.current !== currentContext) return result;
    if (method !== "GET") setOutput(null);
    setNotice({ type: "success", text: success });
    await Promise.all([refresh(), refreshAgenda()]);
    return result;
  };

  const inspect = async (title: string, path: string) => {
    try {
      const data = await request(actor, path);
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
        const result = await run(path, method, clean(body), revision);
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
        text("title", tr("Nombre del evento"), true),
        text("slug", tr("Identificador (slug)"), true),
        text("site_id", tr("ID del sitio (UUID)"), true),
        text("kind", tr("Tipo de evento"), true),
        date("starts_at", tr("Fecha de inicio")),
        date("ends_at", tr("Fecha de fin")),
        text("timezone", tr("Zona horaria"), true),
        { name: "description", label: tr("Descripción"), type: "textarea" },
      ],
      initial: { kind: "conference", timezone: "America/Lima" },
      submit: async (body) => {
        const result = await run(
          "/events",
          "POST",
          clean(body),
          undefined,
          tr("Evento creado correctamente."),
        );
        setSelectedId(result.id ?? "");
        setSection("events");
      },
    });

  const editEvent = () => {
    if (!requireEvent()) return;
    setDialog({
      title: tr("Editar evento"),
      fields: [
        text("title", tr("Nombre"), true),
        text("slug", tr("Identificador"), true),
        text("kind", tr("Tipo"), true),
        date("starts_at", tr("Fecha de inicio")),
        date("ends_at", tr("Fecha de fin")),
        text("timezone", tr("Zona horaria"), true),
        { name: "description", label: tr("Descripción"), type: "textarea" },
      ],
      initial: selected,
      submit: async (body) => {
        await run(
          selectedPath,
          "PATCH",
          clean(body),
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
        text("name", tr("Nombre"), true),
        {
          name: "parent_venue_id",
          label: tr("Sede principal (para salas)"),
          type: "select",
          options: venues
            .filter((v) => v.kind === "venue")
            .map((v) => option(v, v.name)),
        },
        text("address", tr("Dirección"), true),
        text("locality", tr("Ciudad")),
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
          ...clean(rest),
          location: clean({ address, locality }),
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
        text("display_name", tr("Nombre completo"), true),
        { name: "bio", label: tr("Biografía"), type: "textarea" },
        text("media_ref", tr("Referencia multimedia")),
        {
          name: "exclusive",
          label: tr("Ponente de disponibilidad exclusiva"),
          type: "checkbox",
        },
      ],
      initial: {},
      submit: async (body) => {
        await run("/speakers", "POST", {
          ...clean(body),
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
        text("name", tr("Nombre"), true),
        text("slug", tr("Identificador (slug)"), true),
        {
          name: "display_order",
          label: tr("Orden"),
          type: "number",
          required: true,
        },
        text("color", tr("Color (#RRGGBB)")),
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
        text("title", tr("Título"), true),
        {
          name: "program_id",
          label: tr("Programa"),
          type: "select",
          required: true,
          options: programs.map((p) => option(p, p.name)),
        },
        {
          name: "venue_id",
          label: tr("Sede o sala"),
          type: "select",
          required: true,
          options: venues.map((v) => option(v, v.name)),
        },
        date("starts_at", tr("Inicio")),
        date("ends_at", tr("Fin")),
        { name: "description", label: tr("Descripción"), type: "textarea" },
        {
          name: "speaker_ids",
          label: tr("Ponentes (opcional)"),
          type: "multiselect",
          options: speakers.map((s) => option(s, s.display_name)),
          hint: speakers.length
            ? tr("Mantén Ctrl para seleccionar varios ponentes.")
            : tr("Primero agrega ponentes en el directorio."),
        },
      ],
      initial: { speaker_ids: [] },
      submit: async (body) => {
        await run(`${selectedPath}/sessions`, "POST", clean(body));
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
            "Para usar los datos locales de desarrollo, habilita el modo de demostración de eventos.",
          )}
        </Alert>
      </Card>
    );
  }

  return (
    <div className="events-module">
      {demo && (
        <div className="events-context">
          <Alert tone="warning">
            {tr(
              "Demostración local: la identidad, las membresías y el broker están simulados.",
            )}{" "}
            {tr(
              "El actor de prueba es independiente de la organización seleccionada en el shell.",
            )}
          </Alert>
          <label>
            {tr("Actor de desarrollo")}{" "}
            <select value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="org-a-manager">
                {tr("Organización A · Admin")}
              </option>
              <option value="org-a-reader">
                {tr("Organización A · Lector")}
              </option>
              <option value="org-b-manager">
                {tr("Organización B · Admin")}
              </option>
            </select>
          </label>
          <span role="status">
            {connection === "online"
              ? tr("API conectada")
              : connection === "loading"
                ? tr("Conectando")
                : tr("API no disponible")}
          </span>
        </div>
      )}

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
          <>
            <div className="hero">
              <div className="hero-content">
                <div className="hero-tag">
                  <span /> {tr("ESPACIO DE TRABAJO")}
                </div>
                <h2>
                  {tr("Grandes ideas merecen")}
                  <br />
                  <em>{tr("grandes eventos.")}</em>
                </h2>
                <p>
                  {tr(
                    "De la primera idea al último detalle, reúne todo lo que necesitas en un solo lugar.",
                  )}
                </p>
                <button onClick={() => navigate("events")}>
                  {tr("Ver mis eventos")} <ArrowRight size={16} />
                </button>
              </div>
              <div className="hero-art">
                <div className="art-orbit orbit-one" />
                <div className="art-orbit orbit-two" />
                <div className="art-circle" />
                <div className="art-card">
                  <div className="art-card-top">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="art-calendar">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="art-line" />
                  <div className="art-line short" />
                </div>
                <div className="art-spark">✳</div>
                <div className="art-mini">
                  <CalendarDays size={18} />
                </div>
              </div>
              <span className="hero-index">01 / 04</span>
            </div>

            <div className="stats-grid">
              <Stat
                icon={<CalendarDays size={18} />}
                label={tr("Eventos")}
                value={events.length}
                hint={tr("En esta organización")}
                tone="peach"
              />
              <Stat
                icon={<Clock3 size={18} />}
                label={tr("Borradores")}
                value={events.filter((e) => e.status === "draft").length}
                hint={tr("Listos para trabajar")}
                tone="lavender"
              />
              <Stat
                icon={<MapPin size={18} />}
                label={tr("Sedes y salas")}
                value={isReader ? "—" : venues.length}
                hint={
                  isReader
                    ? tr("Sin acceso de escritura")
                    : tr("Espacios disponibles")
                }
                tone="green"
              />
              <Stat
                icon={<Users size={18} />}
                label={tr("Ponentes")}
                value={isReader ? "—" : speakers.length}
                hint={
                  isReader
                    ? tr("Sin acceso de escritura")
                    : tr("Perfiles registrados")
                }
                tone="yellow"
              />
            </div>

            <div className="overview-grid">
              <Panel
                title={tr("Eventos recientes")}
                subtitle={tr("Tus eventos más recientes, en un vistazo.")}
                action={
                  <button
                    className="link-button"
                    onClick={() => navigate("events")}
                  >
                    {tr("Ver todos")} <ArrowRight size={15} />
                  </button>
                }
              >
                {events.length ? (
                  <EventList
                    rows={events.slice(0, 5)}
                    select={(event) => {
                      setSelectedId(event.id ?? "");
                      navigate("events");
                    }}
                  />
                ) : (
                  <Empty
                    title={tr("Todavía no hay eventos")}
                    description={tr(
                      "Tu próximo gran evento comienza con un primer paso.",
                    )}
                    action={
                      !isReader && (
                        <button className="text-action" onClick={createEvent}>
                          {tr("Crear mi primer evento")}{" "}
                          <ArrowRight size={14} />
                        </button>
                      )
                    }
                  />
                )}
              </Panel>

              <Panel
                title={tr("Para comenzar")}
                subtitle={tr("Cada gran experiencia empieza aquí.")}
                className="getting-started"
              >
                <Step
                  number="01"
                  title={tr("Crea tu evento")}
                  detail={tr("Define el nombre, fechas y detalles.")}
                  onClick={() => navigate("events")}
                />
                <Step
                  number="02"
                  title={tr("Prepara los espacios")}
                  detail={tr("Añade sedes, salas y ponentes.")}
                  onClick={() => navigate("venues")}
                />
                <Step
                  number="03"
                  title={tr("Diseña tu agenda")}
                  detail={tr("Organiza los programas y sesiones.")}
                  onClick={() => navigate("agenda")}
                />
              </Panel>
            </div>
          </>
        )}

        {section === "events" && (
          <>
            <div className="section-tools">
              <div className="search">
                <Search size={17} />
                <input
                  placeholder={tr("Buscar eventos por nombre o estado...")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <span className="result-count">
                {filtered.length} {tr("eventos")}
              </span>
            </div>

            <Panel
              title={tr("Todos los eventos")}
              subtitle={tr("Selecciona un evento para ver sus detalles.")}
            >
              <EventList
                rows={filtered}
                select={(e) => setSelectedId(e.id ?? "")}
                selectedId={selectedId}
              />
              {!filtered.length && (
                <Empty
                  title={tr("No encontramos eventos")}
                  description={tr("Crea un evento o prueba con otra búsqueda.")}
                />
              )}
              {nextEventCursor && (
                <div className="load-more">
                  <button
                    className="button secondary"
                    onClick={() =>
                      void loadEvents(nextEventCursor).catch(showError)
                    }
                  >
                    {tr("Cargar más")}
                  </button>
                </div>
              )}
            </Panel>

            {selected && (
              <Panel
                title={selected.title ?? ""}
                subtitle={`${tr("Revisión")} ${selected.revision_number} · ${selected.slug}`}
                action={<Badge status={selected.status} />}
              >
                <div className="detail-grid">
                  <Detail
                    label={tr("INICIO")}
                    value={displayDate(selected.starts_at)}
                  />
                  <Detail
                    label={tr("FINALIZACIÓN")}
                    value={displayDate(selected.ends_at)}
                  />
                  <Detail
                    label={tr("ZONA HORARIA")}
                    value={selected.timezone}
                  />
                  <Detail label={tr("TIPO")} value={selected.kind} />
                </div>
                <p className="detail-description">
                  {selected.description ||
                    tr("Este evento aún no tiene descripción.")}
                </p>
                <div className="button-row">
                  {!isReader && (
                    <>
                      <button className="button secondary" onClick={editEvent}>
                        {tr("Editar evento")}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          command(
                            tr("Duplicar evento"),
                            `${selectedPath}/duplications`,
                            [
                              text("title", tr("Nuevo nombre")),
                              text("slug", tr("Nuevo identificador"), true),
                              text("site_id", tr("ID del sitio"), true),
                              date("starts_at", tr("Inicio")),
                              date("ends_at", tr("Fin")),
                            ],
                            {
                              title: `${selected.title} (copia)`,
                              slug: `${slugify(selected.slug ?? "")}-copia`,
                              site_id: selected.site_id,
                              starts_at: selected.starts_at,
                              ends_at: selected.ends_at,
                            },
                          )
                        }
                      >
                        {tr("Duplicar")}
                      </button>
                    </>
                  )}
                  {canPublish && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() =>
                          command(
                            tr("Cerrar inscripciones"),
                            `${selectedPath}/closures`,
                            [
                              text("reason", tr("Motivo"), true),
                              date("effective_at", tr("Fecha efectiva")),
                            ],
                            { effective_at: new Date().toISOString() },
                            selected.revision_number,
                          )
                        }
                      >
                        {tr("Cerrar")}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          command(
                            tr("Cancelar evento"),
                            `${selectedPath}/cancellations`,
                            [
                              text("reason", tr("Motivo"), true),
                              date("effective_at", tr("Fecha efectiva")),
                            ],
                            { effective_at: new Date().toISOString() },
                            selected.revision_number,
                          )
                        }
                      >
                        {tr("Cancelar")}
                      </button>
                    </>
                  )}
                  {!isReader && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => {
                          if (window.confirm(tr("¿Archivar este evento?"))) {
                            void run(
                              `${selectedPath}/archives`,
                              "POST",
                              {},
                              selected.revision_number,
                            ).catch(showError);
                          }
                        }}
                      >
                        {tr("Archivar")}
                      </button>
                    </>
                  )}
                  <button
                    className="button secondary"
                    onClick={() => navigate("agenda")}
                  >
                    {tr("Ver agenda")} <ArrowRight size={15} />
                  </button>
                </div>
              </Panel>
            )}
          </>
        )}

        {section === "venues" && (
          <Panel
            title={tr("Espacios disponibles")}
            subtitle={tr("Sedes y salas de tu organización.")}
            action={
              <span className="count-pill">
                {venues.length} {tr("espacios")}
              </span>
            }
          >
            <ResourceList
              rows={venues}
              kind="venue"
              onEdit={(row) =>
                setDialog({
                  title: tr("Editar espacio"),
                  fields: [
                    text("name", tr("Nombre")),
                    {
                      name: "capacity",
                      label: tr("Capacidad"),
                      type: "number",
                    },
                    {
                      name: "exclusive",
                      label: tr("Recurso de uso exclusivo"),
                      type: "checkbox",
                    },
                  ],
                  initial: row,
                  submit: async (body) => {
                    await run(
                      `/venues/${row.id}`,
                      "PATCH",
                      clean(body),
                      row.revision,
                    );
                  },
                })
              }
              onArchive={(row) =>
                void archiveResource(`/venues/${row.id}`, row)
              }
            />
          </Panel>
        )}

        {section === "speakers" && (
          <Panel
            title={tr("Directorio de ponentes")}
            subtitle={tr("Perfiles y disponibilidad de ponentes.")}
            action={
              <button
                className="link-button"
                onClick={() =>
                  void inspect(
                    tr("Aviso de consentimiento"),
                    "/speakers/consent-notice",
                  )
                }
              >
                {tr("Ver aviso de consentimiento")} <ArrowRight size={15} />
              </button>
            }
          >
            <ResourceList
              rows={speakers}
              kind="speaker"
              onEdit={(row) =>
                setDialog({
                  title: tr("Editar ponente"),
                  description: tr(
                    "Para cambiar el consentimiento consulta primero el aviso vigente.",
                  ),
                  fields: [
                    text("display_name", tr("Nombre")),
                    { name: "bio", label: tr("Biografía"), type: "textarea" },
                    text("media_ref", tr("Referencia multimedia")),
                    {
                      name: "exclusive",
                      label: tr("Disponibilidad exclusiva"),
                      type: "checkbox",
                    },
                  ],
                  initial: row,
                  submit: async (body) => {
                    await run(
                      `/speakers/${row.id}`,
                      "PATCH",
                      clean(body),
                      row.revision,
                    );
                  },
                })
              }
              onArchive={(row) =>
                void archiveResource(`/speakers/${row.id}`, row)
              }
              extra={(row) => (
                <>
                  <button
                    className="small-button"
                    onClick={async () => {
                      try {
                        const n = await request(
                          actor,
                          "/speakers/consent-notice",
                        );
                        setDialog({
                          title: tr("Registrar consentimiento"),
                          description: `${tr("Aviso")} ${n.version}: ${n.text}`,
                          fields: [
                            {
                              name: "public_consent",
                              label: tr("Acepta la publicación del perfil"),
                              type: "checkbox",
                            },
                          ],
                          submit: async (body) => {
                            await run(
                              `/speakers/${row.id}`,
                              "PATCH",
                              body.public_consent
                                ? {
                                    public_consent: true,
                                    public_consent_version: n.version,
                                  }
                                : { public_consent: false },
                              row.revision,
                            );
                          },
                        });
                      } catch (error) {
                        showError(error);
                      }
                    }}
                  >
                    {tr("Consentimiento")}
                  </button>
                </>
              )}
            />
          </Panel>
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

        {section === "agenda" &&
          (selected ? (
            <div className="stack">
              <Panel
                title={tr("Programas")}
                subtitle={tr("Agrupa las sesiones por tema o itinerario.")}
                action={
                  !isReader && (
                    <button
                      className="button secondary compact"
                      onClick={createProgram}
                    >
                      <Plus size={15} /> {tr("Nuevo programa")}
                    </button>
                  )
                }
              >
                <ResourceList
                  rows={programs}
                  kind="program"
                  onEdit={(row) =>
                    setDialog({
                      title: tr("Editar programa"),
                      fields: [
                        text("name", tr("Nombre")),
                        text("slug", tr("Identificador")),
                        {
                          name: "display_order",
                          label: tr("Orden"),
                          type: "number",
                        },
                        text("color", tr("Color (#RRGGBB)")),
                        {
                          name: "description",
                          label: tr("Descripción"),
                          type: "textarea",
                        },
                      ],
                      initial: row,
                      submit: async (body) => {
                        await run(
                          `${selectedPath}/programs/${row.id}`,
                          "PATCH",
                          clean(body),
                          row.revision,
                        );
                      },
                    })
                  }
                  onArchive={(row) =>
                    void archiveResource(
                      `${selectedPath}/programs/${row.id}`,
                      row,
                    )
                  }
                />
              </Panel>

              <Panel
                title={tr("Sesiones")}
                subtitle={tr(
                  "Crea borradores y reserva los recursos al programarlos.",
                )}
                action={
                  <div className="button-row">
                    {permissions.write && (
                      <button
                        className="button secondary compact"
                        onClick={() =>
                          command(
                            tr("Validar agenda"),
                            `${selectedPath}/schedule-validations`,
                            [
                              {
                                name: "expected_event_revision",
                                label: tr("Revisión del evento"),
                                type: "number",
                                required: true,
                              },
                              {
                                name: "candidate_sessions",
                                label: tr("Sesiones candidatas (JSON)"),
                                type: "json",
                                required: true,
                                hint: tr(
                                  "Para validar la agenda existente utiliza [].",
                                ),
                              },
                            ],
                            {
                              expected_event_revision: selected.revision_number,
                              candidate_sessions: [],
                            },
                          )
                        }
                      >
                        {tr("Validar agenda")}
                      </button>
                    )}
                    {!isReader && (
                      <button
                        className="button primary compact"
                        onClick={createSession}
                      >
                        <Plus size={15} /> {tr("Nueva sesión")}
                      </button>
                    )}
                  </div>
                }
              >
                {sessions.length ? (
                  <div className="resource-list">
                    {sessions.map((row) => (
                      <div className="resource-row" key={row.id}>
                        <div className="resource-icon lavender">
                          <Clock3 size={18} />
                        </div>
                        <div className="resource-main">
                          <strong>{row.title}</strong>
                          <span>
                            {displayDate(row.starts_at)} ·{" "}
                            {displayDate(row.ends_at)}
                          </span>
                        </div>
                        <Badge status={row.status} />
                        {row.status === "draft" && !isReader && (
                          <button
                            className="small-button"
                            onClick={() => void schedule(row)}
                          >
                            {tr("Programar")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={tr("Aún no hay sesiones")}
                    description={tr(
                      "Añade una sesión después de crear un programa y una sede.",
                    )}
                  />
                )}
              </Panel>
            </div>
          ) : (
            <Empty
              title={tr("Selecciona un evento")}
              description={tr(
                "Elige un evento arriba para administrar su agenda.",
              )}
            />
          ))}

        {section === "forms" && (
          <FormsPanel
            transport={transport}
            selectedEventId={selectedId || undefined}
            canWrite={permissions.write}
            canPublish={permissions.publish}
            contextKey={currentContext}
          />
        )}

        {section === "publication" &&
          (selected ? (
            <div className="stack">
              <div className="info-banner">
                <div className="info-symbol">
                  <Sparkles size={19} />
                </div>
                <div>
                  <strong>{tr("Antes de publicar")}</strong>
                  <p>
                    {tr(
                      "Verifica que tu evento, agenda y formularios estén completos.",
                    )}
                  </p>
                </div>
              </div>

              <Panel
                title={tr("Publicación del evento")}
                subtitle={`${tr("Trabajando con la revisión")} ${selected.revision_number}.`}
              >
                <div className="button-row publication-actions">
                  {canPublish && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        command(
                          tr("Validar publicación"),
                          `${selectedPath}/publication-validations`,
                          [
                            {
                              name: "expected_event_revision",
                              label: tr("Revisión del evento"),
                              type: "number",
                              required: true,
                            },
                          ],
                          { expected_event_revision: selected.revision_number },
                        )
                      }
                    >
                      <FileCheck2 size={16} /> {tr("Validar publicación")}
                    </button>
                  )}
                  {canPublish && (
                    <button
                      className="button primary"
                      onClick={() =>
                        command(
                          tr("Publicar nueva versión"),
                          `${selectedPath}/releases`,
                          [
                            {
                              name: "expected_event_revision",
                              label: tr("Revisión del evento"),
                              type: "number",
                              required: true,
                            },
                            date("effective_at", tr("Fecha efectiva"), false),
                          ],
                          { expected_event_revision: selected.revision_number },
                          selected.revision_number,
                        )
                      }
                    >
                      {tr("Publicar versión")} <ArrowRight size={16} />
                    </button>
                  )}
                  <button
                    className="button secondary"
                    onClick={() =>
                      void inspect(
                        tr("Versiones publicadas"),
                        `${selectedPath}/releases`,
                      )
                    }
                  >
                    {tr("Ver versiones")}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      setDialog({
                        title: tr("Consultar versión o artefacto"),
                        description: tr(
                          "Copia el ID de una versión desde «Ver versiones».",
                        ),
                        fields: [
                          text("release_id", tr("ID de la versión"), true),
                          {
                            name: "view",
                            label: tr("Contenido"),
                            type: "select",
                            required: true,
                            options: [
                              { value: "", label: tr("Versión") },
                              { value: "/manifest", label: tr("Manifiesto") },
                              {
                                value: "/manifest/artifacts/event",
                                label: tr("Artefacto: evento"),
                              },
                              {
                                value: "/manifest/artifacts/schedule",
                                label: tr("Artefacto: agenda"),
                              },
                              {
                                value: "/manifest/artifacts/forms",
                                label: tr("Artefacto: formularios"),
                              },
                            ],
                          },
                        ],
                        initial: { view: "/manifest" },
                        submit: async (body) => {
                          const data = await request(
                            actor,
                            `${selectedPath}/releases/${body.release_id}${body.view || ""}`,
                          );
                          if (contextRef.current === currentContext) {
                            setOutput({
                              title: tr("Contenido de la versión"),
                              data,
                            });
                          }
                        },
                      })
                    }
                  >
                    {tr("Consultar artefacto")}
                  </button>
                </div>
              </Panel>
            </div>
          ) : (
            <Empty
              title={tr("Selecciona un evento")}
              description={tr("Elige un evento para preparar su publicación.")}
            />
          ))}

        {section === "activity" &&
          (selected ? (
            <div className="stack">
              <Panel
                title={tr("Trazabilidad y responsables")}
                subtitle={tr(
                  "Consulta los registros y asignaciones del evento.",
                )}
              >
                <div className="button-row publication-actions">
                  {[
                    [tr("Revisiones"), "revisions"],
                    [tr("Auditoría"), "audit"],
                    [tr("Historial"), "history"],
                    [tr("Asignaciones"), "assignments"],
                  ].map(([label, path]) => (
                    <button
                      className="button secondary"
                      key={path}
                      onClick={() =>
                        void inspect(label, `${selectedPath}/${path}`)
                      }
                    >
                      {label}
                    </button>
                  ))}
                  {!isReader && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setDialog({
                            title: tr("Asignar responsable"),
                            fields: [
                              text("user_id", tr("ID de usuario (UUID)"), true),
                              text("role", tr("Rol"), true),
                              text(
                                "scopes",
                                tr("Permisos separados por comas"),
                                true,
                              ),
                            ],
                            initial: {
                              role: "event_manager",
                              scopes: "events:read,events:write",
                            },
                            submit: async (body) => {
                              await run(`${selectedPath}/assignments`, "POST", {
                                ...body,
                                scopes: String(body.scopes)
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              });
                            },
                          })
                        }
                      >
                        {tr("Asignar responsable")}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setDialog({
                            title: tr("Revocar asignación"),
                            fields: [
                              text(
                                "assignment_id",
                                tr("ID de asignación"),
                                true,
                              ),
                            ],
                            submit: async (body) => {
                              await run(
                                `${selectedPath}/assignments/${body.assignment_id}`,
                                "DELETE",
                              );
                            },
                          })
                        }
                      >
                        {tr("Revocar asignación")}
                      </button>
                    </>
                  )}
                </div>
              </Panel>
            </div>
          ) : (
            <Empty
              title={tr("Selecciona un evento")}
              description={tr("Elige un evento para consultar sus registros.")}
            />
          ))}

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
          <span>
            {tr("ENTORNO DE DESARROLLO")} <span className="footer-dot">●</span>
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

async function loadAll(request: EventsRequest, actor: string, path: string) {
  const result: RecordData[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: RecordData = await request(
      actor,
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
