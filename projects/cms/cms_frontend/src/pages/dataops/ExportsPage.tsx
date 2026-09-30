import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, PageHeader, useToast } from '../../ui';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { downloadAuthed } from '../../features/ops/lib/download';
import { DataTabs } from './DataTabs';

export default function ExportsPage() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <OpsPage>
      <PageHeader title="Exports" subtitle="Take a copy of your data. Every export is recorded in the audit log." />
      <DataTabs active="exports" />
      <Notice tone="warn" title="Handle with care">A member export contains personal information protected by the Data Protection Act. Keep it on a device you control and delete it when you are done.</Notice>
      <Card title="Member list (CSV)" subtitle="Names, contact details, status and dates. Formulas are neutralised so it is safe to open in a spreadsheet." actions={<Button variant="primary" loading={busy} icon={<Download size={12} aria-hidden />} onClick={async () => { setBusy(true); try { await downloadAuthed('/dataops/exports/members.csv', 'members.csv'); toast.success('Download started.'); } catch (e) { toast.error(normalizeError(e).message); } finally { setBusy(false); } }}>Download members.csv</Button>}>
        <span className="ops-muted">Up to 100,000 members.</span>
      </Card>
      <Card title="Children's check-in attendance (CSV)" subtitle="Choose the dates on the check-in history page." actions={<Button variant="secondary" to="/checkin/history">Open history</Button>}>
        <span className="ops-muted">Includes room, tag and times for each check-in.</span>
      </Card>
    </OpsPage>
  );
}
