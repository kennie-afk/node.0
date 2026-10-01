import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { AuthProvider } from '../../context/AuthContext';
import { writeSession } from '../../api/session';
import type { Overview } from '../../api/overviewApi';

const state: { overview: Overview } = { overview: { asOf: '2026-10-01', attention: [] } };
vi.mock('../../api/overviewApi', () => ({ getOverview: () => Promise.resolve(state.overview) }));

function tokenFor(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

function mount(grants: string[], overview: Overview) {
  state.overview = overview;
  writeSession(tokenFor({ id: 1, email: 'sam@church.test', churchId: 1, role: 'X' }), 3600, 1, grants, 'Custom role');
  return render(
    <MemoryRouter>
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.clear());

const full: Overview = {
  asOf: '2026-10-01',
  people: { members: { total: 8, joinedLast30Days: 3, joinedPreviousDays: 0 } as never, recentMembers: [{ id: 1, name: 'Wanjiku Kamau', joinedAt: '2026-09-30' }], upcomingEvents: [{ id: 1, name: 'Sunday service', location: 'Main hall', startsAt: '2026-10-04T09:00:00Z' }] },
  giving: { thisMonth: '2000.00', lastMonth: '1000.00', gifts: 2, trend: [{ month: '2026-09', gifts: 1, donors: 1, total: '1000.00' }, { month: '2026-10', gifts: 2, donors: 2, total: '2000.00' }], recent: [{ id: 5, date: '2026-10-01', amount: '1500.00', receiptNo: 'RCT-1', type: 'Tithe', donor: 'Wanjiku Kamau' }] },
  finance: { cash: '5000.00', month: { income: '2000.00', expenses: '0.00', surplus: '2000.00' }, yearToDate: { income: '2000.00', expenses: '0.00', surplus: '2000.00' }, bills: { outstanding: '900.00', overdue: '400.00', dueNext7Days: '0.00', overdueCount: 2 }, accountsPayable: '900.00' },
  attention: [{ key: 'overdue-bills', label: 'Bills overdue', count: 2, href: '/payables/bills' }]
};

describe('the dashboard', () => {
  it('shows each section the server sent, with its figures and attention items', async () => {
    mount(['members:read', 'giving:read', 'giving:write', 'finance:read'], full);
    expect(await screen.findByText('Giving this month')).toBeInTheDocument();
    expect(screen.getByText('Cash and bank')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bills overdue' })).toHaveAttribute('href', '/payables/bills');
    expect(screen.getByText('Sunday service')).toBeInTheDocument();
    expect(screen.getByText('Custom role', { exact: false })).toBeInTheDocument();
  });

  it('offers quick actions only for permissions the role holds', async () => {
    mount(['members:read'], { asOf: '2026-10-01', people: full.people, attention: [] });
    await screen.findByText('Dashboard');
    expect(screen.queryByRole('link', { name: 'Record a gift' })).not.toBeInTheDocument();
    expect(screen.queryByText('Giving this month')).not.toBeInTheDocument();
    expect(screen.queryByText('Cash and bank')).not.toBeInTheDocument();
  });

  it('says when nothing needs attention, and welcomes a role with no church-wide sections', async () => {
    mount(['members:read'], { asOf: '2026-10-01', people: full.people, attention: [] });
    expect(await screen.findByText(/Nothing is waiting/)).toBeInTheDocument();
  });

  it('points a role with no sections at its own account', async () => {
    mount([], { asOf: '2026-10-01', attention: [] });
    expect(await screen.findByText('Welcome')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open my account' })).toHaveAttribute('href', '/me');
  });
});
