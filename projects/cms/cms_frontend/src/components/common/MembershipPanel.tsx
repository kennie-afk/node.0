import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Combobox, InlineConfirm, Input, type ComboOption } from '../../ui';
import { searchMembers } from '../../api/memberLookup';
import { describeError } from '../../api/errors';

export interface RosterEntry {
  id: number;
  firstName: string;
  lastName: string;
  role?: string | null;
}

interface MembershipPanelProps {
  title: string;
  loadRoster: () => Promise<RosterEntry[]>;
  addMember: (memberId: number, role?: string) => Promise<unknown>;
  removeMember: (memberId: number) => Promise<void>;
}

/** A roster with an add row. The member picker searches on the server, so a large church never loads its whole directory. */
export default function MembershipPanel({ title, loadRoster, addMember, removeMember }: MembershipPanelProps) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [picked, setPicked] = useState<ComboOption<number> | null>(null);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The page rebuilds these callbacks on every render; keeping the latest in a ref stops that re-fetching the roster.
  const loader = useRef(loadRoster);
  loader.current = loadRoster;

  const refresh = useCallback(async () => {
    try {
      setError('');
      setRoster(await loader.current());
    } catch (err) {
      setError(describeError(err, 'Failed to load the roster'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      await addMember(picked.value, role.trim() || undefined);
      setPicked(null);
      setRole('');
      await refresh();
    } catch (err) {
      setError(describeError(err, 'Failed to add that member'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (memberId: number) => {
    try {
      await removeMember(memberId);
      await refresh();
    } catch (err) {
      setError(describeError(err, 'Failed to remove that member'));
    }
  };

  return (
    <section className="ui-stack" aria-label={title}>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <h4 className="ui-card-title">{title}</h4>
        <span className="ui-card-sub">{loading ? 'Loading' : `${roster.length} member${roster.length === 1 ? '' : 's'}`}</span>
      </div>

      {error && <div className="ui-error-text" role="alert">{error}</div>}

      <div className="ui-row">
        <div style={{ flex: 2, minWidth: 180 }}>
          <Combobox search={searchMembers} value={picked} onChange={setPicked} placeholder="Search members to add" disabled={busy} />
        </div>
        <Input aria-label="Role (optional)" placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy} maxLength={100} style={{ flex: 1, minWidth: 120 }} />
        <Button variant="primary" size="sm" onClick={handleAdd} disabled={!picked} loading={busy}>Add</Button>
      </div>

      {!loading && roster.length === 0 && <p className="ui-card-sub">Nobody has been added yet. Search for a member above to build the roster.</p>}

      {roster.length > 0 && (
        <table className="ui-table">
          <tbody>
            {roster.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.firstName} {entry.lastName}</td>
                <td>{entry.role || '-'}</td>
                <td style={{ textAlign: 'right' }}>
                  <InlineConfirm label="Remove" question="Remove this member?" confirmLabel="Remove" onConfirm={() => handleRemove(entry.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
