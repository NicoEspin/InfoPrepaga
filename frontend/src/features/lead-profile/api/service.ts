import { leadProfileSchema, type LeadProfileLoader } from './types';

type LeadProfileErrorReason =
  | 'not-found'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'invalid-response';

export class LeadProfileError extends Error {
  readonly reason: LeadProfileErrorReason;
  constructor(reason: LeadProfileErrorReason) {
    super(reason);
    this.name = 'LeadProfileError';
    this.reason = reason;
  }
}

export function parseLeadProfile(payload: unknown, expectedId: string) {
  const result = leadProfileSchema.safeParse(payload);
  // The identity is checked even when the response otherwise matches the schema.
  if (!result.success || result.data.id !== expectedId)
    throw new LeadProfileError('invalid-response');
  return result.data;
}

// Replace this demo endpoint with the approved NestJS/BFF contract when available.
export const getLeadProfile: LeadProfileLoader = async (id, signal) => {
  let response: Response;
  try {
    response = await fetch(`/api/demo/lead-profiles/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)])
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new LeadProfileError('network');
  }
  if (response.status === 404) throw new LeadProfileError('not-found');
  if (response.status === 401) throw new LeadProfileError('unauthorized');
  if (response.status === 403) throw new LeadProfileError('forbidden');
  if (!response.ok) throw new LeadProfileError('network');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LeadProfileError('invalid-response');
  }
  return parseLeadProfile(payload, id);
};
