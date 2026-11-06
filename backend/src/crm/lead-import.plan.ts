import { createHash } from 'node:crypto';
import type { LeadImportRow } from '@prisma/client';
import { contactKeys } from './contact-keys';
import { importContactErrors } from './lead-import.parser';
import { importKey } from './import-normalization';
import { canCleanOptionalContact } from './lead-import.exceptions';
import {
  compareImportContact,
  type ComparisonContext,
} from './lead-import.comparison';

export type ExistingImportContact = {
  id: string;
  name: string;
  emailKey: string | null;
  phoneKey: string | null;
  version: number;
  assignedToId: string | null;
  email?: string | null;
  phone?: string | null;
  sourceId?: string;
  observations?: string;
  status?: string;
  commercialStage?: string;
  sourceName?: string;
  assignedToName?: string;
};
export type ImportAction = 'CREATE' | 'UPDATE' | 'MERGE' | 'SKIP' | 'REVIEW';
type ImportMatch = {
  kind: 'email' | 'phone';
  name: string;
  leadId?: string;
  rowId?: string;
  sheet?: string;
  rowNumber?: number;
};
export function appearanceFingerprint(
  row: Pick<
    LeadImportRow,
    | 'sheet'
    | 'rowNumber'
    | 'name'
    | 'email'
    | 'phone'
    | 'observations'
    | 'metadata'
  >,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.sheet,
        row.rowNumber,
        importKey(row.name),
        contactKeys(row.email, row.phone),
        row.observations,
        row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata)
          ? Object.fromEntries(
              Object.entries(row.metadata).sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            )
          : row.metadata,
      ]),
    )
    .digest('hex');
}

