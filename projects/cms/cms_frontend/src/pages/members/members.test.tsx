import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MemberProfilePage from './MemberProfilePage';
import MembersPage from './MembersPage';
import { AuthProvider } from '../../context/AuthContext';
import { writeSession } from '../../api/session';

const calls: string[] = [];
const profileBody: { value: unknown } = { value: null };
vi.mock('../../api/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/http')>();
  return {
    ...real,
    http: {
      ...real.http,
      get: (path: string, query?: Record<string, unknown>) => {
        calls.push(`${path}?${JSON.stringify(query ?? {})}`);
        if (path.endsWith('/profile')) return Promise.resolve(profileBody.value);
        if (path === '/members') return Promise.resolve({ data: [{ id: 3, firstName: 'Amina', lastName: 'Wanjiru', status: 'Active', membershipDate: '2024-01-01', createdAt: '2024-01-01' }], nextCursor: null, limit: 25 });
        return Promise.resolve({ data: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
      }
    }
  };
});

function tokenFor(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}
function signIn(grants: string[]) {
  writeSession(tokenFor({ id: 1, email: 'sam@church.test', churchId: 1, role: 'X' }), 3600, 1, grants, 'Custom role');
}
beforeEach(() => { localStorage.clear(); calls.length = 0; });

const base = {
  member: { id: 3, firstName: 'Amina', lastName: 'Wanjiru', status: 'Active', membershipDate: '2024-01-01', city: 'Nairobi', createdAt: '2024-01-01' },
  familyMembers: [], ministries: [{ id: 1, name: 'Choir', role: 'Alto' }], smallGroups: [],
  attendance: { last90Days: 4, recent: [] }
};

describe('member profile', () => {
  it('shows giving and care only when the server sent them', async () => {
    signIn(['members:read', 'giving:read']);
    profileBody.value = { ...base, giving: { giftCount: 2, totalMinor: 150000, lastGiftAt: '2025-01-01', recent: [] }, care: null };
    render(<MemoryRouter initialEntries={['/members/3']}><AuthProvider><Routes><Route path="/members/:id" element={<MemberProfilePage />} /></Routes></AuthProvider></MemoryRouter>);
    expect(await screen.findByText('Choir')).toBeTruthy();
    expect(screen.getByText(/2 gifts/)).toBeTruthy();
    expect(screen.queryByText('Care notes')).toBeNull();
  });
});

describe('members list', () => {
  it('asks the server for the filtered cursor page and links each person to the profile', async () => {
    signIn(['members:read']);
    render(<MemoryRouter><AuthProvider><MembersPage /></AuthProvider></MemoryRouter>);
    const link = await screen.findByRole('link', { name: /Amina Wanjiru/ });
    expect(link.getAttribute('href')).toBe('/members/3');
    await waitFor(() => expect(calls.some((c) => c.startsWith('/members?') && c.includes('"limit":25'))).toBe(true));
    expect(screen.queryByRole('button', { name: 'New member' })).toBeNull();
  });
});
