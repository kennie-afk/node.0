import type { Contribution } from '../../api/contributionApi';
import { Button } from '../common/Button';

interface Props {
  contributions: Contribution[];
  onDelete: (id: number) => void;
  onEdit: (contribution: Contribution) => void;
  onView: (contribution: Contribution) => void;
}

export const ContributionTable: React.FC<Props> = ({ contributions, onDelete, onEdit, onView }) => {
  if (contributions.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No contributions found.</p>;
  }

  const sortedContributions = [...contributions].sort((a, b) => b.id - a.id);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: '700px' }} className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Member</th>
            <th>Amount (KES)</th>
            <th>Date</th>
            <th>Type</th>
            <th style={{ width: '240px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedContributions.map((contribution) => (
            <tr key={contribution.id}>
              <td>{contribution.id}</td>
              <td>
                <strong>
                  {contribution.member?.firstName} {contribution.member?.lastName}
                </strong>
              </td>
              <td style={{ fontWeight: '600', color: '#4ade80' }}>
                {Number(contribution.amount).toLocaleString()}
              </td>
              <td>{new Date(contribution.date).toLocaleDateString()}</td>
              <td>{contribution.contributionType}</td>
              <td>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', alignItems: 'center' }}>
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => onView(contribution)}
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
                    onClick={() => onEdit(contribution)}
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
                    onClick={() => onDelete(contribution.id)}
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