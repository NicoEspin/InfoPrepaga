import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { metrics, period, AggregateRow } from './report-calculation';
import { ReportInputDto } from './reports.dto';

describe('Commercial calculation v1', () => {
  it('uses IANA offsets for historical summer dates as well as current Buenos Aires days', () => {
    const p = period(
      '2008-01-01',
      '2008-01-31',
      new Date('2008-02-02T12:00:00Z'),
    );
    expect(p.start.toISOString()).toBe('2008-01-01T02:00:00.000Z');
    expect(p.end.toISOString()).toBe('2008-02-01T02:00:00.000Z');
    const transition = period(
      '2008-10-19',
      '2008-10-19',
      new Date('2008-10-21T12:00:00Z'),
    );
    expect(transition.end.getTime() - transition.start.getTime()).toBe(
      23 * 3600000,
    );
  });
  const row = (overrides: Partial<AggregateRow> = {}): AggregateRow => ({
    population: 'A',
    sourceId: 'channel',
    responsibleId: null,
    stage: 'NEW',
    won: false,
    count: 1n,
    ...overrides,
  });
  it('uses Buenos Aires full days and an exclusive upper bound', () => {
    const p = period(
      '2026-05-01',
      '2026-05-31',
      new Date('2026-06-01T03:00:00Z'),
    );
    expect(p.start.toISOString()).toBe('2026-05-01T03:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-06-01T03:00:00.000Z');
    expect(p.partial).toBe(false);
  });
  it('uses generation as partial cutoff and rejects future, inverted and invalid dates', () => {
    const now = new Date('2026-05-04T12:00:00Z');
    expect(period('2026-05-01', '2026-05-31', now)).toMatchObject({
      partial: true,
      cutoff: now,
    });
    for (const [a, b] of [
      ['2026-05-05', '2026-05-31'],
      ['2026-05-04', '2026-05-01'],
      ['2026-02-30', '2026-05-01'],
    ])
      expect(() => period(a, b, now)).toThrow();
  });
  it('keeps old closures outside the cohort conversion and stage totals reconcile', () => {
    const result = metrics(
      [
        row({ count: 2n }),
        row({ stage: 'CLOSED', won: true }),
        row({ stage: 'UNKNOWN' }),
        row({ population: 'B', count: 8n, won: true }),
      ],
      ['100.10'],
      true,
    );
    expect(result).toMatchObject({
      entered: 4,
      periodClosures: 8,
      cohortClosures: 1,
      conversion: '25.00',
      investment: '100.10',
      cpl: '25.03',
      cpc: '100.10',
    });
    expect(Object.values(result.stages).reduce((a, b) => a + b, 0)).toBe(
      result.entered,
    );
  });
  it('distinguishes missing investment, zero, no denominators and person filters', () => {
    expect(metrics([row()], ['0.00'], true)).toMatchObject({
      investment: '0.00',
      cpl: '0.00',
      cpc: null,
    });
    expect(metrics([row()], ['100.10', null], true)).toMatchObject({
      investment: '100.10',
      investmentPartial: true,
      cpl: null,
      cpc: null,
    });
    expect(metrics([row()], ['100.10'], false).cpl).toBeNull();
    expect(metrics([], ['10.10'], true)).toMatchObject({
      conversion: null,
      cpl: null,
      cpc: null,
    });
    expect(
      metrics([row({ count: 3n })], ['0.10', '0.20'], true).investment,
    ).toBe('0.30');
  });
  it('accepts only precise nonnegative decimal strings, including zero and missing', async () => {
    const input = {
      name: 'Sintético',
      from: '2026-05-01',
      to: '2026-05-31',
      sourceIds: [],
      responsibleIds: [],
    };
    for (const amount of [null, '0', '0.00', '200000.10'])
      expect(
        await validate(
          plainToInstance(ReportInputDto, {
            ...input,
            investments: [
              { sourceId: 'e0f50b30-88e5-4b1b-8cc3-c79acb4bf931', amount },
            ],
          }),
        ),
      ).toHaveLength(0);
    for (const amount of [-1, '-1', '1.001', 'NaN', 0, '1e2'])
      expect(
        (
          await validate(
            plainToInstance(ReportInputDto, {
              ...input,
              investments: [
                { sourceId: 'e0f50b30-88e5-4b1b-8cc3-c79acb4bf931', amount },
              ],
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
  });
});
