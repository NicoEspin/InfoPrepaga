import { NextResponse } from 'next/server';
import { checkDemoAccess } from '@/lib/demo-access';
import { findDemoLeadProfile } from '@/features/lead-profile/data/demo-profiles';

export async function GET(_request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const denied = await checkDemoAccess();
  if (denied) return denied;
  const { leadId } = await params;
  if (!/^[a-z0-9-]{1,100}$/.test(leadId))
    return NextResponse.json(
      { message: 'ID inválido' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  const profile = findDemoLeadProfile(leadId);
  if (!profile)
    return NextResponse.json(
      { message: 'Lead no encontrado' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  return NextResponse.json(profile, { headers: { 'Cache-Control': 'no-store' } });
}
