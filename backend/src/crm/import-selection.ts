import type { ImportSelectionDto } from './lead-import.dto';
import type { planLeadImport } from './lead-import.plan';
type Row = ReturnType<typeof planLeadImport>['rows'][number];
export function importProblem(row: Row, problem = 'ALL') {
  return (
    problem === 'ALL' ||
    (problem === 'REVIEW' && row.action === 'REVIEW') ||
    (problem === 'CONFIGURATION' && row.configurationErrors.length > 0) ||
    (problem === 'CONTACT' && row.contactErrors.length > 0) ||
    (problem === 'IDENTITY' && row.conflicts.length > 0) ||
    (problem === 'OWNER' &&
      row.configurationErrors.some((e) => /responsable|asesor/i.test(e))) ||
    (problem === 'CLASSIFICATION' &&
      (!row.portfolioClass || row.portfolioClass === 'UNCLASSIFIED'))
  );
}
export function matchesImportSelection(
  row: Row,
  selection: ImportSelectionDto,
) {
  return (
    (!selection.actionFilter ||
      selection.actionFilter === 'ALL' ||
      (selection.actionFilter === 'DUPLICATES'
        ? row.duplicate
        : row.action === selection.actionFilter)) &&
    (!selection.ids || selection.ids.includes(row.id)) &&
    (!selection.sheet || row.sheet === selection.sheet) &&
    (!selection.portfolioClass ||
      (row.portfolioClass ?? 'UNKNOWN') === selection.portfolioClass) &&
    importProblem(row, selection.problem)
  );
}
