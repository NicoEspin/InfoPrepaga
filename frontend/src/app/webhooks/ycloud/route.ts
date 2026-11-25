import { backendFetch } from '@/lib/backend';

export const runtime = 'nodejs';
const limit = 128 * 1024;

// Dedicated machine endpoint. Human CRM routes retain session/origin checks.
export async function POST(request: Request) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') ||
    !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')
  )
    return Response.json({ message: 'YCLOUD_JSON_REQUIRED' }, { status: 415 });
  const signature = request.headers.get('ycloud-signature');
  if (!signature || signature.length > 1024)
    return Response.json({ message: 'YCLOUD_SIGNATURE_INVALID' }, { status: 401 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ message: 'YCLOUD_BODY_INVALID' }, { status: 400 });
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
      if (timeout.aborted)
        return Response.json({ message: 'YCLOUD_REQUEST_TIMEOUT' }, { status: 408 });
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return Response.json({ message: 'YCLOUD_BODY_TOO_LARGE' }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const response = await backendFetch('/webhooks/ycloud', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'ycloud-signature': signature },
      redirect: 'error',
      signal: AbortSignal.timeout(5000)
    });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch {
    return Response.json({ message: 'YCLOUD_BACKEND_UNAVAILABLE' }, { status: 503 });
  } finally {
    timeout.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
