import { useState, useEffect } from 'react';
import type { SmallGroup } from '../../api/smallGroupApi';
import {
  fetchSmallGroups,
  deleteSmallGroup,
  fetchSmallGroupMembers,
  addSmallGroupMember,
  removeSmallGroupMember
} from '../../api/smallGroupApi';
import MembershipPanel from '../../components/common/MembershipPanel';
import BackButton from '../../components/common/BackButton';
import AddSmallGroupForm from '../../components/forms/AddSmallGroupForm';
import { SmallGroupTable } from '../../components/tables/SmallGroupTable';
import { describeError } from '../../api/errors';

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
      setError(describeError(err, 'Failed to delete small group'));
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
          <h1 style={{ fontSize: '16.5px', fontWeight: '700', color: 'var(--c-text)', margin: 0 }}>Small Groups</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>Manage cell groups and fellowships</p>
        </div>

        <button 
          onClick={() => {
            setEditingGroup(null);
            setShowAddForm(!showAddForm);
          }}
          style={{
            padding: '10px 20px',
            background: 'var(--c-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '11.5px',
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
            backgroundColor: 'var(--c-fill)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: '6px',
            color: 'var(--c-text)',
            fontSize: '12px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--c-bad)', padding: '12px', background: 'var(--c-bad-bg)', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: 'var(--c-ok)', padding: '12px', background: 'var(--c-ok-bg)', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>
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
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>Loading small groups...</div>
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
              borderBottom: '1px solid var(--c-border)',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: '600' }}>Small Group Details</h3>
              <button 
                onClick={closeViewModal}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--c-bad)',
                  color: 'var(--c-bad)',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11.5px'
                }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)', width: '120px' }}>Group Name</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.name}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Ministry</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.parentMinistry?.name || viewingGroup.ministry?.name || 'N/A'}</td>
                  </tr>
                  {viewingGroup.leader && (
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Leader</td>
                      <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.leader.firstName} {viewingGroup.leader.lastName}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Meeting Day</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.meetingDay || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Meeting Time</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.meetingTime || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Meeting Location</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.meetingLocation || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Description</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.description || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Notes</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.notes || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Status</td>
                    <td style={{ padding: '12px 0', color: viewingGroup.isActive ? 'var(--c-ok)' : 'var(--c-bad)' }}>
                      {viewingGroup.isActive ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Created At</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingGroup.createdAt ? new Date(viewingGroup.createdAt).toLocaleDateString() : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <MembershipPanel
              key={viewingGroup.id}
              title="Members"
              loadRoster={() => fetchSmallGroupMembers(viewingGroup.id)}
              addMember={(memberId, role) =>
                addSmallGroupMember(viewingGroup.id, memberId, role)
              }
              removeMember={(memberId) => removeSmallGroupMember(viewingGroup.id, memberId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}