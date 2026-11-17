import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buenosAiresMidnight } from '../common/buenos-aires-calendar';
export const calculationVersion = 2;
export const stages = [
  'NEW',
  'CONTACTED',
  'FOLLOW_UP',
  'PROPOSAL',
  'CLOSED',
  'UNKNOWN',
] as const;
export const stageNames: Record<string, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  FOLLOW_UP: 'En seguimiento',
  PROPOSAL: 'Propuesta enviada',
  CLOSED: 'Cerrado',
  UNKNOWN: 'Sin historial de etapa',
};
export function period(from: string, to: string, now: Date) {
  function date(value: string) {
    const d = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(d.getTime()) ||
      d.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Fecha de calendario inválida');
    return d;
  }
  const start = buenosAiresMidnight(date(from)),
    end = buenosAiresMidnight(new Date(date(to).getTime() + 86400000));
  if (start >= end || start > now)
    throw new BadRequestException('Período inválido o completamente futuro');
  return {
    start,
    end,
    cutoff: new Date(Math.min(now.getTime(), end.getTime())),
    partial: now < end,
  };
}
export type AggregateRow = {
  population: 'A' | 'B';
  sourceId: string | null;
  responsibleId: string | null;
  stage: string;
  won: boolean;
  count: bigint | number;
};
export type Metrics = {
  entered: number;
  periodClosures: number;
  cohortClosures: number;
  conversion: string | null;
  stages: Record<string, number>;
  investment: string | null;
  investmentPartial: boolean;
  cpl: string | null;
  cpc: string | null;
};
export function metrics(
  rows: AggregateRow[],
  investments: (string | null)[],
  costs: boolean,
): Metrics {
  const result: Metrics = {
    entered: 0,
    periodClosures: 0,
    cohortClosures: 0,
    conversion: null,
    stages: Object.fromEntries(stages.map((s) => [s, 0])),
    investment: null,
    investmentPartial: investments.some((i) => i === null),
    cpl: null,
    cpc: null,
  };
  for (const r of rows) {
    const n = Number(r.count);
    if (r.population === 'B') result.periodClosures += n;
    else {
      result.entered += n;
      result.stages[r.stage] += n;
      if (r.won) result.cohortClosures += n;
    }
  }
  if (result.entered)
    result.conversion = new Prisma.Decimal(result.cohortClosures)
      .mul(100)
      .div(result.entered)
      .toFixed(2);
  const informed = investments.filter((i): i is string => i !== null);
  if (informed.length)
    result.investment = informed
      .reduce((a, b) => a.add(b), new Prisma.Decimal(0))
      .toFixed(2);
  if (costs && !result.investmentPartial && result.investment !== null) {
    if (result.entered)
      result.cpl = new Prisma.Decimal(result.investment)
        .div(result.entered)
        .toFixed(2);
    if (result.cohortClosures)
      result.cpc = new Prisma.Decimal(result.investment)
        .div(result.cohortClosures)
        .toFixed(2);
  }
  return result;
}
export type Snapshot = {
  calculationVersion: number;
  name: string;
  generatedAt: string;
  author: { id: string; name: string };
  from: string;
  to: string;
  timezone: string;
  cutoff: string;
  partial: boolean;
  allResponsibles: boolean;
  sources: {
    id: string;
    name: string;
    isActive: boolean;
    investment: string | null;
  }[];
  responsibles: { id: string | null; name: string; isActive: boolean }[];
  summary: Metrics;
  bySource: { id: string | null; name: string; metrics: Metrics }[];
  byResponsible: { id: string | null; name: string; metrics: Metrics }[];
  warnings: string[];
};
