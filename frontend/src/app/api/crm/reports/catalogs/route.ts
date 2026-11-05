import { NextRequest } from 'next/server';
import { handle } from '@/lib/crm-proxy';
export async function GET(request: NextRequest) {
  return handle(request, { params: Promise.resolve({ path: ['reports', 'catalogs'] }) });
}
