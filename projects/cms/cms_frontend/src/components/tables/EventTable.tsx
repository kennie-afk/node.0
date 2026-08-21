import type { Event } from '../../api/eventApi';
import { Button } from '../common/Button';

interface Props {
  events: Event[];
  onDelete: (id: number) => void;
  onEdit: (event: Event) => void;
}

export function EventTable({ events, onDelete, onEdit }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Event Name</th>
            <th>Start Time</th>
            <th>Location</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
                No events found
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id}>
                <td><strong>{event.name}</strong></td>
                <td>{new Date(event.startTime).toLocaleString()}</td>
                <td>{event.location || '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => onEdit(event)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="danger" 
                      size="sm" 
                      onClick={() => onDelete(event.id)}
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