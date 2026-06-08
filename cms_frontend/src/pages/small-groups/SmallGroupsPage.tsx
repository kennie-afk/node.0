import { useState, useEffect } from 'react';
import type { SmallGroup } from '../../api/smallGroupApi';
import { fetchSmallGroups, deleteSmallGroup } from '../../api/smallGroupApi';
import BackButton from '../../components/common/BackButton';
import AddSmallGroupForm from '../../components/forms/AddSmallGroupForm';
import { SmallGroupTable } from '../../components/tables/SmallGroupTable';

export default function SmallGroupsPage() {
  const [smallGroups, setSmallGroups] = useState<SmallGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SmallGroup | null>(null);
  const [viewingGroup, setViewingGroup] = useState<SmallGroup | null>(null);

  const loadSmallGroups = async () => {
    try {
      setLoading(true);
      const res = await fetchSmallGroups();
      setSmallGroups(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load small groups');
    } finally {
      setLoading(false);
    }
  };

  const handleSmallGroupAdded = () => {
    setSuccess('Small Group saved successfully!');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    setEditingGroup(null);
    loadSmallGroups();
  };

  const handleEdit = (group: SmallGroup) => {
    setEditingGroup(group);
    setShowAddForm(true);
  };

  const handleView = (group: SmallGroup) => {
    setViewingGroup(group);
  };

  const closeViewModal = () => {
    setViewingGroup(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this small group?')) return;
    try {
      await deleteSmallGroup(id);
      setSuccess('Small Group deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadSmallGroups();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete small group');
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingGroup(null);
  };

  useEffect(() => {
    loadSmallGroups();
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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', color: '#f1f5f9', margin: 0 }}>Small Groups</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Manage cell groups and fellowships</p>
        </div>

        <button 
          onClick={() => {
            setEditingGroup(null);
            setShowAddForm(!showAddForm);
          }}
          style={{
            padding: '10px 20px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: 'clamp(13px, 3.5vw, 14px)',
            flexShrink: 0
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Small Group'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
          {success}
        </div>
      )}

      {showAddForm && (
        <AddSmallGroupForm 
          onSmallGroupAdded={handleSmallGroupAdded} 
          initialData={editingGroup} 
          isEdit={!!editingGroup}
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading small groups...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <SmallGroupTable 
                smallGroups={smallGroups} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onView={handleView}
              />
            </div>
          )}
        </>
      )}

      {viewingGroup && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(0,0,0,0.85)', 
          zIndex: 2000, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '24px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>{viewingGroup.name}</h3>
              <button 
                onClick={closeViewModal}
                style={{
                  background: 'transparent',
                  border: '1px solid #f87171',
                  color: '#f87171',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Close
              </button>
            </div>

            <div style={{ color: '#cbd5e1', lineHeight: '1.8' }}>
              <p><strong>Ministry:</strong> {viewingGroup.parentMinistry?.name || viewingGroup.ministry?.name || 'N/A'}</p>
              {viewingGroup.leader && (
                <p><strong>Leader:</strong> {viewingGroup.leader.firstName} {viewingGroup.leader.lastName}</p>
              )}
              {viewingGroup.meetingDay && <p><strong>Meeting Day:</strong> {viewingGroup.meetingDay}</p>}
              {viewingGroup.meetingTime && <p><strong>Meeting Time:</strong> {viewingGroup.meetingTime}</p>}
              {viewingGroup.meetingLocation && <p><strong>Location:</strong> {viewingGroup.meetingLocation}</p>}
              {viewingGroup.description && <p><strong>Description:</strong> {viewingGroup.description}</p>}
              {viewingGroup.notes && <p><strong>Notes:</strong> {viewingGroup.notes}</p>}
              <p><strong>Status:</strong> {viewingGroup.isActive ? 'Active' : 'Inactive'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}