import type { Sermon } from '../../api/sermonApi';
import { Button } from '../common/Button';

interface Props {
  sermons: Sermon[];
  onDelete: (id: number) => void;
  onEdit: (sermon: Sermon) => void;
  onView: (sermon: Sermon) => void;
}

export function SermonTable({ sermons, onDelete, onEdit, onView }: Props) {
  if (sermons.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No sermons found</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ minWidth: '980px' }}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Date Preached</th>
            <th>Speaker</th>
            <th style={{ width: '220px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sermons.map(sermon => (
            <tr key={sermon.id}>
              <td><strong>{sermon.title}</strong></td>
              <td>{new Date(sermon.datePreached).toLocaleDateString()}</td>
              <td>
                {sermon.guestSpeakerName ? (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    backgroundColor: '#166534',
                    color: '#86efac',
                    fontSize: '13px'
                  }}>
                    Guest: {sermon.guestSpeakerName}
                  </span>
                ) : sermon.speaker ? (
                  `${sermon.speaker.firstName} ${sermon.speaker.lastName}`
                ) : (
                  'Unknown'
                )}
              </td>
              <td>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="primary" size="sm" onClick={() => onEdit(sermon)}>
                    Edit
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => onView(sermon)}>
                    View
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onDelete(sermon.id)}>
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