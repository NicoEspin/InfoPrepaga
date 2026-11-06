import { Logger } from '@nestjs/common';
import { CrmService } from './crm.service';
import { LeadImportService } from './lead-import.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccountsService } from '../users/accounts.service';

describe('Periodic import maintenance retries', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('does not overlap a running maintenance transaction and retries after it settles', async () => {
    jest.useFakeTimers();
    const db = {} as PrismaService,
      crm = new CrmService({} as AccountsService, db),
      imports = new LeadImportService(db, crm);
    let releaseAssignment!: (value: number) => void,
      releaseCleanup!: () => void;
    const assignment = new Promise<number>((resolve) => {
      releaseAssignment = resolve;
    });
    const purging = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const allocate = jest
      .spyOn(crm, 'distributePending')
      .mockImplementationOnce(() => assignment)
      .mockResolvedValue(1);
    const cleanup = jest
      .spyOn(imports, 'purgeExpired')
      .mockImplementationOnce(() => purging)
      .mockResolvedValue(undefined);
    crm.onModuleInit();
    imports.onModuleInit();
    await jest.advanceTimersByTimeAsync(60000);
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    releaseAssignment(0);
    releaseCleanup();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(60000);
    expect(allocate).toHaveBeenCalledTimes(3);
    expect(cleanup).toHaveBeenCalledTimes(2);
    await crm.onModuleDestroy();
    await imports.onModuleDestroy();
  });
  it('retries deferred durable work on the next tick and stops both timers on shutdown', async () => {
    jest.useFakeTimers();
    const db = {} as PrismaService,
      crm = new CrmService({} as AccountsService, db),
      imports = new LeadImportService(db, crm);
    let contended = true,
      assigned = false,
      purged = false;
    const allocate = jest
      .spyOn(crm, 'distributePending')
      .mockImplementation(() => {
        if (!contended) assigned = true;
        return Promise.resolve(contended ? 0 : 1);
      });
    const cleanup = jest
      .spyOn(imports, 'purgeExpired')
      .mockImplementation(() => {
        if (!contended) purged = true;
        return Promise.resolve();
      });
    crm.onModuleInit();
    imports.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(assigned || purged).toBe(false);
    contended = false;
    await jest.advanceTimersByTimeAsync(30000);
    expect(assigned).toBe(true);
    expect(purged).toBe(false);
    await jest.advanceTimersByTimeAsync(30000);
    expect(purged).toBe(true);
    await crm.onModuleDestroy();
    await imports.onModuleDestroy();
    const counts = [allocate.mock.calls.length, cleanup.mock.calls.length];
    await jest.advanceTimersByTimeAsync(120000);
    expect([allocate.mock.calls.length, cleanup.mock.calls.length]).toEqual(
      counts,
    );
  });
  it('reports a technical failure and recovers at the next tick without overlapping runs', async () => {
    jest.useFakeTimers();
    const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined),
      log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
    const db = {} as PrismaService,
      crm = new CrmService({} as AccountsService, db),
      imports = new LeadImportService(db, crm);
    const allocate = jest
      .spyOn(crm, 'distributePending')
      .mockRejectedValueOnce({ code: 'P2028' })
      .mockResolvedValue(1);
    const cleanup = jest
      .spyOn(imports, 'purgeExpired')
      .mockRejectedValueOnce({ code: 'P2028' })
      .mockResolvedValue(undefined);
    crm.onModuleInit();
    imports.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60000);
    expect(allocate).toHaveBeenCalledTimes(3);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ recovered: true }),
    );
    await crm.onModuleDestroy();
    await imports.onModuleDestroy();
  });
});
