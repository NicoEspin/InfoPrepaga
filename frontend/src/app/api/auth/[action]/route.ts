import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/'
};

function clearSession(response: NextResponse) {
  for (const name of ['ip_access', 'ip_refresh']) {
    response.cookies.set(name, '', { ...cookieOptions, maxAge: 0 });
  }
  return response;
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  // A fixed configured origin prevents CSRF, including behind a reverse proxy.
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  if (request.headers.get('origin') !== origin) {
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  }
  const { action } = await context.params;
  if (!['login', 'refresh', 'logout'].includes(action)) {
    return NextResponse.json({ message: 'Ruta inexistente' }, { status: 404 });
  }
  try {
    let payload: unknown;
    if (action === 'login') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return NextResponse.json({ message: 'Se requiere JSON' }, { status: 415 });
      }
      const reader = request.body?.getReader();
      if (!reader) return NextResponse.json({ message: 'Se requiere JSON' }, { status: 400 });
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 4096) {
          await reader.cancel();
          return NextResponse.json({ message: 'Solicitud demasiado grande' }, { status: 413 });
        }
        chunks.push(chunk.value);
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        !body ||
        typeof body !== 'object' ||
        !('email' in body) ||
        !('password' in body) ||
        typeof body.email !== 'string' ||
        typeof body.password !== 'string' ||
        body.email.length > 254 ||
        body.password.length > 72
      ) {
        return NextResponse.json({ message: 'Credenciales inválidas' }, { status: 400 });
      }
      payload = { email: body.email, password: body.password };
    } else {
      const refreshToken = request.cookies.get('ip_refresh')?.value;
      if (!refreshToken) {
        return clearSession(
          NextResponse.json(
            { message: 'Sesión finalizada' },
            {
              status: action === 'logout' ? 200 : 401
            }
          )
        );
      }
      payload = { refreshToken };
    }
    const upstream = await backendFetch(`/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!upstream.ok) {
      const response = NextResponse.json(
        {
          message:
            upstream.status === 429
              ? 'Demasiados intentos. Intentá nuevamente en un minuto.'
              : 'No se pudo iniciar o renovar la sesión'
        },
        { status: upstream.status }
      );
      return action === 'refresh' && [401, 403].includes(upstream.status)
        ? clearSession(response)
        : response;
    }
    const response = NextResponse.json({ ok: true });
    response.headers.set('Cache-Control', 'no-store');
    if (action === 'logout') return clearSession(response);
    const tokens = (await upstream.json()) as { accessToken: string; refreshToken: string };
    if (typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string') {
      throw new Error('Invalid upstream response');
    }
    // Cookie lifetime follows the session; NestJS enforces the shorter JWT expiry.
    response.cookies.set('ip_access', tokens.accessToken, { ...cookieOptions, maxAge: 604800 });
    response.cookies.set('ip_refresh', tokens.refreshToken, { ...cookieOptions, maxAge: 604800 });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof SyntaxError ? 'JSON inválido' : 'El servidor no está disponible'
      },
      {
        status: error instanceof SyntaxError ? 400 : 502
      }
    );
  }
}
