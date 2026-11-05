import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';

async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const path = (await context.params).path?.join('/') ?? '';
  const id = '[0-9a-fA-F-]{36}';
  const allowed =
    request.method === 'GET'
      ? path === ''
      : request.method === 'PATCH'
        ? new RegExp(`^${id}$`).test(path)
        : request.method === 'POST' &&
          (path === '' || new RegExp(`^${id}/(?:delete|deactivate|restore)$`).test(path));
  if (!allowed) return NextResponse.json({ message: 'Ruta inexistente' }, { status: 404 });
  if (
    request.method !== 'GET' &&
    request.headers.get('origin') !== (process.env.APP_ORIGIN ?? 'http://localhost:3000')
  )
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  const token = request.cookies.get('ip_access')?.value;
  if (!token) return NextResponse.json({ message: 'Sesión finalizada' }, { status: 401 });
  try {
    let body: string | undefined;
    if (request.method !== 'GET') {
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return NextResponse.json({ message: 'Se requiere JSON' }, { status: 415 });
      const reader = request.body?.getReader();
      if (!reader) return NextResponse.json({ message: 'Se requiere JSON' }, { status: 400 });
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return NextResponse.json({ message: 'Solicitud demasiado grande' }, { status: 413 });
        }
        chunks.push(part.value);
      }
      body = Buffer.concat(chunks).toString('utf8');
      JSON.parse(body);
    }
    const response = await backendFetch(
      `/users${path ? '/' + path : ''}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body && { 'Content-Type': 'application/json' })
        },
        body
      }
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof SyntaxError ? 'JSON inválido' : 'El servidor no está disponible'
      },
      { status: error instanceof SyntaxError ? 400 : 502 }
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
