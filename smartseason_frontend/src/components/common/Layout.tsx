import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { LogOut, Home, MapPin } from 'lucide-react';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold tracking-tight">SmartSeason</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-700 font-medium"
          >
            <Home size={20} />
            Dashboard
          </Link>
          <Link
            to="/fields"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-100 text-zinc-700 font-medium"
          >
            <MapPin size={20} />
            Fields
          </Link>
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="font-medium text-sm">{user?.name}</p>
              <p className="text-xs text-zinc-500">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-100 rounded-lg"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;