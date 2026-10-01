import { useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Field, InlineConfirm, Input, PageHeader, PageLoader, Textarea, useQuery, useToast } from '../../ui';
import { createRole, deleteRole, listPermissions, listRoles, updateRole, type ChurchRole, type PermissionInfo } from '../../api/rolesApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { FormError } from '../../features/finance/components/common';
import { useSubmit } from '../../features/finance/components/useSubmit';

const ADMIN_KEY = 'ADMIN';
const slug = (label: string) => label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^[^A-Z]+/, '').replace(/_+$/, '').slice(0, 20);

interface Draft {
  key: string;
  label: string;
  description: string;
  permissions: Set<string>;
  isNew: boolean;
  isSystem: boolean;
}

const blank = (): Draft => ({ key: '', label: '', description: '', permissions: new Set(), isNew: true, isSystem: false });
const fromRole = (r: ChurchRole): Draft => ({ key: r.key, label: r.label, description: r.description ?? '', permissions: new Set(r.permissions), isNew: false, isSystem: r.isSystem });

export default function RolesPage() {
  const toast = useToast();
  const { can } = useAuth();
  const roles = useQuery(() => listRoles(), []);
  const catalogue = useQuery(() => listPermissions(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const submit = useSubmit();

  const groups = useMemo(() => {
    const out = new Map<string, PermissionInfo[]>();
    for (const p of catalogue.data ?? []) out.set(p.group, [...(out.get(p.group) ?? []), p]);
    return [...out.entries()];
  }, [catalogue.data]);

  if (roles.error && !roles.data) return <div className="ui-page"><ErrorState message={roles.error.message} onRetry={roles.refetch} requestId={roles.error.requestId} /></div>;
  if (!roles.data || !catalogue.data) return <PageLoader />;

  const locked = draft?.key === ADMIN_KEY;
  const toggle = (permission: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return { ...d, permissions: next };
    });

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const body = { label: draft.label.trim(), description: draft.description.trim() || null, permissions: [...draft.permissions] };
    const saved = await submit.run(
      () => (draft.isNew ? createRole(draft.key, body) : updateRole(draft.key, locked ? { label: body.label, description: body.description } : body)),
      draft.isNew ? 'Role created' : 'Role saved'
    );
    if (saved) {
      setDraft(null);
      roles.refetch();
    }
  };

  const onDelete = async (role: ChurchRole) => {
    try {
      await deleteRole(role.key);
      toast.success(`${role.label} deleted`);
      if (draft?.key === role.key) setDraft(null);
      roles.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title="Roles"
        subtitle="Decide what each role may do in your church. Changes apply to everyone holding the role within seconds."
        actions={<Button variant="primary" size="sm" onClick={() => { submit.clearError(); setDraft(blank()); }}>New role</Button>}
      />

      <div className="roles-layout">
        <Card title="Roles in this church" flush>
          {roles.data.length === 0 ? (
            <EmptyState title="No roles yet" message="Create the first role." />
          ) : (
            <ul className="roles-list">
              {roles.data.map((r) => (
                <li key={r.key} className={draft?.key === r.key ? 'is-active' : undefined}>
                  <button type="button" className="roles-pick" onClick={() => { submit.clearError(); setDraft(fromRole(r)); }}>
                    <span className="roles-name">{r.label}</span>
                    <span className="roles-meta">{r.key === ADMIN_KEY ? 'Everything' : `${r.permissions.length} permissions`} · {r.userCount ?? 0} {r.userCount === 1 ? 'user' : 'users'}</span>
                  </button>
                  {r.isSystem && <Badge>Built in</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {draft ? (
          <Card title={draft.isNew ? 'New role' : draft.label || draft.key}>
            <form className="ui-form" onSubmit={onSave}>
              <div className="ui-form-grid">
                <Field label="Name" required>
                  {(c) => (
                    <Input
                      {...c}
                      value={draft.label}
                      maxLength={60}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value, key: draft.isNew ? slug(e.target.value) : draft.key })}
                    />
                  )}
                </Field>
                <Field label="Key" hint={draft.isNew ? 'Set from the name; capital letters, digits and underscores. Cannot change later.' : 'Fixed once created.'}>
                  {(c) => <Input {...c} value={draft.key} disabled={!draft.isNew} maxLength={20} onChange={(e) => setDraft({ ...draft, key: e.target.value.toUpperCase() })} />}
                </Field>
                <Field label="Description">
                  {(c) => <Textarea {...c} rows={2} value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
                </Field>
              </div>

              {locked && <p className="ui-hint">The Administrator role always holds every permission, so you can never lock yourself out.</p>}

              <div className="roles-perms">
                {groups.map(([group, items]) => (
                  <fieldset key={group} disabled={locked}>
                    <legend>{group}</legend>
                    {items.map((p) => {
                      // You may only add what you hold yourself; the server enforces the same rule.
                      const held = draft.permissions.has(p.permission);
                      const grantable = locked || held || can(p.permission as never);
                      return (
                        <label key={p.permission} className={grantable ? undefined : 'is-muted'} title={grantable ? undefined : 'You cannot grant a permission you do not hold'}>
                          <input type="checkbox" checked={locked || held} disabled={!grantable} onChange={() => toggle(p.permission)} />
                          <span>
                            <strong>{p.permission}</strong>
                            <em>{p.description}</em>
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
              </div>

              <FormError error={submit.error} />
              <div className="ui-form-actions">
                <Button type="submit" variant="primary" loading={submit.loading} disabled={draft.label.trim().length < 2 || draft.key.length < 2}>Save</Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                {!draft.isNew && draft.key !== ADMIN_KEY && draft.key !== 'MEMBER' && (
                  <InlineConfirm
                    label="Delete role"
                    question={`Delete ${draft.label}? People must be moved off it first.`}
                    confirmLabel="Delete"
                    onConfirm={() => onDelete(roles.data!.find((r) => r.key === draft.key)!)}
                  />
                )}
              </div>
            </form>
          </Card>
        ) : (
          <Card>
            <EmptyState title="Pick a role" message="Choose a role on the left to see or change what it can do, or create a new one." />
          </Card>
        )}
      </div>
    </div>
  );
}
