export const recordStatuses = ['Válido', 'En revisión', 'Inválido'] as const;
export type AvalianRecordStatus = (typeof recordStatuses)[number];
export interface AvalianRecordPreview {
  module: 'avalian';
  id: string;
  name: string;
  internalId: string;
  status: AvalianRecordStatus;
  importedAt: string;
  batchId: string;
  observations: string;
}
export interface AvalianBatchPreview {
  id: string;
  importedAt: string;
  records: AvalianRecordPreview[];
}
export type RecordSortKey = 'name' | 'internalId' | 'status' | 'importedAt' | 'observations';
export interface RecordFilters {
  search: string;
  status: string;
  batchId: string;
}

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const timeFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
export function importDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
export function importTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
export function normalizeRecordText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
export function filterRecords(records: AvalianRecordPreview[], filters: RecordFilters) {
  const search = normalizeRecordText(filters.search.trim());
  return records.filter(
    (record) =>
      (filters.status === 'Todos' || record.status === filters.status) &&
      (filters.batchId === 'Todos' || record.batchId === filters.batchId) &&
      normalizeRecordText(`${record.name} ${record.internalId}`).includes(search)
  );
}
export function sortRecords(
  records: AvalianRecordPreview[],
  key: RecordSortKey,
  descending: boolean
) {
  return records.toSorted(
    (a, b) => a[key].localeCompare(b[key], 'es', { numeric: true }) * (descending ? -1 : 1)
  );
}
export function getBatches(records: AvalianRecordPreview[]): AvalianBatchPreview[] {
  const batches = new Map<string, AvalianBatchPreview>();
  for (const record of records) {
    const batch = batches.get(record.batchId);
    if (batch) batch.records.push(record);
    else
      batches.set(record.batchId, {
        id: record.batchId,
        importedAt: record.importedAt,
        records: [record]
      });
  }
  return [...batches.values()].toSorted((a, b) => b.importedAt.localeCompare(a.importedAt));
}

const demoNames = [
  'González, Laura',
  'Pérez, Martín',
  'Rodríguez, Carina',
  'López, Daniel',
  'Martínez, Soledad',
  'Fernández, Pablo',
  'Díaz, Valentina',
  'Romero, Ignacio',
  'Castro, Julieta',
  'Álvarez, Santiago',
  'Suárez, Camila',
  'Herrera, Bruno',
  'Acosta, Emilia',
  'Torres, Nicolás',
  'Medina, Florencia',
  'Silva, Tomás',
  'Ríos, Catalina',
  'Navarro, Mateo',
  'Molina, Lucía',
  'Vega, Andrés',
  'Benítez, Paula',
  'Flores, Javier',
  'Ruiz, Sofía',
  'Sosa, Diego'
];
const batchDates = ['2026-10-12T17:32:00Z', '2026-10-21T13:15:00Z', '2026-10-28T17:32:00Z'];

// Synthetic records only. This collection has no lead IDs or commercial relationships.
export const demoAvalianRecords: AvalianRecordPreview[] = demoNames.map((name, index) => {
  const review = [2, 5, 12, 20].includes(index);
  const invalid = [7, 18].includes(index);
  return {
    module: 'avalian',
    id: `avalian-demo-${index + 1}`,
    name,
    internalId: `AV-DEMO-${String(index + 1).padStart(4, '0')}`,
    status: invalid ? 'Inválido' : review ? 'En revisión' : 'Válido',
    importedAt: batchDates[Math.floor(index / 8)],
    batchId: `LOTE-DEMO-${Math.floor(index / 8) + 1}`,
    observations: invalid
      ? 'Identificador de ejemplo no validado'
      : review
        ? index % 2
          ? 'Verificar posible duplicado de ejemplo'
          : 'Diferencia en datos de ejemplo'
        : 'Sin observaciones'
  };
});

// A predefined fictitious batch, not a file parser or a production duplicate policy.
export function createSimulatedBatch(
  records: AvalianRecordPreview[],
  importedAt: string
): AvalianBatchPreview {
  const sequence = Math.max(
    0,
    ...records.map((record) => Number(record.id.replace('avalian-demo-', '')) || 0)
  );
  const batchSequence =
    Math.max(0, ...records.map((record) => Number(record.batchId.replace('LOTE-DEMO-', '')) || 0)) +
    1;
  const id = `LOTE-DEMO-${batchSequence}`;
  return {
    id,
    importedAt,
    records: [
      'Registro ficticio A',
      'Registro ficticio B',
      'Registro ficticio C',
      'Registro ficticio D'
    ].map((name, index) => ({
      module: 'avalian',
      id: `avalian-demo-${sequence + index + 1}`,
      name,
      internalId: `AV-DEMO-${String(sequence + index + 1).padStart(4, '0')}`,
      status: index === 2 ? 'En revisión' : 'Válido',
      importedAt,
      batchId: id,
      observations: index === 2 ? 'Revisión ilustrativa del lote ficticio' : 'Sin observaciones'
    }))
  };
}

export function appendSimulatedBatch(records: AvalianRecordPreview[], batch: AvalianBatchPreview) {
  // Demo-only idempotency: repeated confirmation of the same preview has no effect.
  if (records.some((record) => record.batchId === batch.id)) return records;
  return [...records, ...batch.records];
}
