import { useState, useEffect } from 'react';
import type { Announcement } from '../../api/announcementApi';
import { fetchAnnouncements, deleteAnnouncement } from '../../api/announcementApi';
import BackButton from '../../components/common/BackButton';
import AddAnnouncementForm from '../../components/forms/AddAnnouncementForm';
import { AnnouncementTable } from '../../components/tables/AnnouncementTable';
import { describeError } from '../../api/errors';

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
      setAnnouncements(res);
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
      setError(describeError(err, 'Failed to delete announcement'));
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setShowEditForm(true);
    setShowAddForm(false);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setShowEditForm(false);
    setEditingAnnouncement(null);
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  return (
    <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
      <BackButton />

      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '16.5px', fontWeight: '700', margin: 0 }}>Announcements Management</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>Manage church announcements and notices</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setShowEditForm(false);
            setEditingAnnouncement(null);
          }}
          style={{
            padding: '10px 20px',
            background: 'var(--c-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: '11.5px'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Announcement'}
        </button>
      </div>

      {error && (
        <div style={{ 
          color: 'var(--c-bad)', 
          padding: '12px', 
          background: 'var(--c-bad-bg)', 
          borderRadius: '6px', 
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          color: 'var(--c-ok)', 
          padding: '12px', 
          background: 'var(--c-ok-bg)', 
          borderRadius: '6px', 
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          {success}
        </div>
      )}

      {showAddForm && <AddAnnouncementForm onAnnouncementAdded={handleAnnouncementAdded} onCancel={handleCancelForm} />}

      {showEditForm && editingAnnouncement && (
        <AddAnnouncementForm 
          onAnnouncementAdded={handleAnnouncementUpdated} 
          initialData={editingAnnouncement} 
          isEdit={true} 
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && !showEditForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>Loading announcements...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <AnnouncementTable 
                announcements={announcements} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}