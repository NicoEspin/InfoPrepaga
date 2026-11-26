import { backendFetch } from '@/lib/backend';

export const runtime = 'nodejs';
type Context = { params: Promise<{ landing: string }> };
const origins: Record<string, string[]> = {
  infoprepaga: ['https://infoprepaga.com.ar', 'https://www.infoprepaga.com.ar'],
  'coberturas-medicas': ['https://coberturasmedicas.com.ar', 'https://www.coberturasmedicas.com.ar']
};

// CORS applies exclusively to these machine routes. No cookies are accepted or
// forwarded. The secret belongs in the landing processor, never in its browser.
function cors(request: Request, landing: string): Headers | null {
  const origin = request.headers.get('origin');
  if (origin && !origins[landing]?.includes(origin)) return null;
  const headers = new Headers({ 'cache-control': 'no-store', vary: 'Origin' });
  if (origin) headers.set('access-control-allow-origin', origin);
  return headers;
}
const reply = (status: number, headers?: Headers) =>
  Response.json(
    status === 200 || status === 201 ? { ok: true } : { ok: false, code: `LANDING_${status}` },
    { status, headers }
  );

export async function OPTIONS(request: Request, context: Context) {
  const { landing } = await context.params;
  if (!Object.hasOwn(origins, landing)) return reply(404);
  const headers = cors(request, landing);
  if (!headers) return reply(403);
  const method = request.headers.get('access-control-request-method');
  const requested = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (
    (method && method !== 'POST') ||
    requested.some((header) => !['authorization', 'content-type'].includes(header))
  )
    return reply(403, headers);
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'Authorization, Content-Type');
  headers.set('access-control-max-age', '600');
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request, context: Context) {
  const { landing } = await context.params;
  if (!Object.hasOwn(origins, landing)) return reply(404);
  const headers = cors(request, landing);
  if (!headers) return reply(403);
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [!-~]{32,512}$/.test(authorization)) return reply(401, headers);
  if (
    !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') ||
    !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')
  )
    return reply(415, headers);
  const reader = request.body?.getReader();
  if (!reader) return reply(400, headers);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = AbortSignal.timeout(5000);
  const cancel = () => {
    void reader.cancel();
  };
  timeout.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timeout.aborted) return reply(408, headers);
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return reply(413, headers);
      }
      chunks.push(value);
    }
    const response = await backendFetch(`/integrations/v1/leads/${landing}`, {
      method: 'POST',
      body: Buffer.concat(chunks),
      headers: { authorization, 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20000)
    });
    // Never forward backend details, cookies, contact/assignment data or errors.
    const status = [200, 201, 400, 401, 403, 409, 413, 415, 429].includes(response.status)
      ? response.status
      : 503;
    if (status === 429) headers.set('retry-after', response.headers.get('retry-after') ?? '60');
    await response.body?.cancel();
    return reply(status, headers);
  } catch {
    return reply(503, headers);
  } finally {
    timeout.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
