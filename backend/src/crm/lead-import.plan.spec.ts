import type { LeadImportRow } from '@prisma/client';
import {
  appearanceFingerprint,
  planLeadImport,
  type ExistingImportContact,
} from './lead-import.plan';

const row = (
  id: string,
  patch: Partial<LeadImportRow> = {},
): LeadImportRow => ({
  id,
  batchId: 'batch',
  sheet: 'Fede',
  rowNumber: Number(id) || 1,
  group: 'Fede',
  name: 'Contacto sintético',
  nameCandidates: [],
  nameResolved: true,
  formulaFields: [],
  email: 'contact@example.test',
  phone: '',
  observations: 'Historia sintética',
  metadata: {},
  advisor: '',
  sourceId: 'source',
  assignedToId: null,
  assignmentResolved: true,
  decision: 'AUTO',
  reviewedMatches: [],
  leadId: null,
  outcome: null,
  ...patch,
});
const plan = (
  rows: LeadImportRow[],
  leads: ExistingImportContact[] = [],
  seen = new Set<string>(),
) =>
  planLeadImport(
    rows,
    ['Fede', 'PIPA'],
    leads,
    new Set(['source']),
    new Set(['seller']),
    seen,
  );
describe('Conservative import planning', () => {
  it('consolidates case-insensitive emails across sheets without name-only matching', () => {
    const result = plan([
      row('1'),
      row('2', { sheet: 'PIPA', email: 'CONTACT@EXAMPLE.TEST' }),
      row('3', { email: 'another@example.test' }),
    ]);
    expect(result.rows.map((r) => r.action)).toEqual([
      'CREATE',
      'MERGE',
      'CREATE',
    ]);
    expect(result.summary).toMatchObject({
      uniqueContacts: 2,
      internalMatches: 1,
      creates: 2,
      merged: 1,
    });
  });
  it('normalizes phones and blocks incompatible identities, emails and bridge components', () => {
    const a = row('1', { phone: '011 15 2345-6789', email: '' });
    const b = row('2', { phone: '+54 9 11 2345 6789', email: '' });
    expect(plan([a, b]).rows[1].action).toBe('MERGE');
    expect(plan([a, { ...b, name: 'Otra persona' }]).summary.review).toBe(2);
    expect(
      plan([
        row('1', { phone: a.phone }),
        row('2', { phone: b.phone, email: 'incompatible@example.test' }),
      ]).summary.review,
    ).toBe(2);
    expect(
      plan(
        [a, b],
        [
          {
            id: 'a',
            name: a.name,
            phoneKey: '+5491123456789',
            emailKey: null,
            assignedToId: null,
            version: 1,
          },
          {
            id: 'b',
            name: a.name,
            phoneKey: '+5491123456789',
            emailKey: null,
            assignedToId: null,
            version: 1,
          },
        ],
      ).rows.every((r) => r.action === 'REVIEW'),
    ).toBe(true);
  });
  it('separates configuration from contact errors and never selects blocking rows', () => {
    const result = plan([
      row('1', { sourceId: null }),
      row('2', { email: 'invalid', sourceId: null }),
    ]);
    expect(result.rows[0]).toMatchObject({
      state: 'CONFIGURATION',
      contactErrors: [],
      selected: false,
    });
    expect(result.rows[1]).toMatchObject({
      state: 'CORRECTION',
      selected: false,
    });
    expect(result.summary.contactErrors).toBe(1);
    expect(result.summary.configuration).toBe(1);
  });
  it('plans existing contacts without changing historical owners and detects stale lead versions', () => {
    const lead = {
      id: 'existing',
      name: 'Contacto sintético',
      emailKey: 'contact@example.test',
      phoneKey: null,
      version: 2,
      assignedToId: 'another-seller',
    };
    const input = row('1', {
      advisor: 'Histórico',
      assignmentResolved: false,
      reviewedMatches: ['existing:2'],
    });
    const before = plan([input], [lead]);
    expect(before.rows[0]).toMatchObject({
      action: 'UPDATE',
      configurationErrors: [],
      requiresReview: false,
    });
    const after = plan([input], [{ ...lead, version: 3 }]);
    expect(after.summary.requiresReview).toBe(true);
    expect(after.reviewToken).not.toBe(before.reviewToken);
  });
  it('skips reimported appearances and explicitly omitted conflicts', () => {
    const input = row('1');
    expect(
      plan([input], [], new Set([appearanceFingerprint(input)])).rows[0],
    ).toMatchObject({ action: 'SKIP', replay: true });
    expect(
      plan([
        input,
        row('2', { name: 'Otra persona', decision: 'OMIT' }),
      ]).rows.map((r) => r.action),
    ).toEqual(['CREATE', 'SKIP']);
  });
});
