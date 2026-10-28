import { NextResponse } from 'next/server';
import { backendFetch } from '@/lib/backend';

export async function GET() {
  try {
    const response = await backendFetch('/ready');
    const data = (await response.json()) as { status?: string };
    if (!response.ok || data.status !== 'ok') throw new Error('Unavailable');
    return NextResponse.json(
      { status: 'ok', backend: 'connected' },
      {
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  } catch {
    return NextResponse.json({ status: 'error', backend: 'unavailable' }, { status: 503 });
  }
}
