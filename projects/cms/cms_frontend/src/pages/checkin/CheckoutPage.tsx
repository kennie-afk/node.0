import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, PageLoader, Textarea, Field, formatDateTime, useQuery } from '../../ui';
import { checkOut, getChild, listSessions } from '../../api/checkinApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { explainCheckoutFailure, PICKUP_CODE, type CheckoutOutcome } from '../../features/ops/lib/checkout';

export default function CheckoutPage() {
  const sessionId = Number(useParams().id);
  const { role } = useAuth();
  const inNow = useQuery(() => listSessions({ status: 'IN', limit: 200 }), []);
  const session = inNow.data?.data.find((s) => s.id === sessionId);
  const child = useQuery(() => getChild(session!.childId), [session?.childId], { enabled: Boolean(session) });
  const [guardianId, setGuardianId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<CheckoutOutcome | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [released, setReleased] = useState<string | null>(null);

  if (inNow.loading && !inNow.data) return <PageLoader />;
  if (inNow.error && !inNow.data) return <ErrorState message={inNow.error.message} onRetry={inNow.refetch} requestId={inNow.error.requestId} />;
  if (released) {
    return (
      <OpsPage>
        <PageHeader title="Released" />
        <Notice tone="ok" title="Checked out">{released}</Notice>
        <div><Button variant="primary" to="/checkin">Back to the station</Button></div>
      </OpsPage>
    );
  }
  if (!session) return <OpsPage><EmptyState title="Not checked in" message="This child is not in the building, or was already collected." action={<Button to="/checkin">Back to the station</Button>} /></OpsPage>;

  const name = `${session.firstName} ${session.lastName}`;
  const isAdmin = role === 'ADMIN';
  const codeOk = PICKUP_CODE.test(code);
  const canSubmit = guardianId !== null && (codeOk || (override && isAdmin)) && (!override || reason.trim().length >= 5);

  const submit = async () => {
    if (guardianId === null) return;
    setBusy(true);
    setRefusal(null);
    try {
      const out = await checkOut(sessionId, { code: codeOk ? code : '000000', guardianId, overrideReason: override ? reason.trim() : null });
      const who = child.data?.guardians?.find((g) => g.id === guardianId)?.name ?? 'the guardian';
      setReleased(`${name} was released to ${who}.${out.flagged ? ' This release was flagged for review.' : ''}`);
    } catch (failure) {
      const outcome = explainCheckoutFailure(normalizeError(failure));
      setRefusal(outcome);
      setAttempts((n) => n + 1);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpsPage>
      <PageHeader title={`Check out ${name}`} crumbs={[{ label: "Children's check-in", to: '/checkin' }, { label: 'Check out' }]} subtitle={`${session.roomName} · in since ${formatDateTime(session.checkedInAt)} · tag ${session.securityTag}`} />
      {session.allergies && <div className="ops-alert-allergy" role="alert">ALLERGY: {session.allergies}</div>}
      {refusal && (
        <div className="ops-banner is-bad" role="alert" style={{ fontSize: 'var(--fs-lg)' }}>
          <strong>{refusal.kind === 'wrong-code' ? (refusal.locked ? 'LOCKED. Do not release the child.' : 'Wrong code. Do not release the child yet.') : refusal.kind === 'not-authorised' ? 'Not an authorised pickup. Do not release the child.' : 'Not released.'}</strong>{' '}
          {refusal.message}. {attempts > 1 && <span>{attempts} refused attempts on this screen. Call a coordinator.</span>} This attempt has been recorded in the security trail.
        </div>
      )}
      <div className="ops-split">
        <form className="ui-form" onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit(); }}>
          <div>
            <div className="ui-label">Who is collecting?</div>
            <div className="ui-stack">
              {(child.data?.guardians ?? []).map((g) => (
                <button key={g.id} type="button" className="ops-tap" aria-pressed={guardianId === g.id} onClick={() => setGuardianId(g.id)}>
                  <span><strong>{g.name}</strong> <span className="ops-muted">{g.relationship ?? ''} {g.phone ?? ''}</span></span>
                  {g.isAuthorizedPickup ? <Badge tone="ok">Can collect</Badge> : <Badge tone="bad">Not authorised</Badge>}
                </button>
              ))}
              {child.loading && <span className="ops-muted">Loading guardians…</span>}
              {child.data && (child.data.guardians ?? []).length === 0 && <Notice tone="bad">No guardians on file. Only an administrator can release this child.</Notice>}
            </div>
          </div>
          <Field label="Pickup code from the parent's slip" required>
            {(c) => <Input {...c} className="ops-code-input" inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoFocus />}
          </Field>
          {isAdmin && (
            <div className="ui-stack">
              <label className="ops-check"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Administrator override (code lost or not authorised)</label>
              {override && (
                <Field label="Reason for the override" required hint="Recorded in the security trail with your name. The system still asks for a code field; leave it blank to send none.">
                  {(c) => <Textarea {...c} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
                </Field>
              )}
            </div>
          )}
          <div className="ui-form-actions">
            <Button type="submit" variant={override ? 'dangerSolid' : 'primary'} loading={busy} disabled={!canSubmit}>{override ? 'Release with override' : 'Release child'}</Button>
            <Button to="/checkin" variant="ghost">Cancel</Button>
          </div>
        </form>
        <Card title="Why the code?">
          <p className="ops-muted" style={{ margin: 0 }}>A child is only released to someone who holds the code printed at check-in and is on the authorised list. Every wrong code and every override is written to the security trail. After repeated wrong codes the check-out locks.</p>
          <div style={{ marginTop: 8 }}>
            {session.medicalNotes && <Notice tone="warn" title="Medical">{session.medicalNotes}</Notice>}
          </div>
        </Card>
      </div>
    </OpsPage>
  );
}
