const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/users`;

export interface User {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export const fetchUsers = async (
  token: string,
  page = 1,
  limit = 10
): Promise<{ users: User[]; totalPages: number }> => {
  const res = await fetch(`${API_BASE}?page=${page}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to fetch users');
  }

  const data = await res.json();
  return {
    users: data.data ?? data.users ?? [],
    totalPages: data.meta?.totalPages ?? data.totalPages ?? 1,
  };
};

export const createUser = async (
  token: string,
  user: { username: string; email: string; password: string; isAdmin?: boolean }
) => {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(user),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create user');
  }

  return await res.json();
};

export const updateUser = async (
  token: string,
  id: number,
  user: { username?: string; email?: string; password?: string; isAdmin?: boolean }
) => {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(user),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update user');
  }

  return await res.json();
};

export const deleteUser = async (token: string, id: number) => {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete user');
  }

  return true;
};