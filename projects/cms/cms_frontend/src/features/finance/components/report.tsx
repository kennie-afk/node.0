import type { ReactNode } from 'react';
import { Card, DateInput, ErrorState, Field, FilterBar, PageHeader, PageLoader } from '../../../ui';
import type { ApiError } from '../../../api/http';
import { FundSelect } from './Selectors';
import { CsvButton, PrintButton } from './common';
import type { RangeParams } from './useRangeParams';

export function RangeFilters({ range, fund = true, mode = 'range' }: { range: RangeParams; fund?: boolean; mode?: 'range' | 'asOf' }) {
  return (
    <FilterBar>
      {mode === 'range' ? (
        <>
          <Field label="From">{(c) => <DateInput {...c} value={range.from} onChange={(v) => range.set({ from: v })} />}</Field>
          <Field label="To">{(c) => <DateInput {...c} value={range.to} onChange={(v) => range.set({ to: v })} />}</Field>
        </>
      ) : (
        <Field label="As of">{(c) => <DateInput {...c} value={range.asOf} onChange={(v) => range.set({ asOf: v })} />}</Field>
      )}
      {fund && (
        <Field label="Fund">
          {(c) => <FundSelect {...c} allowEmpty emptyLabel="All funds" value={range.fundId ? Number(range.fundId) : ''} onChange={(v) => range.set({ fundId: v ? String(v) : undefined })} />}
        </Field>
      )}
    </FilterBar>
  );
}

/** Title, filters, print/CSV actions and loading/error handling shared by every report. */
export function ReportFrame({
  title,
  subtitle,
  filters,
  loading,
  error,
  onRetry,
  csv,
  children,
  crumbs
}: {
  title: string;
  subtitle?: string;
  filters?: ReactNode;
  loading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
  csv?: { path: string; query?: Record<string, string | number | boolean | undefined>; name?: string };
  children: ReactNode;
  crumbs?: Array<{ label: string; to?: string }>;
}) {
  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={title}
        subtitle={subtitle}
        crumbs={crumbs ?? [{ label: 'Reports', to: '/reports' }]}
        actions={
          <div className="ui-row no-print">
            {csv && <CsvButton path={csv.path} query={csv.query} name={csv.name} />}
            <PrintButton />
          </div>
        }
      />
      <div className="no-print">{filters}</div>
      {loading && <PageLoader />}
      {children}
      {error && <ErrorState message={error.message} onRetry={onRetry} requestId={error.requestId} />}
    </div>
  );
}

export function ReportCard({ title, children, flush }: { title?: string; children: ReactNode; flush?: boolean }) {
  return (
    <Card title={title} flush={flush}>
      {children}
    </Card>
  );
}
