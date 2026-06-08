import { useState, useEffect } from 'react';
import type { Contribution } from '../../api/contributionApi';
import { fetchContributions, deleteContribution } from '../../api/contributionApi';
import BackButton from '../../components/common/BackButton';
import AddContributionForm from '../../components/forms/AddContributionForm';
import { ContributionTable } from '../../components/tables/ContributionTable';

export default function ContributionsPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const loadContributions = async () => {
    try {
      setLoading(true);
      const res = await fetchContributions();
      setContributions(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load contributions');
    } finally {
      setLoading(false);
    }
  };

  const handleContributionAdded = () => {
    setSuccess('Contribution recorded successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    loadContributions();
  };

  const handleContributionUpdated = () => {
    setSuccess('Contribution updated successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowEditForm(false);
    setEditingContribution(null);
    loadContributions();
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

  const handleEdit = (contribution: Contribution) => {
    setEditingContribution(contribution);
    setShowEditForm(true);
    setShowAddForm(false);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setShowEditForm(false);
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
            setShowEditForm(false);
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

      {showAddForm && <AddContributionForm onContributionAdded={handleContributionAdded} onCancel={handleCancelForm} />}

      {showEditForm && editingContribution && (
        <AddContributionForm 
          onContributionAdded={handleContributionUpdated} 
          initialData={editingContribution} 
          isEdit={true} 
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && !showEditForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading contributions...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <ContributionTable 
                contributions={contributions} 
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