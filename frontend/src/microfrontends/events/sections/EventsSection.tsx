import { ArrowRight, Search } from "lucide-react";
import { translateEvents as tr } from "../../../core/events-i18n";
import { displayDate, type RecordData } from "../api";
import { Badge, Detail, Empty, EventList, Panel } from "../components";
import {
  dateField,
  slugify,
  textField,
  type CommandFn,
  type RunFn,
  type Section,
  type ShowErrorFn,
} from "./shared";

interface EventsSectionProps {
  query: string;
  onQueryChange: (value: string) => void;
  filtered: RecordData[];
  selected?: RecordData;
  selectedId: string;
  selectedPath: string;
  nextEventCursor: string | null;
  isReader: boolean;
  canPublish: boolean;
  onSelectEvent: (id: string) => void;
  onLoadMore: (cursor: string) => Promise<void>;
  onEditEvent: () => void;
  command: CommandFn;
  run: RunFn;
  showError: ShowErrorFn;
  navigate: (section: Section) => void;
}

export function EventsSection({
  query,
  onQueryChange,
  filtered,
  selected,
  selectedId,
  selectedPath,
  nextEventCursor,
  isReader,
  canPublish,
  onSelectEvent,
  onLoadMore,
  onEditEvent,
  command,
  run,
  showError,
  navigate,
}: EventsSectionProps) {
  return (
    <>
      <div className="section-tools">
        <div className="search">
          <Search size={17} />
          <input
            placeholder={tr("Buscar eventos por nombre o estado...")}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
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
          select={(e) => onSelectEvent(e.id ?? "")}
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
              onClick={() => void onLoadMore(nextEventCursor).catch(showError)}
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
            <Detail label={tr("ZONA HORARIA")} value={selected.timezone} />
            <Detail label={tr("TIPO")} value={selected.kind} />
          </div>
          <p className="detail-description">
            {selected.description ||
              tr("Este evento aún no tiene descripción.")}
          </p>
          <div className="button-row">
            {!isReader && (
              <>
                <button className="button secondary" onClick={onEditEvent}>
                  {tr("Editar evento")}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    command(
                      tr("Duplicar evento"),
                      `${selectedPath}/duplications`,
                      [
                        textField("title", tr("Nuevo nombre")),
                        textField("slug", tr("Nuevo identificador"), true),
                        textField("site_id", tr("ID del sitio"), true),
                        dateField("starts_at", tr("Inicio")),
                        dateField("ends_at", tr("Fin")),
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
                        textField("reason", tr("Motivo"), true),
                        dateField("effective_at", tr("Fecha efectiva")),
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
                        textField("reason", tr("Motivo"), true),
                        dateField("effective_at", tr("Fecha efectiva")),
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
  );
}
