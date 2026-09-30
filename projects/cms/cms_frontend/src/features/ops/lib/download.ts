import axiosInstance from '../../../api/axiosInstance';
import { normalizeError } from '../../../api/http';

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a file from an authenticated endpoint (a plain <a href> would not carry the bearer token). */
export async function downloadAuthed(path: string, filename: string, params?: Record<string, string>): Promise<void> {
  try {
    const response = await axiosInstance.get(path, { params, responseType: 'blob' });
    save(response.data as Blob, filename);
  } catch (error) {
    throw normalizeError(error);
  }
}

export function downloadJson(value: unknown, filename: string): void {
  save(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename);
}
