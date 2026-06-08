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
  ChevronDown,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DashboardLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
  
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const sidebarWidth = isSidebarCollapsed ? '80px' : '280px';
  
  const navItemStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
    gap: isSidebarCollapsed ? '0' : '14px',
    padding: isSidebarCollapsed ? '12px' : '12px 20px',
    color: '#cbd5e1',
    textDecoration: 'none',
    fontSize: '14px',
    borderRadius: '8px',
    marginBottom: '4px',
    transition: 'all 0.2s ease',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  } as const;

  const subNavItemStyle = {
    display: 'block',
    padding: isSidebarCollapsed ? '10px' : '8px 20px',
    paddingLeft: isSidebarCollapsed ? '10px' : '44px',
    color: '#a1a1aa',
    textDecoration: 'none',
    fontSize: '13px',
    borderRadius: '8px',
    marginBottom: '2px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    textAlign: isSidebarCollapsed ? 'center' : 'left',
    whiteSpace: isSidebarCollapsed ? 'normal' : 'nowrap',
    wordBreak: isSidebarCollapsed ? 'break-word' : 'normal'
  } as const;

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
      <button
        onClick={toggleMobileMenu}
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 1001,
          background: '#18181b',
          border: '1px solid #27272a',
          color: 'white',
          width: '44px',
          height: '44px',
          borderRadius: '8px',
          display: window.innerWidth <= 768 ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}
      >
        {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <div
        className="sidebar-scroll"
        style={{
          width: sidebarWidth,
          backgroundColor: '#18181b',
          borderRight: '1px solid #27272a',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxShadow: '2px 0 12px rgba(0, 0, 0, 0.25)',
          position: 'fixed',
          left: isMobileMenuOpen ? '0' : (window.innerWidth <= 768 ? `-${sidebarWidth}` : '0'),
          top: 0,
          transition: 'left 0.3s ease, width 0.2s ease',
          zIndex: 1000,
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        <div style={{
          padding: isSidebarCollapsed ? '20px 12px' : '24px 20px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'space-between'
        }}>
          {!isSidebarCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: 'linear-gradient(135deg, #ec4899, #a855f7)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '22px', fontWeight: '900', color: 'white' }}>C</span>
              </div>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#f1f5f9', margin: 0 }}>Church CMS</h1>
              </div>
            </div>
          )}
          {isSidebarCollapsed && (
            <div style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #ec4899, #a855f7)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto'
            }}>
              <span style={{ fontSize: '22px', fontWeight: '900', color: 'white' }}>C</span>
            </div>
          )}
          
          <button
            onClick={toggleSidebar}
            style={{
              background: 'transparent',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              color: '#a1a1aa',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = '#ec4899'; e.currentTarget.style.color = '#ec4899'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = '#3f3f46'; e.currentTarget.style.color = '#a1a1aa'; }}
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav style={{ flex: 1, padding: isSidebarCollapsed ? '16px 8px' : '20px 12px' }}>
          <Link 
            to="/dashboard" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <LayoutDashboard size={20} />
            {!isSidebarCollapsed && <span>Dashboard</span>}
          </Link>

          <Link 
            to="/users" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <Users size={20} />
            {!isSidebarCollapsed && <span>Users</span>}
          </Link>

          <Link 
            to="/families" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <Home size={20} />
            {!isSidebarCollapsed && <span>Families</span>}
          </Link>

          <Link 
            to="/members" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <User size={20} />
            {!isSidebarCollapsed && <span>Members</span>}
          </Link>

          <Link 
            to="/events" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <Calendar size={20} />
            {!isSidebarCollapsed && <span>Events</span>}
          </Link>

          <div>
            <div 
              onClick={() => setIsAttendanceOpen(!isAttendanceOpen)}
              style={navItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
            >
              <CheckSquare size={20} />
              {!isSidebarCollapsed && (
                <>
                  <span style={{ flex: 1 }}>Attendance</span>
                  <ChevronDown size={16} style={{ transition: 'transform 0.2s ease', transform: isAttendanceOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </>
              )}
            </div>

            {isAttendanceOpen && !isSidebarCollapsed && (
              <div style={{ marginTop: '4px' }}>
                <Link 
                  to="/attendance" 
                  style={subNavItemStyle}
                  onClick={closeMobileMenu}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  General Attendance
                </Link>
                <Link 
                  to="/attendance/event" 
                  style={subNavItemStyle}
                  onClick={closeMobileMenu}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Event Attendance
                </Link>
                <Link 
                  to="/attendance/sermon" 
                  style={subNavItemStyle}
                  onClick={closeMobileMenu}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ec4899'; e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#a1a1aa'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  Sermon Attendance
                </Link>
              </div>
            )}
          </div>

          <Link 
            to="/announcements" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <Bell size={20} />
            {!isSidebarCollapsed && <span>Announcements</span>}
          </Link>

          <Link 
            to="/sermons" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <BookOpen size={20} />
            {!isSidebarCollapsed && <span>Sermons</span>}
          </Link>

          <Link 
            to="/contributions" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <DollarSign size={20} />
            {!isSidebarCollapsed && <span>Contributions</span>}
          </Link>

          <Link 
            to="/ministries" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <Users2 size={20} />
            {!isSidebarCollapsed && <span>Ministries</span>}
          </Link>

          <Link 
            to="/small-groups" 
            style={navItemStyle}
            onClick={closeMobileMenu}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(236, 72, 153, 0.1)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <GroupIcon size={20} />
            {!isSidebarCollapsed && <span>Small Groups</span>}
          </Link>
        </nav>

        <div style={{ padding: isSidebarCollapsed ? '20px 12px' : '24px', borderTop: '1px solid #27272a' }}>
          <button 
            onClick={() => {
              handleLogout();
              closeMobileMenu();
            }}
            style={{
              width: '100%',
              padding: isSidebarCollapsed ? '12px' : '12px',
              backgroundColor: 'transparent',
              border: '1px solid #f87171',
              color: '#f87171',
              borderRadius: '8px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isSidebarCollapsed ? '0' : '8px'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.1)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <LogOut size={18} />
            {!isSidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </div>

      <div style={{ 
        flex: 1, 
        marginLeft: isMobileMenuOpen ? sidebarWidth : (window.innerWidth <= 768 ? '0' : sidebarWidth),
        overflow: 'auto', 
        padding: window.innerWidth <= 768 ? '70px 16px 16px' : '32px 40px',
        backgroundColor: '#0a0a0f',
        transition: 'margin-left 0.3s ease'
      }}>
        <Outlet />
      </div>

      {isMobileMenuOpen && (
        <div 
          onClick={closeMobileMenu}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 999
          }}
        />
      )}
    </div>
  );
}