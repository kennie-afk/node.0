import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ScanPage from './ScanPage';
import { QrCode } from '../../features/qr/QrCode';
import { ToastProvider } from '../../ui';

const scans: Array<Record<string, unknown>> = [];
vi.mock('../../api/qrApi', () => ({
  scanMember: (body: Record<string, unknown>) => {
    scans.push(body);
    if (body.token === 'bad.code.value.x') return Promise.reject(new Error('This is not a valid member code for this church'));
    return Promise.resolve({ status: scans.length > 1 ? 'ALREADY' : 'RECORDED', attendanceId: 1, date: '2026-11-12', member: { id: 7, name: 'Wanjiku Kamau', photoUrl: null } });
  }
}));
vi.mock('../../api/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/http')>();
  return { ...real, http: { ...real.http, get: () => Promise.resolve({ data: [] }) } };
});

const view = () => render(<MemoryRouter><ToastProvider><ScanPage /></ToastProvider></MemoryRouter>);

describe('scan check-in', () => {
  it('marks a member present from the code box, then reports a repeat scan', async () => {
    view();
    const box = screen.getByLabelText(/code box/i);
    await userEvent.type(box, 'hq1.1.7.abcdefghijklmnopqrstuv{Enter}');
    expect(await screen.findByText('Marked present for', { exact: false })).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/code box/i), 'hq1.1.7.abcdefghijklmnopqrstuv{Enter}');
    expect(await screen.findByText('Already marked present for', { exact: false })).toBeTruthy();
    expect(scans[0]).toMatchObject({ token: 'hq1.1.7.abcdefghijklmnopqrstuv', eventId: null, sermonId: null });
  });

  it('does not scan for an event until one is chosen', async () => {
    scans.length = 0;
    view();
    await userEvent.selectOptions(screen.getByLabelText(/checking in for/i), 'event');
    await userEvent.type(screen.getByLabelText(/code box/i), 'hq1.1.7.abcdefghijklmnopqrstuv{Enter}');
    expect(scans).toHaveLength(0);
  });
});

describe('QR code', () => {
  it('draws a scannable svg for a code', () => {
    const { container } = render(<QrCode value="hq1.1.7.abcdefghijklmnopqrstuv" label="card" />);
    expect(screen.getByRole('img', { name: 'card' })).toBeTruthy();
    expect(container.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(200);
  });
});
