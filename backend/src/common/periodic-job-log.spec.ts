import { Logger } from '@nestjs/common';
import { PeriodicJobLog, technicalFailure } from './periodic-job-log';
describe('Safe recurring diagnostics', () => {
  it('keeps technical codes and stack frames without exception payloads', () => {
    const e = Object.assign(new Error('secret@example.test password token'), {
      code: 'P2028',
      meta: { query: 'personal record' },
    });
    const detail = technicalFailure(e);
    expect(detail.code).toBe('P2028');
    expect(JSON.stringify(detail)).not.toMatch(
      /secret|password|personal record/,
    );
    expect(detail.stack).toContain('at ');
  });
  it('logs new failures, suppresses repetition and reports recovery', () => {
    const logger = { error: jest.fn(), log: jest.fn() };
    const target = logger as unknown as Logger;
    const log = new PeriodicJobLog();
    const e = { name: 'Error', code: 'P2028' };
    log.failure(target, 'job', e, 1);
    log.failure(target, 'job', e, 100);
    expect(logger.error).toHaveBeenCalledTimes(1);
    log.failure(target, 'job', { name: 'Error', code: 'P1001' }, 200);
    expect(logger.error).toHaveBeenCalledTimes(2);
    log.success(target, 'job');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ recovered: true }),
    );
  });
});
