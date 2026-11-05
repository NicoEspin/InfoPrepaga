export type Metrics = {
  entered: number;
  periodClosures: number;
  cohortClosures: number;
  conversion: string | null;
  stages: Record<string, number>;
  investment: string | null;
  investmentPartial: boolean;
  cpl: string | null;
  cpc: string | null;
};
export type Snapshot = {
  calculationVersion: number;
  name: string;
  generatedAt: string;
  author: { id: string; name: string };
  from: string;
  to: string;
  timezone: string;
  cutoff: string;
  partial: boolean;
  allResponsibles: boolean;
  sources: { id: string; name: string; isActive: boolean; investment: string | null }[];
  responsibles: { id: string | null; name: string; isActive: boolean }[];
  summary: Metrics;
  bySource: { id: string | null; name: string; metrics: Metrics }[];
  byResponsible: { id: string | null; name: string; metrics: Metrics }[];
  warnings: string[];
};
export type Catalog = {
  sources: { id: string; name: string; isActive: boolean }[];
  responsibles: { id: string; name: string; isActive: boolean }[];
};
export type ReportInput = {
  name: string;
  from: string;
  to: string;
  sourceIds: string[];
  responsibleIds: string[];
  investments: { sourceId: string; amount: string | null }[];
};
export type SavedReport = {
  id: string;
  name: string;
  generatedAt: string;
  authorId: string;
  snapshot: Snapshot;
};
export type ReportPage = {
  items: Pick<SavedReport, 'id' | 'name' | 'generatedAt' | 'authorId'>[];
  total: number;
  page: number;
  pageSize: number;
};
export const stageNames: Record<string, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  FOLLOW_UP: 'En seguimiento',
  PROPOSAL: 'Propuesta enviada',
  CLOSED: 'Cerrado',
  UNKNOWN: 'Sin historial de etapa'
};
