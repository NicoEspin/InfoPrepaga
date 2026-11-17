import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { importKey } from './import-normalization';
export const portfolioClasses = [
  'ACTIVE',
  'HISTORICAL',
  'UNCLASSIFIED',
] as const;
export type PortfolioClass = (typeof portfolioClasses)[number];
export type ImportConfiguration = {
  version: 1;
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
  dateFormat?: 'DMY' | 'ISO';
  managementAliases?: Record<string, PortfolioClass>;
};
export function readConfiguration(
  value: string | undefined,
): ImportConfiguration | undefined {
  if (!value) return undefined;
  let config: ImportConfiguration;
  try {
    config = JSON.parse(value) as ImportConfiguration;
  } catch {
    throw new BadRequestException('Configuración inválida');
  }
  if (
    !config ||
    config.version !== 1 ||
    !config.sheets ||
    typeof config.sheets !== 'object' ||
    Array.isArray(config.sheets) ||
    Object.keys(config.sheets).length > 5 ||
    Object.keys(config).some(
      (k) =>
        !['version', 'sheets', 'dateFormat', 'managementAliases'].includes(k),
    ) ||
    (config.dateFormat && !['DMY', 'ISO'].includes(config.dateFormat))
  )
    throw new BadRequestException(
      'Versión o formato de configuración incompatible',
    );
  if (
    config.managementAliases &&
    (typeof config.managementAliases !== 'object' ||
      Array.isArray(config.managementAliases) ||
      Object.keys(config.managementAliases).length > 100 ||
      Object.entries(config.managementAliases).some(
        ([key, value]) =>
          !key.trim() || key.length > 160 || !portfolioClasses.includes(value),
      ))
  )
    throw new BadRequestException('Equivalencias de clasificación inválidas');
  for (const fields of Object.values(config.sheets)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
      throw new BadRequestException('Columnas inválidas');
    for (const [key, rule] of Object.entries(fields)) {
      if (
        ![
          'name',
          'phone',
          'email',
          'advisor',
          'observations',
          'originalDate',
          'currentManagement',
          'currentResponsible',
          'lastManaged',
        ].includes(key) ||
        !rule ||
        typeof rule !== 'object' ||
        Object.keys(rule).some((k) => !['column', 'value'].includes(k)) ||
        (rule.column !== undefined &&
          (!Number.isInteger(rule.column) ||
            rule.column < 1 ||
            rule.column > 256)) ||
        (rule.value !== undefined &&
          (typeof rule.value !== 'string' || rule.value.length > 2000)) ||
        (rule.column !== undefined && rule.value !== undefined)
      )
        throw new BadRequestException('Regla de columna inválida');
    }
  }
  return config;
}
export function portfolioValue(value: string): PortfolioClass | null {
  const key = importKey(value);
  return key === 'si'
    ? 'ACTIVE'
    : key === 'no'
      ? 'HISTORICAL'
      : !key || key === 'revisar'
        ? 'UNCLASSIFIED'
        : null;
}
export function completeImportDate(
  value: string,
  format: 'DMY' | 'ISO' = 'DMY',
): string | null {
  let iso = value;
  if (format === 'DMY') {
    const parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (parts)
      iso = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function portfolioMetadata(metadata: Prisma.JsonValue) {
  const m =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata
      : {};
  const historical = m.intakeMode === 'HISTORICAL';
  return {
    historical,
    classification: historical
      ? portfolioClasses.includes(m.portfolioClass as PortfolioClass)
        ? (m.portfolioClass as PortfolioClass)
        : null
      : ('ACTIVE' as PortfolioClass),
    currentResponsible:
      typeof m.currentResponsible === 'string' ? m.currentResponsible : '',
    allowDistribution: historical && m.allowDistribution === true,
    originDate: typeof m.originDate === 'string' ? m.originDate : null,
    lastManaged: typeof m.lastManaged === 'string' ? m.lastManaged : null,
  };
}
