import { ArrowRight } from "lucide-react";
import { translateEvents as tr } from "../../../core/events-i18n";
import type { EventsRequest, RecordData } from "../api";
import { Panel, ResourceList } from "../components";
import {
  cleanPayload,
  textField,
  type InspectFn,
  type OpenDialogFn,
  type RunFn,
  type ShowErrorFn,
} from "./shared";

interface SpeakersSectionProps {
  speakers: RecordData[];
  request: EventsRequest;
  inspect: InspectFn;
  setDialog: OpenDialogFn;
  run: RunFn;
  archiveResource: (path: string, row: RecordData) => Promise<void>;
  showError: ShowErrorFn;
}

export function SpeakersSection({
  speakers,
  request,
  inspect,
  setDialog,
  run,
  archiveResource,
  showError,
}: SpeakersSectionProps) {
  return (
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
              textField("display_name", tr("Nombre")),
              { name: "bio", label: tr("Biografía"), type: "textarea" },
              textField("media_ref", tr("Referencia multimedia")),
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
                cleanPayload(body),
                row.revision,
              );
            },
          })
        }
        onArchive={(row) => void archiveResource(`/speakers/${row.id}`, row)}
        extra={(row) => (
          <button
            className="small-button"
            onClick={async () => {
              try {
                const n = await request("/speakers/consent-notice");
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
        )}
      />
    </Panel>
  );
}
