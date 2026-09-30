import { useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import {
  Badge, BarChart, Button, Card, Combobox, DataTable, DateInput, Donut, EmptyState, ErrorState, Field, FilterBar, InlineConfirm, Input,
  LineChart, LoadMore, MoneyInput, PageHeader, Pagination, SearchInput, Select, Skeleton, Sparkline, StackedBar, StatTile, StatusPill,
  Tabs, Textarea, addMoney, formatMoney, sumMoney, useToast, type ComboOption
} from './index';

interface Sample {
  id: number;
  name: string;
  fund: string;
  status: string;
  amount: string;
}

const ROWS: Sample[] = [
  { id: 1, name: 'Sunday offering', fund: 'General', status: 'POSTED', amount: '152400.00' },
  { id: 2, name: 'Building pledge - Otieno', fund: 'Building', status: 'PENDING', amount: '25000.50' },
  { id: 3, name: 'Missions seed', fund: 'Missions', status: 'VOID', amount: '8000.00' },
  { id: 4, name: 'Thanksgiving', fund: 'General', status: 'PARTIALLY_PAID', amount: '1200.05' }
];

const PEOPLE: Array<ComboOption<number>> = [
  { value: 1, label: 'Amina Wanjiru', meta: 'M-0001' },
  { value: 2, label: 'Brian Otieno', meta: 'M-0002' },
  { value: 3, label: 'Grace Achieng', meta: 'M-0003' }
];

/** Dev-only catalogue (route /ui-kit). Every shared component in one place, in every state. */
export default function UIKitPage() {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('2026-09-30');
  const [person, setPerson] = useState<ComboOption<number> | null>(null);
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [page, setPage] = useState(1);
  const [shown, setShown] = useState(2);

  return (
    <div className="ui-page">
      <PageHeader title="UI kit" subtitle="Dense, quiet, nothing moves on hover. Root 12px, 6px radius, no shadows." actions={<Button variant="primary" icon={<Plus size={12} />}>New record</Button>} crumbs={[{ label: 'Dev' }, { label: 'UI kit' }]} />

      <Card title="Buttons and badges">
        <div className="ui-row">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Badge>Neutral</Badge>
          <Badge tone="ok" dot>Ok</Badge>
          <StatusPill status="PARTIALLY_PAID" />
          <StatusPill status="VOID" />
          <StatusPill status="POSTED" />
        </div>
      </Card>

      <div className="ui-grid" style={{ ['--ui-min' as string]: '170px' }}>
        <StatTile label="Income MTD" value={formatMoney('1250400.50')} delta={12.4} foot="vs last month" spark={<Sparkline label="Income trend" values={[3, 5, 4, 7, 6, 9, 8]} />} />
        <StatTile label="Expenses MTD" value={formatMoney('830200.00')} delta={-3.1} upIsGood={false} />
        <StatTile label="Net" value={formatMoney('-2500.75', { negative: 'parens' })} tone="bad" />
        <StatTile label="Cash" value={formatMoney(sumMoney(['100.10', '200.20']))} tone="ok" foot={`0.1 + 0.2 = ${addMoney('0.10', '0.20')}`} />
      </div>

      <Card title="Form controls" subtitle="Money is a decimal string end to end.">
        <div className="ui-form-grid">
          <Field label="Amount" required hint={`value: "${amount}"`}>{(c) => <MoneyInput {...c} value={amount} onChange={setAmount} />}</Field>
          <Field label="Date">{(c) => <DateInput {...c} value={date} onChange={setDate} />}</Field>
          <Field label="Member (server search)">
            {(c) => <Combobox {...c} value={person} onChange={setPerson} search={async (q) => PEOPLE.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()))} />}
          </Field>
          <Field label="Fund">{(c) => <Select {...c}><option>General</option><option>Building</option></Select>}</Field>
          <Field label="Name" error="Name is required">{(c) => <Input {...c} />}</Field>
          <Field label="Notes">{(c) => <Textarea {...c} rows={2} />}</Field>
        </div>
      </Card>

      <Card title="Table" flush subtitle="Loading, error and empty states are handled by the component.">
        <FilterBar>
          <SearchInput onSearch={() => undefined} placeholder="Search records" />
          <Field label="Status">{(c) => <Select {...c}><option>All</option><option>Posted</option></Select>}</Field>
        </FilterBar>
        <DataTable
          caption="Sample records"
          rows={ROWS.slice(0, shown)}
          rowKey={(r) => r.id}
          rowHref={(r) => `/ui-kit#${r.id}`}
          columns={[
            { key: 'name', header: 'Record' },
            { key: 'fund', header: 'Fund' },
            { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
            { key: 'amount', header: 'Amount', numeric: true, render: (r) => formatMoney(r.amount, { showCurrency: false }) }
          ]}
          totals={<tr><td colSpan={3}>Total</td><td className="is-num">{formatMoney(sumMoney(ROWS.slice(0, shown).map((r) => r.amount)), { showCurrency: false })}</td></tr>}
          footer={<LoadMore shown={shown} hasMore={shown < ROWS.length} onMore={() => setShown((n) => n + 2)} noun="records" />}
        />
        <Pagination page={page} totalPages={5} total={112} pageSize={25} onPage={setPage} />
      </Card>

      <div className="ui-grid" style={{ ['--ui-min' as string]: '280px' }}>
        <Card title="Loading"><DataTable columns={[{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }]} rows={[]} rowKey={() => 0} loading /></Card>
        <Card title="Empty"><DataTable columns={[{ key: 'a', header: 'A' }]} rows={[]} rowKey={() => 0} empty={<EmptyState icon={<Inbox size={14} />} title="No receipts yet" message="Record the first gift to see it here." action={<Button size="sm" variant="primary">Record gift</Button>} />} /></Card>
        <Card title="Error"><ErrorState message="The server could not be reached." requestId="req-123" onRetry={() => toast.success('Retrying')} /></Card>
      </div>

      <Card title="Charts">
        <div className="ui-grid" style={{ ['--ui-min' as string]: '300px' }}>
          <BarChart label="Giving by month" data={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((label, i) => ({ label, value: [120, 180, 90, 240, 160, 210][i] * 1000 }))} format={(n) => formatMoney(String(n))} />
          <LineChart area label="Income and expenses" labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']} series={[{ name: 'Income', values: [120, 180, 90, 240, 160, 210] }, { name: 'Expenses', values: [100, 120, 110, 130, 150, 140] }]} />
          <Donut label="Giving by type" center="100%" slices={[{ label: 'Tithes', value: 620 }, { label: 'Offerings', value: 280 }, { label: 'Building', value: 100 }]} />
          <StackedBar label="Income by fund" rows={[{ label: 'General', segments: [{ name: 'Tithes', value: 620 }, { name: 'Offerings', value: 280 }] }, { label: 'Building', segments: [{ name: 'Building', value: 300 }] }]} />
        </div>
      </Card>

      <Card title="Tabs, inline confirm, toast, skeleton">
        <div className="ui-stack">
          <Tabs tabs={[{ key: 'a', label: 'Summary' }, { key: 'b', label: 'Detail' }]} active={tab} onChange={setTab} />
          <div className="ui-row">
            <InlineConfirm label="Void receipt" question="Void this receipt?" onConfirm={async () => toast.success('Voided')} />
            <Button onClick={() => toast.success('Saved')}>Success toast</Button>
            <Button onClick={() => toast.error('The period is closed')}>Error toast</Button>
            <Skeleton width={120} />
          </div>
        </div>
      </Card>
    </div>
  );
}
