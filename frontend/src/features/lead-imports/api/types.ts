export type ImportRow = {
  id: string;
  sheet: string;
  rowNumber: number;
  group: string;
  name: string;
  nameCandidates: string[];
  email: string;
  phone: string;
  advisor: string;
  observations: string;
  sourceId: string | null;
  assignedToId: string | null;
  assignmentResolved: boolean;
  decision: 'AUTO' | 'INCLUDE' | 'OMIT';
  metadata: Record<string, string>;
  leadId: string | null;
  active: boolean;
  errors: string[];
  selected: boolean;
  duplicate: boolean;
  requiresReview: boolean;
  matches: Array<{
    kind: 'email' | 'phone';
    name: string;
    leadId?: string;
    rowId?: string;
    sheet?: string;
    rowNumber?: number;
  }>;
};
export type ImportPreview = {
  reviewToken: string;
  id: string;
  fileName: string;
  version: number;
  status: 'REVIEW' | 'IMPORTING' | 'COMPLETE';
  expiresAt: string;
  sheets: string[];
  availableSheets: string[];
  warnings: string[];
  items: ImportRow[];
  rowTotal: number;
  page: number;
  pageSize: number;
  groups: Array<{ sheet: string; group: string; sourceId: string | null }>;
  advisors: Array<{ advisor: string; resolved: boolean; assignedToId: string | null }>;
  summary: {
    imported: number;
    omitted: number;
    invalid: number;
    pending: number;
    duplicates: number;
    requiresReview: boolean;
  };
};
export type ImportBatchSummary = {
  id: string;
  fileName: string;
  status: string;
  imported: number;
  total: number;
};
export type ImportProgress = {
  id: string;
  status: 'IMPORTING' | 'COMPLETE';
  version: number;
  imported: number;
  omitted: number;
};
export type RowChanges = Partial<
  Pick<ImportRow, 'name' | 'email' | 'phone' | 'observations' | 'decision' | 'assignedToId'>
> & { sourceId?: string; acknowledgeDuplicates?: boolean };
export type BatchChanges = {
  sheets?: string[];
  duplicates?: 'INCLUDE' | 'OMIT' | 'AUTO';
  mappings?: Array<{
    sheet?: string;
    group?: string;
    advisor?: string;
    sourceId?: string;
    assignedToId?: string | null;
  }>;
};
