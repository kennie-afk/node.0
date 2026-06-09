import type { Family } from '../../api/familyApi';
import { Button } from '../common/Button';

interface Props {
  families: Family[];
  onDelete: (id: number) => void;
  onEdit: (family: Family) => void;
}

export const FamilyTable: React.FC<Props> = ({ families, onDelete, onEdit }) => {
  if (families.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No families found.</p>;
  }

  const sortedFamilies = [...families].sort((a, b) => b.id - a.id);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: '600px' }} className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Family Name</th>
            <th>Address</th>
            <th>City</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedFamilies.map(family => (
            <tr key={family.id}>
              <td>{family.id}</td>
              <td><strong>{family.familyName}</strong></td>
              <td>{family.address || '-'}</td>
              <td>{family.city || '-'}</td>
              <td>{family.phoneNumber || '-'}</td>
              <td>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onEdit(family)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="danger" 
                    size="sm" 
                    onClick={() => onDelete(family.id)}
                  >
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
};