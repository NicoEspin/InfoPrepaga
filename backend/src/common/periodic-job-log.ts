import type { Logger } from '@nestjs/common';

/** Never includes exception messages, Prisma arguments, URLs or record values. */
export function technicalFailure(error: unknown) {
  const e = error as {
    name?: unknown;
    code?: unknown;
    meta?: { code?: unknown };
    stack?: unknown;
  } | null;
  const code = [e?.code, e?.meta?.code].find(
    (value): value is string =>
      typeof value === 'string' &&
      /^(P\d{4}|[0-9A-Z]{5}|ECONNREFUSED|ETIMEDOUT)$/.test(value),
  );
  const name =
    typeof e?.name === 'string' && /^[A-Za-z]+$/.test(e.name)
      ? e.name
      : 'Error';
  const stack =
    typeof e?.stack === 'string'
      ? e.stack
          .split('\n')
          .filter((line) => /^\s+at [A-Za-z0-9_.$<> /\\():-]+$/.test(line))
          .slice(-8)
          .join('\n')
      : '';
  const sqlState =
    typeof e?.meta?.code === 'string' && /^[0-9A-Z]{5}$/.test(e.meta.code)
      ? e.meta.code
      : undefined;
  return { name, code: code ?? 'UNKNOWN', sqlState, stack };
}

export class PeriodicJobLog {
  private signature = '';
  private last = 0;
  private suppressed = 0;
  failure(logger: Logger, job: string, error: unknown, now = Date.now()) {
    const detail = technicalFailure(error);
    const signature = `${detail.name}:${detail.code}:${detail.sqlState ?? ''}:${detail.stack}`;
    if (signature !== this.signature || now - this.last >= 300_000) {
      logger.error({ job, ...detail, repeated: this.suppressed, retry: true });
      this.signature = signature;
      this.last = now;
      this.suppressed = 0;
    } else this.suppressed++;
  }
  success(logger: Logger, job: string) {
    if (this.signature)
      logger.log({ job, recovered: true, repeated: this.suppressed });
    this.signature = '';
    this.suppressed = 0;
  }
}
