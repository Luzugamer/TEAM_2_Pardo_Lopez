import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, ScanLine, ShieldCheck } from 'lucide-react';
import type { ModuleContext } from '../../platform/microfrontends/contracts';
import { useI18n } from '../../core/i18n';
import { Alert, Badge, Button, Card, Input } from '../../design-system/atoms';
import { EmptyState, PageHeading, SelectMenu, StatusLine } from '../../design-system/molecules';
import { CameraQrScanner } from './CameraQrScanner';

type Tab = 'checkin' | 'attendance' | 'reports';
type Ticket = { ticket_id: string; masked_holder: string; status: string };
type Dashboard = { registered: number; confirmed: number; present: number; attendance_rate: number };
type AttendanceFact = { id: string; ticket_id: string; type: string; occurred_at: string; effective_status: string };
const eventIds: Record<string, string> = { demo: 'event-demo', fiis: 'event-fiis' };

export function OnsiteModule({ context }: { context: ModuleContext }) {
  const { t } = useI18n();
  const navigate = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [event, setEvent] = useState('demo');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard>({ registered: 0, confirmed: 0, present: 0, attendance_rate: 0 });
  const [facts, setFacts] = useState<AttendanceFact[]>([]);
  const tab: Tab = context.route === '/onsite/attendance' ? 'attendance' : context.route === '/onsite/reports' ? 'reports' : 'checkin';
  const eventId = eventIds[event] || eventIds.demo;

  const loadDashboard = async () => {
    try {
      const response = await fetch(`${context.apiBaseUrl}/onsite/v1/dashboard?event_id=${encodeURIComponent(eventId)}`, { headers: { 'X-Mock-Role': 'staff', 'X-Mock-Tenant': '00000000-0000-0000-0000-000000000001' } });
      if (!response.ok) throw new Error();
      setDashboard(await response.json());
    } catch { setMessage(t('onsite.dashboardError')); }
  };
  const loadAttendance = async () => {
    try {
      const response = await fetch(`${context.apiBaseUrl}/onsite/v1/attendance?event_id=${encodeURIComponent(eventId)}&scope=main`, { headers: { 'X-Mock-Role': 'staff' } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setFacts(data.items || []);
    } catch { setMessage(t('onsite.apiError')); }
  };
  useEffect(() => { if (tab === 'checkin') void loadDashboard(); }, [tab, eventId]);
  useEffect(() => { if (tab === 'attendance') void loadAttendance(); }, [tab, eventId]);

  const search = async (value = code) => {
    const query = value.trim();
    if (query.length < 4) { setMessage(t('onsite.searchEmpty')); setTicket(null); return; }
    setSearching(true); setMessage(''); setTicket(null);
    try {
      const response = await fetch(`${context.apiBaseUrl}/onsite/v1/tickets/search?q=${encodeURIComponent(query)}&event_id=${encodeURIComponent(eventId)}&scope=main`, { headers: { 'X-Mock-Role': 'staff' } });
      if (!response.ok) throw new Error();
      const items: Ticket[] = await response.json();
      if (!items.length) setMessage(t('onsite.searchEmpty')); else setTicket(items[0]);
    } catch { setMessage(t('onsite.apiError')); } finally { setSearching(false); }
  };
  const checkin = async (ticketId: string) => {
    setLoading(true); setMessage('');
    try {
      const response = await fetch(`${context.apiBaseUrl}/onsite/v1/attendance/check-ins`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mock-Role': 'staff', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ ticket_id: ticketId, event_id: eventId, scope: 'main' }) });
      const data = await response.json();
      if (!response.ok) { setMessage(t('onsite.checkinError', { error: data.code || 'error' })); return; }
      setMessage(t('onsite.checkinSuccess')); setTicket(null); setCode(''); await loadDashboard();
    } catch { setMessage(t('onsite.apiError')); } finally { setLoading(false); }
  };
  const consumeQr = (rawValue: string) => {
    const match = rawValue.trim().match(/^nexo:ticket:(.+)$/i);
    setCameraOpen(false);
    if (!match) { setMessage(t('onsite.qrInvalid')); return; }
    setCode(match[1]);
    void search(match[1]);
  };
  const error = message.startsWith('No ') || message.startsWith('No se') || message.startsWith('API') || message.startsWith('Could not');

  return <div className="nx-module-page">
    <PageHeading title={tab === 'checkin' ? t('onsite.checkinTab') : tab === 'attendance' ? t('onsite.attendanceTab') : t('onsite.reportsTab')} description={tab === 'checkin' ? t('onsite.registerDescription') : tab === 'attendance' ? t('onsite.attendanceDescription') : t('onsite.reportsDescription')} action={<SelectMenu label={t('onsite.event')} value={event} onChange={setEvent} options={[{ value: 'demo', label: t('onsite.demo') }, { value: 'fiis', label: t('onsite.congress') }]} />} />
    {tab === 'checkin' && <div className="nx-content-grid">
      <Card className="nx-scan-panel">
        <div className="nx-panel-heading"><div><p className="nx-eyebrow">{t('onsite.station')}</p><h2>{t('onsite.register')}</h2><p className="nx-muted">{t('onsite.registerDescription')}</p></div><Badge tone="success"><CheckCircle2 size={14} /> {t('onsite.ready')}</Badge></div>
        <div className="nx-scanner"><ScanLine size={42} /><strong>{t('onsite.scanner')}</strong><span>{t('onsite.scannerDescription')}</span></div>
        <div className="nx-ticket-entry"><Input label={t('onsite.ticketCode')} help={t('onsite.ticketCodeHelp')} value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} placeholder="DEMO-2026-001" /><div className="nx-actions"><Button onClick={() => setCameraOpen(true)}><ScanLine size={16} />{t('onsite.openCamera')}</Button><Button variant="secondary" onClick={() => consumeQr(code)} loading={searching}>{t('onsite.scan')}</Button><Button variant="secondary" onClick={() => void search()} loading={searching}>{t('onsite.search')}</Button></div></div>
        {ticket && <div className="nx-ticket-result"><div><p className="nx-eyebrow">{t('onsite.searchSelect')}</p><strong>{ticket.masked_holder}</strong><span>{ticket.ticket_id} · {ticket.status === 'active' ? t('onsite.ticketReady') : t('onsite.ticketRejected')}</span></div><Button onClick={() => void checkin(ticket.ticket_id)} loading={loading}>{t('onsite.registerSelected')}</Button></div>}
        {message && <Alert tone={error ? 'danger' : 'success'}>{error ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {message}</Alert>}
      </Card>
      <Card className="nx-readiness"><div className="nx-panel-heading"><div><p className="nx-eyebrow">{t('onsite.attendanceTitle')}</p><h2>{t('onsite.attendanceSummary', { percentage: `${Math.round(dashboard.attendance_rate)}%` })}</h2></div></div><StatusLine label={t('onsite.registered')} value={String(dashboard.registered)} /><StatusLine label={t('onsite.confirmed')} value={String(dashboard.confirmed)} tone="success" /><StatusLine label={t('onsite.present')} value={String(dashboard.present)} tone="success" /></Card>
    </div>}
    {tab === 'attendance' && <Card>{facts.length === 0 ? <EmptyState title={t('onsite.attendanceTab')} description={t('onsite.history')} action={<Button variant="secondary" onClick={() => navigate('/onsite')}>{t('onsite.registerEntry')}</Button>} /> : <div className="nx-history-list"><div className="nx-panel-heading"><div><p className="nx-eyebrow">{t('onsite.attendanceTitle')}</p><h2>{facts.length} {t('onsite.entries')}</h2></div><Button variant="secondary" onClick={() => void loadAttendance()}>Actualizar</Button></div>{facts.map((fact) => <div className="nx-history-row" key={fact.id}><div><strong>{fact.ticket_id}</strong><span>{fact.type} · {new Date(fact.occurred_at).toLocaleString()}</span></div><Badge tone="success">{fact.effective_status}</Badge></div>)}</div>}</Card>}
    {tab === 'reports' && <Card><div className="nx-job-list"><Button variant="secondary" onClick={() => setMessage('Reporte: job completed — datos simulados')}><FileText size={18} />{t('onsite.report')}</Button><Button variant="secondary" onClick={() => setMessage('Certificado: job completed — datos simulados')}><ShieldCheck size={18} />{t('onsite.certificate')}</Button><Button variant="secondary" onClick={() => setMessage('HukID: delivery completed — adapter fake')}><ShieldCheck size={18} />{t('onsite.hukid')}</Button></div>{message && <Alert tone="success"><CheckCircle2 size={16} />{message}</Alert>}</Card>}
    <CameraQrScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={consumeQr} copy={{ title: t('onsite.cameraTitle'), description: t('onsite.cameraDescription'), starting: t('onsite.cameraStarting'), ready: t('onsite.cameraReady'), error: t('onsite.cameraError'), stop: t('onsite.stopCamera') }} />
  </div>;
}
