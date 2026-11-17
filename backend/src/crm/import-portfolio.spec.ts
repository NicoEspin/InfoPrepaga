import ExcelJS from 'exceljs';
import {
  completeImportDate,
  portfolioValue,
  readConfiguration,
} from './import-portfolio';
import { parseLeadImport } from './lead-import.parser';
import { planLeadImport } from './lead-import.plan';
import { resolveImportMappings } from './lead-import.mappings';
import type { LeadImportRow } from '@prisma/client';

describe('Historical portfolio conversion', () => {
  it('recognizes conservative marks and complete dates without inventing years', () => {
    expect(
      [' SI ', 'sí', 'NO', 'revisar', '', 'maybe'].map(portfolioValue),
    ).toEqual([
      'ACTIVE',
      'ACTIVE',
      'HISTORICAL',
      'UNCLASSIFIED',
      'UNCLASSIFIED',
      null,
    ]);
    expect(
      ['5/8', '31/2/2026', '29/2/2025', '2026-02-30', 'mañana'].map((v) =>
        completeImportDate(v),
      ),
    ).toEqual([null, null, null, null, null]);
    expect(completeImportDate('29/2/2024')).toBe('2024-02-29');
    expect(completeImportDate('2026-10-04', 'ISO')).toBe('2026-10-04');
    expect(completeImportDate('4/10/2026', 'ISO')).toBeNull();
    expect(() => readConfiguration('{"version":2,"sheets":{}}')).toThrow();
    expect(() =>
      readConfiguration(
        '{"version":1,"sheets":{"Fede":{"phone":{"column":999}}}}',
      ),
    ).toThrow();
  });
  async function book() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Fede');
    sheet.addRow([
      'FECHA',
      'NOMBRE',
      'TEL',
      'HORARIO',
      'MAIL',
      'SEGMENTO',
      'ASESOR',
      'OBSERVACION',
      'Gestion_actual',
      'Responsable_actual',
      'Ultima_gestion',
      'Otro correo',
    ]);
    sheet.addRow([
      '4/5/2026',
      'Persona sintética',
      '',
      '',
      'bad',
      '',
      'Asesor anterior',
      '',
      'SI',
      'Persona actual',
      '5/8',
      'synthetic@example.test',
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  it('reads appended headers and explicit columns without shifting historical fields', async () => {
    const parsed = await parseLeadImport(
      await book(),
      { version: 1, sheets: { Fede: { email: { column: 12 } } } },
      'HISTORICAL',
    );
    expect(parsed.rows[0]).toMatchObject({
      email: 'synthetic@example.test',
      advisor: 'Asesor anterior',
      metadata: {
        portfolioClass: 'ACTIVE',
        currentResponsible: 'Persona actual',
        originalLastManaged: '5/8',
        lastManaged: null,
        originDate: '2026-05-04',
      },
    });
    const resolved = resolveImportMappings(
      parsed.rows,
      [],
      [{ id: 'source', name: 'Fede' }],
      [{ id: 'old', firstName: 'Asesor', lastName: 'anterior' }],
    );
    expect(resolved[0]).toMatchObject({
      assignedToId: null,
      assignmentResolved: false,
    });
    await expect(
      parseLeadImport(await book(), {
        version: 1,
        sheets: { Fede: { email: { column: 200 } } },
      }),
    ).rejects.toThrow('incompatible');
  });
  it('blocks contradictory marks as a contact group and preserves empty marks', async () => {
    const parsed = await parseLeadImport(
      await book(),
      { version: 1, sheets: { Fede: { email: { column: 12 } } } },
      'HISTORICAL',
    );
    const base: LeadImportRow = {
      ...parsed.rows[0],
      id: 'a',
      batchId: 'batch',
      sourceId: 'source',
      assignedToId: 'seller',
      assignmentResolved: true,
      decision: 'AUTO',
      reviewedMatches: [],
      leadId: null,
      outcome: null,
      sourceFingerprint: null,
      legacyFingerprints: [],
    };
    const plan = (rows: LeadImportRow[]) =>
      planLeadImport(
        rows,
        ['Fede'],
        [],
        new Set(['source']),
        new Set(['seller']),
      );
    const other = {
      ...base,
      id: 'b',
      rowNumber: 3,
      metadata: { ...parsed.rows[0].metadata, portfolioClass: 'HISTORICAL' },
    };
    expect(
      plan([base, other]).rows.every(
        (row) =>
          row.conflictReasons.includes('PORTFOLIO_MISMATCH') && !row.selected,
      ),
    ).toBe(true);
    const compatible = {
      ...other,
      metadata: { ...parsed.rows[0].metadata, portfolioClass: 'UNCLASSIFIED' },
    };
    expect(
      plan([compatible, base]).rows.every(
        (row) => row.portfolioClass === 'ACTIVE' && row.selected,
      ),
    ).toBe(true);
  });
});
