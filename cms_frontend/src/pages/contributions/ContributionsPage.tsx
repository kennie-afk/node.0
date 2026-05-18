import { useState, useEffect } from 'react';
import type { Contribution } from '../../api/contributionApi';
import { fetchContributions, deleteContribution } from '../../api/contributionApi';
import AddContributionForm from '../../components/forms/AddContributionForm';
import { ContributionTable } from '../../components/tables/ContributionTable';

export default function ContributionsPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit mode
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
  };

  useEffect(() => {
    loadContributions();
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
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>Contributions Management</h1>
          <p style={{ color: '#a1a1aa', margin: '4px 0 0 0' }}>Record and track member contributions</p>
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
          {showAddForm ? 'Cancel' : '+ Record New Contribution'}
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
      {showAddForm && <AddContributionForm onContributionAdded={handleContributionAdded} />}

      {/* Edit Form */}
      {showEditForm && editingContribution && (
        <AddContributionForm 
          onContributionAdded={handleContributionUpdated} 
          initialData={editingContribution} 
          isEdit={true} 
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#a1a1aa' }}>Loading contributions...</div>
      ) : (
        <div className="card">
          <ContributionTable 
            contributions={contributions} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
          />
        </div>
      )}
    </div>
  );
}