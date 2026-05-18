import { useState, useEffect } from 'react';
import type { Family } from '../../api/familyApi';
import { fetchFamilies, deleteFamily, updateFamily } from '../../api/familyApi';
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

  useEffect(() => {
    loadFamilies();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700' }}>Families Management</h1>
          <p style={{ color: '#a1a1aa' }}>Manage church families</p>
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
            gap: '8px'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Family'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', padding: '12px', background: '#3f1e1e', borderRadius: '12px', marginBottom: '20px' }}>{error}</div>}
      {success && <div style={{ color: '#4ade80', padding: '12px', background: '#1f3a1f', borderRadius: '12px', marginBottom: '20px' }}>{success}</div>}

      {showAddForm && <AddFamilyForm onFamilyAdded={handleFamilyAdded} />}

      {showEditForm && editingFamily && (
        <AddFamilyForm 
          onFamilyAdded={handleUpdateFamily} 
          initialData={editingFamily}
          isEdit={true}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#a1a1aa' }}>Loading families...</div>
      ) : (
        <div className="card">
          <FamilyTable 
            families={families} 
            onDelete={handleDelete} 
            onEdit={handleEdit} 
          />
        </div>
      )}
    </div>
  );
}