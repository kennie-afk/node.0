import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Home, 
  User, 
  Calendar, 
  Bell, 
  BookOpen, 
  DollarSign, 
  CheckSquare, 
  Users2, 
  Users as GroupIcon,
  ChevronDown 
} from 'lucide-react';
import { useState } from 'react';

export default function DashboardLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ 
      display: 'flex', 
      width: '100vw', 
      height: '100vh', 
      backgroundColor: '#0a0a0f', 
      overflow: 'hidden',
      margin: 0,
      padding: 0
    }}>
      {/* Sidebar */}
      <div style={{
        width: '280px',
        backgroundColor: '#18181b',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: '2px 0 12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Logo */}
        <div style={{
          padding: '32px 24px',
          borderBottom: '1px solid #27272a'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'linear-gradient(135deg, #ec4899, #a855f7)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '28px', fontWeight: '900', color: 'white' }}>C</span>
            </div>
            <div>
              <h1 style={{ fontSize: '27px', fontWeight: '700', letterSpacing: '-0.5px', color: '#f1f5f9' }}>Church CMS</h1>
              <p style={{ fontSize: '13px', color: '#a1a1aa', marginTop: '-4px' }}>Management System</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '24px 12px', overflowY: 'auto' }}>
          <Link 
            to="/dashboard" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <LayoutDashboard size={21} /> Dashboard
          </Link>

          <Link 
            to="/users" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <Users size={21} /> Users
          </Link>

          <Link 
            to="/families" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <Home size={21} /> Families
          </Link>

          <Link 
            to="/members" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <User size={21} /> Members
          </Link>

          <Link 
            to="/events" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <Calendar size={21} /> Events
          </Link>

          
          <div>
            <div 
              onClick={() => setIsAttendanceOpen(!isAttendanceOpen)}
              style={navLinkStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
                e.currentTarget.style.border = '1px solid #ec4899';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.border = '1px solid transparent';
                e.currentTarget.style.color = '#cbd5e1';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                <CheckSquare size={21} /> Attendance
              </div>
              <ChevronDown 
                size={18} 
                style={{ 
                  transition: 'transform 0.3s ease',
                  transform: isAttendanceOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                }} 
              />
            </div>

            {isAttendanceOpen && (
              <div style={{ paddingLeft: '40px', marginTop: '6px' }}>
                <Link 
                  to="/attendance" 
                  style={subNavLinkStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  General Attendance
                </Link>
                <Link 
                  to="/attendance/event" 
                  style={subNavLinkStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Event Attendance
                </Link>
                <Link 
                  to="/attendance/sermon" 
                  style={subNavLinkStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Sermon Attendance
                </Link>
              </div>
            )}
          </div>

          <Link 
            to="/announcements" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <Bell size={21} /> Announcements
          </Link>

          <Link 
            to="/sermons" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <BookOpen size={21} /> Sermons
          </Link>

          <Link 
            to="/contributions" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <DollarSign size={21} /> Contributions
          </Link>

          <Link 
            to="/ministries" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <Users2 size={21} /> Ministries
          </Link>

          <Link 
            to="/small-groups" 
            style={navLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.12)';
              e.currentTarget.style.border = '1px solid #ec4899';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <GroupIcon size={21} /> Small Groups
          </Link>
        </nav>

        {/* Logout */}
        <div style={{ padding: '24px', borderTop: '1px solid #27272a' }}>
          <button 
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '13px',
              backgroundColor: 'transparent',
              border: '1px solid #f87171',
              color: '#f87171',
              borderRadius: '8px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#3f3f46'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        overflow: 'auto', 
        padding: '32px 40px',
        backgroundColor: '#0a0a0f'
      }}>
        <Outlet />
      </div>
    </div>
  );
}

const navLinkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '13px 22px',
  color: '#cbd5e1',
  textDecoration: 'none',
  fontSize: '14.8px',
  borderRadius: '8px',
  marginBottom: '4px',
  transition: 'all 0.3s ease',
  fontWeight: '500',
  border: '1px solid transparent',
  cursor: 'pointer'
} as const;

const subNavLinkStyle = {
  display: 'block',
  padding: '10px 22px',
  color: '#a1a1aa',
  textDecoration: 'none',
  fontSize: '14px',
  borderRadius: '8px',
  marginBottom: '2px',
  transition: 'all 0.2s ease',
  cursor: 'pointer'
} as const;