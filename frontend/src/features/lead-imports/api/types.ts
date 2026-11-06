export type ImportFilter = 'ALL' | 'CREATE' | 'UPDATE' | 'MERGE' | 'DUPLICATES' | 'REVIEW' | 'SKIP';
export type ImportRow = {
  comparisons: Array<{
    kind: 'CRM' | 'FILE';
    referenceId: string;
    canApply: boolean;
    fields: Array<{
      field: string;
      label: string;
      current: string | null;
      incoming: string | null;
      result: string | null;
      action: 'PRESERVE' | 'ADD' | 'HISTORY' | 'CONFLICT' | 'REVIEW';
      reason: string;
    }>;
  }>;
  comparisonCount: number;
  action: 'CREATE' | 'UPDATE' | 'MERGE' | 'SKIP' | 'REVIEW';
  state: 'READY' | 'READY_UPDATE' | 'CONFIGURATION' | 'CORRECTION' | 'SKIP';
  contactErrors: string[];
  configurationErrors: string[];
  conflicts: string[];
  conflictReasons: string[];
  replay: boolean;
  targetId: string | null;
  changes: { add: string[]; preserve: string[] };
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
  metadata: {
    originalDate: string;
    schedule: string;
    segment: string;
    originalAdvisor: string;
    originalPhone: string;
    nameColumns: string;
    reviewedOriginal?: Record<string, string | boolean>;
  };
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
  advisors: Array<{
    advisor: string;
    variants: string[];
    resolved: boolean;
    assignedToId: string | null;
  }>;
  summary: {
    detected: number;
    uniqueContacts: number;
    creates: number;
    updates: number;
    internalMatches: number;
    review: number;
    configuration: number;
    contactErrors: number;
    merged: number;
    imported: number;
    omitted: number;
    invalid: number;
    pending: number;
    duplicates: number;
    requiresReview: boolean;
    unreviewedReady: number;
    cleanupCandidates: Record<'INVALID_EMAIL' | 'INVALID_PHONE' | 'FORMULA_PHONE', number>;
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
  created: number;
  updated: number;
  merged: number;
  excluded: number;
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
  bulkCleanup?: 'INVALID_EMAIL' | 'INVALID_PHONE' | 'FORMULA_PHONE';
  sheets?: string[];
  duplicates?: 'INCLUDE' | 'OMIT' | 'AUTO';
  mappings?: Array<{
    remember?: boolean;
    aliases?: string[];
    sheet?: string;
    group?: string;
    advisor?: string;
    sourceId?: string;
    assignedToId?: string | null;
  }>;
};

export type ImportMapping = {
  kind: 'ORIGIN' | 'ADVISOR' | 'DEFAULT';
  scope: string;
  key: string;
  sourceId: string | null;
  assignedToId: string | null;
  updatedAt: string;
  confirmedById: string;
  source: { id: string; name: string; isActive: boolean } | null;
  assignedTo: {
    email: string;
    id: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    deletedAt: string | null;
  } | null;
  confirmedBy: { email: string; id: string; firstName: string | null; lastName: string | null };
};
export type MappingIdentity = Pick<ImportMapping, 'kind' | 'scope' | 'key'> & {
  expectedUpdatedAt: string;
};
export type MappingUpdate = MappingIdentity & {
  newKey?: string;
  sourceId?: string;
  assignedToId?: string | null;
};
export type ImportAppearance = {
  corrections: { email: string | null; phone: string | null; formulaPhoneOmitted: boolean } | null;
  id: string;
  fileName: string;
  batchId: string;
  sheet: string;
  rowNumber: number;
  source: { id: string; name: string; isActive: boolean };
  originalAdvisor: string;
  originalDate: string;
  observations: string;
  group: string;
  createdAt: string;
};
export type AppearancePage = {
  items: ImportAppearance[];
  total: number;
  page: number;
  pageSize: number;
  legacy: Record<string, string | number> | null;
};
