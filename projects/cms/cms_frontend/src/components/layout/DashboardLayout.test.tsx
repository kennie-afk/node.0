import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import { AuthProvider } from '../../context/AuthContext';
import { writeSession } from '../../api/session';
import { RequirePermission } from '../../auth/RequirePermission';

// The server owns roles and what they may do; these stand in for its sign-in response.
const ALL = ['members:read', 'members:write', 'giving:read', 'giving:write', 'finance:read', 'finance:post', 'finance:approve', 'finance:close', 'finance:settings', 'payroll:read', 'payroll:run', 'payroll:approve', 'audit:read', 'care:read', 'care:write', 'comms:send', 'users:manage'];
const LABELS: Record<string, string> = { ADMIN: 'Administrator', TREASURER: 'Treasurer' };
const GRANTS: Record<string, string[]> = {
  ADMIN: ALL,
  TREASURER: ['members:read', 'giving:read', 'giving:write', 'finance:read', 'finance:post', 'finance:close', 'payroll:read', 'payroll:run']
};

function tokenFor(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

function mount(role: string, path = '/dashboard') {
  writeSession(tokenFor({ id: 1, email: `${role.toLowerCase()}@church.test`, churchId: 1, role, isAdmin: role === 'ADMIN' }), 3600, 1, GRANTS[role] ?? [], LABELS[role]);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<p>dash page</p>} />
            <Route path="/users" element={<RequirePermission permission="users:manage"><p>users page</p></RequirePermission>} />
            <Route path="/members" element={<p>members page</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
});

describe('the data-driven shell', () => {
  it('renders the registry groups and marks the current page', () => {
    mount('ADMIN');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('button', { name: /Worship & Events/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveClass('is-active');
    expect(within(nav).getByRole('link', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('hides items a role may not use and shows the guard message on a direct visit', () => {
    mount('TREASURER', '/users');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Contributions' })).toBeInTheDocument();
    expect(screen.getByText('You do not have access to this page')).toBeInTheDocument();
    expect(screen.queryByText('users page')).not.toBeInTheDocument();
  });

  it('collapses a group and remembers it', async () => {
    mount('ADMIN');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await userEvent.click(within(nav).getByRole('button', { name: /People/ }));
    expect(within(nav).queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('navClosedGroups') ?? '{}').people).toBe(true);
  });

  it('collapses the sidebar to a rail of labelled icons', async () => {
    mount('ADMIN');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Members' })).toBeInTheDocument();
    expect(screen.queryByText('Church CMS')).not.toBeInTheDocument();
  });
});
