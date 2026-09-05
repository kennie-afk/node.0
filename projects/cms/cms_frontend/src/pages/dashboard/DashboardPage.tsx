import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, 
  Users, 
  Users2, 
  UserCircle, 
  BookOpen, 
  Megaphone, 
  Calendar,
  ChevronDown
} from 'lucide-react';
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

      const announcements = annRes;
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentAnns = announcements.filter((a: any) => 
        a.createdAt && new Date(a.createdAt) > sixHoursAgo
      );

      setStats({
        members: membersRes.length,
        ministries: ministriesRes.length,
        smallGroups: groupsRes.length,
        sermons: sermonsRes.length,
        announcements: announcements.length,
        events: eventsRes.length,
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
    { title: "Members", count: stats.members, path: "/members", desc: "Manage church members", icon: Users, color: "#ec4899" },
    { title: "Ministries", count: stats.ministries, path: "/ministries", desc: "Departments & ministries", icon: Users2, color: "#a855f7" },
    { title: "Small Groups", count: stats.smallGroups, path: "/small-groups", desc: "Cell groups", icon: UserCircle, color: "#06b6d4" },
    { title: "Sermons", count: stats.sermons, path: "/sermons", desc: "Teachings & sermons", icon: BookOpen, color: "#eab308" },
    { title: "Announcements", count: stats.announcements, path: "/announcements", desc: "Church notices", icon: Megaphone, color: "#f87171", badge: newAnnCount > 0 ? newAnnCount : null },
    { title: "Events", count: stats.events, path: "/events", desc: "Upcoming events", icon: Calendar, color: "#22d3ee" },
  ];

  const quickActions = [
    { label: "New Sermon", path: "/sermons" },
    { label: "New Ministry", path: "/ministries" },
    { label: "New Small Group", path: "/small-groups" },
    { label: "New Member", path: "/members" },
    { label: "New Announcement", path: "/announcements" },
    { label: "New Event", path: "/events" },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '80px 20px', color: '#a1a1aa' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: 'clamp(24px, 5vw, 32px)', 
          fontWeight: '700', 
          color: '#ffffff', 
          marginBottom: '8px' 
        }}>
          Church Dashboard
        </h1>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div 
            style={{
              backgroundColor: '#18181b',
              borderRadius: '8px',
              padding: '10px 20px',
              display: 'inline-block',
              transition: 'all 0.2s ease',
              cursor: 'default'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#18181b';
            }}
          >
            <p style={{
              fontSize: 'clamp(14px, 3.5vw, 15px)',
              fontWeight: '500',
              color: '#ec4899',
              margin: 0
            }}>
              {currentDate}
            </p>
          </div>

          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#f1f5f9',
                borderRadius: '8px',
                fontWeight: '500',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)';
                e.currentTarget.style.color = '#ec4899';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#f1f5f9';
              }}
            >
              Quick Actions
              <ChevronDown size={14} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>

            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                minWidth: '160px',
                width: 'max-content',
                maxWidth: 'calc(100vw - 32px)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                zIndex: 10,
                overflow: 'hidden',
                marginTop: '4px'
              }}>
                {quickActions.map((action, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      navigate(action.path);
                      setDropdownOpen(false);
                    }}
                    style={{
                      padding: '10px 16px',
                      color: '#a1a1aa',
                      fontSize: '13.5px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)';
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: '20px' 
      }}>
        {modules.map((module, i) => {
          const Icon = module.icon;
          return (
            <div 
              key={i}
              onClick={() => navigate(module.path)}
              style={{
                backgroundColor: '#18181b',
                borderRadius: '12px',
                border: '1px solid #27272a',
                padding: '32px 24px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = module.color;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#27272a';
              }}
            >
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: `${module.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                <Icon size={32} color={module.color} strokeWidth={1.5} />
              </div>
              
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px', color: '#f1f5f9' }}>{module.title}</h3>
                <p style={{ color: '#a1a1aa', fontSize: '13px' }}>{module.desc}</p>
              </div>

              <div style={{ fontSize: '48px', fontWeight: '700', color: module.color, margin: '16px 0' }}>
                {module.count}
              </div>

              {module.badge && module.badge > 0 && (
                <div style={{
                  marginTop: '8px',
                  display: 'inline-block',
                  padding: '3px 10px',
                  backgroundColor: '#f87171',
                  color: 'white',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {module.badge} New
                </div>
              )}

              <div 
                style={{
                  marginTop: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: module.color,
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textDecoration: 'none'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = module.color;
                }}
                onClick={(e) => { e.stopPropagation(); navigate(module.path); }}
              >
                View {module.title}
                <ArrowRight size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}