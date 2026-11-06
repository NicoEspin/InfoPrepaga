import type { ImportFilter } from './types';
import { queryOptions } from '@tanstack/react-query';
import { getImport, listImports } from './service';
import { listImportMappings, getImportAppearances } from './service';
export const mappingListOptions = (actorId: string, page: number, kind: string, q: string) =>
  queryOptions({
    queryKey: ['crm', actorId, 'import-mappings', page, kind, q],
    queryFn: ({ signal }) => listImportMappings(page, kind, q, signal),
    retry: false,
    staleTime: 0
  });
export const appearanceOptions = (actorId: string, leadId: string, page: number) =>
  queryOptions({
    queryKey: ['crm', actorId, 'import-appearances', leadId, page],
    queryFn: ({ signal }) => getImportAppearances(leadId, page, signal),
    retry: false,
    staleTime: 0
  });
export const importListOptions = (actorId: string) =>
  queryOptions({
    queryKey: ['crm', actorId, 'lead-imports'],
    queryFn: ({ signal }) => listImports(signal),
    retry: false,
    staleTime: 0
  });
export const importPreviewOptions = (
  actorId: string,
  id: string,
  page: number,
  filter: ImportFilter = 'ALL'
) =>
  queryOptions({
    queryKey: ['crm', actorId, 'lead-imports', id, page, filter],
    queryFn: ({ signal }) => getImport(id, page, signal, filter),
    enabled: !!id,
    retry: false,
    staleTime: 0
  });
