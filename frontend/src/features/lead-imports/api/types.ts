export type ImportSelection = {
  actionFilter?: string;
  ids?: string[];
  sheet?: string;
  portfolioClass?: string;
  problem?: string;
};
export type ImportConfiguration = {
  version: 1;
  managementAliases?: Record<string, 'ACTIVE' | 'HISTORICAL' | 'UNCLASSIFIED'>;
  dateFormat?: 'DMY' | 'ISO';
  sheets: Record<
    string,
    Partial<
      Record<
        | 'name'
        | 'phone'
        | 'email'
        | 'advisor'
        | 'observations'
        | 'originalDate'
        | 'currentManagement'
        | 'currentResponsible'
        | 'lastManaged',
        { column?: number; value?: string }
      >
    >
  >;
};
export type ImportFilter = 'ALL' | 'CREATE' | 'UPDATE' | 'MERGE' | 'DUPLICATES' | 'REVIEW' | 'SKIP';
export type ImportRow = {
  portfolioClass: 'ACTIVE' | 'HISTORICAL' | 'UNCLASSIFIED' | null;
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
    intakeMode?: string;
    allowDistribution?: boolean;
    currentManagement?: string;
    currentResponsible?: string;
    originalLastManaged?: string;
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
  result: ImportResult;
  mode: 'NEW' | 'HISTORICAL';
  configuration: ImportConfiguration | null;
  selectableTotal: number;
  problems: Record<string, number>;
  managementValues: Array<{ value: string; count: number }>;
  currentResponsibles: Array<{ alias: string; count: number }>;
  reviewToken: string;
  id: string;
  fileName: string;
  version: number;
  status: 'REVIEW' | 'IMPORTING' | 'PARTIAL' | 'COMPLETE';
  imported: number;
  expiresAt: string;
  sheets: string[];
  availableSheets: string[];
  warnings: string[];
  items: ImportRow[];
  rowTotal: number;
  page: number;
  pageSize: number;
  groups: Array<{
    count: number;
    blocked: number;
    sheet: string;
    group: string;
    sourceId: string | null;
  }>;
  advisors: Array<{
    advisor: string;
    count: number;
    variants: string[];
    resolved: boolean;
    assignedToId: string | null;
  }>;
  summary: {
    portfolio: Record<string, number>;
    distribution: number;
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
    alreadyRegistered: number;
    userOmitted: number;
    invalid: number;
    pending: number;
    duplicates: number;
    requiresReview: boolean;
    unreviewedReady: number;
    cleanupCandidates: Record<'INVALID_EMAIL' | 'INVALID_PHONE' | 'FORMULA_PHONE', number>;
  };
};
export type ImportResult = {
  created: number;
  updated: number;
  merged: number;
  omitted: number;
  alreadyRegistered: number;
  pending: number;
};
export type ImportBatchSummary = {
  result: ImportResult;
  configuration: ImportConfiguration | null;
  mode: 'NEW' | 'HISTORICAL';
  id: string;
  fileName: string;
  status: string;
  imported: number;
  total: number;
};
export type ImportProgress = {
  result: ImportResult;
  created: number;
  updated: number;
  merged: number;
  excluded: number;
  id: string;
  status: 'IMPORTING' | 'PARTIAL' | 'COMPLETE';
  version: number;
  imported: number;
  omitted: number;
};
export type RowChanges = Partial<
  Pick<ImportRow, 'name' | 'email' | 'phone' | 'observations' | 'decision' | 'assignedToId'>
> & {
  portfolioClass?: 'ACTIVE' | 'HISTORICAL' | 'UNCLASSIFIED';
  sourceId?: string;
  acknowledgeDuplicates?: boolean;
};
export type BatchChanges = {
  bulk?: {
    selection: ImportSelection;
    action: 'ACTIVE' | 'HISTORICAL' | 'UNCLASSIFIED' | 'OMIT' | 'AUTO' | 'ASSIGN' | 'DISTRIBUTE';
    assignedToId?: string;
    expectedCount: number;
  };

  bulkCleanup?: 'INVALID_EMAIL' | 'INVALID_PHONE' | 'FORMULA_PHONE';
  sheets?: string[];
  duplicates?: 'INCLUDE' | 'OMIT' | 'AUTO';
  mappings?: Array<{
    currentResponsible?: boolean;
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
  kind: 'ORIGIN' | 'ADVISOR' | 'DEFAULT' | 'CURRENT_RESPONSIBLE';
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
  intakeMode: string;
  currentManagement: string;
  currentResponsible: string;
  originalLastManaged: string;
  declaredLastManagedAt: string;
  portfolioClass: string;

  corrections: {
    email: string | null;
    phone: string | null;
    appliedEmail: string;
    appliedPhone: string;
    formulaPhoneOmitted: boolean;
  } | null;
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
