import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMembers } from '../../api/memberApi';
import { fetchMinistries } from '../../api/ministryApi';
import { fetchSmallGroups } from '../../api/smallGroupApi';
import { fetchSermons } from '../../api/sermonApi';
import { fetchAnnouncements } from '../../api/announcementApi';
import { fetchEvents } from '../../api/eventApi';

export default function DashboardPage() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    members: 0,
    ministries: 0,
    smallGroups: 0,
    sermons: 0,
    announcements: 0,
    events: 0,
  });

  const [newAnnCount, setNewAnnCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const [membersRes, ministriesRes, groupsRes, sermonsRes, annRes, eventsRes] = await Promise.all([
        fetchMembers(),
        fetchMinistries(),
        fetchSmallGroups(),
        fetchSermons(),
        fetchAnnouncements(),
        fetchEvents()
      ]);

      const announcements = annRes.data || annRes || [];
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentAnns = announcements.filter((a: any) => 
        a.createdAt && new Date(a.createdAt) > sixHoursAgo
      );

      setStats({
        members: membersRes.data?.length || membersRes.length || 0,
        ministries: ministriesRes.data?.length || ministriesRes.length || 0,
        smallGroups: groupsRes.data?.length || groupsRes.length || 0,
        sermons: sermonsRes.data?.length || sermonsRes.length || 0,
        announcements: announcements.length,
        events: eventsRes.data?.length || eventsRes.length || 0,
      });

      setNewAnnCount(recentAnns.length);
    } catch (err) {
      console.error('Dashboard loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    
    const closeDropdown = () => setDropdownOpen(false);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, []);

  const modules = [
    { title: "Members", count: stats.members, color: "#22d3ee", path: "/members", desc: "Manage church members" },
    { title: "Ministries", count: stats.ministries, color: "#a855f7", path: "/ministries", desc: "Departments & ministries" },
    { title: "Small Groups", count: stats.smallGroups, color: "#ec4899", path: "/small-groups", desc: "Cell groups" },
    { title: "Sermons", count: stats.sermons, color: "#eab308", path: "/sermons", desc: "Teachings & sermons" },
    { title: "Announcements", count: stats.announcements, color: "#f87171", path: "/announcements", desc: "Church notices", badge: newAnnCount },
    { title: "Events", count: stats.events, color: "#06b6d4", path: "/events", desc: "Upcoming events" },
  ];

  const quickActions = [
    { label: "+ New Sermon", path: "/sermons" },
    { label: "+ New Ministry", path: "/ministries" },
    { label: "+ New Small Group", path: "/small-groups" },
    { label: "+ New Member", path: "/members" },
    { label: "+ New Announcement", path: "/announcements" },
    { label: "+ New Event", path: "/events" },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '120px', color: '#a1a1aa' }}>Loading dashboard...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '38px', fontWeight: '700', color: '#ffffff', marginBottom: '12px' }}>
          Church Dashboard
        </h1>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          
          <div 
            style={{
              backgroundColor: '#18181b',
              border: '1px solid transparent',
              borderRadius: '8px',
              padding: '14px 26px',
              display: 'inline-block',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.15)';
              e.currentTarget.style.borderColor = '#ec4899';
              const textElement = e.currentTarget.querySelector('p');
              if (textElement) textElement.style.color = '#ffffff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.backgroundColor = '#18181b';
              e.currentTarget.style.borderColor = 'transparent';
              const textElement = e.currentTarget.querySelector('p');
              if (textElement) textElement.style.color = '#ec4899';
            }}
          >
            <p style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#ec4899',
              margin: 0,
              letterSpacing: '0.5px',
              transition: 'color 0.3s ease'
            }}>
              {currentDate}
            </p>
          </div>

          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                padding: '14px 24px',
                backgroundColor: 'transparent',
                border: '1px solid #ec4899',
                color: '#f1f5f9',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundImage = 'linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(236, 72, 153, 0.05))';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundImage = 'none';
              }}
            >
              Quick Actions
              <span style={{ fontSize: '12px', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '120%',
                right: 0,
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                width: '220px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                zIndex: 10,
                overflow: 'hidden'
              }}>
                {quickActions.map((action, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      navigate(action.path);
                      setDropdownOpen(false);
                    }}
                    style={{
                      padding: '12px 18px',
                      color: '#a1a1aa',
                      fontSize: '14.5px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s, color 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#27272a';
                      e.currentTarget.style.color = '#ec4899'; 
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#a1a1aa';
                    }}
                  >
                    {action.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '24px' 
      }}>
        {modules.map((module, i) => (
          <div 
            key={i}
            onClick={() => navigate(module.path)}
            style={{
              backgroundColor: '#18181b',
              borderRadius: '12px',
              border: '1px solid #27272a',
              padding: '28px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.backgroundColor = `${module.color}26`; 
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.backgroundColor = '#18181b';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px' }}>{module.title}</h3>
                <p style={{ color: '#a1a1aa', fontSize: '14.5px' }}>{module.desc}</p>
              </div>
              <div style={{ fontSize: '46px', fontWeight: '700', color: module.color }}>
                {module.count}
              </div>
            </div>

            {module.badge && module.badge > 0 && (
              <div style={{
                marginTop: '12px',
                display: 'inline-block',
                padding: '4px 12px',
                backgroundColor: '#f87171',
                color: 'white',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: '600'
              }}>
                {module.badge} New
              </div>
            )}

            <button 
              style={{
                marginTop: '24px',
                width: '100%',
                padding: '12px',
                border: `1px solid ${module.color}`, 
                color: '#f1f5f9', 
                borderRadius: '8px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backgroundColor: `${module.color}1a`,
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = module.color;
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.border = `1px solid ${module.color}`;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = `${module.color}1a`;
                e.currentTarget.style.color = '#f1f5f9';
              }}
              onClick={(e) => { e.stopPropagation(); navigate(module.path); }}
            >
              Go to {module.title}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}