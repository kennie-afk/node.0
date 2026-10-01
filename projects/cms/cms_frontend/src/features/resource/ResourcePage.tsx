import { useCallback, useState } from 'react';
import { Button, Card, DataTable, InlineConfirm, PageHeader, Pagination, SearchInput, FilterBar, useQuery, useToast, type ComboOption } from '../../ui';
import { http, normalizeError, type ApiError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { ResourceForm, type FormValues } from './ResourceForm';
import type { FieldDef, PageOf, ResourceConfig } from './types';

const PAGE_SIZE = 25;

function defaultForm<T>(fields: FieldDef[], row?: T): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const raw = row ? (row as Record<string, unknown>)[f.name] : f.initial;
    if (f.type === 'checkbox') out[f.name] = raw === true;
    else if (f.type === 'lookup') out[f.name] = (raw as ComboOption<number> | null | undefined) ?? null;
    else if (f.type === 'datetime-local' && typeof raw === 'string') out[f.name] = raw.slice(0, 16);
    else if (f.type === 'date' && typeof raw === 'string') out[f.name] = raw.slice(0, 10);
    else out[f.name] = raw ?? '';
  }
  return out;
}

function defaultPayload(fields: FieldDef[], values: FormValues, mode: 'create' | 'edit'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (mode === 'edit' && f.createOnly) continue;
    const v = values[f.name];
    if (f.type === 'checkbox') out[f.name] = v === true;
    else if (f.type === 'lookup') out[f.name] = v ? (v as ComboOption<number>).value : null;
    else if (f.type === 'number') out[f.name] = v === '' || v === undefined ? null : Number(v);
    else {
      const text = typeof v === 'string' ? v.trim() : v;
      out[f.name] = text === '' ? (f.required ? text : null) : text;
    }
  }
  return out;
}

/**
 * A complete CRUD screen from a config: server-side search and paging, an inline form for create
 * and edit, confirmed delete, and the server's field errors shown on the field. Every list screen
 * that is not special uses this, so they all look and behave the same and none can silently show
 * only the first page.
 */
export default function ResourcePage<T extends { id: number }>({ config }: { config: ResourceConfig<T> }) {
  const { can } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ row: T | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const writable = can(config.writePermission);

  const list = useQuery(() => http.get<PageOf<T>>(config.endpoint, { page, pageSize: PAGE_SIZE, q: q || undefined }), [config.endpoint, page, q]);
  const onSearch = useCallback((text: string) => {
    setQ(text);
    setPage(1);
  }, []);

  const close = () => {
    setEditing(null);
    setError(null);
  };

  const save = async (values: FormValues) => {
    const row = editing?.row ?? null;
    const mode = row ? 'edit' : 'create';
    const body = config.toPayload ? config.toPayload(values, mode) : defaultPayload(config.fields, values, mode);
    setSubmitting(true);
    setError(null);
    try {
      if (row) await http.put(`${config.endpoint}/${row.id}`, body);
      else await http.post(config.endpoint, body);
      toast.success(`${config.noun.charAt(0).toUpperCase()}${config.noun.slice(1)} saved`);
      close();
      list.refetch();
    } catch (failure) {
      setError(normalizeError(failure));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: T) => {
    try {
      await http.delete(`${config.endpoint}/${row.id}`);
      toast.success(`${config.noun.charAt(0).toUpperCase()}${config.noun.slice(1)} deleted`);
      // Deleting the last row of a page would leave an empty page behind.
      if (list.data && list.data.data.length === 1 && page > 1) setPage(page - 1);
      else list.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  const data = list.data;
  const columns = [
    ...config.columns,
    ...(writable
      ? [{
          key: '_actions',
          header: <span className="ui-sr-only">Actions</span>,
          align: 'right' as const,
          render: (row: T) => (
            <span className="ui-row" style={{ justifyContent: 'flex-end' }}>
              {config.rowActions?.(row)}
              <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditing({ row }); }}>Edit</Button>
              {(config.canDelete?.(row) ?? true) && (
                <InlineConfirm label="Delete" question={`Delete this ${config.noun}?`} confirmLabel="Delete" onConfirm={() => remove(row)} />
              )}
            </span>
          )
        }]
      : [])
  ];

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={
          <div className="ui-row">
            {config.headerActions}
            {writable && <Button variant="primary" size="sm" onClick={() => { setError(null); setEditing({ row: null }); }}>{`New ${config.noun}`}</Button>}
          </div>
        }
      />

      {editing && (
        <Card title={editing.row ? `Edit ${config.noun}` : `New ${config.noun}`}>
          <ResourceForm
            key={editing.row?.id ?? 'new'}
            title={`${editing.row ? 'Edit' : 'New'} ${config.noun}`}
            fields={config.fields}
            initial={editing.row ? (config.toForm ? config.toForm(editing.row) : defaultForm(config.fields, editing.row)) : defaultForm(config.fields)}
            mode={editing.row ? 'edit' : 'create'}
            submitting={submitting}
            error={error}
            onSubmit={save}
            onCancel={close}
            extra={editing.row && config.editExtra ? config.editExtra(editing.row) : undefined}
          />
        </Card>
      )}

      <FilterBar>
        <SearchInput onSearch={onSearch} placeholder={config.searchPlaceholder ?? `Search ${config.plural}`} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        loading={list.loading && !data}
        error={list.error && !data ? list.error : null}
        onRetry={list.refetch}
        empty={<span>{q ? `No ${config.plural} match "${q}".` : `No ${config.plural} yet.${writable ? ` Use “New ${config.noun}” to add one.` : ''}`}</span>}
        footer={data && data.total > 0 ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun={config.plural} /> : undefined}
      />
    </div>
  );
}
