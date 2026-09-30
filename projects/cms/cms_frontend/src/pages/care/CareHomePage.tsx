import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, formatDate, useQuery } from '../../ui';
import { followUps } from '../../api/careApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { MemberPicker } from '../../features/ops/components/pickers';
import { ConfidentialityNotice } from './ConfidentialityNotice';
import { CareTabs } from './CareTabs';

export default function CareHomePage() {
  const navigate = useNavigate();
  const [within, setWithin] = useState(14);
  const data = useQuery(() => followUps(within), [within]);
  const [memberId, setMemberId] = useState<number | null>(null);
  const { can } = useAuth();
  const noteCount = data.data?.notes.length ?? 0;
  const visitCount = data.data?.visitations.length ?? 0;
  return (
    <OpsPage>
      <PageHeader title="Pastoral care" subtitle="Notes, visits and prayer for the people in your care." actions={can('care:write') ? <Button to="/care/notes/new" variant="primary">New care note</Button> : undefined} />
      <CareTabs active="followups" />
      <ConfidentialityNotice mode="read" />
      <div className="ops-split">
        <Card title={`Follow-ups due (${noteCount + visitCount})`} actions={<Select aria-label="Window" value={within} onChange={(e) => setWithin(Number(e.target.value))}><option value={7}>Next 7 days</option><option value={14}>Next 14 days</option><option value={30}>Next 30 days</option></Select>}>
          {data.error ? (
            <span className="ops-muted">{data.error.message}</span>
          ) : noteCount + visitCount === 0 && !data.loading ? (
            <EmptyState title="No follow-ups due" message="When you set a follow-up date on a note or visit it appears here." />
          ) : (
            <ul className="ops-list">
              {(data.data?.notes ?? []).map((n) => (
                <li key={`n${n.id}`}><span><Link to={`/care/notes/${n.id}`}>{n.member}</Link> <span className="ops-muted">· {n.kind.toLowerCase()} note</span> {n.confidential && <Badge tone="warn">Confidential</Badge>}</span><span className="ops-muted">{formatDate(n.followUpOn)}</span></li>
              ))}
              {(data.data?.visitations ?? []).map((v) => (
                <li key={`v${v.id}`}><span><Link to={`/care/members/${v.memberId}`}>{v.member}</Link> <span className="ops-muted">· {v.kind.toLowerCase()} visit</span></span><span className="ops-muted">{formatDate(v.followUpOn)}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Open a member's care record">
          <div className="ui-stack">
            <Field label="Member">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>
            <div><Button variant="primary" disabled={memberId === null} onClick={() => navigate(`/care/members/${memberId}`)}>Open record</Button></div>
          </div>
        </Card>
      </div>
    </OpsPage>
  );
}
