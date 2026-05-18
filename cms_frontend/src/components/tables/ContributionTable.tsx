import type { Contribution } from '../../api/contributionApi';
import { Button } from '../common/Button';

interface Props {
  contributions: Contribution[];
  onDelete: (id: number) => void;
  onEdit: (contribution: Contribution) => void;
}

export function ContributionTable({ contributions, onDelete, onEdit }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Date</th>
            <th>Type</th>
            <th>Amount (KES)</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {contributions.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
                No contributions found
              </td>
            </tr>
          ) : (
            contributions.map((contrib) => (
              <tr key={contrib.id}>
                <td>
                  <strong>
                    {contrib.member 
                      ? `${contrib.member.firstName} ${contrib.member.lastName}` 
                      : `Member #${contrib.memberId}`}
                  </strong>
                </td>
                <td>{new Date(contrib.date || '').toLocaleDateString()}</td>
                <td>{contrib.contributionType || 'General'}</td>
                <td style={{ fontWeight: '600', color: '#4ade80' }}>
                  {Number(contrib.amount).toLocaleString()}
                </td>
                <td>{contrib.notes || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => onEdit(contrib)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="danger" 
                      size="sm" 
                      onClick={() => onDelete(contrib.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}