import { useEffect, useState } from 'react';
import { Combobox, Select, useQuery, type ComboOption } from '../../../ui';
import { loadEvents, loadMinistries, loadSmallGroups, memberName, searchMembers } from '../lookups';
import { formatDateTime } from '../../../ui';

/** Type-ahead member picker. `value` is the member id; the label is resolved once for display. */
export function MemberPicker({
  value,
  onChange,
  placeholder = 'Search members by name or phone',
  ...aria
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [selected, setSelected] = useState<ComboOption<number> | null>(null);

  useEffect(() => {
    let live = true;
    if (value === null) {
      // Clearing is driven by the parent; an empty id means nothing to resolve.
      queueMicrotask(() => live && setSelected(null));
      return () => {
        live = false;
      };
    }
    if (selected?.value === value) return;
    memberName(value)
      .then((label) => live && setSelected({ value, label }))
      .catch(() => live && setSelected({ value, label: `Member #${value}` }));
    return () => {
      live = false;
    };
  }, [value, selected?.value]);

  return (
    <Combobox<number>
      {...aria}
      placeholder={placeholder}
      search={searchMembers}
      value={value === null ? null : selected}
      onChange={(option) => {
        setSelected(option);
        onChange(option ? option.value : null);
      }}
    />
  );
}

interface SelectProps {
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  disabled?: boolean;
}

function NamedSelect({ rows, loading, value, onChange, placeholder, ...aria }: SelectProps & { rows: Array<{ id: number; label: string }>; loading: boolean }) {
  return (
    <Select {...aria} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}>
      <option value="">{loading ? 'Loading…' : placeholder ?? 'Choose…'}</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </Select>
  );
}

export function EventSelect(props: SelectProps) {
  const { data, loading } = useQuery(loadEvents, []);
  const rows = (data ?? []).map((e) => ({ id: e.id, label: `${e.name}${e.startTime ? ` - ${formatDateTime(e.startTime)}` : ''}` }));
  return <NamedSelect {...props} rows={rows} loading={loading} placeholder={props.placeholder ?? 'Choose an event'} />;
}

export function MinistrySelect(props: SelectProps) {
  const { data, loading } = useQuery(loadMinistries, []);
  return <NamedSelect {...props} rows={(data ?? []).map((m) => ({ id: m.id, label: m.name }))} loading={loading} placeholder={props.placeholder ?? 'Choose a ministry'} />;
}

export function SmallGroupSelect(props: SelectProps) {
  const { data, loading } = useQuery(loadSmallGroups, []);
  return <NamedSelect {...props} rows={(data ?? []).map((m) => ({ id: m.id, label: m.name }))} loading={loading} placeholder={props.placeholder ?? 'Choose a small group'} />;
}
