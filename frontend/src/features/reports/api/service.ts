import { crmRequest } from '@/features/crm/api';
import { sessionFetch } from '@/lib/session-client';
import type { Catalog, ReportInput, ReportPage, SavedReport, Snapshot } from './types';
export const reportCatalogs = (signal?: AbortSignal) =>
  crmRequest<Catalog>('reports/catalogs', { signal });
export const reportHistory = (page: number, signal?: AbortSignal) =>
  crmRequest<ReportPage>(`reports?page=${page}&pageSize=10`, { signal });
export const reportDetail = (id: string) => crmRequest<SavedReport>(`reports/${id}`);
export const previewReport = (input: ReportInput) =>
  crmRequest<Snapshot>('reports/preview', { method: 'POST', body: JSON.stringify(input) });
export const saveReport = (input: ReportInput, operationKey: string) =>
  crmRequest<SavedReport>('reports', {
    method: 'POST',
    body: JSON.stringify({ ...input, operationKey })
  });
export async function downloadReport(id: string) {
  const response = await sessionFetch(`/api/crm/reports/${encodeURIComponent(id)}/pdf`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf'))
    throw new Error('No se pudo descargar el PDF. El reporte sigue guardado; podés reintentar.');
  return {
    blob: await response.blob(),
    filename:
      response.headers.get('content-disposition')?.match(/filename="([a-zA-Z0-9_.-]+)"/)?.[1] ??
      'reporte.pdf'
  };
}
