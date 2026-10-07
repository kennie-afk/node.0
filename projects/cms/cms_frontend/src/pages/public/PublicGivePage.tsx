import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Church } from 'lucide-react';
import { Button, Card, Field, formatMoney, Input, MoneyInput, Select, toMinor } from '../../ui';
import { http, newIdempotencyKey, normalizeError } from '../../api/http';

interface GiveInfo {
  church: { name: string; slug: string };
  types: Array<{ id: number; name: string }>;
  minAmountMinor: number;
  maxAmountMinor: number;
  configured: boolean;
  testMode: boolean;
}
type Phase = 'form' | 'sending' | 'waiting' | 'done' | 'failed' | 'timeout';

/**
 * A church's public giving page. No sign-in, so it holds no church data beyond the name and the
 * giving options; the server validates, rate-limits and de-duplicates. The donor key (also the
 * idempotency key) is made once per attempt and is the only handle to the gift's status.
 */
export default function PublicGivePage() {
  const slug = useParams().slug ?? '';
  const [info, setInfo] = useState<GiveInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [typeId, setTypeId] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [message, setMessage] = useState('');
  const key = useRef(newIdempotencyKey('give'));

  useEffect(() => {
    http.get<GiveInfo>(`/public/give/${encodeURIComponent(slug)}`).then(setInfo).catch(() => setMissing(true));
  }, [slug]);

  // After the prompt is sent, ask for the outcome every few seconds for about two minutes.
  useEffect(() => {
    if (phase !== 'waiting') return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      try {
        const s = await http.get<{ status: string; receipt: string | null; message: string | null }>(`/public/give/${encodeURIComponent(slug)}/status`, undefined, { headers: { 'Idempotency-Key': key.current } });
        if (s.status === 'SUCCESS') { setMessage(s.receipt ? `Received. M-Pesa receipt ${s.receipt}.` : 'Received.'); setPhase('done'); }
        else if (s.status === 'FAILED' || s.status === 'CANCELLED') { setMessage(s.status === 'CANCELLED' ? 'The request was cancelled on your phone.' : 'The payment did not go through.'); setPhase('failed'); }
      } catch {
        // A lookup that fails is retried on the next tick.
      }
      if (tries >= 40) setPhase('timeout');
    }, 3000);
    return () => window.clearInterval(timer);
  }, [phase, slug]);

  const minor = amount ? toMinor(amount) : 0;
  const inRange = info ? minor >= info.minAmountMinor && minor <= info.maxAmountMinor : false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inRange) return;
    setPhase('sending');
    try {
      const res = await http.post<{ status: string; message: string }>(`/public/give/${encodeURIComponent(slug)}`, { phone, amount, ...(typeId ? { givingTypeId: Number(typeId) } : {}) }, { headers: { 'Idempotency-Key': key.current } });
      setMessage(res.message);
      setPhase(res.status === 'FAILED' ? 'failed' : 'waiting');
    } catch (failure) {
      setMessage(normalizeError(failure).message);
      setPhase('failed');
    }
  };

  const again = () => { key.current = newIdempotencyKey('give'); setPhase('form'); setMessage(''); };

  return (
    <div className="ui-page" style={{ maxWidth: 440, margin: '48px auto', padding: '0 16px' }}>
      <div className="ui-row" style={{ marginBottom: 12 }}>
        <span className="ui-brand-mark"><Church size={20} aria-hidden /></span>
        <strong>{info?.church.name ?? 'Give'}</strong>
      </div>
      {missing && <Card title="Page not found"><p>This giving page does not exist. Check the link you were given.</p></Card>}
      {info && !missing && (
        <Card title="Give by M-Pesa">
          {info.testMode && <div className="fin-warn" role="status">Test mode: no prompt is sent and no money moves.</div>}
          {!info.configured && <div className="fin-warn" role="alert">Giving by M-Pesa is not available for this church yet.</div>}
          {(phase === 'form' || phase === 'sending') && (
            <form className="ui-stack" onSubmit={submit}>
              <Field label="Amount" required hint={`Between ${formatMoney(info.minAmountMinor / 100)} and ${formatMoney(info.maxAmountMinor / 100)}`}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
              <Field label="M-Pesa phone number" required hint="You will get a prompt on this phone">{(c) => <Input {...c} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" maxLength={16} />}</Field>
              <Field label="Giving for">{(c) => (
                <Select {...c} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="">General giving</option>
                  {info.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              )}</Field>
              <Button type="submit" variant="primary" loading={phase === 'sending'} disabled={!info.configured || !inRange || phone.trim().length < 9}>Give {inRange ? formatMoney(minor / 100) : ''}</Button>
            </form>
          )}
          {phase === 'waiting' && <p role="status">{message || 'Check your phone and enter your M-Pesa PIN.'} Waiting for confirmation…</p>}
          {phase === 'done' && <><p role="status"><strong>Thank you.</strong> {message}</p><Button variant="secondary" onClick={again}>Give again</Button></>}
          {(phase === 'failed' || phase === 'timeout') && (
            <>
              <p role="alert">{phase === 'timeout' ? 'We have not heard back yet. If money left your account it will still be recorded; do not pay twice.' : message}</p>
              <Button variant="secondary" onClick={again}>Try again</Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
