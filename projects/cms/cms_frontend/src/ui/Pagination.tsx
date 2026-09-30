import { formatCount } from './format';
import { Button } from './Button';

interface OffsetProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  noun?: string;
}

/** Offset paging for lists with a known total. Says what is shown out of what exists. */
export function Pagination({ page, totalPages, total, pageSize, onPage, noun = 'records' }: OffsetProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className="ui-table-foot" aria-label="Pagination">
      <span>
        {formatCount(from)}-{formatCount(to)} of {formatCount(total)} {noun}
      </span>
      <span className="ui-pager">
        <Button size="sm" variant="ghost" disabled={page <= 1} aria-disabled={page <= 1} aria-label="Previous page" onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="ui-pager-info ui-num" aria-current="page">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= totalPages} aria-disabled={page >= totalPages} aria-label="Next page" onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </span>
    </nav>
  );
}

interface KeysetProps {
  shown: number;
  hasMore: boolean;
  loading?: boolean;
  onMore: () => void;
  noun?: string;
}

/** Keyset paging: "Load more" costs the same on page 1 and page 10,000, and never skips a row. */
export function LoadMore({ shown, hasMore, loading, onMore, noun = 'records' }: KeysetProps) {
  return (
    <div className="ui-table-foot" role="navigation" aria-label="Pagination">
      <span>
        {formatCount(shown)} {noun} shown{hasMore ? '' : ' (all)'}
      </span>
      {hasMore && (
        <Button size="sm" loading={loading} onClick={onMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
