import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, formatDateTime, InlineConfirm, PageHeader, PageLoader, useQuery, useToast } from '../../ui';
import { API_BASE_URL } from '../../api/axiosInstance';
import { http, normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import type { Sermon } from '../../api/sermonApi';

interface Media { id: number; kind: 'audio' | 'video' | 'notes'; fileName: string; contentType: string; sizeBytes: number; sha256: string; createdAt: string }
const MAX_MB = 50;
const sizeText = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Recordings and notes for one sermon, held in the church's own storage. */
export default function SermonMediaPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const writable = can('members:write');
  const sermon = useQuery(() => http.get<Sermon>(`/sermons/${id}`), [id]);
  const files = useQuery(() => http.get<Media[]>(`/sermons/${id}/media`), [id]);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (sermon.error && !sermon.data) return <div className="ui-page"><ErrorState message={sermon.error.message} onRetry={sermon.refetch} requestId={sermon.error.requestId} /></div>;
  if (!sermon.data) return <PageLoader />;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`That file is larger than ${MAX_MB} MB. Link long recordings with the video URL instead.`); return; }
    setBusy(true);
    try {
      await http.post(`/sermons/${id}/media?fileName=${encodeURIComponent(file.name)}`, file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      toast.success('Uploaded');
      files.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const open = async (m: Media) => {
    try {
      const link = await http.get<{ url: string }>(`/sermons/${id}/media/${m.id}/link`);
      window.location.assign(link.url.startsWith('/') ? `${API_BASE_URL}${link.url}` : link.url);
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };
  const remove = async (m: Media) => {
    try {
      await http.delete(`/sermons/${id}/media/${m.id}`);
      toast.success('Removed');
      files.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Files: ${sermon.data.title}`} crumbs={[{ label: 'Sermons', to: '/sermons' }]} subtitle="Audio (MP3, M4A, WAV, OGG), video (MP4, WebM) and notes (PDF or text)." actions={writable ? (
        <>
          <input ref={input} type="file" hidden aria-label="Choose a file to upload" accept=".mp3,.m4a,.wav,.ogg,.mp4,.webm,.pdf,.txt" onChange={(e) => upload(e.target.files?.[0])} />
          <Button size="sm" variant="primary" loading={busy} onClick={() => input.current?.click()}>Upload a file</Button>
        </>
      ) : undefined} />
      <Card flush>
        <DataTable<Media>
          rowKey={(m) => m.id}
          rows={files.data ?? []}
          loading={files.loading && !files.data}
          error={files.error && !files.data ? files.error : null}
          onRetry={files.refetch}
          empty={<span>No files yet.{writable ? ' Upload a recording or the notes.' : ''}</span>}
          columns={[
            { key: 'name', header: 'File', render: (m) => <Button size="sm" variant="ghost" onClick={() => open(m)}>{m.fileName}</Button> },
            { key: 'kind', header: 'Kind', render: (m) => m.kind },
            { key: 'size', header: 'Size', numeric: true, render: (m) => sizeText(m.sizeBytes) },
            { key: 'when', header: 'Added', render: (m) => formatDateTime(m.createdAt) },
            { key: 'act', header: '', render: (m) => writable && <InlineConfirm label="Remove" question="Remove this file?" confirmLabel="Remove" onConfirm={() => remove(m)} /> }
          ]}
        />
      </Card>
    </div>
  );
}
