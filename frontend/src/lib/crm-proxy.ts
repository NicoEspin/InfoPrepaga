import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';

const uuid = '[0-9a-fA-F-]{36}';
const routes: Record<string, RegExp[]> = {
  GET: [
    /^session$/,
    /^pipeline$/,
    /^reports(?:\/catalogs)?$/,
    new RegExp(`^reports/${uuid}(?:/pdf)?$`),
    /^catalogs$/,
    /^users$/,
    /^leads$/,
    /^lead-imports$/,
    new RegExp(`^lead-imports/${uuid}$`),
    new RegExp(`^leads/${uuid}$`),
    new RegExp(`^leads/${uuid}/history$`),
    new RegExp(`^leads/${uuid}/attachments(?:/${uuid}/download)?$`),
    /^tasks$/
  ],
  POST: [
    /^reports(?:\/preview)?$/,
    /^lead-imports$/,
    new RegExp(`^lead-imports/${uuid}/(?:review|confirm)$`),
    /^leads$/,
    /^sources$/,
    /^tasks$/,
    /^users$/,
    new RegExp(`^leads/${uuid}/notes$`),
    new RegExp(`^leads/${uuid}/attachments$`)
  ],
  PATCH: [
    new RegExp(`^pipeline/${uuid}$`),
    new RegExp(`^lead-imports/${uuid}(?:/rows/${uuid})?$`),
    new RegExp(`^leads/${uuid}/attachments/${uuid}$`),
    new RegExp(`^leads/${uuid}(?:/status|/assignment)?$`),
    new RegExp(`^tasks/${uuid}$`),
    new RegExp(`^users/${uuid}$`),
    new RegExp(`^sources/${uuid}$`)
  ],
  DELETE: [new RegExp(`^leads/${uuid}/attachments/${uuid}$`)]
};

export async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  if (!routes[request.method]?.some((pattern) => pattern.test(endpoint))) {
    return NextResponse.json({ message: 'Ruta inexistente' }, { status: 404 });
  }
  if (
    request.method !== 'GET' &&
    request.headers.get('origin') !== (process.env.APP_ORIGIN ?? 'http://localhost:3000')
  ) {
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  }
  const token = request.cookies.get('ip_access')?.value;
  if (!token) return NextResponse.json({ message: 'Sesión finalizada' }, { status: 401 });
  try {
    let body: string | ArrayBuffer | undefined;
    const upload =
      request.method === 'POST' &&
      (endpoint.endsWith('/attachments') || endpoint === 'lead-imports');
    // A report can contain 500 sources, people and investments. Keep the
    // larger JSON allowance scoped to its two validated write endpoints.
    const bodyLimit = upload
      ? 10 * 1024 * 1024 + 8192
      : endpoint === 'reports' || endpoint === 'reports/preview'
        ? 128 * 1024
        : 16_384;
    const contentType = request.headers.get('content-type') ?? '';
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      if (
        upload
          ? !contentType.startsWith('multipart/form-data;')
          : !contentType.startsWith('application/json')
      )
        return NextResponse.json(
          { message: upload ? 'Se requiere un archivo multipart' : 'Se requiere JSON' },
          { status: 415 }
        );
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (!reader)
        return NextResponse.json(
          { message: upload ? 'Seleccioná un archivo' : 'Se requiere JSON' },
          { status: 400 }
        );
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > bodyLimit) {
          await reader.cancel();
          return NextResponse.json({ message: 'Solicitud demasiado grande' }, { status: 413 });
        }
        chunks.push(chunk.value);
      }
      const bytes = Buffer.concat(chunks);
      body = upload ? Uint8Array.from(bytes).buffer : bytes.toString('utf8');
      if (!upload) JSON.parse(body as string);
    }
    const upstreamPath =
      endpoint === 'session'
        ? '/users/me'
        : endpoint === 'users' && request.method === 'POST'
          ? '/auth/register'
          : `/crm/${endpoint}`;
    const upstream = await backendFetch(`${upstreamPath}${request.nextUrl.search}`, {
      method: request.method,
      ...(endpoint.startsWith('reports') && { signal: AbortSignal.timeout(60000) }),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body && { 'Content-Type': contentType })
      },
      body
    });
    if (endpoint.startsWith('reports/') && endpoint.endsWith('/pdf') && upstream.ok) {
      return new NextResponse(upstream.body, {
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'private, no-store',
          'Content-Disposition':
            upstream.headers.get('content-disposition') ?? 'attachment; filename="reporte.pdf"',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }
    const payload: unknown = await upstream.json();
    if (
      endpoint === 'users' &&
      request.method === 'POST' &&
      upstream.ok &&
      payload &&
      typeof payload === 'object' &&
      'user' in payload
    ) {
      // Account creation must never expose the issued account tokens to the browser.
      return NextResponse.json(payload.user, {
        status: upstream.status,
        headers: { 'Cache-Control': 'private, no-store' }
      });
    }
    if (endpoint === 'session' && upstream.ok && payload && typeof payload === 'object') {
      return NextResponse.json(
        {
          ...payload,
          demosEnabled:
            process.env.NODE_ENV !== 'production' && process.env.ENABLE_STARTER_DEMOS === 'true'
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof SyntaxError ? 'JSON inválido' : 'No se pudo contactar al servidor'
      },
      { status: error instanceof SyntaxError ? 400 : 502 }
    );
  }
}
