import { ArrowRight, FileCheck2, Sparkles } from "lucide-react";
import { translateEvents as tr } from "../../../core/events-i18n";
import type { EventsRequest, RecordData } from "../api";
import { Empty, Panel } from "../components";
import {
  dateField,
  textField,
  type CommandFn,
  type InspectFn,
  type OpenDialogFn,
} from "./shared";

interface PublicationSectionProps {
  selected?: RecordData;
  selectedPath: string;
  canPublish: boolean;
  request: EventsRequest;
  command: CommandFn;
  inspect: InspectFn;
  setDialog: OpenDialogFn;
  onShowArtifactOutput: (title: string, data: unknown) => void;
}

export function PublicationSection({
  selected,
  selectedPath,
  canPublish,
  request,
  command,
  inspect,
  setDialog,
  onShowArtifactOutput,
}: PublicationSectionProps) {
  if (!selected) {
    return (
      <Empty
        title={tr("Selecciona un evento")}
        description={tr("Elige un evento para preparar su publicación.")}
      />
    );
  }

  return (
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
                    dateField("effective_at", tr("Fecha efectiva"), false),
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
                  textField("release_id", tr("ID de la versión"), true),
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
                    `${selectedPath}/releases/${body.release_id}${body.view || ""}`,
                  );
                  onShowArtifactOutput(tr("Contenido de la versión"), data);
                },
              })
            }
          >
            {tr("Consultar artefacto")}
          </button>
        </div>
      </Panel>
    </div>
  );
}
