import { useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Leaf } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card p-10">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center">
                <Leaf className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">SmartSeason</h1>
            </div>
          </div>

          <h2 className="text-center text-2xl font-semibold mb-2">Welcome back</h2>
          <p className="text-center text-zinc-500 mb-8">Sign in to monitor your fields</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 border border-zinc-300 rounded-3xl focus:outline-none focus:border-zinc-400 text-base"
                required
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 border border-zinc-300 rounded-3xl focus:outline-none focus:border-zinc-400 text-base"
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-900 hover:bg-black text-white font-medium py-4 rounded-3xl transition-all disabled:opacity-70"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-zinc-500">
            Demo Credentials<br />
            <span className="font-mono text-xs">admin@smartseason.com / admin123</span><br />
            <span className="font-mono text-xs">agent@smartseason.com / agent123</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;