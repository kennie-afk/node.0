import { useState, useEffect } from 'react';
import type { Family } from '../../api/familyApi';
import { fetchFamilies, deleteFamily, updateFamily } from '../../api/familyApi';
import BackButton from '../../components/common/BackButton';
import { AddFamilyForm } from '../../components/forms/AddFamilyForm';
import { FamilyTable } from '../../components/tables/FamilyTable';
import { describeError } from '../../api/errors';

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
      const data = response;
      setFamilies(data);
      setFilteredFamilies(data);
    } catch (err: any) {
      setError(describeError(err, 'Failed to load families'));
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
      setError(describeError(err, 'Failed to update family'));
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
      setError(describeError(err, 'Failed to delete family'));
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
          <h1 style={{ fontSize: '16.5px', fontWeight: '700', margin: 0 }}>Families Management</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>Manage church families</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setShowEditForm(false);
            setEditingFamily(null);
          }}
          style={{
            padding: '10px 20px',
            background: 'var(--c-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: '11.5px'
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
            backgroundColor: 'var(--c-fill)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: '6px',
            color: 'var(--c-text)',
            fontSize: '12px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {error && <div style={{ color: 'var(--c-bad)', padding: '12px', background: 'var(--c-bad-bg)', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>{error}</div>}
      {success && <div style={{ color: 'var(--c-ok)', padding: '12px', background: 'var(--c-ok-bg)', borderRadius: '6px', marginBottom: '20px', fontSize: '12px' }}>{success}</div>}

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
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>Loading families...</div>
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
              borderBottom: '1px solid var(--c-border)',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: '600' }}>Family Details</h3>
              <button 
                onClick={closeViewModal}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--c-bad)',
                  color: 'var(--c-bad)',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11.5px'
                }}
              >
                Close
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)', width: '120px' }}>Family Name</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.familyName}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Address</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.address || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>City</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.city || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>County</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.county || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Postal Code</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.postalCode || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Phone Number</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.phoneNumber || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Email</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.email || '-'}</td>
                  </tr>
                  {viewingFamily.notes && (
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Notes</td>
                      <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.notes}</td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <td style={{ padding: '12px 0', fontWeight: '600', color: 'var(--c-muted)' }}>Created At</td>
                    <td style={{ padding: '12px 0', color: 'var(--c-text)' }}>{viewingFamily.createdAt ? new Date(viewingFamily.createdAt).toLocaleDateString() : '-'}</td>
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