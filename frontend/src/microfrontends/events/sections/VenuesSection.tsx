import { translateEvents as tr } from "../../../core/events-i18n";
import type { RecordData } from "../api";
import { Panel, ResourceList } from "../components";
import {
  cleanPayload,
  textField,
  type OpenDialogFn,
  type RunFn,
} from "./shared";

interface VenuesSectionProps {
  venues: RecordData[];
  setDialog: OpenDialogFn;
  run: RunFn;
  archiveResource: (path: string, row: RecordData) => Promise<void>;
}

export function VenuesSection({
  venues,
  setDialog,
  run,
  archiveResource,
}: VenuesSectionProps) {
  return (
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
              textField("name", tr("Nombre")),
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
                cleanPayload(body),
                row.revision,
              );
            },
          })
        }
        onArchive={(row) => void archiveResource(`/venues/${row.id}`, row)}
      />
    </Panel>
  );
}