/** Conservative connected components: a shared contact key never overrides identity conflicts. */
export function planLeadImport(
  rows: LeadImportRow[],
  sheets: string[],
  leads: ExistingImportContact[],
  sourceIds: Set<string>,
  sellerIds: Set<string>,
  seen: Set<string> = new Set(),
  context: ComparisonContext = {},
) {
  const active = rows.filter(
    (row) => sheets.includes(row.sheet) && row.decision !== 'OMIT',
  );
  const keys = new Map(
    rows.map((row) => [row.id, contactKeys(row.email, row.phone)]),
  );
  const potentialCounts = new Map<string, number>();
  const values = (key: ReturnType<typeof contactKeys>) =>
    [
      key.emailKey && `e:${key.emailKey}`,
      key.phoneKey && `p:${key.phoneKey}`,
    ].filter((value): value is string => !!value);
  for (const key of [
    ...rows
      .filter((row) => sheets.includes(row.sheet))
      .map((row) => keys.get(row.id)!),
    ...leads,
  ]) {
    for (const value of values(key))
      potentialCounts.set(value, (potentialCounts.get(value) ?? 0) + 1);
  }
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p) {
      parent.set(id, id);
      return id;
    }
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const index = new Map<string, string>();
  const add = (id: string, key: ReturnType<typeof contactKeys>) => {
    find(id);
    for (const value of [
      key.emailKey && `e:${key.emailKey}`,
      key.phoneKey && `p:${key.phoneKey}`,
    ]) {
      if (!value) continue;
      const previous = index.get(value);
      if (previous) parent.set(find(id), find(previous));
      else index.set(value, id);
    }
  };
  active.forEach((row) => add(`r:${row.id}`, keys.get(row.id)!));
  leads.forEach((lead) => add(`l:${lead.id}`, lead));
  const groups = new Map<
    string,
    { rows: LeadImportRow[]; leads: ExistingImportContact[] }
  >();
  for (const row of active) {
    const root = find(`r:${row.id}`);
    if (!groups.has(root)) groups.set(root, { rows: [], leads: [] });
    groups.get(root)!.rows.push(row);
  }
  for (const lead of leads) groups.get(find(`l:${lead.id}`))?.leads.push(lead);
  const plans = new Map<
    string,
    {
      conflict: boolean;
      conflictReasons: string[];
      leaderId: string;
      targetId: string | null;
      matches: Array<{
        kind: 'email' | 'phone';
        name: string;
        leadId?: string;
        rowId?: string;
        sheet?: string;
        rowNumber?: number;
      }>;
      externalMatches: string[];
      leads: ExistingImportContact[];
      reference: LeadImportRow;
    }
  >();
  const ownIds = new Set(rows.map((row) => row.leadId).filter(Boolean));
  for (const group of groups.values()) {
    const names = new Set(
      [
        ...group.rows.map((row) => row.name),
        ...group.leads.map((lead) => lead.name),
      ]
        .filter(Boolean)
        .map(importKey),
    );
    const emails = new Set(
      [
        ...group.rows.map((row) => keys.get(row.id)!.emailKey),
        ...group.leads.map((lead) => lead.emailKey),
      ].filter(Boolean),
    );
    const phones = new Set(
      [
        ...group.rows.map((row) => keys.get(row.id)!.phoneKey),
        ...group.leads.map((lead) => lead.phoneKey),
      ].filter(Boolean),
    );
    const owners = new Set(
      group.rows.map((row) => row.assignedToId).filter(Boolean),
    );
    const conflict =
      names.size > 1 ||
      emails.size > 1 ||
      phones.size > 1 ||
      group.leads.length > 1 ||
      (!group.leads.length && owners.size > 1);
    const conflictReasons = [
      names.size > 1 ? 'NAME_MISMATCH' : null,
      emails.size > 1 ? 'EMAIL_MISMATCH' : null,
      phones.size > 1 ? 'PHONE_MISMATCH' : null,
      group.leads.length > 1 ? 'MULTIPLE_CRM_MATCHES' : null,
      !group.leads.length && owners.size > 1 ? 'ADVISOR_MISMATCH' : null,
    ].filter((value): value is string => !!value);
    const leader =
      group.rows.find(
        (row) =>
          !row.leadId &&
          !importContactErrors(row).length &&
          !!row.sourceId &&
          sourceIds.has(row.sourceId) &&
          (group.leads.length > 0 ||
            (row.assignmentResolved &&
              (!row.assignedToId || sellerIds.has(row.assignedToId)))),
      ) ?? group.rows[0];
    const targetId =
      group.leads[0]?.id ??
      group.rows.find((row) => row.leadId)?.leadId ??
      null;
    const externalMatches = group.leads
      .filter((lead) => !ownIds.has(lead.id))
      .map((lead) => `${lead.id}:${lead.version}`)
      .sort();
    const sampleRows = group.rows.slice(0, 21);
    for (const row of group.rows) {
      const key = keys.get(row.id)!;
      const matches = [
        ...group.leads.map<ImportMatch>((lead) => ({
          kind:
            key.emailKey && lead.emailKey === key.emailKey ? 'email' : 'phone',
          name: lead.name,
          leadId: lead.id,
        })),
        ...sampleRows
          .filter((other) => other.id !== row.id)
          .slice(0, 20)
          .map<ImportMatch>((other) => ({
            kind:
              key.emailKey && keys.get(other.id)!.emailKey === key.emailKey
                ? 'email'
                : 'phone',
            name: other.name,
            rowId: other.id,
            sheet: other.sheet,
            rowNumber: other.rowNumber,
          })),
      ];
      plans.set(row.id, {
        conflict,
        conflictReasons,
        leaderId: leader.id,
        targetId,
        matches,
        externalMatches,
        leads: group.leads,
        reference: leader,
      });
    }
  }
  const result = rows.map((row) => {
    const group = plans.get(row.id);
    const active = sheets.includes(row.sheet);
    const contactErrors = importContactErrors(row);
    const configurationErrors: string[] = [];
    if (!row.sourceId || !sourceIds.has(row.sourceId))
      configurationErrors.push('Elegí el origen para este grupo');
    // Existing contacts keep their current owner; an unresolved historical advisor is provenance only.
    if (!group?.targetId && !row.assignmentResolved)
      configurationErrors.push(
        'Relacioná el asesor o elegí reparto automático',
      );
    if (
      !group?.targetId &&
      row.assignedToId &&
      !sellerIds.has(row.assignedToId)
    )
      configurationErrors.push('Responsable no disponible');
    const conflicts = group?.conflict
      ? ['Coincidencia con identidades, contactos o responsables incompatibles']
      : [];
    const externalMatches = group?.externalMatches ?? [];
    const fingerprint = appearanceFingerprint(row);
    const replay = seen.has(fingerprint);
    const requiresReview =
      active &&
      !row.leadId &&
      !replay &&
      row.decision !== 'OMIT' &&
      externalMatches.some((value) => !row.reviewedMatches.includes(value));
    let action: ImportAction = 'SKIP';
    if (active && row.decision !== 'OMIT' && !row.leadId && !replay) {
      action =
        contactErrors.length || configurationErrors.length || conflicts.length
          ? 'REVIEW'
          : group?.targetId
            ? ownIds.has(group.targetId) || group.leaderId !== row.id
              ? 'MERGE'
              : 'UPDATE'
            : group?.leaderId === row.id
              ? 'CREATE'
              : 'MERGE';
    }
    const errors = [...contactErrors, ...configurationErrors, ...conflicts];
    const state =
      action === 'SKIP'
        ? 'SKIP'
        : contactErrors.length || conflicts.length
          ? 'CORRECTION'
          : configurationErrors.length
            ? 'CONFIGURATION'
            : action === 'UPDATE'
              ? 'READY_UPDATE'
              : 'READY';
    return {
      ...row,
      active,
      action,
      state,
      contactErrors,
      configurationErrors,
      conflicts,
      conflictReasons: group?.conflictReasons ?? [],
      errors,
      matches: group?.matches ?? [],
      externalMatches,
      requiresReview,
      fingerprint,
      replay,
      duplicate:
        active &&
        values(keys.get(row.id)!).some(
          (value) => (potentialCounts.get(value) ?? 0) > 1,
        ),
      leaderId: group?.leaderId ?? row.id,
      targetId: group?.targetId ?? null,
      selected: ['CREATE', 'UPDATE', 'MERGE'].includes(action),
      comparisons: (group?.leads.length
        ? group.leads
        : group && group.matches.length
          ? [
              {
                id: group.reference.id,
                name: group.reference.name,
                ...contactKeys(group.reference.email, group.reference.phone),
                email: group.reference.email,
                phone: group.reference.phone,
                sourceId: group.reference.sourceId ?? undefined,
                observations: group.reference.observations,
                assignedToId: group.reference.assignedToId,
                version: 0,
              },
            ]
          : []
      )
        .slice(0, 20)
        .map((lead) => ({
          kind: group?.leads.length ? 'CRM' : 'FILE',
          referenceId: lead.id,
          fields: compareImportContact(
            row,
            lead,
            action === 'REVIEW' || action === 'SKIP' || requiresReview,
            context,
          ),
          canApply: action !== 'REVIEW' && action !== 'SKIP' && !requiresReview,
        })),
      comparisonCount: group?.leads.length ?? 0,
      changes: {
        add: [
          'Procedencia histórica y observaciones trazables',
          'Teléfono/correo solo si están vacíos',
        ],
        preserve: [
          'Nombre existente',
          'Responsable',
          'Estado',
          'Origen comercial',
          'Seguimientos',
          'Observaciones comerciales',
        ],
      },
    };
  });
  const pending = result.filter((row) => !row.leadId && row.active);
  const ready = pending.filter((row) => row.selected);
  return {
    rows: result,
    reviewToken: createHash('sha256')
      .update(
        JSON.stringify(result.map((row) => [row.id, row.externalMatches])),
      )
      .digest('hex'),
    summary: {
      detected: rows.length,
      uniqueContacts: groups.size,
      creates: ready.filter((row) => row.action === 'CREATE').length,
      updates: new Set(
        ready
          .filter((row) => row.action === 'UPDATE')
          .map((row) => row.targetId),
      ).size,
      internalMatches: [...groups.values()].reduce(
        (count, group) => count + Math.max(0, group.rows.length - 1),
        0,
      ),
      review: pending.filter((row) => row.action === 'REVIEW').length,
      configuration: pending.filter((row) => row.state === 'CONFIGURATION')
        .length,
      contactErrors: pending.filter((row) => row.contactErrors.length).length,
      imported: rows.filter((row) => row.leadId).length,
      omitted: result.filter((row) => !row.leadId && row.action === 'SKIP')
        .length,
      invalid: pending.filter((row) => row.action === 'REVIEW').length,
      pending: ready.length,
      merged: ready.filter((row) => row.action === 'MERGE').length,
      duplicates: pending.filter((row) => row.duplicate).length,
      requiresReview: pending.some((row) => row.requiresReview),
      unreviewedReady: ready.filter((row) => row.requiresReview).length,
      cleanupCandidates: {
        INVALID_EMAIL: pending.filter((row) =>
          canCleanOptionalContact(row, 'INVALID_EMAIL'),
        ).length,
        INVALID_PHONE: pending.filter((row) =>
          canCleanOptionalContact(row, 'INVALID_PHONE'),
        ).length,
        FORMULA_PHONE: pending.filter((row) =>
          canCleanOptionalContact(row, 'FORMULA_PHONE'),
        ).length,
      },
    },
  };
}
