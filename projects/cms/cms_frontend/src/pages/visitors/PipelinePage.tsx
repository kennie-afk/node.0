import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Badge, Button, PageHeader, Select, StatTile, formatDate, useKeysetList, useQuery, useToast } from '../../ui';
import { moveStage, pipeline, STAGES, type Stage, type Visitor } from '../../api/visitorsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { conversionPercent, nextStage, STAGE_LABEL } from '../../features/ops/lib/stages';
import { VisitorsTabs } from './VisitorsTabs';

function Column({ stage, count, onMoved }: { stage: Stage; count: number; onMoved: () => void }) {
  const list = useKeysetList<Visitor>('/visitors', { stage }, { limit: 15 });
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const move = async (v: Visitor, to: Stage) => {
    setBusy(v.id);
    try {
      await moveStage(v.id, to);
      toast.success(`${v.firstName} moved to ${STAGE_LABEL[to]}.`);
      onMoved();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="ops-col" aria-label={STAGE_LABEL[stage]}>
      <div className="ops-col-head"><span>{STAGE_LABEL[stage]}</span><span className="ui-num">{count}</span></div>
      <div className="ops-col-body">
        {list.items.map((v) => {
          const next = nextStage(v.stage);
          return (
            <div key={v.id} className="ops-card">
              <Link to={`/visitors/${v.id}`}>{v.firstName} {v.lastName}</Link>
              <span className="ops-muted">First visit {formatDate(v.firstVisitDate)}{v.source ? ` · ${v.source}` : ''}</span>
              {v.status === 'CONVERTED' && <Badge tone="ok">Now a member</Badge>}
              {can('members:write') && v.status === 'OPEN' && (
                <div className="ui-row">
                  {next && <Button size="sm" variant="secondary" loading={busy === v.id} onClick={() => move(v, next)}>{STAGE_LABEL[next]} →</Button>}
                  <Select aria-label={`Move ${v.firstName}`} value="" onChange={(e) => e.target.value && void move(v, e.target.value as Stage)} disabled={busy === v.id}>
                    <option value="">Move to…</option>
                    {STAGES.filter((s) => s !== v.stage).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                  </Select>
                </div>
              )}
            </div>
          );
        })}
        {list.loading && list.items.length === 0 && <span className="ops-muted">Loading…</span>}
        {!list.loading && list.items.length === 0 && <span className="ops-muted">No one here.</span>}
        {list.hasMore && <Link to={`/visitors/list?stage=${stage}`} className="ops-muted">See all {count}</Link>}
      </div>
    </section>
  );
}

export default function PipelinePage() {
  const [rev, setRev] = useState(0);
  const stats = useQuery(pipeline, [rev]);
  const { can } = useAuth();
  const total = stats.data?.total ?? 0;
  return (
    <OpsPage>
      <PageHeader title="Visitors" subtitle="First-time guests, from their first Sunday to joining the church." actions={can('members:write') ? <Button to="/visitors/new" variant="primary" icon={<Plus size={12} aria-hidden />}>Record a visitor</Button> : undefined} />
      <VisitorsTabs active="pipeline" />
      <div className="ui-grid" style={{ ['--ui-min' as string]: '120px' }}>
        <StatTile label="Visitors" value={total} />
        <StatTile label="Became members" value={stats.data?.stages.JOINED ?? 0} tone="ok" />
        <StatTile label="Conversion" value={stats.data ? conversionPercent(stats.data.conversionRate) : '-'} foot="Joined out of all recorded" />
      </div>
      <div className="ops-board">
        {STAGES.map((stage) => (
          <Column key={`${stage}-${rev}`} stage={stage} count={stats.data?.stages[stage] ?? 0} onMoved={() => setRev((n) => n + 1)} />
        ))}
      </div>
    </OpsPage>
  );
}
