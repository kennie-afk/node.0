import type { ReactNode } from 'react';
import type { Column, ComboOption } from '../../ui';
import type { Permission } from '../../auth/permissions';

/** One server page, as the older list endpoints return it. */
export interface PageOf<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type FieldType = 'text' | 'email' | 'tel' | 'password' | 'number' | 'date' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'lookup' | 'checkbox';

/** A form field, described as data so every screen's form is built the same way. */
export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  hint?: string;
  maxLength?: number;
  /** For type "select": the choices. A leading blank choice is added unless the field is required. */
  options?: Array<{ value: string; label: string }>;
  /** For type "lookup": asks the server for matches; the whole table is never loaded. */
  search?: (query: string) => Promise<Array<ComboOption<number>>>;
  /** Initial value for a new record. */
  initial?: unknown;
  /** Hide the field when editing (e.g. a password that is set once). */
  createOnly?: boolean;
}

/** Everything a CRUD screen needs: the rest (paging, search, form, delete, errors) is shared. */
export interface ResourceConfig<T extends { id: number }> {
  /** Singular and plural nouns, e.g. "family" / "families". */
  noun: string;
  plural: string;
  title: string;
  subtitle?: string;
  /** Path under the API, e.g. "/families". */
  endpoint: string;
  columns: Array<Column<T>>;
  fields: FieldDef[];
  /** The permission that allows creating, editing and deleting. */
  writePermission: Permission;
  searchPlaceholder?: string;
  /** Turn a row into the form's starting values (lookup fields as {value,label}). Defaults to the row's own fields. */
  toForm?: (row: T) => Record<string, unknown>;
  /** Turn form values into the request body. The default trims text and sends blank optional fields as null. */
  toPayload?: (values: Record<string, unknown>, mode: 'create' | 'edit') => Record<string, unknown>;
  /** Extra buttons on each row, after Edit and Delete. */
  rowActions?: (row: T) => ReactNode;
  /** Extra content shown inside the edit form (e.g. a membership panel). */
  editExtra?: (row: T) => ReactNode;
  /** Extra header actions next to "New …". */
  headerActions?: ReactNode;
  /** Whether a row can be deleted (default true). */
  canDelete?: (row: T) => boolean;
}
