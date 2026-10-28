import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession } from './session';

export async function checkDemoAccess(method = 'GET') {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_STARTER_DEMOS !== 'true') {
    return NextResponse.json({ message: 'Demo deshabilitada' }, { status: 404 });
  }
  const user = await getSession();
  if (!user) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  if (!user.roles.includes('ADMIN')) {
    return NextResponse.json({ message: 'Acceso restringido' }, { status: 403 });
  }
  // Demo handlers include mutations. Apply the same origin check to all requests.
  const origin = (await headers()).get('origin');
  if (
    (!['GET', 'HEAD'].includes(method) || origin) &&
    origin !== (process.env.APP_ORIGIN ?? 'http://localhost:3000')
  ) {
    return NextResponse.json({ message: 'Origen no permitido' }, { status: 403 });
  }
  return null;
}
