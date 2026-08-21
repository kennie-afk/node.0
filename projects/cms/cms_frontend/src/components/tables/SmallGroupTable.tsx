import type { SmallGroup } from '../../api/smallGroupApi';
import { Button } from '../common/Button';

interface Props {
  smallGroups: SmallGroup[];
  onDelete: (id: number) => void;
  onEdit: (smallGroup: SmallGroup) => void;
  onView: (smallGroup: SmallGroup) => void;
}

export function SmallGroupTable({ smallGroups, onDelete, onEdit, onView }: Props) {
  if (smallGroups.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No small groups found</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ minWidth: '1100px' }}>
        <thead>
          <tr>
            <th>Group Name</th>
            <th>Ministry</th>
            <th>Leader</th>
            <th>Meeting Day</th>
            <th>Meeting Time</th>
            <th>Location</th>
            <th>Status</th>
            <th style={{ width: '260px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {smallGroups.map(group => (
            <tr key={group.id}>
              <td><strong>{group.name}</strong></td>
              <td>{group.parentMinistry?.name || group.ministry?.name || 'N/A'}</td>
              <td>
                {group.leader 
                  ? `${group.leader.firstName} ${group.leader.lastName}` 
                  : 'No Leader'}
              </td>
              <td>{group.meetingDay || '-'}</td>
              <td>{group.meetingTime || '-'}</td>
              <td>{group.meetingLocation || '-'}</td>
              <td>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  backgroundColor: group.isActive ? '#166534' : '#450a0a',
                  color: group.isActive ? '#86efac' : '#f87171'
                }}>
                  {group.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="primary" size="sm" onClick={() => onView(group)}>
                    View
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => onEdit(group)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onDelete(group.id)}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}