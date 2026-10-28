const BASE_URL = '/api';

export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new Error('API endpoint must be a relative path');
  }
  const headers = new Headers(options?.headers);
  if (options?.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store'
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}
