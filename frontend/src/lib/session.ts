import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFetch } from './backend';

export const getSession = cache(async () => {
  const token = (await cookies()).get('ip_access')?.value;
  if (!token) return null;
  const response = await backendFetch('/users/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('No se pudo verificar la sesión');
  return (await response.json()) as {
    id: string;
    email: string;
    roles: Array<'ADMIN' | 'VENDEDOR'>;
    permissions: string[];
  };
});

export async function requireSession() {
  const user = await getSession();
  if (!user) {
    const refresh = (await cookies()).get('ip_refresh')?.value;
    const path = (await headers()).get('x-ip-path') ?? '/leads';
    redirect(refresh ? `/auth/restore?returnTo=${encodeURIComponent(path)}` : '/auth/sign-in');
  }
  return user;
}
