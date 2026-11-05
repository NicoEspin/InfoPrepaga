import { crmRequest } from '@/features/crm/api';
import type {
  BatchChanges,
  ImportBatchSummary,
  ImportPreview,
  ImportProgress,
  RowChanges
} from './types';
export const listImports = (signal?: AbortSignal) =>
  crmRequest<ImportBatchSummary[]>('lead-imports', { signal });
export const getImport = (id: string, page: number, signal?: AbortSignal) =>
  crmRequest<ImportPreview>(`lead-imports/${id}?page=${page}`, { signal });
export function uploadImport(file: File) {
  const body = new FormData();
  body.set('file', file);
  return crmRequest<{ id: string }>('lead-imports', { method: 'POST', body });
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
export const confirmImport = (id: string, version: number) =>
  crmRequest<ImportProgress>(`lead-imports/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ version })
  });
