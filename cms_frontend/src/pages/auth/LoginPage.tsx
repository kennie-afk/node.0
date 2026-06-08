import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0a0a0f',
      padding: '20px 16px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#18181b',
        padding: '40px 28px',
        borderRadius: '12px',
        border: '1px solid #27272a'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #ec4899, #a855f7)',
            borderRadius: '12px',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            fontWeight: '900',
            color: 'white'
          }}>
            C
          </div>
          <h1 style={{ fontSize: 'clamp(24px, 5.5vw, 28px)', fontWeight: '700', color: '#f1f5f9' }}>
            Church CMS
          </h1>
          <p style={{ color: '#a1a1aa', marginTop: '6px' }}>Sign in to manage the Church</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: '#a1a1aa', fontSize: '14px' }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '14px 16px',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: 'white',
                fontSize: '15px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: '#a1a1aa', fontSize: '14px' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '14px 16px',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: 'white',
                fontSize: '15px'
              }}
            />
          </div>

          {error && <p style={{ color: '#f87171', textAlign: 'center', fontSize: '14px' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '14px',
              background: 'linear-gradient(135deg, #ec4899, #c026d3)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '15px',
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