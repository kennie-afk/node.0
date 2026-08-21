import type { Ministry } from '../../api/ministryApi';
import { Button } from '../common/Button';

interface Props {
  ministries: Ministry[];
  onDelete: (id: number) => void;
  onEdit: (ministry: Ministry) => void;
  onView: (ministry: Ministry) => void;
}

export function MinistryTable({ ministries, onDelete, onEdit, onView }: Props) {
  if (ministries.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No ministries found</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ minWidth: '900px' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Leader</th>
            <th style={{ width: '240px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {ministries.map(ministry => (
            <tr key={ministry.id}>
              <td><strong>{ministry.name}</strong></td>
              <td>{ministry.description || '-'}</td>
              <td>
                {ministry.leader 
                  ? `${ministry.leader.firstName} ${ministry.leader.lastName}` 
                  : 'No Leader'}
              </td>
              <td>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="primary" size="sm" onClick={() => onView(ministry)}>
                    View
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => onEdit(ministry)}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onDelete(ministry.id)}>
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