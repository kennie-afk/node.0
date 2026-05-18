import { useState, useEffect } from 'react';
import type { Member } from '../../api/memberApi';
import { fetchMembers, deleteMember } from '../../api/memberApi';
import { fetchMemberContributions, type Contribution } from '../../api/contributionApi';
import { AddMemberForm } from '../../components/forms/AddMemberForm';
import { MemberTable } from '../../components/tables/MemberTable';

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Edit mode
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  // Contributions modal
  const [showContributionsModal, setShowContributionsModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState('');
  const [memberContributions, setMemberContributions] = useState<Contribution[]>([]);
  const [loadingContributions, setLoadingContributions] = useState(false);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const res = await fetchMembers();
      setMembers(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const loadMemberContributions = async (memberId: number) => {
    try {
      setLoadingContributions(true);
      const res = await fetchMemberContributions(memberId);
      setMemberContributions(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load contributions for this member');
      setMemberContributions([]);
    } finally {
      setLoadingContributions(false);
    }
  };

  const handleMemberAdded = () => {
    setSuccess('Member added successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    loadMembers();
  };

  const handleMemberUpdated = () => {
    setSuccess('Member updated successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowEditForm(false);
    setEditingMember(null);
    loadMembers();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this member?')) return;
    try {
      await deleteMember(id);
      setSuccess('Member deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadMembers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete member');
    }
  };

  const handleEdit = (member: Member) => {
    setEditingMember(member);
    setShowEditForm(true);
  };

  const handleViewContributions = async (memberId: number, memberName: string) => {
    setSelectedMemberId(memberId);
    setSelectedMemberName(memberName);
    setShowContributionsModal(true);
    await loadMemberContributions(memberId);   // This already filters by memberId
  };

  const closeContributionsModal = () => {
    setShowContributionsModal(false);
    setSelectedMemberId(null);
    setSelectedMemberName('');
    setMemberContributions([]);
  };

  useEffect(() => {
    loadMembers();
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
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>Members Management</h1>
          <p style={{ color: '#a1a1aa', margin: '4px 0 0 0' }}>Manage individual church members and their records</p>
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
          {showAddForm ? 'Cancel' : '+ Add New Member'}
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
      {showAddForm && <AddMemberForm onMemberAdded={handleMemberAdded} />}

      {/* Edit Form */}
      {showEditForm && editingMember && (
        <AddMemberForm 
          onMemberAdded={handleMemberUpdated} 
          initialData={editingMember} 
          isEdit={true} 
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#a1a1aa' }}>
          Loading members...
        </div>
      ) : (
        <div className="card">
          <MemberTable 
            members={members} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
            onViewContributions={handleViewContributions}
          />
        </div>
      )}

      {/* Contributions Modal - Shows ONLY this member's contributions */}
      {showContributionsModal && selectedMemberId && (
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
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '720px', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '24px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '16px'
            }}>
              <h3>Contributions for {selectedMemberName}</h3>
              <button 
                onClick={closeContributionsModal}
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

            {loadingContributions ? (
              <p style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>Loading contributions...</p>
            ) : memberContributions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>
                No contributions recorded for this member yet.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount (KES)</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {memberContributions.map((contrib) => (
                    <tr key={contrib.id}>
                      <td>{new Date(contrib.date || '').toLocaleDateString()}</td>
                      <td>{contrib.contributionType || 'General'}</td>
                      <td style={{ fontWeight: '600', color: '#4ade80' }}>
                        {Number(contrib.amount).toLocaleString()}
                      </td>
                      <td>{contrib.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}