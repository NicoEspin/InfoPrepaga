import 'server-only';

export function backendFetch(path: string, init: RequestInit = {}) {
  const origin = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
  return fetch(new URL(path, origin), {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  });
}
