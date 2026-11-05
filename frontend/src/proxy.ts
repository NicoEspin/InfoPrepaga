import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith('/dashboard') &&
    (process.env.NODE_ENV === 'production' || process.env.ENABLE_STARTER_DEMOS !== 'true')
  ) {
    return new NextResponse('Demo deshabilitada', { status: 404 });
  }
  const headers = new Headers(request.headers);
  headers.set('x-ip-path', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
