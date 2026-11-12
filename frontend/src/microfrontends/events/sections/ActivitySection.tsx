import { translateEvents as tr } from "../../../core/events-i18n";
import type { RecordData } from "../api";
import { Empty, Panel } from "../components";
import {
  textField,
  type InspectFn,
  type OpenDialogFn,
  type RunFn,
} from "./shared";

interface ActivitySectionProps {
  selected?: RecordData;
  selectedPath: string;
  isReader: boolean;
  inspect: InspectFn;
  setDialog: OpenDialogFn;
  run: RunFn;
}

export function ActivitySection({
  selected,
  selectedPath,
  isReader,
  inspect,
  setDialog,
  run,
}: ActivitySectionProps) {
  if (!selected) {
    return (
      <Empty
        title={tr("Selecciona un evento")}
        description={tr("Elige un evento para consultar sus registros.")}
      />
    );
  }

  return (
    <div className="stack">
      <Panel
        title={tr("Trazabilidad y responsables")}
        subtitle={tr("Consulta los registros y asignaciones del evento.")}
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
              onClick={() => void inspect(label, `${selectedPath}/${path}`)}
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
                      textField("user_id", tr("ID de usuario (UUID)"), true),
                      textField("role", tr("Rol"), true),
                      textField(
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
                      textField("assignment_id", tr("ID de asignación"), true),
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
  );
}
