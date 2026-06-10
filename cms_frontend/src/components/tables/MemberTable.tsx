import type { Member } from '../../api/memberApi';
import { Button } from '../common/Button';
import { PlusCircle } from 'lucide-react';

interface Props {
  members: Member[];
  onDelete: (id: number) => void;
  onEdit: (member: Member) => void;
  onViewContributions: (memberId: number, memberName: string) => void;
  onAddContribution?: (memberId: number, memberName: string) => void;
}

export const MemberTable: React.FC<Props> = ({
  members,
  onDelete,
  onEdit,
  onViewContributions,
  onAddContribution
}) => {
  if (members.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No members found.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table 
        className="table" 
        style={{ 
          tableLayout: 'fixed', 
          width: '100%', 
          minWidth: '980px',
          borderCollapse: 'collapse'
        }}
      >
        <thead>
          <tr>
            <th style={{ width: '55px' }}>ID</th>
            <th style={{ width: '190px' }}>Full Name</th>
            <th style={{ width: '160px' }}>Email</th>
            <th style={{ width: '120px' }}>Phone</th>
            <th style={{ width: '150px' }}>Family</th>
            <th style={{ width: '280px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map(member => (
            <tr key={member.id}>
              <td>{member.id}</td>
              <td><strong>{member.firstName} {member.lastName}</strong></td>
              <td style={{ 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>
                {member.email || '-'}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{member.phoneNumber || '-'}</td>
              <td style={{ 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>
                {member.family?.familyName || 'No Family'}
              </td>
              <td>
                <div style={{ 
                  display: 'flex', 
                  gap: '5px', 
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onEdit(member)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px',
                      minWidth: '62px'
                    }}
                  >
                    Edit
                  </Button>

                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onViewContributions(member.id, `${member.firstName} ${member.lastName}`)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px',
                      minWidth: '92px'
                    }}
                  >
                    Contributions
                  </Button>

                  {onAddContribution && (
                    <button
                      onClick={() => onAddContribution(member.id, `${member.firstName} ${member.lastName}`)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#4ade80',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        minWidth: '112px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.1)';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#4ade80';
                      }}
                    >
                      <PlusCircle size={12} />
                      Add Contribution
                    </button>
                  )}

                  <Button 
                    variant="danger" 
                    size="sm" 
                    onClick={() => onDelete(member.id)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px',
                      minWidth: '62px'
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