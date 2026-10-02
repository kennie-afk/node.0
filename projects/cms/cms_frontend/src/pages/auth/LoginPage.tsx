import { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useNavigate } from 'react-router-dom';
import { describeError } from '../../api/errors';
import { ThemeSwitch } from '../../ui/ThemeSwitch';
import { usePublicRoles } from '../../api/rolesApi';
import { BookOpen, Church, HandCoins, Users } from 'lucide-react';

// Demo sign-in picker: fills in the seeded demo account for a role. It is not a bypass, the
// password is still checked by the API. Compiled out unless the image is built with
// VITE_DEMO_LOGINS=true, and the accounts only exist where `seed-demo` has been run.
const DEMO_LOGINS = import.meta.env.VITE_DEMO_LOGINS === 'true';
const DEMO_CHURCH = import.meta.env.VITE_DEMO_CHURCH || 'grace-demo';
const DEMO_DOMAIN = import.meta.env.VITE_DEMO_DOMAIN || 'grace-demo.test';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'DemoPass-12345';
const demoEmail = (role: string) => `${role.toLowerCase()}@${DEMO_DOMAIN}`;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const roles = usePublicRoles(DEMO_CHURCH, DEMO_LOGINS);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(email, password);
  };

  const signIn = async (who: string, secret: string) => {
    setError('');
    setLoading(true);

    try {
      await login(who, secret);
      navigate('/');
    } catch (err: unknown) {
      setError(describeError(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <aside className="login-panel">
        <div className="login-brand">
          <span className="ui-brand-mark"><Church size={20} aria-hidden /></span>
          <span className="ui-side-title">Church CMS</span>
        </div>
        <div>
          <h1 className="login-headline">One quiet place for the whole life of the church.</h1>
          <p className="login-lede">Members, giving, the books, payroll and care, each with the access its role needs and nothing more.</p>
          <ul className="login-points">
            <li><Users size={18} aria-hidden /> People, families and ministries</li>
            <li><HandCoins size={18} aria-hidden /> Giving, receipts and M-Pesa</li>
            <li><BookOpen size={18} aria-hidden /> Ledger, bills and statements</li>
          </ul>
        </div>
        <p className="login-foot">Every action is recorded against a named person.</p>
      </aside>

      <main className="login-form-side">
        <div className="login-theme"><ThemeSwitch label className="ui-btn is-secondary is-sm" /></div>
        <div className="login-card">
          <h2 className="login-title">Sign in</h2>
          <p className="login-sub">Use the account your church administrator created for you.</p>

          {DEMO_LOGINS && (
            <div className="ui-field" style={{ marginBottom: 20 }}>
              <label htmlFor="demo-role" className="ui-label">Sign in as</label>
              <select
                id="demo-role"
                className="ui-input"
                defaultValue=""
                disabled={loading}
                onChange={(e) => {
                  const role = e.target.value;
                  if (!role) return;
                  setEmail(demoEmail(role));
                  setPassword(DEMO_PASSWORD);
                  void signIn(demoEmail(role), DEMO_PASSWORD);
                }}
              >
                <option value="">Choose a role</option>
                {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
              <span className="ui-hint">Demo accounts only. The password is still checked by the API.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="ui-stack" style={{ gap: 18 }}>
            <div className="ui-field">
              <label htmlFor="login-email" className="ui-label">Email address</label>
              <input id="login-email" className="ui-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="ui-field">
              <label htmlFor="login-password" className="ui-label">Password</label>
              <input id="login-password" className="ui-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {error && <p className="ui-error-text" role="alert" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{error}</p>}

            <button type="submit" disabled={loading} className="ui-btn is-primary" style={{ width: '100%', padding: '11px 16px', fontSize: 'var(--fs-base)' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
