import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AttendanceScreen from './AttendanceScreen';
import { AuthProvider } from '../../context/AuthContext';
import { writeSession } from '../../api/session';
import { ToastProvider } from '../../ui';

const calls: Array<Record<string, unknown>> = [];
vi.mock('../../api/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/http')>();
  return {
    ...real,
    http: {
      ...real.http,
      get: (_path: string, query: Record<string, unknown> = {}) => {
        calls.push(query);
        return Promise.resolve(query.cursor
          ? { data: [{ id: 2, guestName: 'Second Page', attendanceDate: '2025-01-05', attendanceType: 'In-person' }], nextCursor: null, limit: 25 }
          : { data: [{ id: 1, guestName: 'First Page', attendanceDate: '2025-01-12', attendanceType: 'In-person' }], nextCursor: 'abc', limit: 25 });
      }
    }
  };
});

beforeEach(() => { localStorage.clear(); calls.length = 0; });

describe('attendance list', () => {
  it('pages by cursor: Load more sends the cursor and appends the next records', async () => {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    writeSession(`${b64({ alg: 'HS256' })}.${b64({ id: 1, email: 'a@b.test', churchId: 1, role: 'X' })}.sig`, 3600, 1, ['members:read'], 'Custom');
    render(<MemoryRouter><AuthProvider><ToastProvider><AttendanceScreen kind="general" /></ToastProvider></AuthProvider></MemoryRouter>);
    expect(await screen.findByText('First Page')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second Page')).toBeTruthy();
    expect(screen.getByText('First Page')).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.cursor === 'abc')).toBe(true));
  });
});
