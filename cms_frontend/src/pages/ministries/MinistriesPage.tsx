import { useState, useEffect } from 'react';
import type { Ministry } from '../../api/ministryApi';
import { fetchMinistries, deleteMinistry } from '../../api/ministryApi';
import BackButton from '../../components/common/BackButton';
import AddMinistryForm from '../../components/forms/AddMinistryForm';
import { MinistryTable } from '../../components/tables/MinistryTable';

export default function MinistriesPage() {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [filteredMinistries, setFilteredMinistries] = useState<Ministry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMinistry, setEditingMinistry] = useState<Ministry | null>(null);
  const [viewingMinistry, setViewingMinistry] = useState<Ministry | null>(null);

  const loadMinistries = async () => {
    try {
      setLoading(true);
      const res = await fetchMinistries();
      const data = res.data || res || [];
      setMinistries(data);
      setFilteredMinistries(data);
    } catch (err: any) {
      setError('Failed to load ministries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredMinistries(ministries);
      return;
    }
    const term = searchTerm.toLowerCase().trim();
    const filtered = ministries.filter(ministry =>
      ministry.name?.toLowerCase().includes(term) ||
      ministry.description?.toLowerCase().includes(term)
    );
    setFilteredMinistries(filtered);
  }, [searchTerm, ministries]);

  const handleMinistryAdded = () => {
    setSuccess('Ministry saved successfully!');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    setEditingMinistry(null);
    loadMinistries();
  };

  const handleEdit = (ministry: Ministry) => {
    setEditingMinistry(ministry);
    setShowAddForm(true);
  };

  const handleView = (ministry: Ministry) => {
    setViewingMinistry(ministry);
  };

  const closeViewModal = () => {
    setViewingMinistry(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this ministry?')) return;
    try {
      await deleteMinistry(id);
      setSuccess('Ministry deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadMinistries();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete ministry');
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingMinistry(null);
  };

  useEffect(() => {
    loadMinistries();
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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', color: '#f1f5f9', margin: 0 }}>Ministries</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Manage church ministries and departments</p>
        </div>

        <button 
          onClick={() => {
            setEditingMinistry(null);
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
          {showAddForm ? 'Cancel' : '+ Add New Ministry'}
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
          placeholder="Search by ministry name or description..."
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
        <AddMinistryForm 
          onMinistryAdded={handleMinistryAdded} 
          initialData={editingMinistry} 
          isEdit={!!editingMinistry}
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading ministries...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <MinistryTable 
                ministries={filteredMinistries} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onView={handleView}
              />
            </div>
          )}
        </>
      )}

      {viewingMinistry && (
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
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto' }}>
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
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>Ministry Details</h3>
              <button 
                onClick={closeViewModal}
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

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: '600', color: '#a1a1aa', width: '140px' }}>Ministry Name</td>
                    <td style={{ color: '#f1f5f9' }}><strong>{viewingMinistry.name}</strong></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: '600', color: '#a1a1aa' }}>Description</td>
                    <td style={{ color: '#f1f5f9' }}>{viewingMinistry.description || '-'}</td>
                  </tr>
                  {viewingMinistry.leader && (
                    <tr>
                      <td style={{ fontWeight: '600', color: '#a1a1aa' }}>Leader</td>
                      <td style={{ color: '#f1f5f9' }}>{viewingMinistry.leader.firstName} {viewingMinistry.leader.lastName}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ fontWeight: '600', color: '#a1a1aa' }}>Created At</td>
                    <td style={{ color: '#f1f5f9' }}>{viewingMinistry.createdAt ? new Date(viewingMinistry.createdAt).toLocaleDateString() : '-'}</td>
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