import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { Button, Card, Field, Input, PageHeader, Select, formatDate, useQuery, useToast } from '../../ui';
import { http } from '../../api/http';
import { normalizeError } from '../../api/http';
import { scanMember, type ScanResult } from '../../api/qrApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { EventSelect } from '../../features/ops/components/pickers';
import { QrScanView } from '../../features/qr/QrScanView';

type Kind = 'service' | 'event' | 'sermon';
interface Entry { key: number; at: Date; tone: 'ok' | 'dup' | 'bad'; text: string }

function beep(freq: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch { /* sound is a nicety; the panel already shows the result */ }
}

const loadSermons = async () => (await http.get<{ data: { id: number; title: string; datePreached: string }[] }>('/sermons', { page: 1, pageSize: 50 })).data;

/**
 * Door check-in: scan each member's QR card (camera, or a USB scanner that types into the code box).
 * The server marks them present for today against the chosen occasion and says if they were already in.
 */
export default function ScanPage() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('service');
  const [eventId, setEventId] = useState<number | ''>('');
  const [sermonId, setSermonId] = useState<number | ''>('');
  const [camera, setCamera] = useState(true);
  const [last, setLast] = useState<ScanResult | { error: string } | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [code, setCode] = useState('');
  const seq = useRef(0);
  const sermons = useQuery(loadSermons, []);
  const busy = useRef(false);

  const occasionMissing = (kind === 'event' && eventId === '') || (kind === 'sermon' && sermonId === '');

  const submit = useCallback(async (token: string) => {
    if (busy.current || !token.trim()) return;
    if (occasionMissing) { toast.error(kind === 'event' ? 'Choose the event first' : 'Choose the sermon first'); return; }
    busy.current = true;
    const push = (tone: Entry['tone'], text: string) => setLog((l) => [{ key: (seq.current += 1), at: new Date(), tone, text }, ...l].slice(0, 12));
    try {
      const res = await scanMember({ token: token.trim(), eventId: kind === 'event' && eventId !== '' ? eventId : null, sermonId: kind === 'sermon' && sermonId !== '' ? sermonId : null });
      setLast(res);
      push(res.status === 'RECORDED' ? 'ok' : 'dup', `${res.member.name} - ${res.status === 'RECORDED' ? 'marked present' : 'already marked'}`);
      beep(res.status === 'RECORDED' ? 880 : 440);
    } catch (failure) {
      const message = normalizeError(failure).message;
      setLast({ error: message });
      push('bad', message);
      beep(220);
    } finally {
      busy.current = false;
    }
  }, [kind, eventId, sermonId, occasionMissing, toast]);

  // A USB/Bluetooth scanner types the code and presses Enter into the box; keep it focused.
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => { form.current?.querySelector('input')?.focus(); }, [last]);

  return (
    <OpsPage>
      <PageHeader title="Scan check-in" subtitle="Mark members present by scanning the QR code on their card." actions={<Button variant="secondary" size="sm" to="/attendance/cards">Print QR cards</Button>} />
      <div className="ops-split">
        <div className="ui-stack">
          <Card title="Occasion" actions={<span className="ops-muted">{formatDate(new Date().toISOString())}</span>}>
            <div className="ops-qr-fields">
              <Field label="Checking in for">
                {(c) => (
                  <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                    <option value="service">Today's service</option>
                    <option value="event">A specific event</option>
                    <option value="sermon">A specific sermon</option>
                  </Select>
                )}
              </Field>
              {kind === 'event' && <Field label="Event">{(c) => <EventSelect {...c} value={eventId} onChange={setEventId} />}</Field>}
              {kind === 'sermon' && (
                <Field label="Sermon">
                  {(c) => (
                    <Select {...c} value={sermonId} onChange={(e) => setSermonId(e.target.value === '' ? '' : Number(e.target.value))}>
                      <option value="">{sermons.loading ? 'Loading…' : 'Choose a sermon'}</option>
                      {(sermons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.title} - {formatDate(s.datePreached)}</option>)}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          </Card>
          <Card title="Scanner" actions={<Button variant="ghost" size="sm" icon={camera ? <CameraOff size={12} aria-hidden /> : <Camera size={12} aria-hidden />} onClick={() => setCamera((v) => !v)}>{camera ? 'Turn camera off' : 'Turn camera on'}</Button>}>
            {camera ? <QrScanView active={!occasionMissing} onCode={submit} paused={occasionMissing} /> : <p className="ops-muted">Camera is off.</p>}
            <form ref={form} className="ops-qr-manual" onSubmit={(e) => { e.preventDefault(); void submit(code); setCode(''); }}>
              <Field label="Code box" hint="A USB scanner types here. You can also paste a code.">
                {(c) => <Input {...c} value={code} onChange={(e) => setCode(e.target.value)} placeholder="hq1.…" autoComplete="off" />}
              </Field>
              <Button type="submit" variant="secondary" size="sm" disabled={!code.trim()}>Check in</Button>
            </form>
          </Card>
        </div>
        <div className="ui-stack">
          <Card title="Result">
            {!last && <p className="ops-muted">Waiting for a scan.</p>}
            {last && 'error' in last && <div className="ops-qr-result ops-qr-bad" role="alert"><strong>Not recognised</strong><span>{last.error}</span></div>}
            {last && 'member' in last && (
              <div className={`ops-qr-result ${last.status === 'RECORDED' ? 'ops-qr-ok' : 'ops-qr-dup'}`} role="status">
                <strong>{last.member.name}</strong>
                <span>{last.status === 'RECORDED' ? `Marked present for ${formatDate(last.date)}` : `Already marked present for ${formatDate(last.date)}`}</span>
              </div>
            )}
          </Card>
          <Card title="This session">
            {log.length === 0 ? <p className="ops-muted">No scans yet.</p> : (
              <ul className="ops-qr-log">
                {log.map((e) => <li key={e.key} className={`ops-qr-${e.tone}-text`}><span>{e.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> {e.text}</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
