export const stages = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  FOLLOW_UP: 'En seguimiento',
  PROPOSAL: 'Propuesta enviada',
  CLOSED: 'Cerrado'
};
export type Stage = keyof typeof stages;
export type PipelineLead = {
  id: string;
  name: string;
  company: string | null;
  version: number;
  commercialStage: Stage;
  source: { id: string; name: string };
  assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
};
export type PipelinePage = { items: PipelineLead[]; total: number; page: number; pageSize: number };
