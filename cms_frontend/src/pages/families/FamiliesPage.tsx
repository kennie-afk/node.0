import { useState, useEffect } from 'react';
import type { Family } from '../../api/familyApi';
import { fetchFamilies, deleteFamily, updateFamily } from '../../api/familyApi';
import BackButton from '../../components/common/BackButton';
import { AddFamilyForm } from '../../components/forms/AddFamilyForm';
import { FamilyTable } from '../../components/tables/FamilyTable';

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [filteredFamilies, setFilteredFamilies] = useState<Family[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [viewingFamily, setViewingFamily] = useState<Family | null>(null);

  const loadFamilies = async () => {
    try {
      setLoading(true);
      const response = await fetchFamilies();
      const data = response.data || response || [];
      setFamilies(data);
      setFilteredFamilies(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load families');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredFamilies(families);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = families.filter(family =>
      family.familyName?.toLowerCase().includes(term) ||
      family.address?.toLowerCase().includes(term) ||
      family.city?.toLowerCase().includes(term) ||
      family.phoneNumber?.includes(term) ||
      family.email?.toLowerCase().includes(term)
    );
    setFilteredFamilies(filtered);
  }, [searchTerm, families]);

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

  const handleView = (family: Family) => {
    setViewingFamily(family);
  };

  const closeViewModal = () => {
    setViewingFamily(null);
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

      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px', 
        flexWrap: 'wrap',
        flexDirection: window.innerWidth < 500 ? 'column' : 'row'
      }}>
        <input
          type="text"
          placeholder="Search by family name, address, city, phone or email..."
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
                families={filteredFamilies} 
                onDelete={handleDelete} 
                onEdit={handleEdit}
                onView={handleView}
              />
            </div>
          )}
        </>
      )}

      {viewingFamily && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(0,0,0,0.85)', 
          zIndex: 2000, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflow: 'auto', position: 'relative' }}>
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
              <h3 style={{ fontSize: 'clamp(16px, 4vw, 20px)' }}>{viewingFamily.familyName}</h3>
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
              <p><strong>Family Name:</strong> {viewingFamily.familyName}</p>
              <p><strong>Address:</strong> {viewingFamily.address || '-'}</p>
              <p><strong>City:</strong> {viewingFamily.city || '-'}</p>
              <p><strong>County:</strong> {viewingFamily.county || '-'}</p>
              <p><strong>Postal Code:</strong> {viewingFamily.postalCode || '-'}</p>
              <p><strong>Phone:</strong> {viewingFamily.phoneNumber || '-'}</p>
              <p><strong>Email:</strong> {viewingFamily.email || '-'}</p>
              {viewingFamily.notes && <p><strong>Notes:</strong> {viewingFamily.notes}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}