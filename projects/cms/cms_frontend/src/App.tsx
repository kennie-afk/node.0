import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import LoginPage from './pages/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import UsersPage from './pages/users/UsersPage';
import FamiliesPage from './pages/families/FamiliesPage';
import MembersPage from './pages/members/MembersPage';
import EventsPage from './pages/events/EventsPage';
import AnnouncementsPage from './pages/announcements/AnnouncementsPage';
import SermonsPage from './pages/sermons/SermonsPage';
import ContributionsPage from './pages/contributions/ContributionsPage';
import AttendancePage from './pages/attendance/AttendancePage';
import EventAttendancePage from './pages/attendance/EventAttendancePage';
import SermonAttendancePage from './pages/attendance/SermonAttendancePage';
import MinistriesPage from './pages/ministries/MinistriesPage';
import SmallGroupsPage from './pages/small-groups/SmallGroupsPage';

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} 
      />

      <Route 
        element={isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" replace />} 
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/families" element={<FamiliesPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/sermons" element={<SermonsPage />} />
        <Route path="/contributions" element={<ContributionsPage />} />
        <Route path="/ministries" element={<MinistriesPage />} />
        <Route path="/small-groups" element={<SmallGroupsPage />} />

        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/attendance/event" element={<EventAttendancePage />} />
        <Route path="/attendance/sermon" element={<SermonAttendancePage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;