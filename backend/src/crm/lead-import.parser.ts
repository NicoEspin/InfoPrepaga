import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { contactKeys } from './contact-keys';
import { isEmail } from 'class-validator';
import { inflateRawSync } from 'node:zlib';

export const IMPORT_SHEETS = [
  'DATOS LAN',
  'PIPA',
  'Fede',
  'DATOS FACE',
  'folletos',
];
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export type ParsedImportRow = {
  sheet: string;
  rowNumber: number;
  group: string;
  name: string;
  nameCandidates: string[];
  nameResolved: boolean;
  formulaFields: string[];
  phone: string;
  email: string;
  advisor: string;
  observations: string;
  metadata: {
    originalDate: string;
    schedule: string;
    segment: string;
    originalAdvisor: string;
  };
};
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
export function importCellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText))
      return clean(
        value.richText
          .map((run: unknown) =>
            run && typeof run === 'object' && 'text' in run
              ? importCellText(run.text)
              : '',
          )
          .join(''),
      );
    if ('text' in value) return importCellText(value.text);
    return '';
  }
  return clean(
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '',
  );
}

// Bound the XLSX archive before ExcelJS allocates the workbook. No extraction to disk.
export function checkImportArchive(buffer: Buffer) {
  if (buffer.length > MAX_IMPORT_BYTES)
    throw new BadRequestException('El archivo supera 10 MB');
  let end = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new BadRequestException('El archivo no es un XLSX válido');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  let expanded = 0;
  if (!count || count > 2000)
    throw new BadRequestException('El Excel excede los límites de contenido');
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new BadRequestException('Estructura de Excel inválida');
    expanded += buffer.readUInt32LE(cursor + 24);
    if (expanded > 64 * 1024 * 1024 || buffer.readUInt16LE(cursor + 8) & 1)
      throw new BadRequestException(
        'Excel cifrado o contenido demasiado grande',
      );
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if (
      localOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localOffset) !== 0x04034b50
    )
      throw new BadRequestException('Estructura de Excel inválida');
    const start =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    if (start + compressedSize > buffer.length)
      throw new BadRequestException('Contenido de Excel incompleto');
    try {
      const compressed = buffer.subarray(start, start + compressedSize);
      const method = buffer.readUInt16LE(cursor + 10);
      const actualSize =
        method === 0
          ? compressed.length
          : method === 8
            ? inflateRawSync(compressed, {
                maxOutputLength: Math.max(1, uncompressedSize),
              }).length
            : -1;
      if (actualSize !== uncompressedSize)
        throw new Error('Invalid ZIP entry size');
    } catch {
      throw new BadRequestException(
        'Contenido comprimido de Excel inválido o demasiado grande',
      );
    }
    cursor +=
      46 +
      buffer.readUInt16LE(cursor + 28) +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
}

