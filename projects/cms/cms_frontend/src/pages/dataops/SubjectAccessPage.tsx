import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, EmptyState, Field, PageHeader, useToast } from '../../ui';
import { dataSubjectExport } from '../../api/dataopsApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { downloadJson } from '../../features/ops/lib/download';
import { DataTabs } from './DataTabs';

function countOf(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} record${value.length === 1 ? '' : 's'}`;
  if (value && typeof value === 'object') return 'included';
  return '';
}

export default function SubjectAccessPage() {
  const toast = useToast();
  const [memberId, setMemberId] = useState<number | null>(null);
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const sections = bundle ? Object.entries(bundle).filter(([k]) => k !== 'generatedAt') : [];
  return (
    <OpsPage>
      <PageHeader title="Subject access request" subtitle="When a member asks what the church holds about them, produce everything in one file." />
      <DataTabs active="access" />
      <Notice tone="info" title="Audited">Generating this bundle is recorded in the audit log with your name. Give it only to the member, in person or through a channel they control.</Notice>
      <div style={{ maxWidth: 360 }}><Field label="Member">{(c) => <MemberPicker {...c} value={memberId} onChange={(id) => { setMemberId(id); setBundle(null); }} />}</Field></div>
      <div><Button variant="primary" loading={busy} disabled={memberId === null} onClick={async () => { setBusy(true); try { setBundle(await dataSubjectExport(memberId!)); } catch (e) { toast.error(normalizeError(e).message); } finally { setBusy(false); } }}>Gather their data</Button></div>
      {bundle ? (
        <Card title="Everything held about this member" actions={<Button variant="primary" icon={<Download size={12} aria-hidden />} onClick={() => downloadJson(bundle, `member-${memberId}-data.json`)}>Download JSON</Button>}>
          <ul className="ops-list">{sections.map(([key, value]) => <li key={key}><span>{key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span><span className="ops-muted">{countOf(value)}</span></li>)}</ul>
        </Card>
      ) : memberId === null ? <EmptyState title="Choose a member" message="Then gather their data into a single downloadable file." /> : null}
    </OpsPage>
  );
}
