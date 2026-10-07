import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AttachmentsPanel } from './AttachmentsPanel';
import { ToastProvider } from '../../ui';
import type { Bill } from '../../api/payablesApi';

const api = vi.hoisted(() => ({ upload: vi.fn(() => Promise.resolve({})), link: vi.fn(), remove: vi.fn(() => Promise.resolve({})) }));
vi.mock('../../api/payablesApi', () => ({ uploadAttachment: api.upload, attachmentLink: api.link, removeAttachment: api.remove }));

const bill = (over: Partial<Bill> = {}) => ({ id: 9, status: 'DRAFT', attachments: [{ id: 4, fileName: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 2048, sha256: 'abcdef0123456789' }], ...over }) as unknown as Bill;
const mount = (b: Bill, canWrite = true) => render(<MemoryRouter><ToastProvider><AttachmentsPanel bill={b} canWrite={canWrite} onChanged={() => undefined} /></ToastProvider></MemoryRouter>);

describe('bill attachments panel', () => {
  it('lists files with their checksum and uploads a chosen file', async () => {
    mount(bill());
    expect(screen.getByText('invoice.pdf')).toBeTruthy();
    expect(screen.getByText('abcdef0123')).toBeTruthy();
    const file = new File(['%PDF-1.4'], 'new.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose a file to attach'), file);
    await waitFor(() => expect(api.upload).toHaveBeenCalledWith(9, file));
  });

  it('offers no upload or removal to a reader, nor on a void bill', () => {
    mount(bill(), false);
    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('refuses a file over 10 MB before sending it', async () => {
    api.upload.mockClear();
    mount(bill());
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose a file to attach'), big);
    expect(api.upload).not.toHaveBeenCalled();
  });
});
