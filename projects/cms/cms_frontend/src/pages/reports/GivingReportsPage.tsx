import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Card, DataTable, Donut, Field, formatMoney, Select, StatTile, Tabs, toMinor, useQuery, monthLabel, Input } from '../../ui';
import { getAverageGift, getGivingByFund, getGivingByMonth, getGivingByType, getLapsedGivers, getRetention, getTopGivers } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { yearsBack } from '../../features/finance/components/helpers';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

const TABS = [
  { key: 'type', label: 'By type' }, { key: 'month', label: 'By month' }, { key: 'fund', label: 'By fund' }, { key: 'top', label: 'Top givers' },
  { key: 'lapsed', label: 'Lapsed givers' }, { key: 'retention', label: 'Retention' }, { key: 'average', label: 'Average gift' }
];
const major = (s: string) => toMinor(s) / 100;
const fmt = (n: number) => formatMoney(n.toFixed(2));

export default function GivingReportsPage() {
  const range = useRangeParams();
  const [tab, setTab] = useState('type');
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [quiet, setQuiet] = useState('3');
  const q = { from: range.from, to: range.to, fundId: range.fundId || undefined };
  const byType = useQuery(() => getGivingByType(q), [tab, range.from, range.to, range.fundId], { enabled: tab === 'type' });
  const byMonth = useQuery(() => getGivingByMonth(q), [tab, range.from, range.to, range.fundId], { enabled: tab === 'month' });
  const byFund = useQuery(() => getGivingByFund(q), [tab, range.from, range.to, range.fundId], { enabled: tab === 'fund' });
  const top = useQuery(() => getTopGivers({ ...q, limit: 25 }), [tab, range.from, range.to, range.fundId], { enabled: tab === 'top' });
  const lapsed = useQuery(() => getLapsedGivers({ asOf: range.asOf, quietMonths: Number(quiet) }), [tab, range.asOf, quiet], { enabled: tab === 'lapsed' });
  const retention = useQuery(() => getRetention(year), [tab, year], { enabled: tab === 'retention' });
  const average = useQuery(() => getAverageGift(q), [tab, range.from, range.to, range.fundId], { enabled: tab === 'average' });
  const active = { type: byType, month: byMonth, fund: byFund, top, lapsed, retention, average }[tab]!;
  const csvPath = { type: 'by-type', month: 'by-month', fund: 'by-fund', top: 'top-givers', lapsed: 'lapsed', retention: 'retention', average: 'average-gift' }[tab];

  return (
    <ReportFrame
      title="Giving reports"
      loading={active.loading}
      error={active.error}
      onRetry={active.refetch}
      csv={{ path: `/reports/giving/${csvPath}`, query: tab === 'retention' ? { year } : tab === 'lapsed' ? { asOf: range.asOf, quietMonths: Number(quiet) } : q, name: `giving-${csvPath}.csv` }}
      filters={
        <div className="ui-stack">
          <Tabs tabs={TABS} active={tab} onChange={setTab} label="Giving report" />
          {tab === 'lapsed' ? (
            <div className="ui-row"><RangeFilters range={range} mode="asOf" fund={false} /><Field label="Quiet for (months)">{(c) => <Input {...c} type="number" min={1} max={24} value={quiet} onChange={(e) => setQuiet(e.target.value)} />}</Field></div>
          ) : tab === 'retention' ? (
            <Field label="Year">{(c) => <Select {...c} value={year} onChange={(e) => setYear(Number(e.target.value))}>{yearsBack().map((y) => <option key={y}>{y}</option>)}</Select>}</Field>
          ) : (
            <RangeFilters range={range} fund={tab !== 'fund'} />
          )}
        </div>
      }
    >
      {tab === 'type' && byType.data && (
        <>
          <Card title={`Total ${byType.data.total}`}>
            {byType.data.types.length > 0 && <Donut label="Giving by type" slices={byType.data.types.map((t) => ({ label: t.type, value: major(t.total) }))} format={fmt} />}
          </Card>
          <Card flush><DataTable rowKey={(t) => t.type} rows={byType.data.types} columns={[{ key: 't', header: 'Type', render: (t) => t.type }, { key: 'g', header: 'Gifts', numeric: true, render: (t) => t.gifts }, { key: 'd', header: 'Donors', numeric: true, render: (t) => t.donors }, { key: 's', header: 'Share', numeric: true, render: (t) => `${t.share}%` }, { key: 'a', header: 'Total', numeric: true, render: (t) => <Money value={t.total} strong /> }]} empty={<span>No gifts in this period.</span>} /></Card>
        </>
      )}
      {tab === 'month' && byMonth.data && (
        <>
          <Card title="Giving by month"><BarChart label="Giving by month" data={byMonth.data.months.map((m) => ({ label: `${monthLabel(Number(m.month.slice(5))).slice(0, 3)} ${m.month.slice(2, 4)}`, value: major(m.total) }))} format={fmt} /></Card>
          <Card flush><DataTable rowKey={(m) => m.month} rows={byMonth.data.months} columns={[{ key: 'm', header: 'Month', render: (m) => m.month }, { key: 'g', header: 'Gifts', numeric: true, render: (m) => m.gifts }, { key: 'd', header: 'Donors', numeric: true, render: (m) => m.donors }, { key: 't', header: 'Total', numeric: true, render: (m) => <Money value={m.total} strong /> }]} /></Card>
        </>
      )}
      {tab === 'fund' && byFund.data && (
        <Card flush title={`Total ${byFund.data.total} (from the ledger)`}><DataTable rowKey={(f) => f.fundId} rows={byFund.data.funds} columns={[{ key: 'f', header: 'Fund', render: (f) => `${f.code} · ${f.name}` }, { key: 'r', header: 'Restriction', render: (f) => f.restriction.replace(/_/g, ' ').toLowerCase() }, { key: 'i', header: 'Given', numeric: true, render: (f) => <Money value={f.income} strong /> }]} empty={<span>No giving in this period.</span>} /></Card>
      )}
      {tab === 'top' && top.data && (
        <Card flush><DataTable rowKey={(g) => g.memberId} rows={top.data.givers} columns={[{ key: 'r', header: '#', numeric: true, render: (g) => g.rank }, { key: 'n', header: 'Member', render: (g) => <Link to={`/giving/statements/${g.memberId}`}>{g.name}</Link> }, { key: 'g', header: 'Gifts', numeric: true, render: (g) => g.gifts }, { key: 'l', header: 'Last gift', render: (g) => g.lastGift }, { key: 't', header: 'Total', numeric: true, render: (g) => <Money value={g.total} strong /> }]} empty={<span>No identified givers in this period.</span>} /></Card>
      )}
      {tab === 'lapsed' && lapsed.data && (
        <Card flush title={`Gave before ${lapsed.data.quietSince}, nothing since`}><DataTable rowKey={(g) => g.memberId} rows={lapsed.data.givers} columns={[{ key: 'n', header: 'Member', render: (g) => <Link to={`/giving/statements/${g.memberId}`}>{g.name}</Link> }, { key: 'l', header: 'Last gift', render: (g) => g.lastGift }]} empty={<span>No one has gone quiet. Every recent giver gave within the window.</span>} /></Card>
      )}
      {tab === 'retention' && retention.data && (
        <div className="ui-grid" style={{ ['--ui-min' as string]: '160px' }}>
          <StatTile label="Donors last year" value={retention.data.priorYearDonors} />
          <StatTile label="Donors this year" value={retention.data.currentYearDonors} />
          <StatTile label="Retained" value={retention.data.retained} tone="ok" />
          <StatTile label="Lost" value={retention.data.lost} tone={retention.data.lost > 0 ? 'warn' : undefined} />
          <StatTile label="New" value={retention.data.newDonors} />
          <StatTile label="Retention rate" value={retention.data.retentionRate === null ? 'no prior year' : `${retention.data.retentionRate}%`} />
        </div>
      )}
      {tab === 'average' && average.data && (
        <div className="ui-grid" style={{ ['--ui-min' as string]: '170px' }}>
          <StatTile label="Gifts" value={average.data.gifts} />
          <StatTile label="Identified donors" value={average.data.identifiedDonors} />
          <StatTile label="Total given" value={formatMoney(average.data.total)} />
          <StatTile label="Average gift" value={formatMoney(average.data.averageGift)} />
          <StatTile label="Average per donor" value={formatMoney(average.data.averagePerDonor)} />
        </div>
      )}
    </ReportFrame>
  );
}
