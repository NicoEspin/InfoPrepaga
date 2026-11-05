import { queryOptions } from '@tanstack/react-query';
import { getLeadProfile, parseLeadProfile } from './service';
import type { LeadProfileLoader } from './types';

export function leadProfileOptions(
  id: string,
  opening: string,
  loader: LeadProfileLoader = getLeadProfile
) {
  return queryOptions({
    queryKey: ['lead-profile', id, opening],
    queryFn: async ({ signal }) => parseLeadProfile(await loader(id, signal), id),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
    // Never add placeholderData/keepPreviousData to an identity-sensitive modal.
  });
}
