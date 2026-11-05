import ExcelJS from 'exceljs';
import { contactKeys } from './contact-keys';
import {
  checkImportArchive,
  importCellText,
  importContactErrors,
  parseLeadImport,
} from './lead-import.parser';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportPatchDto, ImportRowPatchDto } from './lead-import.dto';

const file = async (book: ExcelJS.Workbook) =>
  Buffer.from(await book.xlsx.writeBuffer());
describe('Lead Excel adapters', () => {
  it('maps five layouts, PIPA shifted headers, incomplete dates and extra blocks', async () => {
    const book = new ExcelJS.Workbook();
    const lan = book.addWorksheet('DATOS LAN');
    lan.addRow([
      'FECHA',
      'Datos Lan',
      'Whatsapp',
      'Datos Ip',
      'face Meta',
      'TELEFONO',
      'HORARIO',
      'MAIL',
      'SEGMENTO',
      'ASESOR',
      'OBSERVACION',
    ]);
    lan.addRow([
      '2/8',
      '  Contacto   Uno  ',
      null,
      null,
      null,
      '011 15 2345 6789',
      'Tarde',
      'UNO@EXAMPLE.TEST',
      'Grupo',
      'Asesor A',
      'Texto',
    ]);
    lan.addRow([
      null,
      'Candidato Uno',
      'Candidato Dos',
      null,
      null,
      '+54 9 11 2345 6790',
    ]);
    const pipa = book.addWorksheet('PIPA');
    pipa.addRow(['A', 'G', 'O', 'S', 'T', 'O']);
    pipa.addRow([
      'FECHA',
      'NOMBRE',
      'TEL',
      'HORARIO',
      'MAIL',
      'REGIMEN',
      null,
      'OBSERVACION',
    ]);
    pipa.addRow([
      '3/8',
      'Contacto Dos',
      null,
      'Mañana',
      'dos@example.test',
      'Régimen',
      'Asesor B',
      'Observación',
    ]);
    const fede = book.addWorksheet('Fede');
    fede.addRow([
      'FECHA',
      'NOMBRE Y APELLIDO',
      'TELEFONO',
      'HORARIO',
      'MAIL',
      'SEGMENTO',
      'ASESOR',
      'OBSERVACION',
    ]);
    fede.addRow([
      new Date('2026-08-04T00:00:00Z'),
      'Contacto Tres',
      '+54 9 11 2345 6791',
      null,
      null,
      null,
      'Asesor C',
    ]);
    fede.getCell('AB2').value = 'Copia accidental';
    fede.addRow(['FECHA', 'NOMBRE Y APELLIDO', 'TELEFONO']);
    const face = book.addWorksheet('DATOS FACE');
    face.addRow([null, 46168, 'tel', 'FECHA', 'OBSERVACIONES', 'INVERSION']);
    face.addRow([
      'Asesor D',
      'Contacto Cuatro',
      '+54 9 11 2345 6792',
      '5/8',
      'Nota',
      'No importar inversión',
    ]);
    const leaflet = book.addWorksheet('folletos');
    leaflet.addRow([
      'FECHA',
      'nombre',
      'tel ',
      'regimen',
      'asesor',
      'observacion',
    ]);
    leaflet.addRow([
      '6/8',
      'Contacto Cinco',
      '+54 9 11 2345 6793',
      'Grupo',
      'Asesor E',
      'Texto',
    ]);
    book.addWorksheet('Pagos').addRow(['No importar']);
    book.addWorksheet('Analisis').addRow(['No importar']);
    const parsed = await parseLeadImport(await file(book));
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.sheets).toHaveLength(5);
    expect(parsed.rows[0]).toMatchObject({
      name: 'Contacto Uno',
      email: 'uno@example.test',
      metadata: {
        originalDate: '2/8',
        schedule: 'Tarde',
        originalAdvisor: 'Asesor A',
      },
    });
    expect(parsed.rows[1]).toMatchObject({
      name: '',
      nameResolved: false,
      nameCandidates: ['Candidato Uno', 'Candidato Dos'],
    });
    expect(parsed.rows[2]).toMatchObject({
      sheet: 'PIPA',
      rowNumber: 3,
      advisor: 'Asesor B',
    });
    expect(parsed.rows[3].metadata.originalDate).toBe('2026-08-04');
    expect(parsed.rows[4].observations).toBe('Nota');
    expect(JSON.stringify(parsed.rows)).not.toContain('inversión');
    expect(parsed.warnings.some((warning) => warning.includes('Fede'))).toBe(
      true,
    );
    expect(parsed.warnings).toContain('Hoja excluida: Pagos');
  });
  it('blocks formula cells, reads hyperlink text and rejects corrupt files or archive size limits', async () => {
    expect(() => checkImportArchive(Buffer.from('not excel'))).toThrow();
    expect(() =>
      checkImportArchive(Buffer.alloc(10 * 1024 * 1024 + 1)),
    ).toThrow('10 MB');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Fede');
    sheet.getCell('B1').value = { formula: '"Contacto"', result: 'Contacto' };
    const formula = (await parseLeadImport(await file(book))).rows[0];
    expect(formula.name).toBe('');
    expect(
      importContactErrors(formula).some((error) =>
        error.includes('Fórmula no admitida'),
      ),
    ).toBe(true);
    sheet.getCell('B1').value = {
      text: 'Contacto',
      hyperlink: 'https://example.test',
    };
    expect((await parseLeadImport(await file(book))).rows[0].name).toBe(
      'Contacto',
    );
    sheet.getCell('B1').value = 'Contacto';
    const archive = await file(book);
    // Central directory expansion limits are checked before allocating XML.
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt32LE(128 * 1024 * 1024, central + 24);
    await expect(parseLeadImport(archive)).rejects.toThrow('demasiado grande');
    const forged = await file(book);
    const forgedCentral = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    forged.writeUInt32LE(1, forgedCentral + 24);
    await expect(parseLeadImport(forged)).rejects.toThrow('comprimido');
  });
  it('rejects more than 5000 candidates and does not count styled empty rows', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Fede');
    for (let i = 0; i < 5001; i++)
      sheet.addRow([
        null,
        `Contacto ${i}`,
        null,
        null,
        `lead${i}@example.test`,
      ]);
    await expect(parseLeadImport(await file(book))).rejects.toThrow('5.000');
    const empty = new ExcelJS.Workbook();
    empty.addWorksheet('Fede').getCell('B1000').font = { bold: true };
    await expect(parseLeadImport(await file(empty))).rejects.toThrow(
      'No encontramos',
    );
  });
  it('normalizes complete Argentine phones without treating prose as a phone', () => {
    expect(
      importCellText({
        text: { richText: [{ text: 'NESTED' }, { text: '@example.test' }] },
        hyperlink: 'mailto:nested@example.test',
      }),
    ).toBe('NESTED@example.test');
    expect(contactKeys('  A@EXAMPLE.TEST ', '011 15 2345-6789')).toEqual({
      emailKey: 'a@example.test',
      phoneKey: '+5491123456789',
    });
    expect(contactKeys(null, '+54 9 11 2345 6789').phoneKey).toBe(
      '+5491123456789',
    );
    expect(contactKeys(null, 'Llamar 1123456789').phoneKey).toBeNull();
    expect(contactKeys(null, '123').phoneKey).toBeNull();
    expect(contactKeys('', '')).toEqual({ emailKey: null, phoneKey: null });
  });
  it('requires a valid contact and rejects null or unknown API inputs', async () => {
    expect(
      importContactErrors({
        name: 'Contacto',
        nameResolved: true,
        email: 'bad',
        phone: '123',
        observations: '',
      }),
    ).toHaveLength(2);
    for (const payload of [
      { version: 1, sheets: null },
      { version: 1, mappings: [{ sheet: null }] },
      { version: 1, role: 'ADMIN' },
    ])
      expect(
        await validate(plainToInstance(ImportPatchDto, payload), {
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ImportRowPatchDto, { version: 1, assignedToId: null }),
      ),
    ).toHaveLength(0);
  });
});
