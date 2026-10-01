import { useState, useEffect } from 'react';
import type { Event } from '../../api/eventApi';
import { fetchEvents, deleteEvent } from '../../api/eventApi';
import BackButton from '../../components/common/BackButton';
import AddEventForm from '../../components/forms/AddEventForm';
import { EventTable } from '../../components/tables/EventTable';
import { describeError } from '../../api/errors';

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetchEvents();
      setEvents(res);
    } catch (err: any) {
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleEventAdded = () => {
    setSuccess('Event added successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowAddForm(false);
    loadEvents();
  };

  const handleEventUpdated = () => {
    setSuccess('Event updated successfully');
    setTimeout(() => setSuccess(''), 3000);
    setShowEditForm(false);
    setEditingEvent(null);
    loadEvents();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteEvent(id);
      setSuccess('Event deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      loadEvents();
    } catch (err: any) {
      setError(describeError(err, 'Failed to delete event'));
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setShowEditForm(true);
    setShowAddForm(false);
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setShowEditForm(false);
    setEditingEvent(null);
  };

  useEffect(() => {
    loadEvents();
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
          <h1 style={{ fontSize: '16.5px', fontWeight: '700', margin: 0 }}>Events Management</h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>Manage church events and programs</p>
        </div>

        <button 
          onClick={() => {
            setShowAddForm(!showAddForm);
            setShowEditForm(false);
            setEditingEvent(null);
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
          {showAddForm ? 'Cancel' : '+ Add New Event'}
        </button>
      </div>

      {error && (
        <div style={{ 
          color: 'var(--c-bad)', 
          padding: '12px', 
          background: 'var(--c-bad-bg)', 
          borderRadius: '6px', 
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          color: 'var(--c-ok)', 
          padding: '12px', 
          background: 'var(--c-ok-bg)', 
          borderRadius: '6px', 
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          {success}
        </div>
      )}

      {showAddForm && <AddEventForm onEventAdded={handleEventAdded} onCancel={handleCancelForm} />}

      {showEditForm && editingEvent && (
        <AddEventForm 
          onEventAdded={handleEventUpdated} 
          initialData={editingEvent} 
          isEdit={true} 
          onCancel={handleCancelForm}
        />
      )}

      {!showAddForm && !showEditForm && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--c-muted)' }}>Loading events...</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <EventTable 
                events={events} 
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