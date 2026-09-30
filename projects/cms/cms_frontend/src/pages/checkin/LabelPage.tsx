import { Link, Navigate, useLocation } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Button, PageHeader, formatDateTime } from '../../ui';
import type { Session } from '../../api/checkinApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';

interface LabelState {
  session: Session;
  room: string;
}

/**
 * The pickup code exists in plain text only in the check-in response (the server keeps a hash), so
 * this page reads it from the navigation state. Reloading loses it on purpose.
 */
export default function LabelPage() {
  const state = useLocation().state as LabelState | null;
  if (!state?.session) return <Navigate to="/checkin" replace />;
  const { session, room } = state;
  const name = session.child ? `${session.child.firstName} ${session.child.lastName}` : `${session.firstName ?? ''} ${session.lastName ?? ''}`;
  const allergies = session.child?.allergies ?? session.allergies;

  return (
    <OpsPage>
      <PageHeader title="Checked in" subtitle={`${name} is in ${room}.`} actions={<><Button variant="primary" icon={<Printer size={12} aria-hidden />} onClick={() => window.print()}>Print label</Button><Button to="/checkin">Next child</Button></>} />
      <div className="ops-noprint"><Notice tone="warn" title="Keep the parent's code safe">The pickup code is shown once. The system stores only a scrambled copy, so it cannot be looked up later. The parent needs it, together with the tag number, to collect {session.firstName ?? session.child?.firstName ?? 'the child'}.</Notice></div>
      <div className="ops-split">
        <div className="ops-label ops-printable" aria-label="Child label">
          <h2>{name}</h2>
          <div className="ops-muted">{room} · {formatDateTime(session.checkedInAt)}</div>
          {allergies && <div className="ops-alert-allergy">ALLERGY: {allergies}</div>}
          <div className="ops-label-tag" aria-label={`Tag ${session.securityTag}`}>{session.securityTag}</div>
        </div>
        <div className="ops-label ops-printable" aria-label="Parent pickup slip">
          <h2>Parent slip</h2>
          <div className="ops-muted">Show this to collect {name}</div>
          <div className="ops-label-tag" aria-label={`Tag ${session.securityTag}`}>{session.securityTag}</div>
          <div className="ops-codebox" aria-label={`Pickup code ${session.pickupCode ?? 'hidden'}`}>{session.pickupCode ?? '------'}</div>
        </div>
      </div>
      <div className="ops-noprint"><Link to={`/checkin/sessions/${session.id}/checkout`} className="ops-muted">Go straight to check-out</Link></div>
    </OpsPage>
  );
}
