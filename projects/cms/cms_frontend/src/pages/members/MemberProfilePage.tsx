import { Link, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, StatusPill, formatDate, formatMoney, fromMinor, useQuery } from '../../ui';
import { http } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import type { MemberProfile } from '../../api/memberApi';
import { OpsPage } from '../../features/ops/components/OpsPage';

/** One view of one person: what the church knows, gives and has done with them. Sections the viewer may not read are absent. */
export default function MemberProfilePage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const profile = useQuery(() => http.get<MemberProfile>(`/members/${id}/profile`), [id]);
  if (profile.loading && !profile.data) return <PageLoader />;
  if (profile.error && !profile.data) return <ErrorState message={profile.error.message} onRetry={profile.refetch} requestId={profile.error.requestId} />;
  const p = profile.data;
  if (!p) return null;
  const m = p.member;
  const location = [m.city, m.county].filter(Boolean).join(', ');
  return (
    <OpsPage>
      <PageHeader
        title={[m.firstName, m.middleName, m.lastName].filter(Boolean).join(' ')}
        crumbs={[{ label: 'Members', to: '/members' }, { label: `${m.firstName} ${m.lastName}` }]}
        actions={<>
          {p.giving && can('giving:read') && <Button to={`/giving/statements/${m.id}`} variant="secondary" size="sm">Giving statement</Button>}
          {p.care && can('care:read') && <Button to={`/care/members/${m.id}`} variant="secondary" size="sm">Care record</Button>}
        </>}
      />
      <div className="ops-split">
        <div className="ui-stack">
          <Card title="Details">
            <dl className="ops-kv">
              <dt>Status</dt><dd><StatusPill status={m.status} /></dd>
              <dt>Member since</dt><dd>{formatDate(m.membershipDate)}</dd>
              <dt>Baptised</dt><dd>{m.baptismDate ? formatDate(m.baptismDate) : '-'}</dd>
              <dt>Date of birth</dt><dd>{m.dateOfBirth ? formatDate(m.dateOfBirth) : '-'}</dd>
              <dt>Gender</dt><dd>{m.gender ?? '-'}</dd>
              <dt>Email</dt><dd>{m.email ?? '-'}</dd>
              <dt>Phone</dt><dd>{m.phoneNumber ?? '-'}</dd>
              <dt>Address</dt><dd>{[m.address, location, m.postalCode].filter(Boolean).join(', ') || '-'}</dd>
              {m.notes && <><dt>Notes</dt><dd>{m.notes}</dd></>}
            </dl>
          </Card>
          <Card title="Attendance" actions={<span className="ops-muted">{p.attendance.last90Days} in the last 90 days</span>}>
            {p.attendance.recent.length === 0 ? <EmptyState title="No attendance recorded" message="Check-ins and attendance entries for this person appear here." /> : (
              <ul className="ops-list">
                {p.attendance.recent.map((a) => (
                  <li key={a.id}><span>{a.eventName ?? a.sermonTitle ?? 'Service'}</span><span className="ops-muted">{formatDate(a.date)} · {a.type}</span></li>
                ))}
              </ul>
            )}
          </Card>
          {p.giving && (
            <Card title="Giving" actions={<span className="ops-muted">{p.giving.giftCount} gifts, {formatMoney(fromMinor(p.giving.totalMinor))} in total</span>}>
              {p.giving.recent.length === 0 ? <EmptyState title="No gifts" message="Posted gifts from this person appear here." /> : (
                <ul className="ops-list">
                  {p.giving.recent.map((g) => (
                    <li key={g.id}><Link to={`/giving/contributions/${g.id}`}>{g.contributionType}{g.receiptNo ? ` · ${g.receiptNo}` : ''}</Link><span>{formatDate(g.date)} · {formatMoney(g.amount)}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {p.care && (
            <Card title="Care notes">
              {p.care.notes.length === 0 ? <EmptyState title="No notes" message="Pastoral care notes appear here." /> : (
                <ul className="ops-list">
                  {p.care.notes.map((n) => (
                    <li key={n.id} style={{ alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="ui-row"><strong>{n.kind.charAt(0) + n.kind.slice(1).toLowerCase()}</strong> <span className="ops-muted">{formatDate(n.occurredOn)}</span> {n.isConfidential && <Badge tone="warn">Confidential</Badge>}</div>
                        {n.redacted ? <div className="ops-redacted"><Lock size={11} aria-hidden /> Confidential note by another user. The text is hidden from you.</div> : <div className="ops-note-body">{n.body}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
        <div className="ui-stack">
          <Card title="Family">
            {m.family ? <p><strong>{m.family.familyName}</strong></p> : <p className="ops-muted">Not linked to a family.</p>}
            <ul className="ops-list">
              {p.familyMembers.map((f) => <li key={f.id}><Link to={`/members/${f.id}`}>{f.firstName} {f.lastName}</Link><StatusPill status={f.status} /></li>)}
            </ul>
          </Card>
          <Card title="Ministries">
            {p.ministries.length === 0 ? <p className="ops-muted">Not serving in a ministry.</p> : <ul className="ops-list">{p.ministries.map((x) => <li key={x.id}><span>{x.name}</span><span className="ops-muted">{x.role ?? ''}</span></li>)}</ul>}
          </Card>
          <Card title="Small groups">
            {p.smallGroups.length === 0 ? <p className="ops-muted">Not in a small group.</p> : <ul className="ops-list">{p.smallGroups.map((x) => <li key={x.id}><span>{x.name}</span></li>)}</ul>}
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
