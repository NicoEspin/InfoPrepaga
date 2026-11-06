import type { LeadImportMapping } from '@prisma/client';
import { resolveImportMappings } from './lead-import.mappings';
import type { ParsedImportRow } from './lead-import.parser';
const row: ParsedImportRow = {
  sheet: 'DATOS LAN',
  rowNumber: 2,
  group: 'Datos IP',
  name: 'Sintético',
  nameCandidates: [],
  nameResolved: true,
  formulaFields: [],
  phone: '',
  email: 'synthetic@example.test',
  advisor: 'FEDE',
  observations: '',
  metadata: {
    originalDate: '5/8',
    schedule: '',
    segment: '',
    originalAdvisor: 'FEDE',
    originalPhone: '',
    nameColumns: 'D',
  },
};
const rule = (patch: Partial<LeadImportMapping>): LeadImportMapping => ({
  kind: 'ADVISOR',
  scope: '*',
  key: 'fede',
  sourceId: null,
  assignedToId: 'seller',
  confirmedById: 'admin',
  updatedAt: new Date(),
  ...patch,
});
describe('Reusable confirmed mappings', () => {
  const sources = [
    { id: 'ip', name: 'Landing IP' },
    { id: 'meta1', name: 'Meta 1' },
    { id: 'meta2', name: 'Meta 2' },
  ];
  const users = [{ id: 'seller', firstName: 'Federico', lastName: null }];
  it('resolves a unique known source but does not infer nickname identities', () => {
    expect(resolveImportMappings([row], [], sources, users)[0]).toMatchObject({
      sourceId: 'ip',
      assignmentResolved: false,
      assignedToId: null,
    });
    expect(
      resolveImportMappings([{ ...row, group: 'Meta' }], [], sources, users)[0]
        .sourceId,
    ).toBeNull();
  });
  it('reuses confirmed aliases regardless of capitalization and respects explicit automatic assignment', () => {
    expect(
      resolveImportMappings([row], [rule({})], sources, users)[0],
    ).toMatchObject({ assignedToId: 'seller', assignmentResolved: true });
    expect(
      resolveImportMappings(
        [{ ...row, advisor: 'Federico' }],
        [rule({ key: 'federico', assignedToId: null })],
        sources,
        users,
      )[0],
    ).toMatchObject({ assignedToId: null, assignmentResolved: true });
  });
  it('does not use inactive saved destinations or assign sheet defaults over a historical advisor', () => {
    const rules = [
      rule({
        kind: 'ORIGIN',
        scope: 'DATOS LAN',
        key: 'datos ip',
        sourceId: 'disabled',
      }),
      rule({ kind: 'DEFAULT', scope: 'DATOS LAN', key: '*' }),
    ];
    expect(
      resolveImportMappings([row], rules, sources, users)[0],
    ).toMatchObject({
      sourceId: null,
      assignmentResolved: false,
      assignedToId: null,
    });
    expect(
      resolveImportMappings(
        [{ ...row, advisor: '' }],
        rules,
        sources,
        users,
      )[0],
    ).toMatchObject({ assignedToId: 'seller', assignmentResolved: true });
  });
});
