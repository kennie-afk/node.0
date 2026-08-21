const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/auth`;

export const login = async (email: string, password: string) => {
  console.log('Attempting login to:', `${API_BASE}/login`);  

  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  console.log('Response status:', res.status);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Login error:', err);
    throw new Error(err.message || 'Login failed');
  }

  const data = await res.json();
  return data.token as string;
};