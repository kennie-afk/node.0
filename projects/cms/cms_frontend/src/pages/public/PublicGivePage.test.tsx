import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PublicGivePage from './PublicGivePage';

const posts: Array<{ url: string; body: unknown; key: unknown }> = [];
vi.mock('../../api/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/http')>();
  return {
    ...real,
    http: {
      ...real.http,
      get: () => Promise.resolve({ church: { name: 'Grace Chapel', slug: 'grace' }, types: [{ id: 3, name: 'Tithe' }], minAmountMinor: 1000, maxAmountMinor: 15000000, configured: true, testMode: true }),
      post: (url: string, body: unknown, config?: { headers?: Record<string, string> }) => {
        posts.push({ url, body, key: config?.headers?.['Idempotency-Key'] });
        return Promise.resolve({ status: 'PENDING', message: 'Check your phone.' });
      }
    }
  };
});

describe('public giving page', () => {
  it('sends the gift with one idempotency key, only after the amount is in range', async () => {
    render(<MemoryRouter initialEntries={['/give/grace']}><Routes><Route path="/give/:slug" element={<PublicGivePage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Grace Chapel')).toBeTruthy();
    expect(screen.getByText(/Test mode/)).toBeTruthy();
    const button = screen.getByRole('button', { name: /^Give/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Amount/), '500');
    await userEvent.type(screen.getByLabelText(/phone number/i), '0712345678');
    await userEvent.click(screen.getByRole('button', { name: /^Give/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe('/public/give/grace');
    expect(posts[0].body).toMatchObject({ phone: '0712345678' });
    expect(String(posts[0].key)).toMatch(/^give-[A-Za-z0-9_-]{12,}/);
    expect(await screen.findByText(/Waiting for confirmation/)).toBeTruthy();
  });
});
