const API_BASE = 'http://localhost:3000/auth';

export const login = async (email: string, password: string) => {
  const res = await fetch(`${API_BASE}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  credentials: 'include', 
});

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Login failed');
  }

  const data = await res.json();
  return data.token as string;
};

export const getProfile = async (token: string) => {
  const res = await fetch(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
};