import type { LeadImportRow } from '@prisma/client';
import { contactKeys } from './contact-keys';
import { importKey } from './import-normalization';
import type { ExistingImportContact } from './lead-import.plan';
export type ComparisonContext = {
  sources?: Map<string, string>;
  sellers?: Map<string, string>;
};
export type FieldComparison = {
  field: string;
  label: string;
  current: string | null;
  incoming: string | null;
  result: string | null;
  action: 'PRESERVE' | 'ADD' | 'HISTORY' | 'CONFLICT' | 'REVIEW';
  reason: string;
};

export function compareImportContact(
  row: LeadImportRow,
  current: ExistingImportContact,
  blocked: boolean,
  context: ComparisonContext = {},
) {
  const keys = contactKeys(row.email, row.phone);
  const contact = (
    field: 'name' | 'email' | 'phone',
    label: string,
  ): FieldComparison => {
    const existing =
      field === 'name'
        ? current.name
        : field === 'email'
          ? (current.email ?? current.emailKey)
          : (current.phone ?? current.phoneKey);
    const incoming = row[field] || null;
    const normalized =
      field === 'name'
        ? importKey(row.name)
        : field === 'email'
          ? keys.emailKey
          : keys.phoneKey;
    const previous =
      field === 'name'
        ? importKey(current.name)
        : field === 'email'
          ? current.emailKey
          : current.phoneKey;
    const conflict = !!incoming && !!previous && previous !== normalized;
    const add = field !== 'name' && !existing?.trim() && !!normalized;
    return {
      field,
      label,
      current: existing || null,
      incoming,
      result: add && !blocked ? normalized : existing || null,
      action: conflict
        ? 'CONFLICT'
        : add
          ? blocked
            ? 'REVIEW'
            : 'ADD'
          : 'PRESERVE',
      reason: conflict
        ? 'Valores incompatibles: no se actualiza automáticamente'
        : add
          ? blocked
            ? 'Pendiente de resolver las excepciones de esta aparición'
            : 'Completar únicamente el campo vacío'
          : 'Conservar el valor actual del CRM',
    };
  };
  const historical = (
    field: string,
    label: string,
    existing: string | null,
    incoming: string | null,
  ): FieldComparison => ({
    field,
    label,
    current: existing,
    incoming,
    result: existing,
    action: incoming ? 'HISTORY' : 'PRESERVE',
    reason: incoming
      ? 'Guardar como procedencia histórica; no reemplazar el dato comercial'
      : 'Sin información entrante',
  });
  return [
    contact('name', 'Nombre'),
    contact('email', 'Correo'),
    contact('phone', 'Teléfono'),
    historical(
      'source',
      'Origen',
      current.sourceName ??
        context.sources?.get(current.sourceId ?? '') ??
        null,
      context.sources?.get(row.sourceId ?? '') ?? row.group,
    ),
    historical(
      'advisor',
      'Responsable',
      current.assignedToName ??
        context.sellers?.get(current.assignedToId ?? '') ??
        'Sin asignar',
      context.sellers?.get(row.assignedToId ?? '') ?? (row.advisor || null),
    ),
    {
      field: 'status',
      label: 'Estado',
      current: current.status ?? null,
      incoming: null,
      result: current.status ?? null,
      action: 'PRESERVE',
      reason: 'La importación no cambia el estado comercial',
    } as FieldComparison,
    {
      field: 'stage',
      label: 'Etapa comercial',
      current: current.commercialStage ?? null,
      incoming: null,
      result: current.commercialStage ?? null,
      action: 'PRESERVE',
      reason: 'La importación no mueve oportunidades',
    } as FieldComparison,
    historical(
      'observations',
      'Observaciones',
      current.observations ?? null,
      row.observations || null,
    ),
    historical(
      'date',
      'Fecha histórica',
      null,
      row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata) &&
        typeof row.metadata.originalDate === 'string'
        ? row.metadata.originalDate
        : null,
    ),
    {
      field: 'tasks',
      label: 'Seguimientos',
      current: 'Se conservan',
      incoming: null,
      result: 'Sin cambios',
      action: 'PRESERVE',
      reason: 'No se crean ni se modifican tareas',
    } as FieldComparison,
  ];
}
