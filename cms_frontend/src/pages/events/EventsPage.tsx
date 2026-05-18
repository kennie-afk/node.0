import { useState, useEffect } from 'react';
import type { Event } from '../../api/eventApi';
import { fetchEvents, deleteEvent } from '../../api/eventApi';
import AddEventForm from '../../components/forms/AddEventForm';
import { EventTable } from '../../components/tables/EventTable';

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Edit mode
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetchEvents();
      setEvents(res.data || res || []);
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
      setError(err.response?.data?.message || 'Failed to delete event');
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setShowEditForm(true);
  };

  useEffect(() => {
    loadEvents();
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
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>Events Management</h1>
          <p style={{ color: '#a1a1aa', margin: '4px 0 0 0' }}>Manage church events and programs</p>
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
          {showAddForm ? 'Cancel' : '+ Add New Event'}
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
      {showAddForm && <AddEventForm onEventAdded={handleEventAdded} />}

      {/* Edit Form */}
      {showEditForm && editingEvent && (
        <AddEventForm 
          onEventAdded={handleEventUpdated} 
          initialData={editingEvent} 
          isEdit={true} 
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: '#a1a1aa' }}>Loading events...</div>
      ) : (
        <div className="card">
          <EventTable 
            events={events} 
            onDelete={handleDelete} 
            onEdit={handleEdit}
          />
        </div>
      )}
    </div>
  );
}