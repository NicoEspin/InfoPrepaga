import type { LeadImportRow } from '@prisma/client';
import { compareImportContact } from './lead-import.comparison';
import { importExceptionSummary } from './lead-import.exceptions';
import { planLeadImport } from './lead-import.plan';
const row: LeadImportRow = {
  id: 'row',
  batchId: 'batch',
  sheet: 'Fede',
  rowNumber: 2,
  group: 'Fede',
  name: 'Contacto sintético',
  nameCandidates: [],
  nameResolved: true,
  formulaFields: [],
  email: 'synthetic@example.test',
  phone: '011 15 2345 6789',
  observations: 'Historia',
  metadata: { originalDate: '5/8' },
  advisor: 'Histórico',
  sourceId: 'source',
  assignedToId: 'incoming-seller',
  assignmentResolved: true,
  decision: 'AUTO',
  reviewedMatches: [],
  leadId: null,
  outcome: null,
};
const current = {
  id: 'crm',
  name: row.name,
  emailKey: row.email,
  phoneKey: null,
  email: row.email,
  phone: null,
  assignedToId: 'current-seller',
  sourceId: 'old-source',
  version: 2,
  status: 'PROSPECT',
  commercialStage: 'FOLLOW_UP',
  observations: 'Comercial vigente',
};
describe('Import field comparisons', () => {
  it('shows current and incoming values and adds only empty contacts', () => {
    const fields = compareImportContact(row, current, false);
    expect(fields.find((field) => field.field === 'phone')).toMatchObject({
      current: null,
      incoming: row.phone,
      result: '+5491123456789',
      action: 'ADD',
    });
    expect(fields.find((field) => field.field === 'email')?.action).toBe(
      'PRESERVE',
    );
    expect(
      fields.find((field) => field.field === 'observations'),
    ).toMatchObject({
      current: 'Comercial vigente',
      incoming: 'Historia',
      result: 'Comercial vigente',
      action: 'HISTORY',
    });
    expect(fields.find((field) => field.field === 'status')).toMatchObject({
      current: 'PROSPECT',
      result: 'PROSPECT',
      action: 'PRESERVE',
    });
  });
  it('never presents a blocked contact addition as an applicable update', () => {
    const fields = compareImportContact(
      { ...row, name: 'Otra identidad' },
      current,
      true,
    );
    expect(fields.find((field) => field.field === 'name')?.action).toBe(
      'CONFLICT',
    );
    expect(fields.find((field) => field.field === 'phone')).toMatchObject({
      result: null,
      action: 'REVIEW',
    });
    const plan = planLeadImport(
      [{ ...row, name: 'Otra identidad' }],
      ['Fede'],
      [current],
      new Set(['source']),
      new Set(['incoming-seller']),
    );
    expect(plan.rows[0]).toMatchObject({ action: 'REVIEW', selected: false });
    expect(plan.rows[0].comparisons[0].canApply).toBe(false);
  });
  it('keeps aggregate diagnosis free of contact data and exposes safe bulk candidates separately', () => {
    const plan = planLeadImport(
      [{ ...row, email: 'invalid', advisor: '' }],
      ['Fede'],
      [],
      new Set(['source']),
      new Set(['incoming-seller']),
    );
    const result = importExceptionSummary(plan.rows);
    expect(result).toMatchObject({
      total: 1,
      explicitBulkCandidates: { discardInvalidEmailWithVerifiedPhone: 1 },
      automaticIdentityMerges: 0,
    });
    expect(JSON.stringify(result)).not.toContain(row.phone);
    expect(JSON.stringify(result)).not.toContain(row.name);
  });
});
