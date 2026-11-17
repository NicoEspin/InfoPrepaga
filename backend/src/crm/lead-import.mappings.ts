import { portfolioMetadata } from './import-portfolio';
import type { LeadImportMapping } from '@prisma/client';
import type { ParsedImportRow } from './lead-import.parser';
import { importKey } from './import-normalization';
export function resolveImportMappings(
  rows: ParsedImportRow[],
  rules: LeadImportMapping[],
  sources: Array<{ id: string; name: string }>,
  users: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
  }>,
) {
  return rows.map((row) => {
    const sourceRule =
      rules.find(
        (rule) =>
          rule.kind === 'ORIGIN' &&
          rule.scope === row.sheet &&
          rule.key === importKey(row.group),
      ) ??
      rules.find(
        (rule) =>
          rule.kind === 'ORIGIN' &&
          rule.scope === row.sheet &&
          rule.key === '*',
      );
    const channel =
      (
        {
          'datos ip': 'landing ip',
          whatsapp: 'whatsapp',
          meta: 'meta',
          'datos face': 'meta',
        } as Record<string, string>
      )[importKey(row.group)] ?? importKey(row.group);
    const sourceCandidates = sources.filter(
      (source) =>
        importKey(source.name) === importKey(row.group) ||
        importKey(source.name) === channel ||
        (['meta', 'whatsapp'].includes(channel) &&
          importKey(source.name).startsWith(channel + ' ')),
    );
    const sourceId = sourceRule
      ? sources.find((source) => source.id === sourceRule.sourceId)?.id
      : sourceCandidates.length === 1
        ? sourceCandidates[0].id
        : undefined;
    const portfolio = portfolioMetadata(row.metadata);
    const currentAlias = portfolio.historical
      ? portfolio.currentResponsible
      : row.advisor;
    const advisorRule =
      rules.find(
        (rule) =>
          rule.kind ===
            (portfolio.historical ? 'CURRENT_RESPONSIBLE' : 'ADVISOR') &&
          rule.key === importKey(currentAlias),
      ) ??
      (!portfolio.historical && !row.advisor
        ? rules.find(
            (rule) => rule.kind === 'DEFAULT' && rule.scope === row.sheet,
          )
        : undefined);
    const exactUsers = currentAlias
      ? users.filter(
          (user) =>
            importKey(
              [user.firstName, user.lastName].filter(Boolean).join(' '),
            ) === importKey(currentAlias),
        )
      : [];
    const assignedToId = advisorRule
      ? advisorRule.assignedToId
      : exactUsers.length === 1
        ? exactUsers[0].id
        : null;
    const assignmentResolved =
      (!portfolio.historical && !row.advisor) ||
      (!!advisorRule &&
        (!advisorRule.assignedToId ||
          users.some((user) => user.id === advisorRule.assignedToId))) ||
      exactUsers.length === 1;
    return {
      ...row,
      sourceId: sourceId ?? null,
      assignedToId,
      assignmentResolved:
        portfolio.historical &&
        portfolio.classification !== 'ACTIVE' &&
        !currentAlias
          ? true
          : assignmentResolved,
    };
  });
}
