import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, DateInput, Field, Input, PageHeader, todayISO } from '../../ui';
import { addTask } from '../../api/visitorsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner } from '../../features/ops/components/FormBanner';
import { MemberPicker } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

export default function VisitorTaskFormPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayISO());
  const [assignee, setAssignee] = useState<number | null>(null);
  return (
    <OpsPage>
      <PageHeader title="Add a follow-up task" crumbs={[{ label: 'Visitors', to: '/visitors' }, { label: 'Visitor', to: `/visitors/${id}` }, { label: 'Add a task' }]} />
      <form className="ui-form" onSubmit={async (e) => { e.preventDefault(); if (await submit(() => addTask(id, { title, dueDate, assigneeMemberId: assignee }), 'Task added.')) navigate(`/visitors/${id}`); }}>
        <FormBanner error={error} />
        <Field label="Task" required error={fieldError('title')}>{(c) => <Input {...c} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Due" required error={fieldError('dueDate')}>{(c) => <DateInput {...c} value={dueDate} onChange={setDueDate} />}</Field>
        <Field label="Who does it" hint="Optional.">{(c) => <MemberPicker {...c} value={assignee} onChange={setAssignee} />}</Field>
        <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={title.trim().length < 2 || !dueDate}>Add task</Button><Button to={`/visitors/${id}`} variant="ghost">Cancel</Button></div>
      </form>
    </OpsPage>
  );
}
