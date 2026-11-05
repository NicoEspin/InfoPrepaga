import { queryOptions } from '@tanstack/react-query';
import { listAccounts } from './service';
export const accountsOptions = (actorId: string, query: string) =>
  queryOptions({
    queryKey: ['accounts', actorId, query],
    queryFn: ({ signal }) => listAccounts(query, signal),
    retry: false
  });
