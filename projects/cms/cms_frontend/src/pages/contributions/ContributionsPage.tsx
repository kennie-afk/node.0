import { useState, useEffect } from 'react';
import type { Contribution } from '../../api/contributionApi';
import { fetchContributions, deleteContribution } from '../../api/contributionApi';
import BackButton from '../../components/common/BackButton';
import AddContributionForm from '../../components/forms/AddContributionForm';
import { ContributionTable } from '../../components/tables/ContributionTable';

export default function ContributionsPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [filteredContributions, setFilteredContributions] = useState<Contribution[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
  const [viewingContribution, setViewingContribution] = useState<Contribution | null>(null);

  const loadContributions = async () => {
    try {
      setLoading(true);
      const res = await fetchContributions();
      const data = res.data || res || [];
      setContributions(data);
      setFilteredContributions(data);
    } catch (err: any) {
      setError('Failed to load contributions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredContributions(contributions);
      return;
    }
    const term = searchTerm.toLowerCase().trim();
    const filtered = contributions.filter(contrib =>
      contrib.contributionType?.toLowerCase().includes(term) ||
      contrib.member?.firstName?.toLowerCase().includes(term) ||
      contrib.member?.lastName?.toLowerCase().includes(term) ||
      contrib.notes?.toLowerCase().includes(term)
    );
    setFilteredContributions(filtered);
  }, [searchTerm, contributions]);

  const handleContributionAdded = () => {
    setSuccess('Contribution recorded successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    setEditingContribution(null);
    loadContributions();
  };

  const handleEdit = (contribution: Contribution) => {
    setEditingContribution(contribution);
    setShowAddForm(true);
  };

  const handleView = (contribution: Contribution) => {
    setViewingContribution(contribution);
  };

  const closeViewModal = () => {
    setViewingContribution(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this contribution?')) return;
    try {
      await deleteContribution(id);
      setSuccess('Contribution deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadContributions();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete contribution');
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingContribution(null);
  };

  useEffect(() => {
    loadContributions();
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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', margin: 0 }}>Contributions Management</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Record and track member contributions</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingContribution(null);
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
          {showAddForm ? 'Cancel' : '+ Record New Contribution'}
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
          placeholder="Search by type, member name or notes..."
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
        <div style={{ 
          color: '#f87171', 
          padding: '12px', 
          background: '#3f1e1e', 
          borderRadius: '8px', 
          marginBottom: '20px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          color: '#4ade80', 
          padding: '12px', 
          background: '#1f3a1f', 
          borderRadius: '8px', 
          marginBottom: '20px',
          fontSize: '14px'
        }}>
          {success}
        </div>
      )}

      {showAddForm && <AddContributionForm onContributionAdded={handleContributionAdded} onCancel={handleCancelForm} isEdit={!!editingContribution} initialData={editingContribution} />}

      {!showAddForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading contributions...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <ContributionTable 
                contributions={filteredContributions} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onView={handleView}
              />
            </div>
          )}
        </>
      )}

      {viewingContribution && (
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
          <div className="card" style={{ width: '100%', maxWidth: '500px', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Contribution Details</h3>
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
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa', width: '110px' }}>Member Name</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>
                      {viewingContribution.member?.firstName} {viewingContribution.member?.lastName}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Amount</td>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#4ade80' }}>
                      KES {Number(viewingContribution.amount).toLocaleString()}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Date</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingContribution.date ? new Date(viewingContribution.date).toLocaleDateString() : '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Type</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingContribution.contributionType}</td>
                  </tr>
                  {viewingContribution.notes && (
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Notes</td>
                      <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingContribution.notes}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: '#a1a1aa' }}>Created At</td>
                    <td style={{ padding: '12px 0', color: '#f1f5f9' }}>{viewingContribution.createdAt ? new Date(viewingContribution.createdAt).toLocaleDateString() : '-'}</td>
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