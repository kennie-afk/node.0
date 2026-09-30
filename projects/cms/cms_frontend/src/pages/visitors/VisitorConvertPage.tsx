import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, ErrorState, Field, PageHeader, PageLoader, formatDate, useQuery } from '../../ui';
import { convertVisitor, getVisitor } from '../../api/visitorsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function VisitorConvertPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const visitor = useQuery(() => getVisitor(id), [id]);
  const { submit, busy, error } = useFormSubmit();
  const [link, setLink] = useState<number | null>(null);
  if (visitor.loading && !visitor.data) return <PageLoader />;
  if (visitor.error && !visitor.data) return <ErrorState message={visitor.error.message} onRetry={visitor.refetch} />;
  const v = visitor.data!;
  return (
    <OpsPage>
      <PageHeader title={`Make ${v.firstName} a member`} crumbs={[{ label: 'Visitors', to: '/visitors' }, { label: `${v.firstName} ${v.lastName}`, to: `/visitors/${id}` }, { label: 'Make a member' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          let memberId: number | null = null;
          const ok = await submit(async () => { memberId = (await convertVisitor(id, link)).memberId; }, 'They are now a member.');
          if (ok && memberId) navigate(`/members`);
        }}
      >
        <FormBanner error={error} />
        <Card title="What happens">
          <ul className="ui-stack" style={{ margin: 0, paddingLeft: 16 }}>
            <li>A member record is created for {v.firstName} {v.lastName}{v.phone ? ` (${v.phone})` : ''}.</li>
            <li>Their visit history, contacts and tasks stay on the visitor record.</li>
            <li>The visitor moves to "Joined" and leaves the open pipeline. First visit was {formatDate(v.firstVisitDate)}.</li>
          </ul>
        </Card>
        <Field label="Already a member?" hint="If they are already on the member list, pick them here to link instead of creating a duplicate. The server refuses a duplicate phone number or email otherwise.">
          {(c) => <MemberPicker {...c} value={link} onChange={setLink} />}
        </Field>
        {link !== null && <Notice tone="info">No new member will be created; the visitor will be linked to the member chosen.</Notice>}
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy}>{link ? 'Link to that member' : 'Create the member'}</Button><Button to={`/visitors/${id}`} variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
