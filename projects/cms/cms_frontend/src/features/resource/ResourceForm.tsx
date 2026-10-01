import { useState, type FormEvent } from 'react';
import { Button, Combobox, Field, Input, Select, Textarea, type ComboOption } from '../../ui';
import { FormError } from '../finance/components/common';
import type { ApiError } from '../../api/http';
import type { FieldDef } from './types';

export type FormValues = Record<string, unknown>;

interface Props {
  title: string;
  fields: FieldDef[];
  initial: FormValues;
  mode: 'create' | 'edit';
  submitting: boolean;
  error: ApiError | null;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  extra?: React.ReactNode;
}

const asText = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** Builds one form from field definitions, wiring labels, errors from the server, and required checks. */
export function ResourceForm({ title, fields, initial, mode, submitting, error, onSubmit, onCancel, extra }: Props) {
  const [values, setValues] = useState<FormValues>(initial);
  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));
  const visible = fields.filter((f) => !(mode === 'edit' && f.createOnly));
  const missing = visible.some((f) => f.required && f.type !== 'checkbox' && (values[f.name] === undefined || values[f.name] === null || String(typeof values[f.name] === 'object' ? (values[f.name] as ComboOption).value : values[f.name]).trim() === ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!missing) onSubmit(values);
  };

  return (
    <form className="ui-form resource-form" onSubmit={submit} aria-label={title}>
      <div className="ui-form-grid">
        {visible.map((f) => {
          const message = error?.fieldMessage(f.name);
          const type = f.type ?? 'text';
          return (
            <Field key={f.name} label={f.label} required={f.required} hint={f.hint} error={message} className={type === 'textarea' ? 'is-wide' : undefined}>
              {(c) => {
                if (type === 'textarea') return <Textarea {...c} rows={3} maxLength={f.maxLength} value={asText(values[f.name])} onChange={(e) => set(f.name, e.target.value)} />;
                if (type === 'select')
                  return (
                    <Select {...c} value={asText(values[f.name])} onChange={(e) => set(f.name, e.target.value)}>
                      {!f.required && <option value="">None</option>}
                      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  );
                if (type === 'lookup')
                  return <Combobox {...c} search={f.search!} value={(values[f.name] as ComboOption<number> | null) ?? null} onChange={(o) => set(f.name, o)} placeholder={`Search ${f.label.toLowerCase()}`} />;
                if (type === 'checkbox')
                  return (
                    <label className="ui-row">
                      <input type="checkbox" checked={values[f.name] === true} onChange={(e) => set(f.name, e.target.checked)} /> {f.hint ?? f.label}
                    </label>
                  );
                return <Input {...c} type={type} maxLength={f.maxLength} value={asText(values[f.name])} onChange={(e) => set(f.name, e.target.value)} autoComplete="off" />;
              }}
            </Field>
          );
        })}
      </div>
      {extra}
      <FormError error={error} />
      <div className="ui-form-actions">
        <Button type="submit" variant="primary" loading={submitting} disabled={missing}>Save</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
