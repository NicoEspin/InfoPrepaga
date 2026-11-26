import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { R2Service } from './r2.service';

describe('R2 private configuration and signatures', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      'put',
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
      'AccessDenied',
      undefined,
      403,
    ],
    ['put', { name: 'AbortError' }, 'AbortError', undefined, undefined],
    [
      'remove',
      { name: 'Error', cause: { code: 'ENOTFOUND' } },
      'UnknownError',
      'ENOTFOUND',
      undefined,
    ],
    [
      'put',
      {
        name: 'secret',
        code: 'secret',
        cause: { code: 'secret' },
        $metadata: { httpStatusCode: 'secret' },
      },
      'UnknownError',
      undefined,
      undefined,
    ],
  ] as const)(
    'logs safe diagnostics for %s failures (%j)',
    async (operation, failure, errorCode, networkCode, httpStatusCode) => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce({
        ...failure,
        message: 'secret credential and filename',
        stack: 'secret stack',
      } as never);
      const r2 = new R2Service(
        new ConfigService({
          R2_ACCOUNT_ID: '0'.repeat(32),
          R2_BUCKET_NAME: 'synthetic-private',
          R2_ACCESS_KEY_ID: 'synthetic',
          R2_SECRET_ACCESS_KEY: 'secret',
        }),
      );
      try {
        const request =
          operation === 'put'
            ? r2.put(
                'secret-object-key',
                Buffer.from('secret-file'),
                'application/pdf',
              )
            : r2.remove('secret-object-key');
        await expect(request).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith({
          event: 'r2-operation-failed',
          operation,
          errorCode,
          networkCode,
          httpStatusCode,
          elapsedMs: expect.any(Number) as number,
        });
        expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
      } finally {
        r2.onModuleDestroy();
      }
    },
  );
  it('starts without credentials and fails only storage operations', () => {
    const r2 = new R2Service(new ConfigService({}));
    expect(() => r2.assertConfigured()).toThrow('todavía no está configurado');
    r2.onModuleDestroy();
  });
  it('signs a short-lived download with forced attachment disposition and safe filename', async () => {
    const r2 = new R2Service(
      new ConfigService({
        R2_ACCOUNT_ID: '0'.repeat(32),
        R2_BUCKET_NAME: 'synthetic-private',
        R2_ACCESS_KEY_ID: 'synthetic',
        R2_SECRET_ACCESS_KEY: 'synthetic',
      }),
    );
    try {
      const result = await r2.download(
        'leads/synthetic/id',
        'Cotización "uno".pdf',
      );
      const url = new URL(result.url);
      expect(url.hostname).toMatch(/\.r2\.cloudflarestorage\.com$/);
      expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
      expect(url.searchParams.get('response-content-type')).toBe(
        'application/octet-stream',
      );
      expect(url.searchParams.get('response-content-disposition')).toContain(
        "filename*=UTF-8''Cotizaci%C3%B3n%20%22uno%22.pdf",
      );
      expect(url.searchParams.get('response-cache-control')).toBe(
        'private, no-store',
      );
    } finally {
      r2.onModuleDestroy();
    }
  });
});
