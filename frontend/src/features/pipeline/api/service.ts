import { crmRequest } from '@/features/crm/api';
import type { PipelinePage, Stage } from './types';
export const pipelinePage = (query: string, signal?: AbortSignal) =>
  crmRequest<PipelinePage>(`pipeline?${query}`, { signal });
export const moveStage = (id: string, version: number, stage: Stage, reason?: string) =>
  crmRequest(`pipeline/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ version, stage, ...(reason && { reason }) })
  });
