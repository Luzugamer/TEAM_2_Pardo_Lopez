import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Layers3, MapPin, Sparkles, Users, X } from 'lucide-react';
import { Badge as NexoBadge, Card, EmptyState } from '../../design-system';
import { translateEvents as tr } from '../../core/events-i18n';
import { displayDate, type RecordData } from './api';

export type Field = { name: string; label: string; type?: 'text' | 'textarea' | 'datetime-local' | 'number' | 'checkbox' | 'select' | 'multiselect' | 'json'; required?: boolean; options?: { label: string; value: string }[]; hint?: string };
export type Dialog = { title: string; description?: string; fields: Field[]; initial?: RecordData; submit: (body: RecordData) => Promise<void>; button?: string };
const toLocal = (value: string) => { const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function FormDialog({ dialog, close }: { dialog: Dialog; close: () => void }) {
  const initial = Object.fromEntries(dialog.fields.map(field => {
    const raw = dialog.initial?.[field.name];
    return [field.name, field.type === 'datetime-local' && raw ? toLocal(String(raw)) : field.type === 'json' ? JSON.stringify(raw ?? {}, null, 2) : raw ?? (field.type === 'checkbox' ? false : '')];
  }));
  const [values, setValues] = useState<RecordData>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = controls();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body: RecordData = {};
      const form = new FormData(event.currentTarget);
      for (const field of dialog.fields) {
        if (field.type === 'multiselect') { body[field.name] = form.getAll(field.name).map(String); continue; }
        const value = field.type === 'checkbox' ? form.has(field.name) : form.get(field.name);
        if (value === '' || value === null) continue;
        body[field.name] = field.type === 'number' ? Number(value) : field.type === 'datetime-local' ? new Date(String(value)).toISOString() : field.type === 'json' ? JSON.parse(String(value)) : value;
      }
      await dialog.submit(body); close();
    } catch (error) { setError(error instanceof Error ? error.message : tr("No se pudo completar la operación.")); }
    finally { setBusy(false); }
  };
  return <div className="overlay" onMouseDown={close}><div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={e => e.stopPropagation()}>
    <div className="dialog-head"><div><p className="eyebrow">{tr("CONFIGURACIÓN")}</p><h2 id="dialog-title">{dialog.title}</h2>{dialog.description && <p className="subtle">{dialog.description}</p>}</div><button className="icon-button" onClick={close} aria-label={tr("Cerrar")}><X size={19}/></button></div>
    <form onSubmit={submit}><div className="form-grid">{dialog.fields.map(field => <label className={`field ${field.type === 'textarea' || field.type === 'json' ? 'wide' : ''} ${field.type === 'checkbox' ? 'check-field' : ''}`} key={field.name}>
      {field.type === 'checkbox' ? <><input name={field.name} type="checkbox" checked={Boolean(values[field.name])} onChange={e => setValues({ ...values, [field.name]: e.target.checked })}/><span>{field.label}</span></> : <><span>{field.label}{field.required && ' *'}</span>{field.type === 'select' ? <select name={field.name} required={field.required} value={String(values[field.name] ?? '')} onChange={e => setValues({ ...values, [field.name]: e.target.value })}><option value="">{tr("Selecciona una opción")}</option>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.type === 'multiselect' ? <select name={field.name} multiple defaultValue={Array.isArray(values[field.name]) ? (values[field.name] as unknown[]).map(String) : []} size={Math.min(5, Math.max(2, field.options?.length ?? 0))}>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.type === 'textarea' || field.type === 'json' ? <textarea name={field.name} required={field.required} rows={field.type === 'json' ? 9 : 3} value={String(values[field.name] ?? '')} onChange={e => setValues({ ...values, [field.name]: e.target.value })}/> : <input name={field.name} required={field.required} type={field.type || 'text'} value={String(values[field.name] ?? '')} onChange={e => setValues({ ...values, [field.name]: e.target.value })}/>} {field.hint && <small>{field.hint}</small>}</>}
    </label>)}</div>{error && <div className="alert error">{error}</div>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={close}>{tr("Cancelar")}</button><button disabled={busy} className="button primary">{busy ? tr("Guardando…") : dialog.button || tr("Guardar cambios")} <ArrowRight size={16}/></button></div></form>
  </div></div>;
}

export function Badge({ status }: { status?: string }) {
  const labels: Record<string, string> = { draft: tr("Borrador"), published: tr("Publicado"), scheduled: tr("Programada"), closed: tr("Cerrado"), cancelled: tr("Cancelado"), archived: tr("Archivado") };
  return <NexoBadge tone={status === 'published' || status === 'scheduled' ? 'success' : status === 'cancelled' ? 'danger' : 'neutral'}>{labels[status || ''] || status || tr("Borrador")}</NexoBadge>;
}
export function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <EmptyState title={title} description={description} action={action}/>;
}
export function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <Card className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</Card>;
}

export function Stat({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: number | string; hint: string; tone: string }) { return <div className="stat"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong>{String(value).padStart(typeof value === 'number' && value < 10 ? 2 : 0, '0')}</strong><small>{hint}</small></div>; }
export function Step({ number, title, detail, onClick }: { number: string; title: string; detail: string; onClick: () => void }) { return <button className="step" onClick={onClick}><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div><ArrowRight size={16}/></button>; }
export function Detail({ label, value }: { label: string; value?: string }) { return <div className="detail"><small>{label}</small><strong>{value}</strong></div>; }
export function EventList({ rows, select, selectedId }: { rows: RecordData[]; select: (row: RecordData) => void; selectedId?: string }) { return <div className="event-list">{rows.map((event, index) => <button key={event.id} className={`event-row ${selectedId === event.id ? 'selected' : ''}`} onClick={() => select(event)}><div className={`event-icon ${['peach', 'lavender', 'green', 'yellow'][index % 4]}`}><CalendarDays size={19}/></div><div className="event-name"><strong>{event.title}</strong><span>{event.slug}</span></div><div className="event-date">{displayDate(event.starts_at)}</div><Badge status={event.status}/><ArrowRight className="row-arrow" size={17}/></button>)}</div>; }
export function ResourceList({ rows, kind, onEdit, onArchive, extra }: { rows: RecordData[]; kind: 'venue' | 'speaker' | 'program'; onEdit: (row: RecordData) => void; onArchive: (row: RecordData) => void; extra?: (row: RecordData) => ReactNode }) { if (!rows.length) return <Empty title={tr("Sin registros por ahora")} description={tr("Cuando agregues elementos aparecerán aquí.")}/>; return <div className="resource-list">{rows.map(row => <div className="resource-row" key={row.id}><div className={`resource-icon ${kind === 'speaker' ? 'peach' : kind === 'program' ? 'lavender' : 'green'}`}>{kind === 'speaker' ? <Users size={18}/> : kind === 'program' ? <Layers3 size={18}/> : <MapPin size={18}/>}</div><div className="resource-main"><strong>{row.name || row.display_name}</strong><span>{kind === 'venue' ? `${row.kind === 'room' ? tr("Sala") : tr("Sede")} · ${row.location?.address || tr("Sin dirección")}` : kind === 'speaker' ? (row.public_consent ? tr("Consentimiento público registrado") : tr("Sin consentimiento público")) : row.slug}</span></div><span className="revision">REV. {row.revision}</span>{extra?.(row)}<button className="small-button" onClick={() => onEdit(row)}>{tr("Editar")}</button><button className="small-button muted" onClick={() => onArchive(row)}>{tr("Archivar")}</button></div>)}</div>; }
