import { useEffect, useMemo, useState } from 'react';
import { fetchMembers, type Member } from '../../api/memberApi';
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

const label = { padding: '12px 0', fontWeight: 600, color: 'var(--c-muted)' } as const;

export default function MembershipPanel({
  title,
  loadRoster,
  addMember,
  removeMember
}: MembershipPanelProps) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [directory, setDirectory] = useState<Member[]>([]);
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      setLoading(true);
      setError('');
      const [current, all] = await Promise.all([loadRoster(), fetchMembers()]);
      setRoster(current);
      setDirectory(all);
    } catch (err) {
      setError(describeError(err, 'Failed to load members'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const available = useMemo(() => {
    const enrolled = new Set(roster.map((entry) => entry.id));
    return directory.filter((member) => !enrolled.has(member.id));
  }, [roster, directory]);

  const handleAdd = async () => {
    if (!selected) {
      setError('Choose a member to add.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await addMember(Number(selected), role.trim() || undefined);
      setSelected('');
      setRole('');
      await refresh();
    } catch (err) {
      setError(describeError(err, 'Failed to add that member'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (memberId: number) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      setBusy(true);
      setError('');
      await removeMember(memberId);
      await refresh();
    } catch (err) {
      setError(describeError(err, 'Failed to remove that member'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid var(--c-border)', paddingTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-text)', margin: 0 }}>{title}</h4>
        <span style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>
          {loading ? 'Loading' : `${roster.length} member${roster.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <div
          style={{
            color: 'var(--c-bad)',
            background: 'var(--c-bad-bg)',
            borderRadius: '6px',
            padding: '10px',
            fontSize: '11.5px',
            marginTop: '12px'
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={busy || available.length === 0}
          style={{
            flex: 2,
            minWidth: '160px',
            padding: '10px 12px',
            backgroundColor: 'var(--c-fill)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: '6px',
            color: 'var(--c-text)',
            fontSize: '11.5px'
          }}
        >
          <option value="">
            {available.length === 0 ? 'Every member is already here' : 'Choose a member'}
          </option>
          {available.map((member) => (
            <option key={member.id} value={member.id}>
              {member.firstName} {member.lastName}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Role (optional)"
          disabled={busy}
          style={{
            flex: 1,
            minWidth: '120px',
            padding: '10px 12px',
            backgroundColor: 'var(--c-fill)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: '6px',
            color: 'var(--c-text)',
            fontSize: '11.5px'
          }}
        />

        <button
          onClick={handleAdd}
          disabled={busy || !selected}
          style={{
            padding: '10px 18px',
            background: busy || !selected ? 'var(--c-fill-strong)' : 'var(--c-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '11.5px',
            cursor: busy || !selected ? 'not-allowed' : 'pointer'
          }}
        >
          Add
        </button>
      </div>

      {!loading && roster.length === 0 && (
        <p style={{ color: 'var(--c-muted)', fontSize: '11.5px', marginTop: '16px' }}>
          Nobody has been added yet. Choose a member above to build the roster.
        </p>
      )}

      {roster.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
          <tbody>
            {roster.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ ...label, color: 'var(--c-text)', fontWeight: 500 }}>
                  {entry.firstName} {entry.lastName}
                </td>
                <td style={{ ...label, fontSize: '11.5px' }}>{entry.role || '-'}</td>
                <td style={{ padding: '12px 0', textAlign: 'right' }}>
                  <button
                    onClick={() => handleRemove(entry.id)}
                    disabled={busy}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--c-bad)',
                      color: 'var(--c-bad)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      fontSize: '10.5px'
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
