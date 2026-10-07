import { useRef, useState } from 'react';
import { Button, Card, DataTable, formatDateTime, InlineConfirm, useToast } from '../../ui';
import { API_BASE_URL } from '../../api/axiosInstance';
import { normalizeError } from '../../api/http';
import { attachmentLink, removeAttachment, uploadAttachment, type Bill } from '../../api/payablesApi';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt';
const MAX_MB = 10;

const sizeText = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Invoices and receipts for one bill: real uploads, downloaded through a short-lived link the server mints. */
export function AttachmentsPanel({ bill, canWrite, onChanged }: { bill: Bill; canWrite: boolean; onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const locked = bill.status === 'VOID';

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`That file is larger than ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      await uploadAttachment(bill.id, file);
      toast.success('Attached');
      onChanged();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const open = async (attachmentId: number) => {
    try {
      const link = await attachmentLink(bill.id, attachmentId);
      // The local store returns an API-relative path; a pre-signed URL is already absolute.
      window.location.assign(link.url.startsWith('/') ? `${API_BASE_URL}${link.url}` : link.url);
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  const remove = async (attachmentId: number) => {
    try {
      await removeAttachment(bill.id, attachmentId);
      toast.success('Removed');
      onChanged();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  return (
    <Card
      title="Attachments"
      flush
      actions={canWrite && !locked ? (
        <>
          <input ref={input} type="file" accept={ACCEPT} hidden aria-label="Choose a file to attach" onChange={(e) => pick(e.target.files?.[0])} />
          <Button size="sm" loading={busy} onClick={() => input.current?.click()}>Attach a file</Button>
        </>
      ) : undefined}
    >
      <DataTable
        rowKey={(a) => a.id}
        rows={bill.attachments}
        empty={<span>No attachments. PDF, image, CSV or text, up to {MAX_MB} MB.</span>}
        columns={[
          { key: 'name', header: 'File', render: (a) => <Button size="sm" variant="ghost" onClick={() => open(a.id)}>{a.fileName}</Button> },
          { key: 'size', header: 'Size', numeric: true, render: (a) => sizeText(a.sizeBytes) },
          { key: 'sum', header: 'Checksum', render: (a) => (a.sha256 ? <code title={a.sha256}>{a.sha256.slice(0, 10)}</code> : '-') },
          { key: 'when', header: 'Added', render: (a) => (a.createdAt ? formatDateTime(a.createdAt) : '-') },
          { key: 'act', header: '', render: (a) => canWrite && !['PAID', 'VOID'].includes(bill.status) && <InlineConfirm label="Remove" question="Remove this file?" confirmLabel="Remove" onConfirm={() => remove(a.id)} /> }
        ]}
      />
    </Card>
  );
}
