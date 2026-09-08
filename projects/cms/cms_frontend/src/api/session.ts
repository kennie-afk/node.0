const TOKEN_KEY = 'token';
const EXPIRY_KEY = 'tokenExpiresAt';

export interface StoredSession {
  token: string;
  expiresAt: number;
  churchId: number;
}

const listeners = new Set<() => void>();

export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  listeners.forEach((listener) => listener());
}

export function readSession(): StoredSession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRY_KEY));

  if (!token || !Number.isFinite(expiresAt)) {
    return null;
  }

  if (expiresAt <= Date.now()) {
    clearSession();
    return null;
  }

  return { token, expiresAt, churchId: Number(localStorage.getItem('churchId')) || 0 };
}

export function writeSession(token: string, expiresInSeconds: number, churchId: number): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInSeconds * 1000));
  localStorage.setItem('churchId', String(churchId));
  announce();
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem('churchId');
  announce();
}
