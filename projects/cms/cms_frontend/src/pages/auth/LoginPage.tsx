import { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useNavigate } from 'react-router-dom';
import { describeError } from '../../api/errors';
import { ThemeSwitch } from '../../ui/ThemeSwitch';
import { usePublicRoles } from '../../api/rolesApi';

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
    } catch (err: any) {
      setError(describeError(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--c-bg)',
      padding: '16px'
    }}>
      <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
        <ThemeSwitch label />
      </div>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        backgroundColor: 'var(--c-surface)',
        padding: 'clamp(24px, 5vw, 32px)',
        borderRadius: '6px',
        border: '1px solid var(--c-border)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--c-text)', margin: '0 0 4px' }}>
            Church CMS
          </h1>
          <p style={{ color: 'var(--c-muted)', fontSize: '11.5px' }}>Sign in to manage the Church</p>
        </div>

        {DEMO_LOGINS && (
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="demo-role" style={{ display: 'block', marginBottom: '6px', color: 'var(--c-muted)', fontSize: '10.5px', fontWeight: 500 }}>Sign in as</label>
            <select
              id="demo-role"
              defaultValue=""
              disabled={loading}
              onChange={(e) => {
                const role = e.target.value;
                if (!role) return;
                setEmail(demoEmail(role));
                setPassword(DEMO_PASSWORD);
                void signIn(demoEmail(role), DEMO_PASSWORD);
              }}
              style={{ width: '100%', padding: '10px 14px', backgroundColor: 'var(--c-fill)', border: '1px solid var(--c-border-strong)', borderRadius: '6px', color: 'var(--c-text)', fontSize: '12px', boxSizing: 'border-box' }}
            >
              <option value="">Choose a role</option>
              {roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--c-muted)', fontSize: '10.5px', fontWeight: '500' }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: 'var(--c-fill)',
                border: '1px solid var(--c-border-strong)',
                borderRadius: '6px',
                color: 'var(--c-text)',
                fontSize: '12px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--c-muted)', fontSize: '10.5px', fontWeight: '500' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: 'var(--c-fill)',
                border: '1px solid var(--c-border-strong)',
                borderRadius: '6px',
                color: 'var(--c-text)',
                fontSize: '12px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && <p style={{ color: 'var(--c-bad)', textAlign: 'center', fontSize: '10.5px' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '4px',
              padding: '10px',
              background: 'var(--c-accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}