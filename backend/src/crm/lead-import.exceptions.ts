import { isEmail } from 'class-validator';
import { contactKeys } from './contact-keys';
import type { LeadImportRow } from '@prisma/client';
type ExceptionRow = LeadImportRow & {
  action: string;
  conflicts: string[];
  contactErrors: string[];
  conflictReasons: string[];
};
export type ContactCleanup =
  'INVALID_EMAIL' | 'INVALID_PHONE' | 'FORMULA_PHONE';
export function canCleanOptionalContact(
  row: ExceptionRow,
  kind: ContactCleanup,
) {
  if (
    row.action !== 'REVIEW' ||
    row.conflicts.length ||
    !row.nameResolved ||
    !row.name.trim() ||
    row.name.length > 160 ||
    row.observations.length > 2000
  )
    return false;
  const target = kind === 'INVALID_EMAIL' ? 'email' : 'phone';
  if (row.formulaFields.some((field) => field !== target)) return false;
  if (kind === 'INVALID_EMAIL')
    return (
      !!row.email &&
      !isEmail(row.email) &&
      !!contactKeys(null, row.phone).phoneKey &&
      !row.formulaFields.length
    );
  if (!isEmail(row.email)) return false;
  return kind === 'FORMULA_PHONE'
    ? row.formulaFields.includes('phone')
    : !!row.phone &&
        !contactKeys(null, row.phone).phoneKey &&
        !row.formulaFields.length;
}

/** Aggregate-only report: never returns names, phones, emails or source cell content. */
export function importExceptionSummary(rows: ExceptionRow[]) {
  const exceptions = rows.filter((row) => row.action === 'REVIEW');
  const reasonCounts: Record<string, number> = {};
  for (const row of exceptions)
    for (const reason of [
      ...row.conflictReasons,
      ...row.contactErrors.map((error) =>
        error.includes('Fórmula')
          ? 'FORMULA'
          : error.includes('candidatos')
            ? 'AMBIGUOUS_NAME'
            : error.startsWith('Nombre')
              ? 'MISSING_OR_LONG_NAME'
              : error.startsWith('Correo')
                ? 'INVALID_EMAIL'
                : error.startsWith('Teléfono')
                  ? 'INVALID_PHONE'
                  : error.startsWith('Ingresá')
                    ? 'MISSING_CONTACT'
                    : 'OBSERVATION_LENGTH',
      ),
    ])
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  const noIdentityConflict = exceptions.filter((row) => !row.conflicts.length);
  return {
    total: exceptions.length,
    contactOnly: noIdentityConflict.filter((row) => row.contactErrors.length)
      .length,
    identityOnly: exceptions.filter(
      (row) => row.conflicts.length && !row.contactErrors.length,
    ).length,
    both: exceptions.filter(
      (row) => row.conflicts.length && row.contactErrors.length,
    ).length,
    reasonCounts,
    explicitBulkCandidates: {
      discardInvalidEmailWithVerifiedPhone: exceptions.filter((row) =>
        canCleanOptionalContact(row, 'INVALID_EMAIL'),
      ).length,
      discardInvalidPhoneWithVerifiedEmail: exceptions.filter((row) =>
        canCleanOptionalContact(row, 'INVALID_PHONE'),
      ).length,
      omitFormulaPhoneWithVerifiedEmail: exceptions.filter((row) =>
        canCleanOptionalContact(row, 'FORMULA_PHONE'),
      ).length,
    },
    automaticIdentityMerges: 0,
  };
}

export function cleanOptionalContact<T extends ExceptionRow>(
  row: T,
  kind: ContactCleanup,
) {
  if (!canCleanOptionalContact(row, kind)) return row;
  const field = kind === 'INVALID_EMAIL' ? 'email' : 'phone';
  const metadata =
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const previous =
    metadata.reviewedOriginal &&
    typeof metadata.reviewedOriginal === 'object' &&
    !Array.isArray(metadata.reviewedOriginal)
      ? metadata.reviewedOriginal
      : {};
  return {
    ...row,
    [field]: '',
    formulaFields: row.formulaFields.filter((item) => item !== field),
    metadata: {
      ...metadata,
      reviewedOriginal: {
        ...previous,
        [field]: row[field],
        ...(kind === 'FORMULA_PHONE' && { formulaPhoneOmitted: true }),
      },
    },
  };
}
