const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/auth`;

export const login = async (email: string, password: string) => {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
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