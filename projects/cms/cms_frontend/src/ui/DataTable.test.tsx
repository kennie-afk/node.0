import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from './DataTable';
import { ApiError } from '../api/http';
import { LoadMore } from './Pagination';

interface Row {
  id: number;
  name: string;
}
const columns: Array<Column<Row>> = [{ key: 'name', header: 'Name' }];
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DataTable states', () => {
  it('shows a skeleton while loading with no rows', () => {
    wrap(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error with a retry and the request reference', async () => {
    const onRetry = vi.fn();
    wrap(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} error={new ApiError('Nope', 500, [], 'req-9')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nope');
    expect(screen.getByText(/req-9/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the supplied empty signpost, or a default one', () => {
    const { unmount } = wrap(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={<p>Record the first gift</p>} />);
    expect(screen.getByText('Record the first gift')).toBeInTheDocument();
    unmount();
    wrap(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders rows, keeps them visible and marked busy during a refetch, and links the first cell', () => {
    wrap(<DataTable columns={columns} rows={[{ id: 1, name: 'Amina' }]} rowKey={(r) => r.id} loading rowHref={(r) => `/m/${r.id}`} />);
    expect(screen.getByRole('link', { name: 'Amina' })).toHaveAttribute('href', '/m/1');
    expect(screen.getByRole('table').closest('[aria-busy="true"]')).not.toBeNull();
  });
});

describe('LoadMore', () => {
  it('offers more only while a cursor remains', async () => {
    const onMore = vi.fn();
    const { rerender } = render(<LoadMore shown={50} hasMore onMore={onMore} />);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onMore).toHaveBeenCalled();
    rerender(<LoadMore shown={73} hasMore={false} onMore={onMore} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.getByText(/73 records shown \(all\)/)).toBeInTheDocument();
  });
});
