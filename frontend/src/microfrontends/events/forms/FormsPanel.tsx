import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { EventsTransport } from "../api";
import { Panel } from "../components";
import { translateEvents as tr } from "../../../core/events-i18n";

type Definition = {
  id: string;
  name: string;
  purpose: string;
};

type Version = {
  id: string;
  version_number: number;
  revision: number;
  status: string;
};

type Binding = {
  id: string;
  event_id: string;
  purpose: string;
  status: string;
  revision: number;
};

type FieldDraft = {
  name: string;
  title: string;
  type: string;
  purpose: string;
  classification: string;
  retention: string;
};

type Props = {
  transport: EventsTransport;
  selectedEventId?: string;
  canWrite: boolean;
  canPublish: boolean;
  contextKey: string;
};

export function FormsPanel({
  transport,
  selectedEventId,
  canWrite,
  canPublish,
  contextKey,
}: Props) {
  const [forms, setForms] = useState<Definition[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [formId, setFormId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("registration");
  const [fieldName, setFieldName] = useState("nombre");
  const [fieldTitle, setFieldTitle] = useState("Nombre");
  const [fieldType, setFieldType] = useState("string");
  const [extraFields, setExtraFields] = useState<FieldDraft[]>([]);
  const [consent, setConsent] = useState("");
  const [consentVersion, setConsentVersion] = useState("");
  const [policyPurpose, setPolicyPurpose] = useState("");
  const [classification, setClassification] = useState("interna");
  const [retention, setRetention] = useState("");
  const [bindingStatus, setBindingStatus] = useState("open");
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [bindingId, setBindingId] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftEditor, setDraftEditor] = useState<{
    id: string;
    revision: number;
    schema: string;
    ui_schema: string;
    consent: string;
    field_policies: string;
  } | null>(null);

  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;

  const selectionRef = useRef({ formId, selectedEventId });
  selectionRef.current = { formId, selectedEventId };

  const selected = versions.find((v) => v.id === versionId);

  const load = useCallback(async () => {
    if (!canWrite) return;
    const result = await transport.request<Definition[]>("/forms");
    if (contextRef.current !== contextKey) return;
    setForms(Array.isArray(result) ? result : []);

    if (formId) {
      const rows = await transport.request<Version[]>(
        `/forms/${formId}/versions`,
      );
      if (
        contextRef.current !== contextKey ||
        selectionRef.current.formId !== formId
      ) {
        return;
      }
      setVersions(Array.isArray(rows) ? rows : []);
    }

    if (selectedEventId) {
      const rows = await transport.request<Binding[]>(
        `/events/${selectedEventId}/form-bindings`,
      );
      if (
        contextRef.current !== contextKey ||
        selectionRef.current.selectedEventId !== selectedEventId
      ) {
        return;
      }
      setBindings(Array.isArray(rows) ? rows : []);
    }
  }, [transport, formId, selectedEventId, canWrite, contextKey]);

  useEffect(() => {
    setForms([]);
    setVersions([]);
    setBindings([]);
    setFormId("");
    setVersionId("");
    setBindingId("");
    setDraftEditor(null);
    setNotice("");
    setBusy(false);
    setName("");
    setPurpose("registration");
    setFieldName("nombre");
    setFieldTitle("Nombre");
    setFieldType("string");
    setExtraFields([]);
    setConsent("");
    setConsentVersion("");
    setPolicyPurpose("");
    setClassification("interna");
    setRetention("");
    setBindingStatus("open");
    setOpens("");
    setCloses("");
    setReason("");
  }, [contextKey]);

  useEffect(() => {
    setBindings([]);
    setBindingId("");
    setReason("");
  }, [selectedEventId]);

  useEffect(() => {
    let active = true;
    void load().catch((error) => {
      if (active) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function action(task: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      if (contextRef.current !== contextKey) return;
      await load();
      if (contextRef.current === contextKey) {
        setNotice(tr("Operación completada."));
      }
    } catch (error) {
      if (contextRef.current === contextKey) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (contextRef.current === contextKey) {
        setBusy(false);
      }
    }
  }

  async function createDefinition(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const row = await transport.request<Definition>("/forms", {
        method: "POST",
        body: { name, purpose },
      });
      if (contextRef.current === contextKey) {
        setFormId(row.id);
        setName("");
      }
    });
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const fields = [
        ...extraFields,
        {
          name: fieldName,
          title: fieldTitle,
          type: fieldType,
          purpose: policyPurpose,
          classification,
          retention,
        },
      ];
      if (new Set(fields.map((field) => field.name)).size !== fields.length) {
        throw new Error(tr("Los identificadores de campos deben ser únicos."));
      }
      const names = fields.map((field) => field.name);
      const properties = Object.fromEntries(
        fields.map((field) => [
          field.name,
          { type: field.type, title: field.title },
        ]),
      );
      const policies = Object.fromEntries(
        fields.map((field) => [
          field.name,
          {
            purpose: field.purpose,
            classification: field.classification,
            retention: field.retention,
            export_allowlist: [],
          },
        ]),
      );
      const body = {
        schema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties,
          required: names,
        },
        ui_schema: { order: names },
        consent: { text: consent, version: consentVersion },
        field_policies: policies,
      };
      const row = await transport.request<Version>(
        `/forms/${formId}/versions`,
        {
          method: "POST",
          body,
        },
      );
      if (contextRef.current === contextKey) {
        setVersionId(row.id);
      }
    });
  }

  function addField() {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(fieldName) ||
      !fieldTitle.trim() ||
      !policyPurpose.trim() ||
      !retention.trim()
    ) {
      setNotice(tr("Completa los datos del campo y su política."));
      return;
    }
    if (
      extraFields.some((field) => field.name === fieldName) ||
      fieldName === ""
    ) {
      setNotice(tr("Los identificadores de campos deben ser únicos."));
      return;
    }
    setExtraFields([
      ...extraFields,
      {
        name: fieldName,
        title: fieldTitle,
        type: fieldType,
        purpose: policyPurpose,
        classification,
        retention,
      },
    ]);
    setFieldName("");
    setFieldTitle("");
    setNotice("");
  }

  async function editDraft() {
    if (!selected || selected.status !== "draft") return;
    await action(async () => {
      const row = await transport.request<{
        id: string;
        revision: number;
        schema: unknown;
        ui_schema: unknown;
        consent: unknown;
        field_policies: unknown;
      }>(`/form-versions/${selected.id}`);
      if (
        contextRef.current !== contextKey ||
        selectionRef.current.formId !== formId
      ) {
        return;
      }
      setDraftEditor({
        id: row.id,
        revision: row.revision,
        schema: JSON.stringify(row.schema, null, 2),
        ui_schema: JSON.stringify(row.ui_schema, null, 2),
        consent: JSON.stringify(row.consent, null, 2),
        field_policies: JSON.stringify(row.field_policies, null, 2),
      });
    });
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draftEditor) return;
    await action(async () => {
      const body = {
        schema: JSON.parse(draftEditor.schema),
        ui_schema: JSON.parse(draftEditor.ui_schema),
        consent: JSON.parse(draftEditor.consent),
        field_policies: JSON.parse(draftEditor.field_policies),
      };
      await transport.request(`/form-versions/${draftEditor.id}`, {
        method: "PATCH",
        body,
        revision: draftEditor.revision,
      });
      if (contextRef.current === contextKey) {
        setDraftEditor(null);
      }
    });
  }

  async function publish() {
    if (!selected) return;
    await action(async () => {
      const result = await transport.request<{
        valid: boolean;
        errors: string[];
        expected_hash: string;
      }>(`/form-versions/${selected.id}/validations`, { method: "POST" });
      if (
        contextRef.current !== contextKey ||
        selectionRef.current.formId !== formId
      ) {
        return;
      }
      if (!result.valid) {
        throw new Error(result.errors.join("; "));
      }
      await transport.request(`/form-versions/${selected.id}/publications`, {
        method: "POST",
        body: { expected_hash: result.expected_hash },
        revision: selected.revision,
      });
    });
  }

  async function bind() {
    if (!selectedEventId || !selected) return;
    await action(async () => {
      await transport.request(`/events/${selectedEventId}/form-bindings`, {
        method: "POST",
        body: {
          form_version_id: selected.id,
          purpose: forms.find((f) => f.id === formId)?.purpose,
          status: bindingStatus,
          opens_at: new Date(opens).toISOString(),
          closes_at: new Date(closes).toISOString(),
        },
      });
    });
  }

  async function transition(target: "open" | "cancel") {
    const row = bindings.find((b) => b.id === bindingId);
    if (!row || row.event_id !== selectedEventId) return;
    await action(async () => {
      await transport.request(
        `/bindings/${row.id}/${target === "open" ? "openings" : "cancellations"}`,
        {
          method: "POST",
          body: target === "cancel" ? { reason } : undefined,
          revision: row.revision,
        },
      );
    });
  }

  async function close() {
    const row = bindings.find((b) => b.id === bindingId);
    if (!row || row.event_id !== selectedEventId) return;
    await action(async () => {
      await transport.request(`/bindings/${row.id}/closures`, {
        method: "POST",
        body: { reason },
        revision: row.revision,
      });
    });
  }

  if (!canWrite) {
    return <p>{tr("Sin acceso de escritura")}</p>;
  }

  return (
    <div className="stack">
      <Panel
        title={tr("Formularios y vínculos")}
        subtitle={tr("Diseña versiones y asócialas a un evento.")}
      >
        {notice && <p role="status">{notice}</p>}
        <form onSubmit={createDefinition} className="form-grid">
          <label className="field">
            {tr("Nombre del formulario")}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            {tr("Propósito")}
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              <option value="registration">Registration</option>
              <option value="application">Application</option>
              <option value="feedback">Feedback</option>
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            {tr("Crear formulario")}
          </button>
        </form>

        <label className="field">
          {tr("Formulario")}
          <select
            value={formId}
            onChange={(e) => {
              setFormId(e.target.value);
              setVersionId("");
              setDraftEditor(null);
            }}
          >
            <option value="">{tr("Selecciona una opción")}</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} · {f.purpose}
              </option>
            ))}
          </select>
        </label>

        {formId && (
          <form onSubmit={createDraft} className="form-grid">
            <label className="field">
              {tr("Identificador del campo")}
              <input
                required
                pattern="[a-z][a-z0-9_]*"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Etiqueta del campo")}
              <input
                required
                value={fieldTitle}
                onChange={(e) => setFieldTitle(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Tipo de campo")}
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
              >
                <option value="string">Texto</option>
                <option value="number">Número</option>
                <option value="integer">Entero</option>
                <option value="boolean">Sí/No</option>
              </select>
            </label>
            <label className="field">
              {tr("Texto de consentimiento")}
              <textarea
                required
                value={consent}
                onChange={(e) => setConsent(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Versión del consentimiento")}
              <input
                required
                value={consentVersion}
                onChange={(e) => setConsentVersion(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Finalidad del campo")}
              <input
                required
                value={policyPurpose}
                onChange={(e) => setPolicyPurpose(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Clasificación")}
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
              >
                {["publica", "interna", "confidencial", "restringida"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
              {["confidencial", "restringida"].includes(classification) && (
                <small role="status">
                  {tr(
                    "Campo de riesgo: revisa la política y el consentimiento.",
                  )}
                </small>
              )}
            </label>
            <label className="field">
              {tr("Referencia de retención")}
              <input
                required
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={addField}
            >
              {tr("Agregar campo a la vista previa")}
            </button>
            <div className="field">
              <strong>{tr("Vista previa")}</strong>
              {extraFields.map((field, index) => (
                <label key={field.name}>
                  {index + 1}. {field.title} · {field.name} ({field.type})
                  <input disabled placeholder={tr("Respuesta de ejemplo")} />
                </label>
              ))}
              {fieldName && fieldTitle && (
                <label>
                  {extraFields.length + 1}. {fieldTitle} · {fieldName} (
                  {fieldType})
                  <input disabled placeholder={tr("Respuesta de ejemplo")} />
                </label>
              )}
              {extraFields.length > 0 && (
                <small>
                  {tr("Campos agregados al borrador")}: {extraFields.length}.{" "}
                  {tr(
                    "El campo que estás editando aparece al final de la vista previa.",
                  )}
                </small>
              )}
            </div>
            <button className="button secondary" disabled={busy}>
              {tr("Crear versión borrador")}
            </button>
          </form>
        )}

        {formId && (
          <>
            <label className="field">
              {tr("Versión")}
              <select
                aria-label={tr("Versión")}
                value={versionId}
                onChange={(e) => {
                  setVersionId(e.target.value);
                  setDraftEditor(null);
                }}
              >
                <option value="">{tr("Selecciona una opción")}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number} · {v.status}
                  </option>
                ))}
              </select>
            </label>
            {selected?.status === "draft" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void editDraft()}
              >
                {tr("Editar borrador")}
              </button>
            )}
            {selected?.status === "draft" && canPublish && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void publish()}
              >
                {tr("Validar y publicar formulario")}
              </button>
            )}
          </>
        )}

        {draftEditor && (
          <form onSubmit={saveDraft} className="form-grid">
            {(
              ["schema", "ui_schema", "consent", "field_policies"] as const
            ).map((key) => (
              <label className="field" key={key}>
                {key}
                <textarea
                  aria-label={key}
                  rows={7}
                  required
                  value={draftEditor[key]}
                  onChange={(e) =>
                    setDraftEditor({ ...draftEditor, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <button className="button primary" disabled={busy}>
              {tr("Guardar borrador")}
            </button>
          </form>
        )}

        {selected?.status === "published" && selectedEventId && (
          <div className="form-grid">
            <label className="field">
              {tr("Estado inicial")}
              <select
                value={bindingStatus}
                onChange={(e) => setBindingStatus(e.target.value)}
              >
                <option value="open">{tr("Abierto")}</option>
                <option value="scheduled">{tr("Programado")}</option>
              </select>
            </label>
            <label className="field">
              {tr("Apertura")}
              <input
                type="datetime-local"
                value={opens}
                onChange={(e) => setOpens(e.target.value)}
              />
            </label>
            <label className="field">
              {tr("Cierre")}
              <input
                type="datetime-local"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={busy || !opens || !closes}
              onClick={() => void bind()}
            >
              {tr("Vincular al evento")}
            </button>
          </div>
        )}

        {selectedEventId && bindings.length > 0 && (
          <div className="form-grid">
            <label className="field">
              {tr("Vínculo")}
              <select
                value={bindingId}
                onChange={(e) => setBindingId(e.target.value)}
              >
                <option value="">{tr("Selecciona una opción")}</option>
                {bindings
                  .filter(
                    (b) => b.status === "open" || b.status === "scheduled",
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.purpose} · {b.status} · {b.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              {tr("Motivo")}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {bindings.find((b) => b.id === bindingId)?.status ===
              "scheduled" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void transition("open")}
              >
                {tr("Abrir vínculo")}
              </button>
            )}
            {bindings.find((b) => b.id === bindingId)?.status === "open" && (
              <button
                className="button secondary"
                disabled={busy || !reason.trim()}
                onClick={() => void close()}
              >
                {tr("Cerrar vínculo")}
              </button>
            )}
            <button
              className="button secondary"
              disabled={busy || !bindingId || !reason.trim()}
              onClick={() => void transition("cancel")}
            >
              {tr("Cancelar vínculo")}
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}
