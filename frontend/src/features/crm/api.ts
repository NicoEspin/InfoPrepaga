'use client';
import { sessionFetch } from '@/lib/session-client';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { getQueryClient } from '@/lib/query-client';

export type Identity = {
  id: string;
  email: string;
  roles: Array<'ADMIN' | 'VENDEDOR'>;
  permissions: string[];
  demosEnabled?: boolean;
};
export type Person = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};
export type Source = { id: string; code: string; name: string; isBase: boolean; isActive: boolean };
export type Catalogs = { statuses: { id: string; name: string }[]; sources: Source[] };
export type Seller = Person & {
  isActive: boolean;
  receivesLeads: boolean;
  roles: { role: { name: string } }[];
};
export type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  observations: string;
  importData?: Record<string, string | number> | null;
  status: string;
  sourceId: string;
  source: Source;
  assignedToId: string | null;
  assignedTo: Person | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type Task = {
  id: string;
  leadId: string | null;
  ownerId: string;
  createdById: string | null;
  contact: string;
  title: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dueAt: string;
  duration: number;
  completedAt: string | null;
  version: number;
  lead: { id: string; name: string; assignedToId: string | null } | null;
  owner: Person;
};
export type Profile = Lead & { nextActivity: Task | null };
export type Activity = {
  id: string;
  kind: string;
  detail: Record<string, unknown>;
  actor: Person | null;
  createdAt: string;
};
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type TaskPage = Page<Task> & { counts: { pending: number; completed: number } };

export class CrmError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export async function crmRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await sessionFetch(`/api/crm/${path}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([
            init.signal,
            AbortSignal.timeout(path.startsWith('reports') ? 60000 : 15000)
          ])
        : AbortSignal.timeout(path.startsWith('reports') ? 60000 : 15000),
      headers: {
        ...(init.body &&
          !(init.body instanceof FormData) && { 'Content-Type': 'application/json' }),
        ...init.headers
      },
      credentials: 'same-origin',
      cache: 'no-store'
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (error instanceof Error && /sesión|Restaurá/.test(error.message))
      throw new CrmError(401, error.message);
    throw new CrmError(
      0,
      'No pudimos confirmar la respuesta del servidor. Revisá tu conexión; si estabas guardando, actualizá los datos antes de reintentar.'
    );
  }
  let payload: unknown;
  try {
    payload = response.status === 204 ? undefined : await response.json();
  } catch {
    if (response.ok)
      throw new CrmError(
        502,
        'Recibimos una respuesta que no pudimos verificar. Intentá actualizar la vista.'
      );
  }
  const serverMessage =
    payload && typeof payload === 'object' && 'message' in payload ? payload.message : undefined;
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      getQueryClient().clear();
      window.location.assign('/auth/sign-in');
    }
    const message =
      response.status === 401
        ? 'La sesión venció. Ingresá nuevamente o restaurá la sesión.'
        : response.status === 404
          ? 'Registro no encontrado o fuera de tu acceso.'
          : response.status === 403
            ? 'No tenés permiso para realizar esta operación.'
            : response.status === 429
              ? 'Demasiadas solicitudes. Intentá nuevamente en un minuto.'
              : response.status >= 500
                ? 'El servidor no está disponible en este momento. Intentá nuevamente en unos instantes.'
                : Array.isArray(serverMessage)
                  ? 'Revisá los campos del formulario y sus límites.'
                  : serverMessage === 'Email already registered'
                    ? 'Ya existe un usuario con ese correo.'
                    : typeof serverMessage === 'string'
                      ? serverMessage
                      : 'No se pudo completar la operación. Intentá nuevamente.';
    throw new CrmError(response.status, message);
  }
  return payload as T;
}
const personSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable()
});
const sourceSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  isBase: z.boolean(),
  isActive: z.boolean()
});
const taskSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  ownerId: z.string().uuid(),
  createdById: z.string().uuid().nullable(),
  contact: z.string(),
  title: z.string(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  dueAt: z.string().datetime({ offset: true }),
  duration: z.number(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  version: z.number().int(),
  lead: z
    .object({ id: z.string().uuid(), name: z.string(), assignedToId: z.string().nullable() })
    .nullable(),
  owner: personSchema
});
export const profileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  observations: z.string(),
  importData: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .nullable()
    .optional(),
  status: z.enum([
    'NEW',
    'NO_ANSWER',
    'WHATSAPP',
    'OVER_BUDGET',
    'MEDICAL_PREEXISTENCE',
    'RETIRED',
    'PROSPECT',
    'OTHER_INTEREST',
    'ALREADY_CONTRACTED'
  ]),
  sourceId: z.string().uuid(),
  source: sourceSchema,
  assignedToId: z.string().uuid().nullable(),
  assignedTo: personSchema.nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  nextActivity: taskSchema.nullable()
});
export async function loadProfile(id: string, signal: AbortSignal) {
  const parsed = profileSchema.safeParse(
    await crmRequest<unknown>(`leads/${encodeURIComponent(id)}`, { signal })
  );
  if (!parsed.success)
    throw new CrmError(
      502,
      'No pudimos verificar los datos del perfil. Intentá actualizar la vista.'
    );
  const profile = parsed.data;
  if (profile.id !== id) throw new Error('El servidor devolvió otro lead');
  return profile;
}
export function commercialProfileOptions(
  actorId: string | undefined,
  id: string,
  opening: string,
  loader = loadProfile
) {
  return queryOptions({
    queryKey: ['crm', actorId, 'profile', id, opening],
    queryFn: ({ signal }) => loader(id, signal),
    enabled: Boolean(actorId),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000
  });
}
export function useIdentity(initialData?: Identity) {
  return useQuery({
    queryKey: ['crm-identity'],
    queryFn: ({ signal }) => crmRequest<Identity>('session', { signal }),
    initialData,
    staleTime: 0,
    retry: false
  });
}
export function useCrmQuery<T>(actorId: string | undefined, path: string, enabled = true) {
  return useQuery({
    queryKey: ['crm', actorId, path],
    queryFn: ({ signal }) => crmRequest<T>(path, { signal }),
    enabled: Boolean(actorId) && enabled,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false
  });
}
export function useRefreshCrm() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['crm'] });
}
export function personName(person: Person | null) {
  return person
    ? [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
    : 'Sin asignar';
}
export function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return query.toString();
}
