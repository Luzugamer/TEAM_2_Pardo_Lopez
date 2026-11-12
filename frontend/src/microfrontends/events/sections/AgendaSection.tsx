import { Clock3, Plus } from "lucide-react";
import { translateEvents as tr } from "../../../core/events-i18n";
import { displayDate, type RecordData } from "../api";
import { Badge, Empty, Panel, ResourceList } from "../components";
import {
  cleanPayload,
  textField,
  type CommandFn,
  type OpenDialogFn,
  type RunFn,
} from "./shared";

interface AgendaSectionProps {
  selected?: RecordData;
  selectedPath: string;
  programs: RecordData[];
  sessions: RecordData[];
  canWrite: boolean;
  isReader: boolean;
  onCreateProgram: () => void;
  onCreateSession: () => void;
  onScheduleSession: (session: RecordData) => Promise<void>;
  setDialog: OpenDialogFn;
  run: RunFn;
  command: CommandFn;
  archiveResource: (path: string, row: RecordData) => Promise<void>;
}

export function AgendaSection({
  selected,
  selectedPath,
  programs,
  sessions,
  canWrite,
  isReader,
  onCreateProgram,
  onCreateSession,
  onScheduleSession,
  setDialog,
  run,
  command,
  archiveResource,
}: AgendaSectionProps) {
  if (!selected) {
    return (
      <Empty
        title={tr("Selecciona un evento")}
        description={tr("Elige un evento arriba para administrar su agenda.")}
      />
    );
  }

  return (
    <div className="stack">
      <Panel
        title={tr("Programas")}
        subtitle={tr("Agrupa las sesiones por tema o itinerario.")}
        action={
          !isReader && (
            <button
              className="button secondary compact"
              onClick={onCreateProgram}
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
                textField("name", tr("Nombre")),
                textField("slug", tr("Identificador")),
                {
                  name: "display_order",
                  label: tr("Orden"),
                  type: "number",
                },
                textField("color", tr("Color (#RRGGBB)")),
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
                  cleanPayload(body),
                  row.revision,
                );
              },
            })
          }
          onArchive={(row) =>
            void archiveResource(`${selectedPath}/programs/${row.id}`, row)
          }
        />
      </Panel>

      <Panel
        title={tr("Sesiones")}
        subtitle={tr("Crea borradores y reserva los recursos al programarlos.")}
        action={
          <div className="button-row">
            {canWrite && (
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
                onClick={onCreateSession}
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
                    {displayDate(row.starts_at)} · {displayDate(row.ends_at)}
                  </span>
                </div>
                <Badge status={row.status} />
                {row.status === "draft" && !isReader && (
                  <button
                    className="small-button"
                    onClick={() => void onScheduleSession(row)}
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
  );
}
