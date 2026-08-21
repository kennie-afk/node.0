import type { Family } from '../../api/familyApi';
import { Button } from '../common/Button';

interface Props {
  families: Family[];
  onDelete: (id: number) => void;
  onEdit: (family: Family) => void;
  onView: (family: Family) => void;
}

export const FamilyTable: React.FC<Props> = ({ families, onDelete, onEdit, onView }) => {
  if (families.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No families found.</p>;
  }

  const sortedFamilies = [...families].sort((a, b) => b.id - a.id);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: '700px' }} className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Family Name</th>
            <th>Address</th>
            <th>City</th>
            <th>Phone</th>
            <th style={{ width: '240px' }}>Actions</th>
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
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', alignItems: 'center' }}>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onView(family)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px',
                      minWidth: '50px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    View
                  </Button>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onEdit(family)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px',
                      minWidth: '50px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="danger" 
                    size="sm" 
                    onClick={() => onDelete(family.id)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px',
                      minWidth: '55px',
                      whiteSpace: 'nowrap'
                    }}
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