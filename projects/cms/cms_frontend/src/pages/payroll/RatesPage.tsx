import { Card, DataTable, ErrorState, PageHeader, PageLoader, StatusPill, useQuery } from '../../ui';
import { getRates, type RateSet, type RateSource } from '../../api/payrollApi';
import { KeyValue, Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

function Sources({ set }: { set: RateSet }) {
  return (
    <DataTable<RateSource>
      rowKey={(s) => s.url + s.what}
      rows={set.sources}
      columns={[
        { key: 'v', header: 'Source type', render: (s) => <StatusPill status={s.verified === 'official' ? 'Official source' : 'Secondary source'} tone={s.verified === 'official' ? 'ok' : 'warn'} /> },
        { key: 'what', header: 'Covers', render: (s) => s.what },
        { key: 'url', header: 'Link', render: (s) => <a href={s.url} target="_blank" rel="noreferrer noopener">{new URL(s.url).hostname}</a> },
        { key: 'r', header: 'Retrieved', render: (s) => s.retrieved }
      ]}
    />
  );
}

/** The rates payroll uses, with the honest status of each: what was read from an official page and what was not. */
export default function RatesPage() {
  const { data, error, refetch } = useQuery(() => getRates(), []);
  if (error && !data) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!data) return <PageLoader />;
  const c = data.current;
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Statutory rates" subtitle={`In force: version ${c.version}, from ${c.effectiveFrom}`} />
      <SectionTabs section="payroll" active="/payroll/rates" />
      <div className="fin-warn" role="note"><strong>Check before the first real payroll.</strong> {data.note}</div>
      <Card title="PAYE" actions={<StatusPill status="Official source" tone="ok" />}>
        <DataTable
          rowKey={(b) => b.rate + (b.upTo ?? 'top')}
          rows={c.payeBands}
          columns={[{ key: 'up', header: 'Monthly taxable pay up to', numeric: true, render: (b) => (b.upTo ? <Money value={b.upTo} /> : 'above') }, { key: 'r', header: 'Rate', numeric: true, render: (b) => b.rate }]}
        />
        <KeyValue items={[['Personal relief / month', <Money key="p" value={c.personalRelief} />], ['Insurance relief', c.insuranceRelief]]} />
      </Card>
      <Card title="NSSF, SHIF and housing levy" actions={<StatusPill status="Provisional: secondary sources" tone="warn" />}>
        <KeyValue items={[['NSSF rate', c.nssf.rate], ['NSSF lower limit', <Money key="l" value={c.nssf.lowerLimit} />], ['NSSF upper limit', <Money key="u" value={c.nssf.upperLimit} />], ['SHIF rate', c.shif.rate], ['SHIF minimum', <Money key="m" value={c.shif.minimum} />], ['Housing levy (employee)', c.housingLevy.employee], ['Housing levy (employer)', c.housingLevy.employer]]} />
      </Card>
      <Card title="Where each figure came from" flush><Sources set={c} /></Card>
      {data.history.length > 1 && <Card title="Earlier rate versions">{data.history.filter((h) => h.version !== c.version).map((h) => <p key={h.version}>Version {h.version} (from {h.effectiveFrom}): NSSF limits {h.nssf.lowerLimit} to {h.nssf.upperLimit}</p>)}</Card>}
    </div>
  );
}
