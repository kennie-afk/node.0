import { useState, useEffect } from 'react';
import type { Family } from '../../api/familyApi';
import { fetchFamilies, deleteFamily, updateFamily } from '../../api/familyApi';
import BackButton from '../../components/common/BackButton';
import { AddFamilyForm } from '../../components/forms/AddFamilyForm';
import { FamilyTable } from '../../components/tables/FamilyTable';

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const loadFamilies = async () => {
    try {
      setLoading(true);
      const response = await fetchFamilies();
      setFamilies(response.data || response || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load families');
    } finally {
      setLoading(false);
    }
  };

  const handleFamilyAdded = async () => {
    setSuccess('Family created successfully!');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    await loadFamilies();
  };

  const handleEdit = (family: Family) => {
    setEditingFamily(family);
    setShowEditForm(true);
    setShowAddForm(false);
  };

  const handleUpdateFamily = async (updatedData: any) => {
    if (!editingFamily) return;
    try {
      await updateFamily(editingFamily.id, updatedData);
      setSuccess('Family updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setShowEditForm(false);
      setEditingFamily(null);
      await loadFamilies();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update family');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this family?')) return;
    try {
      await deleteFamily(id);
      setSuccess('Family deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      await loadFamilies();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete family');
    }
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setShowEditForm(false);
    setEditingFamily(null);
  };

  useEffect(() => {
    loadFamilies();
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
          <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: '700', margin: 0 }}>Families Management</h1>
          <p style={{ color: '#a1a1aa', fontSize: 'clamp(13px, 3.5vw, 14px)' }}>Manage church families</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setShowEditForm(false);
            setEditingFamily(null);
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
          {showAddForm ? 'Cancel' : '+ Add New Family'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{success}</div>}

      {showAddForm && <AddFamilyForm onFamilyAdded={handleFamilyAdded} onCancel={handleCancelForm} />}

      {showEditForm && editingFamily && (
        <AddFamilyForm 
          onFamilyAdded={handleUpdateFamily} 
          initialData={editingFamily}
          isEdit={true}
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && !showEditForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading families...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <FamilyTable 
                families={families} 
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