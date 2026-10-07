import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegistrationsPage from './RegistrationsPage';
import EventsPage from './EventsPage';
import { AuthProvider } from '../../context/AuthContext';
import { writeSession } from '../../api/session';
import { ToastProvider } from '../../ui';

vi.mock('../../api/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/http')>();
  return {
    ...real,
    http: {
      ...real.http,
      get: (path: string) => {
        if (path === '/events/occurrences') return Promise.resolve({ data: [{ eventId: 5, name: 'Youth class', startsAt: '2030-01-06T16:00:00Z', date: '2030-01-06', capacity: 2, recurring: true }] });
        if (path === '/events/5') return Promise.resolve({ id: 5, name: 'Youth class', startTime: '2030-01-06T16:00:00Z' });
        if (path === '/events/5/rsvps') return Promise.resolve({ eventId: 5, occurrenceDate: '2030-01-06', capacity: 2, seatsTaken: 2, seatsLeft: 0, waitlisted: 1, data: [
          { id: 1, name: 'Amina One', partySize: 2, status: 'GOING', waitlistPosition: null },
          { id: 2, name: 'Bella Two', partySize: 1, status: 'WAITLIST', waitlistPosition: 1 }] });
        if (path === '/events') return Promise.resolve({ data: [{ id: 5, name: 'Sunday service', startTime: '2030-01-06T09:00:00Z', isRecurring: true, recurrencePattern: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,WE;COUNT=6', capacity: 80 }], page: 1, pageSize: 25, total: 1, totalPages: 1 });
        return Promise.resolve({ data: [] });
      }
    }
  };
});

function signIn(grants: string[]) {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  writeSession(`${b64({ alg: 'HS256' })}.${b64({ id: 1, email: 'a@b.test', churchId: 1, role: 'X' })}.sig`, 3600, 1, grants, 'Custom');
}
beforeEach(() => localStorage.clear());

describe('event registrations', () => {
  it('shows seats, the waitlist and its order, and hides registering from a reader', async () => {
    signIn(['members:read']);
    render(<MemoryRouter initialEntries={['/events/5/registrations']}><AuthProvider><ToastProvider><Routes><Route path="/events/:id/registrations" element={<RegistrationsPage />} /></Routes></ToastProvider></AuthProvider></MemoryRouter>);
    expect(await screen.findByText('Amina One')).toBeTruthy();
    expect(screen.getByText(/2 of 2 seats taken, 1 on the waitlist/)).toBeTruthy();
    expect(screen.getByText('Bella Two')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
  });
});

describe('events list', () => {
  it('describes the repeat rule in words and shows seats', async () => {
    signIn(['members:read']);
    render(<MemoryRouter><AuthProvider><ToastProvider><EventsPage /></ToastProvider></AuthProvider></MemoryRouter>);
    expect(await screen.findByText('Every 2 weeks on SU, WE, 6 times')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sunday service' }).getAttribute('href')).toBe('/events/5/registrations');
  });
});
