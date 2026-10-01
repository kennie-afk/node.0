import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/auth-context';

import LoginPage from './pages/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import { financeRoutes } from './routes/finance.routes';
import { opsRoutes } from './routes/ops.routes';
import { lazyPage } from './routes/lazy';

/** Members land on their own portal; staff land on the dashboard. */
function Home() {
  const { role } = useAuth();
  return <Navigate to={role === 'MEMBER' ? '/me' : '/dashboard'} replace />;
}

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} 
      />

      <Route 
        element={isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" replace />} 
      >
        <Route path="/dashboard" element={lazyPage(() => import('./pages/dashboard/DashboardPage'), 'members:read')} />
        <Route path="/users" element={lazyPage(() => import('./pages/users/UsersPage'), 'users:manage')} />
        <Route path="/roles" element={lazyPage(() => import('./pages/roles/RolesPage'), 'users:manage')} />
        <Route path="/families" element={lazyPage(() => import('./pages/families/FamiliesPage'), 'members:read')} />
        <Route path="/members" element={lazyPage(() => import('./pages/members/MembersPage'), 'members:read')} />
        <Route path="/events" element={lazyPage(() => import('./pages/events/EventsPage'), 'members:read')} />
        <Route path="/announcements" element={lazyPage(() => import('./pages/announcements/AnnouncementsPage'), 'members:read')} />
        <Route path="/sermons" element={lazyPage(() => import('./pages/sermons/SermonsPage'), 'members:read')} />
        <Route path="/contributions" element={lazyPage(() => import('./pages/contributions/ContributionsPage'), 'giving:read')} />
        <Route path="/ministries" element={lazyPage(() => import('./pages/ministries/MinistriesPage'), 'members:read')} />
        <Route path="/small-groups" element={lazyPage(() => import('./pages/small-groups/SmallGroupsPage'), 'members:read')} />

        <Route path="/attendance" element={lazyPage(() => import('./pages/attendance/AttendancePage'), 'members:read')} />
        <Route path="/attendance/event" element={lazyPage(() => import('./pages/attendance/EventAttendancePage'), 'members:read')} />
        <Route path="/attendance/sermon" element={lazyPage(() => import('./pages/attendance/SermonAttendancePage'), 'members:read')} />

        {financeRoutes}
        {opsRoutes}
        {import.meta.env.DEV && <Route path="/ui-kit" element={lazyPage(() => import('./ui/UIKitPage'))} />}
      </Route>

      <Route path="/" element={<Home />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;