import { queryOptions } from '@tanstack/react-query';
import { getImport, listImports } from './service';
export const importListOptions = (actorId: string) =>
  queryOptions({
    queryKey: ['crm', actorId, 'lead-imports'],
    queryFn: ({ signal }) => listImports(signal),
    retry: false,
    staleTime: 0
  });
export const importPreviewOptions = (actorId: string, id: string, page: number) =>
  queryOptions({
    queryKey: ['crm', actorId, 'lead-imports', id, page],
    queryFn: ({ signal }) => getImport(id, page, signal),
    enabled: !!id,
    retry: false,
    staleTime: 0
  });
