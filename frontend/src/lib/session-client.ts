import { getQueryClient } from './query-client';

export function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((c) => c.charCodeAt(0) <= 32) ||
    value.startsWith('/auth/') ||
    value.startsWith('/api/')
  )
    return '/leads';
  return value;
}

async function restore() {
  // Recheck after acquiring the cross-tab lock: another tab may have rotated.
  const current = await fetch('/api/crm/session', { cache: 'no-store' });
  if (current.ok) return true;
  if (current.status !== 401)
    throw new Error('No se pudo verificar la sesión. Intentá nuevamente.');
  const response = await fetch('/api/auth/refresh', { method: 'POST' });
  if (response.status === 401 || response.status === 403) {
    getQueryClient().clear();
    return false;
  }
  if (!response.ok) throw new Error('No se pudo renovar la sesión. Intentá nuevamente.');
  return true;
}
export async function restoreSession(manual = false): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request('infoprepaga-session', restore);
  if (manual) return restore();
  throw new Error('Restaurá la sesión desde la pantalla de ingreso para continuar.');
}

export async function sessionFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) return response;
  const restored = await restoreSession();
  if (!restored) {
    getQueryClient().clear();
    if (typeof window !== 'undefined') window.location.assign('/auth/sign-in');
    return response;
  }
  if ((init.method ?? 'GET').toUpperCase() === 'GET') return fetch(input, init);
  throw new Error('La sesión se renovó. Tus campos se conservaron; volvé a confirmar el envío.');
}

export async function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('infoprepaga-session', action)
    : action();
}
