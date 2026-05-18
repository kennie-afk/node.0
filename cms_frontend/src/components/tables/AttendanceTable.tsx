// src/components/tables/AttendanceTable.tsx
import type { Attendance } from '../../api/attendanceApi';
import { Button } from '../common/Button';

interface Props {
  attendance: Attendance[];
  onDelete: (id: number) => void;
  onEdit: (record: Attendance) => void;
  onViewEvent: (eventId: number) => void;
  onViewSermon: (sermonId: number) => void;
  activeTab?: 'general' | 'event' | 'sermon';
}

export function AttendanceTable({ 
  attendance, 
  onDelete, 
  onEdit, 
  onViewEvent, 
  onViewSermon,
  activeTab = 'general'
}: Props) {
  if (attendance.length === 0) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>No attendance records found</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ minWidth: '980px' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Attendee</th>
            <th>Type</th>
            <th>Event</th>
            <th>Sermon</th>
            <th style={{ width: '260px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map(record => (
            <tr key={record.id}>
              <td>{new Date(record.attendanceDate).toLocaleDateString()}</td>

              <td>
                {record.attendeeMember ? (
                  <strong>{record.attendeeMember.firstName} {record.attendeeMember.lastName}</strong>
                ) : (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    backgroundColor: '#166534',
                    color: '#86efac',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}>
                    Guest
                  </span>
                )}
                {record.guestName && !record.attendeeMember && ` (${record.guestName})`}
              </td>

              <td>{record.attendanceType}</td>

              <td>
                {record.attendedEvent ? record.attendedEvent.name : 
                  (activeTab === 'general' || activeTab === 'sermon') ? '-' : '—'}
              </td>

              <td>
                {record.attendedSermon ? record.attendedSermon.title : 
                  (activeTab === 'general' || activeTab === 'event') ? '-' : '—'}
              </td>

              <td>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <Button variant="primary" size="sm" onClick={() => onEdit(record)}>
                    Edit
                  </Button>

                  {record.eventId && (
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => onViewEvent(record.eventId!)}
                    >
                      View
                    </Button>
                  )}

                  {record.sermonId && (
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => onViewSermon(record.sermonId!)}
                    >
                      View
                    </Button>
                  )}

                  <Button variant="danger" size="sm" onClick={() => onDelete(record.id)}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}