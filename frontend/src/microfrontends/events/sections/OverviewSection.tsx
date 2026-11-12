import { ArrowRight, CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { translateEvents as tr } from "../../../core/events-i18n";
import type { RecordData } from "../api";
import { Empty, EventList, Panel, Stat, Step } from "../components";
import type { Section } from "./shared";

interface OverviewSectionProps {
  events: RecordData[];
  venuesCount: number;
  speakersCount: number;
  isReader: boolean;
  navigate: (section: Section) => void;
  onSelectEvent: (id: string) => void;
  onCreateEvent: () => void;
}

export function OverviewSection({
  events,
  venuesCount,
  speakersCount,
  isReader,
  navigate,
  onSelectEvent,
  onCreateEvent,
}: OverviewSectionProps) {
  return (
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
          value={isReader ? "—" : venuesCount}
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
          value={isReader ? "—" : speakersCount}
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
            <button className="link-button" onClick={() => navigate("events")}>
              {tr("Ver todos")} <ArrowRight size={15} />
            </button>
          }
        >
          {events.length ? (
            <EventList
              rows={events.slice(0, 5)}
              select={(event) => {
                onSelectEvent(event.id ?? "");
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
                  <button className="text-action" onClick={onCreateEvent}>
                    {tr("Crear mi primer evento")} <ArrowRight size={14} />
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
  );
}
