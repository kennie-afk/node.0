import { useParams, useSearchParams } from 'react-router-dom';
import { Card, DataTable, ErrorState, formatDate, formatDateTime, formatMoney, PageHeader, PageLoader, Select, useQuery } from '../../ui';
import { getStatement, type Statement } from '../../api/givingApi';
import { getChurchProfile } from '../../api/churchApi';
import { DownloadPdfButton, KeyValue, Money, PrintButton } from '../../features/finance/components/common';
import type { PdfDoc } from '../../features/finance/components/pdfDoc';
import { yearsBack } from '../../features/finance/components/helpers';

/** The statement as a PDF a member can keep for tax: the same figures as the screen, gift by gift. */
function statementDoc(s: Statement, church: string): PdfDoc {
  return {
    filename: `giving-statement-${s.year}-${s.member.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    org: church,
    title: 'Giving statement',
    subtitle: String(s.year),
    sections: [
      { heading: 'Member', rows: [['Name', s.member.name], ['Phone', s.member.phone ?? '-'], ['Email', s.member.email ?? '-']] },
      { heading: 'Summary', rows: [['Gifts', String(s.giftCount)], ['Tax-deductible', formatMoney(s.taxDeductibleTotal)]], total: ['Total given', formatMoney(s.total)] },
      { heading: 'By type', rows: s.byType.map((r) => [r.type, formatMoney(r.amount)] as [string, string]) },
      { heading: 'By fund', rows: s.byFund.map((r) => [r.fund, formatMoney(r.amount)] as [string, string]) },
      { heading: 'Every gift', rows: s.gifts.map((g) => [`${formatDate(g.date)}  ${g.receiptNo ?? ''}  ${g.type} (${g.fund})`, formatMoney(g.amount)] as [string, string]) },
      { note: `Amounts in ${s.currency}. Thank you for your faithful giving.` }
    ],
    footer: `Generated ${formatDateTime(s.generatedAt)}`
  };
}

/** The yearly giving statement a member can be handed or sent. Prints cleanly. */
export default function StatementPage() {
  const memberId = Number(useParams().memberId);
  const [params, setParams] = useSearchParams();
  const year = Number(params.get('year') ?? new Date().getUTCFullYear());
  const { data: s, error, refetch } = useQuery(() => getStatement(memberId, year), [memberId, year]);
  const church = useQuery(() => getChurchProfile(), []);
  if (error && !s) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!s) return <PageLoader />;
  return (
    <div className="ui-page ui-stack fin-doc">
      <PageHeader
        title={`Giving statement ${s.year}`}
        subtitle={s.member.name}
        crumbs={[{ label: 'Statements', to: '/giving/statements' }]}
        actions={
          <div className="ui-row no-print">
            <Select aria-label="Year" value={year} onChange={(e) => setParams({ year: e.target.value })}>{yearsBack().map((y) => <option key={y}>{y}</option>)}</Select>
            <PrintButton />
            <DownloadPdfButton build={() => statementDoc(s, church.data?.name ?? 'Church')} />
          </div>
        }
      />
      <Card>
        <KeyValue items={[['Member', s.member.name], ['Phone', s.member.phone ?? '-'], ['Email', s.member.email ?? '-'], ['Total given', <Money key="t" value={s.total} strong />], ['Tax-deductible', <Money key="d" value={s.taxDeductibleTotal} />], ['Gifts', s.giftCount]]} />
      </Card>
      <div className="ui-grid" style={{ ['--ui-min' as string]: '260px' }}>
        <Card title="By type" flush><DataTable rowKey={(r) => r.type} rows={s.byType} columns={[{ key: 'type', header: 'Type', render: (r) => r.type }, { key: 'amount', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} empty={<span>No gifts.</span>} /></Card>
        <Card title="By fund" flush><DataTable rowKey={(r) => r.fund} rows={s.byFund} columns={[{ key: 'fund', header: 'Fund', render: (r) => r.fund }, { key: 'amount', header: 'Amount', numeric: true, render: (r) => <Money value={r.amount} /> }]} empty={<span>No gifts.</span>} /></Card>
      </div>
      <Card title="Every gift" flush>
        <DataTable
          rowKey={(g) => g.id}
          rows={s.gifts}
          columns={[
            { key: 'date', header: 'Date', render: (g) => formatDate(g.date) },
            { key: 'receipt', header: 'Receipt', render: (g) => g.receiptNo ?? '-' },
            { key: 'type', header: 'Type', render: (g) => g.type },
            { key: 'fund', header: 'Fund', render: (g) => g.fund },
            { key: 'method', header: 'Method', render: (g) => g.method ?? '-' },
            { key: 'amount', header: 'Amount', numeric: true, render: (g) => <Money value={g.amount} /> }
          ]}
          empty={<span>No gifts recorded for {s.year}.</span>}
        />
      </Card>
      <p className="fin-muted">Generated {formatDateTime(s.generatedAt)}. Amounts in {s.currency}. Thank you for your faithful giving.</p>
    </div>
  );
}
