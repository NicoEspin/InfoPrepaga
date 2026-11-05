import { sessionFetch } from '@/lib/session-client';
import type { AccountsPage, AccountValues } from './types';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await sessionFetch(`/api/admin/users${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data ? data.message : null;
    throw new Error(
      typeof message === 'string'
        ? message
        : 'Revisá los datos o actualizá la vista antes de reintentar.'
    );
  }
  return data as T;
}
export const listAccounts = (query: string, signal?: AbortSignal) =>
  request<AccountsPage>(`?${query}`, { signal });
export const saveAccount = (id: string | undefined, values: AccountValues) =>
  request(id ? `/${id}` : '', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
export const accountAction = (
  id: string,
  action: string,
  values: { version: number; replacementId?: string; password?: string }
) => request(`/${id}/${action}`, { method: 'POST', body: JSON.stringify(values) });
