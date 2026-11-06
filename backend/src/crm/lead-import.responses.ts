import { ApiResponse, type ApiResponseSchemaHost } from '@nestjs/swagger';
type Schema = ApiResponseSchemaHost['schema'];
const text: Schema = { type: 'string' };
const uuid: Schema = { type: 'string', format: 'uuid' };
const number: Schema = { type: 'integer' };
const bool: Schema = { type: 'boolean' };
const array = (items: Schema): Schema => ({ type: 'array', items });
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: 'object', properties, required });
const metadata = object({
  originalDate: text,
  schedule: text,
  segment: text,
  originalAdvisor: text,
  originalPhone: text,
  nameColumns: text,
});
const match = object(
  {
    kind: { type: 'string', enum: ['email', 'phone'] },
    name: text,
    leadId: uuid,
    rowId: uuid,
    sheet: text,
    rowNumber: number,
  },
  ['kind', 'name'],
);
const row = object({
  action: {
    type: 'string',
    enum: ['CREATE', 'UPDATE', 'MERGE', 'SKIP', 'REVIEW'],
  },
  state: {
    type: 'string',
    enum: ['READY', 'READY_UPDATE', 'CONFIGURATION', 'CORRECTION', 'SKIP'],
  },
  contactErrors: array(text),
  configurationErrors: array(text),
  conflicts: array(text),
  conflictReasons: array(text),
  replay: bool,
  targetId: nullable(uuid),
  fingerprint: text,
  leaderId: uuid,
  outcome: nullable(text),
  changes: object({ add: array(text), preserve: array(text) }),
  comparisons: array(
    object({
      kind: { type: 'string', enum: ['CRM', 'FILE'] },
      referenceId: uuid,
      canApply: bool,
      fields: array(
        object({
          field: text,
          label: text,
          current: nullable(text),
          incoming: nullable(text),
          result: nullable(text),
          action: {
            type: 'string',
            enum: ['PRESERVE', 'ADD', 'HISTORY', 'CONFLICT', 'REVIEW'],
          },
          reason: text,
        }),
      ),
    }),
  ),
  comparisonCount: number,
  id: uuid,
  batchId: uuid,
  sheet: text,
  rowNumber: number,
  group: text,
  name: text,
  nameCandidates: array(text),
  nameResolved: bool,
  formulaFields: array(text),
  email: text,
  phone: text,
  observations: text,
  metadata,
  advisor: text,
  sourceId: nullable(uuid),
  assignedToId: nullable(uuid),
  assignmentResolved: bool,
  decision: { type: 'string', enum: ['AUTO', 'INCLUDE', 'OMIT'] },
  leadId: nullable(uuid),
  active: bool,
  errors: array(text),
  matches: array(match),
  duplicate: bool,
  selected: bool,
  requiresReview: bool,
});
const schemas = {
  created: object({ id: uuid }),
  changed: object({ id: uuid, version: number }),
  reviewed: object({ id: uuid, version: number }),
  list: array(
    object({
      id: uuid,
      fileName: text,
      status: text,
      imported: number,
      total: number,
      createdAt: { type: 'string', format: 'date-time' },
    }),
  ),
  progress: object({
    created: number,
    updated: number,
    merged: number,
    excluded: number,
    id: uuid,
    status: { type: 'string', enum: ['IMPORTING', 'COMPLETE'] },
    version: number,
    imported: number,
    omitted: number,
  }),
  preview: object({
    id: uuid,
    fileName: text,
    version: number,
    status: { type: 'string', enum: ['REVIEW', 'IMPORTING', 'COMPLETE'] },
    expiresAt: { type: 'string', format: 'date-time' },
    sheets: array(text),
    availableSheets: array(text),
    warnings: array(text),
    reviewToken: text,
    items: array(row),
    page: number,
    pageSize: { type: 'integer', enum: [50] },
    rowTotal: number,
    groups: array(
      object({ sheet: text, group: text, sourceId: nullable(uuid) }),
    ),
    advisors: array(
      object({
        advisor: text,
        variants: array(text),
        resolved: bool,
        assignedToId: nullable(uuid),
      }),
    ),
    summary: object({
      detected: number,
      uniqueContacts: number,
      creates: number,
      updates: number,
      internalMatches: number,
      review: number,
      configuration: number,
      contactErrors: number,
      merged: number,
      imported: number,
      omitted: number,
      invalid: number,
      pending: number,
      duplicates: number,
      requiresReview: bool,
      unreviewedReady: number,
      cleanupCandidates: object({
        INVALID_EMAIL: number,
        INVALID_PHONE: number,
        FORMULA_PHONE: number,
      }),
    }),
  }),
};
export function ImportResponse(kind: keyof typeof schemas, status = 200) {
  return ApiResponse({ status, schema: schemas[kind] });
}
