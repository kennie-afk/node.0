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
      <table className="table" style={{ minWidth: activeTab === 'general' ? '900px' : '700px' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Attendee</th>
            <th>Type</th>
            {activeTab !== 'sermon' && <th>Event</th>}
            {activeTab !== 'event' && <th>Sermon</th>}
            <th style={{ width: '240px' }}>Actions</th>
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
              {activeTab !== 'sermon' && (
                <td>{record.attendedEvent ? record.attendedEvent.name : '-'}</td>
              )}
              {activeTab !== 'event' && (
                <td>{record.attendedSermon ? record.attendedSermon.title : '-'}</td>
              )}
              <td>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <Button variant="primary" size="sm" onClick={() => onEdit(record)} style={{ padding: '4px 10px', fontSize: '12px' }}>
                    Edit
                  </Button>

                  {record.eventId && activeTab !== 'sermon' && (
                    <Button variant="primary" size="sm" onClick={() => onViewEvent(record.eventId!)} style={{ padding: '4px 10px', fontSize: '12px' }}>
                      View
                    </Button>
                  )}

                  {record.sermonId && activeTab !== 'event' && (
                    <Button variant="primary" size="sm" onClick={() => onViewSermon(record.sermonId!)} style={{ padding: '4px 10px', fontSize: '12px' }}>
                      View
                    </Button>
                  )}

                  <Button variant="danger" size="sm" onClick={() => onDelete(record.id)} style={{ padding: '4px 10px', fontSize: '12px' }}>
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