export async function parseLeadImport(buffer: Buffer) {
  checkImportArchive(buffer);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
  } catch {
    throw new BadRequestException(
      'No se pudo leer el Excel. Revisá que sea un .xlsx válido',
    );
  }
  const rows: ParsedImportRow[] = [];
  const warnings = new Set<string>();
  const sheets: string[] = [];
  for (const sheet of book.worksheets) {
    const canonical = IMPORT_SHEETS.find(
      (name) => name.toLowerCase() === sheet.name.trim().toLowerCase(),
    );
    if (!canonical) {
      warnings.add(`Hoja excluida: ${sheet.name}`);
      continue;
    }
    if (sheets.includes(canonical))
      throw new BadRequestException('Hay hojas con nombres equivalentes');
    sheets.push(canonical);
    const lan = canonical === 'DATOS LAN';
    const face = canonical === 'DATOS FACE';
    const leaflet = canonical === 'folletos';
    const last = lan ? 11 : face ? 5 : leaflet ? 6 : 8;
    if (sheet.rowCount > 20000 || sheet.columnCount > 256)
      throw new BadRequestException(
        'La hoja excede los límites de filas o columnas',
      );
    sheet.eachRow((row, rowNumber) => {
      const values: string[] = [''];
      const formulaFields: string[] = [];
      row.eachCell((cell, column) => {
        if (column > last) {
          if (cell.value !== null)
            warnings.add(
              `${canonical}: hay contenido fuera de la tabla principal; no se importará`,
            );
          return;
        }
        const value = cell.value;
        if (
          value &&
          typeof value === 'object' &&
          ('formula' in value || 'sharedFormula' in value)
        ) {
          const field = (lan ? [2, 3, 4, 5] : [2]).includes(column)
            ? 'name'
            : column === (lan ? 6 : 3)
              ? 'phone'
              : column === (lan ? 8 : face || leaflet ? 0 : 5)
                ? 'email'
                : column === (lan ? 11 : face ? 5 : leaflet ? 6 : 8)
                  ? 'observations'
                  : undefined;
          if (field) formulaFields.push(field);
          else
            warnings.add(
              `${canonical}, fila ${rowNumber}: se omitió una fórmula en un dato complementario`,
            );
          return;
        }
        // Hyperlinks contribute only their visible text; never follow their target.
        values[column] = importCellText(value);
      });
      const v = (column: number) => values[column] ?? '';
      const nameColumns = lan ? [2, 3, 4, 5] : [2];
      const phoneColumn = lan ? 6 : 3;
      const emailColumn = lan ? 8 : face || leaflet ? 0 : 5;
      const names = nameColumns.map(v).filter(Boolean);
      const phone = v(phoneColumn);
      // Recognize structural rows, including PIPA's decorative month above its header.
      if (
        /^(tel|telefono|teléfono)$/i.test(phone) ||
        /^(nombre|nombre y apellido)$/i.test(v(2)) ||
        (lan && /datos lan/i.test(v(2))) ||
        (canonical === 'PIPA' &&
          /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i.test(
            [1, 2, 3, 4, 5, 6, 7].map(v).join(''),
          ))
      ) {
        return;
      }
      const email = emailColumn ? v(emailColumn).toLowerCase() : '';
      if (!names.length && !phone && !email && !formulaFields.length) return;
      if (rows.length >= 5000)
        throw new BadRequestException(
          'El archivo supera 5.000 filas candidatas',
        );
      const advisor = v(lan ? 10 : face ? 1 : leaflet ? 5 : 7);
      const group = lan
        ? nameColumns
            .filter((column) => v(column))
            .map(
              (column) =>
                ['Datos Lan', 'Whatsapp', 'Datos Ip', 'face Meta'][column - 2],
            )
            .join(' / ') || 'Sin grupo'
        : canonical;
      rows.push({
        sheet: canonical,
        rowNumber,
        group,
        name: names.length === 1 ? names[0] : '',
        nameCandidates: names,
        nameResolved: names.length <= 1,
        formulaFields: [...new Set(formulaFields)],
        phone,
        email,
        advisor,
        observations: v(lan ? 11 : face ? 5 : leaflet ? 6 : 8),
        metadata: {
          originalDate: v(face ? 4 : 1),
          schedule: face || leaflet ? '' : v(lan ? 7 : 4),
          segment: face ? '' : v(lan ? 9 : leaflet ? 4 : 6),
          originalAdvisor: advisor,
        },
      });
    });
  }
  if (!rows.length)
    throw new BadRequestException(
      'No encontramos contactos en las hojas admitidas',
    );
  return { rows, sheets, warnings: [...warnings] };
}

export function importContactErrors(row: {
  name: string;
  nameResolved: boolean;
  email: string;
  phone: string;
  observations: string;
  formulaFields?: string[];
}) {
  const errors: string[] = [];
  for (const field of row.formulaFields ?? [])
    errors.push(
      `Fórmula no admitida en ${{ name: 'nombre', phone: 'teléfono', email: 'correo', observations: 'observaciones' }[field] ?? field}; reemplazá por texto`,
    );
  if (!row.nameResolved)
    errors.push('Elegí o corregí el nombre entre los candidatos');
  if (!row.name.trim() || row.name.length > 160)
    errors.push('Nombre obligatorio, hasta 160 caracteres');
  if (row.email && (!isEmail(row.email) || row.email.length > 254))
    errors.push('Correo inválido');
  if (row.phone && !contactKeys(null, row.phone).phoneKey)
    errors.push('Teléfono inválido o ambiguo');
  if (!row.email && !row.phone) errors.push('Ingresá teléfono o correo');
  if (row.observations.length > 2000)
    errors.push('Observaciones: máximo 2.000 caracteres');
  return errors;
}
