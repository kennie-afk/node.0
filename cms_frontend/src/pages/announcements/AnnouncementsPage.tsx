import { useState, useEffect } from 'react';
import type { Announcement } from '../../api/announcementApi';
import { fetchAnnouncements, deleteAnnouncement } from '../../api/announcementApi';
import AddAnnouncementForm from '../../components/forms/AddAnnouncementForm';
import { AnnouncementTable } from '../../components/tables/AnnouncementTable';

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await fetchAnnouncements();
      setAnnouncements(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleAnnouncementAdded = () => {
    setSuccess('Announcement added successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    loadAnnouncements();
  };

  const handleAnnouncementUpdated = () => {
    setSuccess('Announcement updated successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowEditForm(false);
    setEditingAnnouncement(null);
    loadAnnouncements();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await deleteAnnouncement(id);
      setSuccess('Announcement deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadAnnouncements();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete announcement');
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setShowEditForm(true);
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '28px' 
      }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>Announcements Management</h1>
          <p style={{ color: '#a1a1aa', margin: '4px 0 0 0' }}>Manage church announcements and notices</p>
        </div>

        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #ec4899, #c026d3)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Announcement'}
        </button>
      </div>

      {error && (
        <div style={{ 
          color: '#f87171', 
          padding: '12px', 
          background: '#3f1e1e', 
          borderRadius: '12px', 
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          color: '#4ade80', 
          padding: '12px', 
          background: '#1f3a1f', 
          borderRadius: '12px', 
          marginBottom: '20px' 
        }}>
          {success}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && <AddAnnouncementForm onAnnouncementAdded={handleAnnouncementAdded} />}

      {/* Edit Form */}
      {showEditForm && editingAnnouncement && (
        <AddAnnouncementForm 
          onAnnouncementAdded={handleAnnouncementUpdated} 
          initialData={editingAnnouncement} 
          isEdit={true} 
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#a1a1aa' }}>Loading announcements...</div>
      ) : (
        <div className="card">
          <AnnouncementTable 
            announcements={announcements} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
          />
        </div>
      )}
    </div>
  );
}