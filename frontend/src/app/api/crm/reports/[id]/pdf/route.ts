import { NextRequest } from 'next/server';
import { handle } from '@/lib/crm-proxy';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(request, { params: Promise.resolve({ path: ['reports', id, 'pdf'] }) });
}
