import { useState, useEffect } from 'react';
import type { Member } from '../../api/memberApi';
import { fetchMembers, deleteMember } from '../../api/memberApi';
import { fetchMemberContributions, type Contribution } from '../../api/contributionApi';
import BackButton from '../../components/common/BackButton';
import { AddMemberForm } from '../../components/forms/AddMemberForm';
import { MemberTable } from '../../components/tables/MemberTable';
import AddContributionForm from '../../components/forms/AddContributionForm';

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showContributionsModal, setShowContributionsModal] = useState(false);
  const [showAddContributionModal, setShowAddContributionModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState('');
  const [memberContributions, setMemberContributions] = useState<Contribution[]>([]);
  const [loadingContributions, setLoadingContributions] = useState(false);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const res = await fetchMembers();
      const data = res;
      setMembers(data);
      setFilteredMembers(data);
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
      setMemberContributions(res);
    } catch (err: any) {
      setError('Failed to load contributions for this member');
      setMemberContributions([]);
    } finally {
      setLoadingContributions(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredMembers(members);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = members.filter(member =>
      member.firstName?.toLowerCase().includes(term) ||
      member.lastName?.toLowerCase().includes(term) ||
      member.email?.toLowerCase().includes(term) ||
      member.phoneNumber?.includes(term)
    );
    setFilteredMembers(filtered);
  }, [searchTerm, members]);

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
    setShowAddForm(false);
  };

  const handleViewContributions = async (memberId: number, memberName: string) => {
    setSelectedMemberId(memberId);
    setSelectedMemberName(memberName);
    setShowContributionsModal(true);
    setShowAddContributionModal(false);
    await loadMemberContributions(memberId);
  };

  const handleAddContribution = (memberId: number, memberName: string) => {
    setSelectedMemberId(memberId);
    setSelectedMemberName(memberName);
    setShowAddContributionModal(true);
    setShowContributionsModal(false);
  };

  const closeContributionsModal = () => {
    setShowContributionsModal(false);
    setShowAddContributionModal(false);
    setSelectedMemberId(null);
    setSelectedMemberName('');
    setMemberContributions([]);
  };

  const handleContributionAdded = () => {
    setSuccess('Contribution added successfully');
    setTimeout(() => setSuccess(''), 3000);
    closeContributionsModal();
    if (selectedMemberId) {
      loadMemberContributions(selectedMemberId);
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setShowEditForm(false);
    setEditingMember(null);
  };

  useEffect(() => {
    loadMembers();
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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', margin: 0 }}>Members Management</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Manage individual church members and their records</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setShowEditForm(false);
            setEditingMember(null);
          }}
          style={{
            padding: '10px 20px',
            background: '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: 'clamp(13px, 3.5vw, 14px)'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Member'}
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
          placeholder="Search by name, email or phone..."
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

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{success}</div>}

      {showAddForm && <AddMemberForm onMemberAdded={handleMemberAdded} onCancel={handleCancelForm} />}

      {showEditForm && editingMember && (
        <AddMemberForm 
          onMemberAdded={handleMemberUpdated} 
          initialData={editingMember} 
          isEdit={true} 
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && !showEditForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading members...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <MemberTable 
                members={filteredMembers} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onViewContributions={handleViewContributions}
                onAddContribution={handleAddContribution}
              />
            </div>
          )}
        </>
      )}

      {/* Contributions Modal */}
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
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '720px', maxHeight: '85vh', overflow: 'auto' }}>
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
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>Contributions for {selectedMemberName}</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={() => handleAddContribution(selectedMemberId, selectedMemberName)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #4ade80',
                    color: '#4ade80',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  + Add Contribution
                </button>
                <button 
                  onClick={closeContributionsModal}
                  style={{
                    background: 'transparent',
                    border: '1px solid #f87171',
                    color: '#f87171',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {loadingContributions ? (
              <p style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>Loading contributions...</p>
            ) : memberContributions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>
                No contributions recorded for this member yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ minWidth: '400px' }}>
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Contribution Modal */}
      {showAddContributionModal && selectedMemberId && (
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
          <div style={{ width: '100%', maxWidth: '600px' }}>
            <AddContributionForm 
              onContributionAdded={handleContributionAdded}
              preSelectedMemberId={selectedMemberId}
              onCancel={closeContributionsModal}
            />
          </div>
        </div>
      )}
    </div>
  );
}