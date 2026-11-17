import {
  type ImportConfiguration,
  portfolioValue,
  completeImportDate,
} from './import-portfolio';
import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { contactKeys } from './contact-keys';
import { isEmail } from 'class-validator';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { historicalLabel, importKey } from './import-normalization';
export const IMPORT_SHEETS = [
  'DATOS LAN',
  'PIPA',
  'Fede',
  'DATOS FACE',
  'folletos',
];
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export type ParsedImportRow = {
  sourceFingerprint?: string;
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
    [key: string]: string | boolean | null;
    originalDate: string;
    schedule: string;
    segment: string;
    originalAdvisor: string;
    originalPhone: string;
    nameColumns: string;
  };
};
export function sourceAppearanceFingerprint(
  row: Pick<
    ParsedImportRow,
    | 'sheet'
    | 'rowNumber'
    | 'group'
    | 'nameCandidates'
    | 'email'
    | 'phone'
    | 'advisor'
    | 'observations'
  > & {
    metadata: Record<string, unknown>;
  },
  formulas: Array<[number, string]> = [],
) {
  // Only source literals belong in the hash; JSON object keys may be reordered in storage.
  const source = Object.fromEntries(
    [
      'originalDate',
      'intakeMode',
      'currentManagement',
      'currentResponsible',
      'originalLastManaged',
      'schedule',
      'segment',
      'originalAdvisor',
      'originalPhone',
      'nameColumns',
    ]
      .filter((key) => Object.hasOwn(row.metadata, key))
      .map((key) => [key, row.metadata[key]]),
  );
  return (
    'v2:' +
    createHash('sha256')
      .update(
        JSON.stringify([
          row.sheet,
          row.rowNumber,
          row.group,
          row.nameCandidates,
          row.email,
          row.phone,
          row.advisor,
          row.observations,
          source,
          formulas,
        ]),
      )
      .digest('hex')
  );
}

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
export async function parseLeadImport(
  buffer: Buffer,
  configuration?: ImportConfiguration,
  mode: 'NEW' | 'HISTORICAL' = 'NEW',
) {
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
  const discarded: Array<{ sheet: string; rowNumber: number; reason: string }> =
    [];
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
    const fields = configuration?.sheets[canonical] ?? {};
    const headers: Record<string, number> = {};
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++)
      sheet.getRow(r).eachCell((cell, column) => {
        const key = importKey(importCellText(cell.value)).replaceAll(' ', '_');
        if (
          ['gestion_actual', 'responsable_actual', 'ultima_gestion'].includes(
            key,
          )
        )
          headers[key] = column;
      });
    const extraColumns = Object.values(fields).flatMap((rule) =>
      rule.column ? [rule.column] : [],
    );
    if (extraColumns.some((column) => column > sheet.columnCount))
      throw new BadRequestException(
        `Configuración incompatible con ${canonical}: columna ausente`,
      );
    const last = Math.max(
      lan ? 11 : face ? 5 : leaflet ? 6 : 8,
      ...extraColumns,
      ...Object.values(headers),
    );
    if (sheet.rowCount > 20000 || sheet.columnCount > 256)
      throw new BadRequestException(
        'La hoja excede los límites de filas o columnas',
      );
    let outside:
      { minCol: number; maxCol: number; rows: Set<number> } | undefined;
    sheet.eachRow((row, rowNumber) => {
      const values: string[] = [''];
      const formulaFields: string[] = [];
      const formulas: Array<[number, string]> = [];
      row.eachCell((cell, column) => {
        if (column > last) {
          if (cell.value !== null) {
            outside ??= { minCol: column, maxCol: column, rows: new Set() };
            outside.minCol = Math.min(outside.minCol, column);
            outside.maxCol = Math.max(outside.maxCol, column);
            outside.rows.add(rowNumber);
          }
          return;
        }
        const value = cell.value;
        if (
          value &&
          typeof value === 'object' &&
          ('formula' in value || 'sharedFormula' in value)
        ) {
          const defaults: Record<string, number[]> = {
            name: lan ? [2, 3, 4, 5] : [2],
            phone: [lan ? 6 : 3],
            email: [lan ? 8 : face || leaflet ? 0 : 5],
            observations: [lan ? 11 : face ? 5 : leaflet ? 6 : 8],
            currentManagement: [headers.gestion_actual ?? 0],
            currentResponsible: [headers.responsable_actual ?? 0],
            lastManaged: [headers.ultima_gestion ?? 0],
          };
          const field = Object.keys(defaults).find((key) => {
            const rule = fields[key as keyof typeof fields];
            return rule
              ? rule.column === column
              : defaults[key].includes(column);
          });
          if (field) {
            formulaFields.push(field);
            formulas.push([
              column,
              String('formula' in value ? value.formula : value.sharedFormula),
            ]);
          } else
            warnings.add(
              `${canonical}, fila ${rowNumber}: se omitió una fórmula en un dato complementario`,
            );
          return;
        }
        // Hyperlinks contribute only their visible text; never follow their target.
        values[column] = importCellText(value);
      });
      const v = (column: number) => values[column] ?? '';
      const field = (key: keyof typeof fields, fallback: number) => {
        const rule = fields[key];
        return rule
          ? (rule.value ?? (rule.column ? v(rule.column) : ''))
          : v(fallback);
      };
      const nameColumns = lan ? [2, 3, 4, 5] : [2];
      const phoneColumn = lan ? 6 : 3;
      const emailColumn = lan ? 8 : face || leaflet ? 0 : 5;
      const names = fields.name
        ? [field('name', 2)].filter(Boolean)
        : nameColumns.map(v).filter(Boolean);
      const uniqueNames = [
        ...new Map(names.map((name) => [importKey(name), name])).values(),
      ];
      const phone = field('phone', phoneColumn);
      // Recognize structural rows, including PIPA's decorative month above its header.
      if (
        /^(tel|telefono|teléfono)$/i.test(phone) ||
        /^(nombre|nombre y apellido)$/i.test(v(2)) ||
        (lan && /datos lan/i.test(v(2))) ||
        /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i.test(
          [1, 2, 3, 4, 5, 6, 7].map(v).join(''),
        )
      ) {
        discarded.push({
          sheet: canonical,
          rowNumber,
          reason: 'Encabezado o título mensual',
        });
        return;
      }
      if (
        /^(total(?:es)?|subtotal|resumen|inversion|inversión|cantidad|promedio)$/i.test(
          v(2),
        ) &&
        !phone &&
        !v(emailColumn)
      ) {
        discarded.push({
          sheet: canonical,
          rowNumber,
          reason: 'Resumen sin contacto',
        });
        return;
      }
      const email = field('email', emailColumn).toLowerCase();
      if (!names.length && !phone && !email && !formulaFields.length) {
        discarded.push({
          sheet: canonical,
          rowNumber,
          reason: 'Sin contacto en el bloque principal',
        });
        return;
      }
      if (rows.length >= 5000)
        throw new BadRequestException(
          'El archivo supera 5.000 filas candidatas',
        );
      const originalAdvisor = field(
        'advisor',
        lan ? 10 : face ? 1 : leaflet ? 5 : 7,
      );
      const label =
        canonical === 'PIPA' ? historicalLabel(originalAdvisor) : undefined;
      const advisor = label ? '' : originalAdvisor;
      const group =
        lan && fields.name
          ? 'Canal por resolver'
          : lan
            ? names.length === 1
              ? ['Datos Lan', 'Whatsapp', 'Datos Ip', 'Meta'][
                  nameColumns.find((column) => v(column))! - 2
                ]
              : 'Canal por resolver'
            : (label ?? canonical);
      const parsed: ParsedImportRow = {
        sheet: canonical,
        rowNumber,
        group,
        name: uniqueNames.length === 1 ? uniqueNames[0] : '',
        nameCandidates: names,
        nameResolved: uniqueNames.length <= 1,
        formulaFields: [...new Set(formulaFields)],
        phone,
        email,
        advisor,
        observations: field(
          'observations',
          lan ? 11 : face ? 5 : leaflet ? 6 : 8,
        ),
        metadata: {
          originalDate: field('originalDate', face ? 4 : 1),
          ...(mode === 'HISTORICAL' && {
            intakeMode: mode,
            currentManagement: field(
              'currentManagement',
              headers.gestion_actual ?? 0,
            ),
            portfolioClass:
              portfolioValue(
                field('currentManagement', headers.gestion_actual ?? 0),
              ) ??
              configuration?.managementAliases?.[
                importKey(
                  field('currentManagement', headers.gestion_actual ?? 0),
                )
              ] ??
              null,
            currentResponsible: field(
              'currentResponsible',
              headers.responsable_actual ?? 0,
            ),
            originalLastManaged: field(
              'lastManaged',
              headers.ultima_gestion ?? 0,
            ),
            lastManaged: completeImportDate(
              field('lastManaged', headers.ultima_gestion ?? 0),
              configuration?.dateFormat,
            ),
            originDate: completeImportDate(
              field('originalDate', face ? 4 : 1),
              configuration?.dateFormat,
            ),
          }),
          schedule: face || leaflet ? '' : v(lan ? 7 : 4),
          segment: face ? '' : v(lan ? 9 : leaflet ? 4 : 6),
          originalAdvisor,
          originalPhone: phone,
          nameColumns: nameColumns
            .filter((column) => v(column))
            .map((column) => String.fromCharCode(64 + column))
            .join(','),
        },
      };
      // Capture workbook input once; review choices must never change replay identity.
      parsed.sourceFingerprint = sourceAppearanceFingerprint(parsed, formulas);
      rows.push(parsed);
    });
    if (outside) {
      const bounds = [...outside.rows];
      const range = `${sheet.getCell(bounds[0], outside.minCol).address}:${sheet.getCell(bounds[bounds.length - 1], outside.maxCol).address}`;
      warnings.add(
        `${canonical}, ${range} (${bounds.length} filas con contenido): columnas fuera de la tabla principal; no se importan.`,
      );
    }
  }
  if (
    configuration &&
    Object.keys(configuration.sheets).some((name) => !sheets.includes(name))
  )
    throw new BadRequestException(
      'La configuración contiene hojas ausentes o incompatibles',
    );
  if (!rows.length)
    throw new BadRequestException(
      'No encontramos contactos en las hojas admitidas',
    );
  return { rows, sheets, warnings: [...warnings], discarded };
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
