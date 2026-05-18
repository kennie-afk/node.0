import { useState, useEffect } from 'react';
import type { Ministry } from '../../api/ministryApi';
import { fetchMinistries, deleteMinistry } from '../../api/ministryApi';
import AddMinistryForm from '../../components/forms/AddMinistryForm';
import { MinistryTable } from '../../components/tables/MinistryTable';

export default function MinistriesPage() {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
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
      setMinistries(res.data || res || []);
    } catch (err: any) {
      setError('Failed to load ministries');
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    loadMinistries();
  }, []);

  return (
    <div style={{ padding: '32px 40px', backgroundColor: '#0a0a0f', minHeight: '100vh' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '32px' 
      }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#f1f5f9' }}>Ministries</h1>
          <p style={{ color: '#a1a1aa' }}>Manage church ministries and departments</p>
        </div>

        <button 
          onClick={() => {
            setEditingMinistry(null);
            setShowAddForm(!showAddForm);
          }}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #ec4899, #c026d3)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14.5px'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Ministry'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px' }}>
          {success}
        </div>
      )}

      {showAddForm && (
        <AddMinistryForm 
          onMinistryAdded={handleMinistryAdded} 
          initialData={editingMinistry} 
          isEdit={!!editingMinistry} 
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#a1a1aa' }}>Loading ministries...</div>
      ) : (
        <div className="card">
          <MinistryTable 
            ministries={ministries} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
            onView={handleView}
          />
        </div>
      )}

      {viewingMinistry && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(0,0,0,0.85)', 
          zIndex: 2000, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <div className="card" style={{ width: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '24px',
              borderBottom: '1px solid #27272a',
              paddingBottom: '16px'
            }}>
              <h3>{viewingMinistry.name}</h3>
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
              <p><strong>Description:</strong> {viewingMinistry.description || 'No description provided'}</p>
              {viewingMinistry.leader && (
                <p><strong>Leader:</strong> {viewingMinistry.leader.firstName} {viewingMinistry.leader.lastName}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}