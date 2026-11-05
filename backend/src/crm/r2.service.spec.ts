import { ConfigService } from '@nestjs/config';
import { R2Service } from './r2.service';

describe('R2 private configuration and signatures', () => {
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
