import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSermons } from '../../api/sermonApi';
import { fetchMinistries } from '../../api/ministryApi';
import { fetchSmallGroups } from '../../api/smallGroupApi';
import { fetchMembers } from '../../api/memberApi';
import { Button } from '../../components/common/Button';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    members: 0,
    ministries: 0,
    smallGroups: 0,
    sermons: 0,
  });
  const [recentSermons, setRecentSermons] = useState<any[]>([]);
  const [recentGroups, setRecentGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [membersRes, ministriesRes, groupsRes, sermonsRes] = await Promise.all([
        fetchMembers(),
        fetchMinistries(),
        fetchSmallGroups(),
        fetchSermons()
      ]);

      setStats({
        members: membersRes.data?.length || 0,
        ministries: ministriesRes.data?.length || 0,
        smallGroups: groupsRes.data?.length || 0,
        sermons: sermonsRes.data?.length || 0,
      });

      setRecentSermons(sermonsRes.data?.slice(0, 5) || []);
      setRecentGroups(groupsRes.data?.slice(0, 5) || []);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const quickActions = [
    { label: 'New Sermon', path: '/sermons' },
    { label: 'New Ministry', path: '/ministries' },
    { label: 'New Small Group', path: '/small-groups' },
    { label: 'New Member', path: '/members' },
  ];

  return (
    <div>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: '700', color: '#f1f5f9', marginBottom: '8px' }}>
          Church Dashboard
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '17px' }}>
          Overview • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Statistics Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
        gap: '24px', 
        marginBottom: '40px' 
      }}>
        <div style={{ backgroundColor: '#18181b', padding: '28px', borderRadius: '12px', border: '1px solid #27272a' }}>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '12px' }}>Total Members</p>
          <h2 style={{ fontSize: '48px', fontWeight: '700', color: '#22d3ee' }}>{stats.members}</h2>
        </div>

        <div style={{ backgroundColor: '#18181b', padding: '28px', borderRadius: '12px', border: '1px solid #27272a' }}>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '12px' }}>Ministries</p>
          <h2 style={{ fontSize: '48px', fontWeight: '700', color: '#a855f7' }}>{stats.ministries}</h2>
        </div>

        <div style={{ backgroundColor: '#18181b', padding: '28px', borderRadius: '12px', border: '1px solid #27272a' }}>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '12px' }}>Small Groups</p>
          <h2 style={{ fontSize: '48px', fontWeight: '700', color: '#ec4899' }}>{stats.smallGroups}</h2>
        </div>

        <div style={{ backgroundColor: '#18181b', padding: '28px', borderRadius: '12px', border: '1px solid #27272a' }}>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '12px' }}>Sermons Preached</p>
          <h2 style={{ fontSize: '48px', fontWeight: '700', color: '#eab308' }}>{stats.sermons}</h2>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '18px', color: '#f1f5f9', fontSize: '20px' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {quickActions.map((action, index) => (
            <Button
              key={index}
              onClick={() => navigate(action.path)}
              style={{
                padding: '20px 24px',
                fontSize: '15.5px',
                fontWeight: '600',
                height: 'auto',
                textAlign: 'left',
                justifyContent: 'flex-start'
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Recent Sermons */}
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Recent Sermons</h3>
          {recentSermons.length === 0 ? (
            <p style={{ color: '#a1a1aa' }}>No sermons recorded yet</p>
          ) : (
            recentSermons.map(sermon => (
              <div key={sermon.id} style={{ padding: '14px 0', borderBottom: '1px solid #27272a' }}>
                <strong>{sermon.title}</strong>
                <p style={{ color: '#a1a1aa', fontSize: '14px', marginTop: '4px' }}>
                  {sermon.datePreached ? new Date(sermon.datePreached).toLocaleDateString() : ''} • 
                  {sermon.speaker ? ` ${sermon.speaker.firstName} ${sermon.speaker.lastName}` : ''}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Recent Small Groups */}
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Recent Small Groups</h3>
          {recentGroups.length === 0 ? (
            <p style={{ color: '#a1a1aa' }}>No small groups yet</p>
          ) : (
            recentGroups.map(group => (
              <div key={group.id} style={{ padding: '14px 0', borderBottom: '1px solid #27272a' }}>
                <strong>{group.name}</strong>
                <p style={{ color: '#a1a1aa', fontSize: '14px', marginTop: '4px' }}>
                  {group.parentMinistry?.name || group.ministry?.name || 'No Ministry'} • {group.meetingDay}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}