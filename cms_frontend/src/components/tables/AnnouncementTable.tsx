import type { Announcement } from '../../api/announcementApi';
import { Button } from '../common/Button';

interface Props {
  announcements: Announcement[];
  onDelete: (id: number) => void;
  onEdit: (announcement: Announcement) => void;
}

export function AnnouncementTable({ announcements, onDelete, onEdit }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Author</th>
            <th>Publication Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {announcements.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
                No announcements found
              </td>
            </tr>
          ) : (
            announcements.map((ann) => (
              <tr key={ann.id}>
                <td><strong>{ann.title}</strong></td>
                <td>
                  {ann.author 
                    ? ann.author.username 
                    : 'System'}
                </td>
                <td>{new Date(ann.publicationDate).toLocaleDateString()}</td>
                <td>
                  <span style={{ 
                    color: ann.isPublished ? '#4ade80' : '#f87171',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    background: ann.isPublished ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)'
                  }}>
                    {ann.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => onEdit(ann)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="danger" 
                      size="sm" 
                      onClick={() => onDelete(ann.id)}
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