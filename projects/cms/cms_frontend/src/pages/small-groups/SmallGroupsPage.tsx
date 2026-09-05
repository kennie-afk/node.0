import { useState, useEffect } from 'react';
import type { SmallGroup } from '../../api/smallGroupApi';
import { fetchSmallGroups, deleteSmallGroup } from '../../api/smallGroupApi';
import BackButton from '../../components/common/BackButton';
import AddSmallGroupForm from '../../components/forms/AddSmallGroupForm';
import { SmallGroupTable } from '../../components/tables/SmallGroupTable';

export default function SmallGroupsPage() {
  const [smallGroups, setSmallGroups] = useState<SmallGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<SmallGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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
      const data = res;
      setSmallGroups(data);
      setFilteredGroups(data);
    } catch (err: any) {
      setError('Failed to load small groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredGroups(smallGroups);
      return;
    }
    const term = searchTerm.toLowerCase().trim();
    const filtered = smallGroups.filter(group =>
      group.name?.toLowerCase().includes(term) ||
      group.description?.toLowerCase().includes(term) ||
      group.meetingLocation?.toLowerCase().includes(term)
    );
    setFilteredGroups(filtered);
  }, [searchTerm, smallGroups]);

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

      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px', 
        flexWrap: 'wrap',
        flexDirection: window.innerWidth < 500 ? 'column' : 'row'
      }}>
        <input
          type="text"
          placeholder="Search by group name, description or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        />
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
                smallGroups={filteredGroups} 
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
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '550px', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Small Group Details</h3>
              <button 
                onClick={closeViewModal}
                style={{
                  background: 'transparent',
                  border: '1px solid #f87171',
                  color: '#f87171',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa', width: '120px' }}>Group Name</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.name}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Ministry</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.parentMinistry?.name || viewingGroup.ministry?.name || 'N/A'}</td>
                  </tr>
                  {viewingGroup.leader && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Leader</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.leader.firstName} {viewingGroup.leader.lastName}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Meeting Day</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.meetingDay || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Meeting Time</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.meetingTime || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Meeting Location</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.meetingLocation || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Description</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.description || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Notes</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.notes || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Status</td>
                    <td style={{ padding: '12px 0', color: viewingGroup.isActive ? '#4ade80' : '#f87171' }}>
                      {viewingGroup.isActive ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Created At</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingGroup.createdAt ? new Date(viewingGroup.createdAt).toLocaleDateString() : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}