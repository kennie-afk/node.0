import type { KeyboardEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/http';
import { cx } from './classes';
import { EmptyState, ErrorState } from './ErrorState';
import { SkeletonRows } from './Skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell content. Defaults to `row[key]`. */
  render?: (row: T, index: number) => ReactNode;
  /** Right-align and use tabular digits; use for every amount and count. */
  numeric?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  /** Text for assistive tech when the header is an icon. */
  label?: string;
}

interface Props<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | ApiError | null;
  onRetry?: () => void;
  /** Shown when there are no rows. A signpost with the way forward, not a blank table. */
  empty?: ReactNode;
  /** Makes each row navigate; the first cell also becomes a real link for keyboard and screen readers. */
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  /** Pagination or "load more" controls rendered under the table. */
  footer?: ReactNode;
  /** Totals row, rendered in <tfoot>. */
  totals?: ReactNode;
  caption?: string;
  sticky?: boolean;
  maxHeight?: number | string;
}

/**
 * The shared dense table. States are handled here so pages cannot forget one: skeleton while
 * loading, an error signpost with retry, an empty signpost, and stale rows kept visible (and
 * marked busy) during a refetch.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  rowHref,
  onRowClick,
  footer,
  totals,
  caption,
  sticky = true,
  maxHeight
}: Props<T>) {
  const navigate = useNavigate();

  if (error && rows.length === 0) {
    const requestId = error instanceof ApiError ? error.requestId : undefined;
    return <ErrorState message={typeof error === 'string' ? error : error.message} onRetry={onRetry} requestId={requestId} />;
  }
  if (loading && rows.length === 0) {
    return <SkeletonRows rows={6} columns={Math.min(columns.length, 6)} />;
  }
  if (!loading && rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet" message="No records match." />}</>;
  }

  const clickable = Boolean(rowHref || onRowClick);
  const open = (row: T) => {
    const href = rowHref?.(row);
    if (href) navigate(href);
    else onRowClick?.(row);
  };
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) open(row);
  };

  return (
    <div aria-busy={loading || undefined}>
      <div className="ui-table-wrap" style={maxHeight ? ({ '--ui-table-max': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } as React.CSSProperties) : undefined}>
        <table className={cx('ui-table', sticky && 'is-sticky')}>
          {caption && <caption className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(column.numeric && 'is-num', column.align === 'center' && 'is-center')}
                  style={{ width: column.width, textAlign: column.align === 'right' ? 'right' : undefined }}
                  aria-label={column.label}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={columns.length} style={{ color: 'var(--ui-bad)' }}>
                  {typeof error === 'string' ? error : error.message} {onRetry && <button type="button" className="ui-btn is-ghost is-sm" onClick={onRetry}>Retry</button>}
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cx(clickable && 'is-clickable')}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => open(row) : undefined}
                  onKeyDown={clickable ? (event) => onKey(event, row) : undefined}
                >
                  {columns.map((column, columnIndex) => {
                    const content = column.render ? column.render(row, index) : ((row as Record<string, unknown>)[column.key] as ReactNode);
                    return (
                      <td
                        key={column.key}
                        className={cx(column.numeric && 'is-num', column.align === 'center' && 'is-center')}
                        style={column.align === 'right' ? { textAlign: 'right' } : undefined}
                      >
                        {columnIndex === 0 && href ? (
                          <Link to={href} className="ui-row-link" onClick={(event) => event.stopPropagation()}>
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {totals && <tfoot>{totals}</tfoot>}
        </table>
      </div>
      {footer}
    </div>
  );
}
