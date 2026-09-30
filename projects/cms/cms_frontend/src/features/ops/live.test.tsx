/**
 * Drives the real operations pages against a real API (no mocks). Skipped unless OPS_LIVE_API is
 * set, e.g.
 *   OPS_LIVE_API=1 VITE_API_URL=http://localhost:14401 OPS_ADMIN_EMAIL=... OPS_ADMIN_PASSWORD=... npx vitest run src/features/ops/live.test.tsx
 * The API must have CORS_ORIGINS including http://localhost:3000 (jsdom's origin).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { clearSession, writeSession } from '../../api/session';
import * as checkin from '../../api/checkinApi';
import * as facilities from '../../api/facilitiesApi';
import * as comms from '../../api/commsApi';
import * as volunteers from '../../api/volunteersApi';
import * as visitors from '../../api/visitorsApi';
import * as selfservice from '../../api/selfserviceApi';
import * as dataops from '../../api/dataopsApi';
import * as care from '../../api/careApi';
import { http } from '../../api/http';
import CheckoutPage from '../../pages/checkin/CheckoutPage';
import BookingFormPage from '../../pages/facilities/BookingFormPage';
import ImportPage from '../../pages/dataops/ImportPage';
import CareMemberPage from '../../pages/care/CareMemberPage';
import StationPage from '../../pages/checkin/StationPage';
import { opsRoutes } from '../../routes/ops.routes';

const live = Boolean(process.env.OPS_LIVE_API);
const email = process.env.OPS_ADMIN_EMAIL ?? 'admin@grace.test';
const password = process.env.OPS_ADMIN_PASSWORD ?? 'Demo-passphrase-1';
const run = Date.now().toString(36);

async function signIn(who: string, pass = password): Promise<void> {
  clearSession();
  const session = await http.post<{ token: string; expiresInSeconds: number; churchId: number }>('/auth/login', { email: who, password: pass });
  writeSession(session.token, session.expiresInSeconds, session.churchId);
}

function mount(path: string, pattern: string, element: React.ReactElement) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

afterEach(() => cleanup());

describe.runIf(live)('operations screens against the live API', () => {
  beforeAll(async () => {
    await signIn(email);
  });

  it('check-out refuses a wrong code loudly, then releases on the right one', async () => {
    await signIn(email);
    const room = await checkin.createRoom({ name: `Live room ${run}`, minAgeMonths: 0, maxAgeMonths: 240, capacity: 10 });
    const child = await checkin.createChild({ firstName: `Live${run}`, lastName: 'Child', dateOfBirth: '2023-01-01', allergies: 'Peanuts', guardians: [{ name: 'Mum Live', phone: '0700111222', relationship: 'Mother', isAuthorizedPickup: true }] });
    const guardian = child.guardians![0];
    const session = await checkin.checkIn({ childId: child.id, roomId: room.id, guardianId: guardian.id });
    expect(session.pickupCode).toMatch(/^\d{6}$/);

    mount(`/checkin/sessions/${session.id}/checkout`, '/checkin/sessions/:id/checkout', <CheckoutPage />);
    await screen.findByText(`Check out Live${run} Child`);
    expect(screen.getByRole('alert').textContent).toMatch(/ALLERGY: Peanuts/);
    fireEvent.click(await screen.findByRole('button', { name: /Mum Live/ }));
    const code = screen.getByLabelText(/Pickup code/);
    const wrong = session.pickupCode === '000000' ? '111111' : '000000';
    fireEvent.change(code, { target: { value: wrong } });
    fireEvent.click(screen.getByRole('button', { name: 'Release child' }));
    await waitFor(() => expect(screen.getByText(/Wrong code/)).toBeTruthy());
    expect(screen.getByText(/recorded in the security trail/)).toBeTruthy();

    const trail = await http.get<{ data: Array<{ type: string; sessionId: number }> }>('/checkin/events', { childId: child.id });
    expect(trail.data.some((e) => e.type === 'DENIED' && e.sessionId === session.id)).toBe(true);

    fireEvent.change(screen.getByLabelText(/Pickup code/), { target: { value: session.pickupCode! } });
    fireEvent.click(screen.getByRole('button', { name: 'Release child' }));
    await screen.findByText(/was released to Mum Live/);
    const after = await checkin.listSessions({ status: 'IN', childId: child.id });
    expect(after.data).toHaveLength(0);
  }, 60_000);

  it('the station finds a child, suggests the room and shows the allergy', async () => {
    await signIn(email);
    const child = await checkin.createChild({ firstName: `Finder${run}`, lastName: 'Kid', dateOfBirth: '2024-06-01', allergies: 'Eggs', guardians: [{ name: 'Dad Finder', isAuthorizedPickup: true }] });
    mount('/checkin', '/checkin', <StationPage />);
    fireEvent.change(await screen.findByLabelText('Find a child'), { target: { value: `Finder${run}` } });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Finder${run}`) }, { timeout: 8000 }));
    await screen.findByText(/ALLERGY: Eggs/);
    expect(screen.getByRole('button', { name: /Check in and print label/ })).toBeTruthy();
    void child;
  }, 60_000);

  it('the booking form shows a clash before anything is saved', async () => {
    await signIn(email);
    const resource = await facilities.createResource({ name: `Live hall ${run}`, kind: 'ROOM', capacity: 50 });
    const start = new Date(Date.now() + 10 * 86400000);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600000);
    await facilities.createBooking({ resourceId: resource.id, title: 'Existing choir', startsAt: start.toISOString(), endsAt: end.toISOString() });

    mount(`/facilities/bookings/new?resourceId=${resource.id}`, '/facilities/bookings/new', <BookingFormPage />);
    await screen.findByText('New booking');
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    fireEvent.change(screen.getByLabelText(/What for/), { target: { value: 'Wedding rehearsal' } });
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    const times = document.querySelectorAll<HTMLInputElement>('input[type="time"]');
    fireEvent.change(dates[0], { target: { value: day } });
    fireEvent.change(times[0], { target: { value: '11:00' } });
    fireEvent.change(dates[1], { target: { value: day } });
    fireEvent.change(times[1], { target: { value: '12:00' } });
    await screen.findByText(/This time is already taken/, {}, { timeout: 8000 });
    expect(screen.getByText(/Existing choir/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Book' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(times[0], { target: { value: '13:00' } });
    fireEvent.change(times[1], { target: { value: '14:00' } });
    await screen.findByText('That time is free.', {}, { timeout: 8000 });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Book' }) as HTMLButtonElement).disabled).toBe(false));
  }, 60_000);

  it('the import wizard checks first, shows row errors, then applies only the good rows', async () => {
    await signIn(email);
    const csv = `first_name,last_name,email,phone_number\nJoy${run},Import,joy${run}@grace.test,0733${Math.floor(100000 + Math.random() * 899999)}\nBad,,not-an-email,\n`;
    mount('/data/import', '/data/import', <ImportPage />);
    fireEvent.change(await screen.findByLabelText(/paste the rows/i), { target: { value: csv } });
    fireEvent.click(screen.getByRole('button', { name: 'Check the file' }));
    await screen.findByText(/Checked, nothing saved yet/);
    expect(screen.getByText('Rows with problems')).toBeTruthy();
    expect(screen.getByText(/last name is required/)).toBeTruthy();
    const before = await http.get<{ total: number }>('/members', { pageSize: 1 });
    expect((screen.getByRole('button', { name: 'Import now' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Import the good rows/));
    await waitFor(() => expect(screen.getByRole('button', { name: /Import 1 good rows/ })).toBeTruthy());
    const mid = await http.get<{ total: number }>('/members', { pageSize: 1 });
    expect(mid.total).toBe(before.total);
    fireEvent.click(screen.getByRole('button', { name: /Import 1 good rows/ }));
    await screen.findByText(/^Imported/);
    const after = await http.get<{ total: number }>('/members', { pageSize: 1 });
    expect(after.total).toBe(before.total + 1);
  }, 60_000);

  it('a pastor sees another author\'s confidential note redacted', async () => {
    await signIn(email);
    const members = await http.get<{ data: Array<{ id: number }> }>('/members', { pageSize: 1 });
    const memberId = members.data[0].id;
    await http.post('/care/notes', { memberId, kind: 'COUNSELING', body: `Secret ${run}`, isConfidential: true });
    await signIn('pat@grace.test');
    mount(`/care/members/${memberId}`, '/care/members/:memberId', <CareMemberPage />);
    await screen.findAllByText(/Confidential note by another user/, {}, { timeout: 8000 });
    expect(document.body.textContent).not.toContain(`Secret ${run}`);
    cleanup();
    await signIn(email);
    mount(`/care/members/${memberId}`, '/care/members/:memberId', <CareMemberPage />);
    await screen.findByText(`Secret ${run}`, {}, { timeout: 8000 });
  }, 60_000);

  it('every list endpoint returns the fields the screens read', async () => {
    await signIn(email);
    const need = (label: string, row: unknown, keys: string[]) => {
      if (row === undefined) return; // an empty list proves nothing about shape
      for (const k of keys) expect(row, `${label}.${k}`).toHaveProperty(k);
    };
    need('template', (await comms.listTemplates())[0], ['id', 'name', 'channel', 'body', 'isActive']);
    need('segment', (await comms.listSegments())[0], ['id', 'name', 'definition']);
    need('campaign', (await comms.listCampaigns()).data[0], ['id', 'name', 'status', 'recipientCount', 'channel']);
    need('outbox', (await http.get<{ data: unknown[] }>('/comms/outbox', { limit: 1 })).data[0], ['id', 'toAddress', 'status', 'attempts']);
    need('team', (await volunteers.listTeams())[0], ['id', 'name', 'memberCount']);
    need('assignment', (await volunteers.listRosters({ limit: 1 })).data[0], ['id', 'eventName', 'teamName', 'firstName', 'status', 'startsAt']);
    need('swap', (await volunteers.listSwaps())[0], ['id', 'assignmentId', 'fromMemberId', 'status']);
    need('reminder', (await volunteers.reminders(720))[0], ['assignmentId', 'eventName', 'firstName', 'status']);
    need('room', (await checkin.listRooms())[0], ['id', 'name', 'capacity', 'present', 'minAgeMonths']);
    need('child', (await checkin.listChildren({ limit: 1 })).data[0], ['id', 'firstName', 'dateOfBirth', 'allergies']);
    need('session', (await checkin.listSessions({ limit: 1 })).data[0], ['id', 'roomName', 'firstName', 'securityTag', 'status']);
    need('security event', (await checkin.listSecurityEvents({ limit: 1 })).data[0], ['id', 'type', 'createdAt']);
    need('resource', (await facilities.listResources())[0], ['id', 'name', 'kind', 'requiresApproval']);
    need('booking', (await facilities.listBookings({ limit: 1 })).data[0], ['id', 'title', 'startsAt', 'endsAt', 'status', 'resourceName']);
    need('visitor', (await visitors.listVisitors({ limit: 1 })).data[0], ['id', 'stage', 'status', 'firstVisitDate']);
    need('pipeline', await visitors.pipeline(), ['stages', 'total', 'conversionRate']);
    need('me', await selfservice.me(), ['user', 'permissions', 'member']);
    need('imports', (await dataops.listImports())[0], ['id', 'status', 'createdCount', 'errorCount', 'errors']);
    need('erasure', (await dataops.listErasures())[0], ['id', 'memberId', 'status', 'reason']);
    need('links', (await selfservice.listAccountLinks())[0], ['userId', 'username', 'memberId']);
    need('follow-ups', await care.followUps(30), ['notes', 'visitations']);
    need('prayer', (await care.listPrayerRequests({ limit: 1 })).data[0], ['id', 'body', 'status', 'isPrivate']);
  }, 60_000);

  it.each([
    ['admin', 'admin@grace.test', ['/operations', '/comms/campaigns', '/comms/campaigns/new', '/comms/campaigns/1', '/comms/templates', '/comms/templates/new', '/comms/templates/1/edit', '/comms/segments', '/comms/segments/new', '/comms/segments/1/edit', '/comms/outbox',
      '/volunteers/teams', '/volunteers/teams/new', '/volunteers/teams/1', '/volunteers/rosters', '/volunteers/rosters/new', '/volunteers/swaps', '/volunteers/availability', '/volunteers/reminders',
      '/checkin', '/checkin/children', '/checkin/children/new', '/checkin/children/1', '/checkin/children/1/edit', '/checkin/children/1/guardians/new', '/checkin/guardians/1/edit?childId=1', '/checkin/rooms', '/checkin/rooms/new', '/checkin/rooms/1/edit', '/checkin/history', '/checkin/security',
      '/facilities/bookings', '/facilities/bookings/new', '/facilities/bookings/1', '/facilities/resources', '/facilities/resources/new', '/facilities/resources/1/edit',
      '/visitors', '/visitors/list', '/visitors/tasks', '/visitors/new', '/visitors/1', '/visitors/1/edit', '/visitors/1/interactions/new', '/visitors/1/tasks/new', '/visitors/1/convert',
      '/care', '/care/members/1', '/care/notes/new', '/care/notes/1', '/care/notes/1/edit', '/care/visitations/new', '/care/prayer-requests', '/care/prayer-requests/new', '/care/prayer-requests/1/update',
      '/data/import', '/data/imports', '/data/exports', '/data/consents', '/data/consents/1/new', '/data/subject-access', '/data/erasure', '/data/erasure/new', '/data/erasure/1/refuse', '/account-links', '/account-links/new']],
    ['member', 'mona@grace.test', ['/me', '/me/profile', '/me/family', '/me/groups', '/me/giving', '/me/prayer', '/me/availability', '/me/privacy']],
    ['pastor (not linked)', 'pat@grace.test', ['/me', '/me/profile', '/me/giving', '/care', '/comms/campaigns']]
  ])('every %s route renders real data without errors', async (_who, who, paths) => {
    await signIn(who);
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ').slice(0, 300)); };
    try {
      for (const path of paths) {
        const view = render(
          <AuthProvider>
            <MemoryRouter initialEntries={[path]}>
              <Routes>{opsRoutes}<Route path="*" element={<div>no such route</div>} /></Routes>
            </MemoryRouter>
          </AuthProvider>
        );
        await waitFor(() => expect(document.querySelector('h1, .ui-signpost-title')).toBeTruthy(), { timeout: 8000 });
        await new Promise((r) => setTimeout(r, 400));
        const text = document.body.textContent ?? '';
        expect(text, `${path} fell through to the catch-all route`).not.toContain('no such route');
        expect(text, `${path} shows an error state`).not.toMatch(/Something went wrong/);
        view.unmount();
      }
    } finally {
      console.error = original;
    }
    expect(errors.filter((e) => !/act\(/.test(e)), 'console errors').toEqual([]);
  }, 240_000);
});
