import { crmRequest } from '@/features/crm/api';
import type {
  BatchChanges,
  ImportFilter,
  ImportBatchSummary,
  ImportPreview,
  ImportProgress,
  RowChanges
} from './types';
import type { ImportMapping, MappingIdentity, MappingUpdate, AppearancePage } from './types';
import type { Page } from '@/features/crm/api';
export const listImportMappings = (page: number, kind: string, q: string, signal?: AbortSignal) =>
  crmRequest<Page<ImportMapping>>(
    `import-mappings?${new URLSearchParams({ page: String(page), pageSize: '20', ...(kind && { kind }), ...(q && { q }) })}`,
    { signal }
  );
export const updateImportMapping = (changes: MappingUpdate) =>
  crmRequest('import-mappings', { method: 'PATCH', body: JSON.stringify(changes) });
export const deleteImportMapping = (identity: MappingIdentity) =>
  crmRequest('import-mappings', { method: 'DELETE', body: JSON.stringify(identity) });
export const getImportAppearances = (leadId: string, page: number, signal?: AbortSignal) =>
  crmRequest<AppearancePage>(`leads/${leadId}/import-appearances?page=${page}&pageSize=10`, {
    signal
  });
export const listImports = (signal?: AbortSignal) =>
  crmRequest<ImportBatchSummary[]>('lead-imports', { signal });
export const getImport = (
  id: string,
  page: number,
  signal?: AbortSignal,
  filter: ImportFilter = 'ALL',
  selection: import('./types').ImportSelection = {}
) =>
  crmRequest<ImportPreview>(
    `lead-imports/${id}?page=${page}&filter=${filter}&${new URLSearchParams(Object.entries(selection).filter(([, v]) => typeof v === 'string') as [string, string][])}`,
    { signal }
  );
export function uploadImport(
  file: File,
  mode = 'NEW',
  configuration?: import('./types').ImportConfiguration,
  replacement?: { id: string; version: number }
) {
  const body = new FormData();
  body.set('file', file);
  body.set('mode', mode);
  if (configuration) body.set('configuration', JSON.stringify(configuration));
  if (replacement) body.set('version', String(replacement.version));
  return crmRequest<{ id: string }>(
    replacement ? `lead-imports/${replacement.id}/reconfigure` : 'lead-imports',
    { method: 'POST', body }
  );
}
export const changeImport = (
  id: string,
  version: number,
  changes: BatchChanges,
  reviewToken: string
) =>
  crmRequest(`lead-imports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, reviewToken, ...changes })
  });
export const changeImportRow = (
  id: string,
  rowId: string,
  version: number,
  changes: RowChanges,
  reviewToken: string
) =>
  crmRequest(`lead-imports/${id}/rows/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, reviewToken, ...changes })
  });
export const reviewImport = (id: string, version: number, reviewToken: string) =>
  crmRequest(`lead-imports/${id}/review`, {
    method: 'POST',
    body: JSON.stringify({ version, reviewToken })
  });
export const confirmImport = (id: string, version: number, excludePending = false) =>
  crmRequest<ImportProgress>(`lead-imports/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ version, excludePending })
  });
