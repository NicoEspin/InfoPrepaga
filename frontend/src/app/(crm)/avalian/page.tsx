import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AvalianWorkspace } from '@/features/avalian/components/avalian-workspace';
import { demoAvalianRecords } from '@/features/avalian/data/records';

export const metadata: Metadata = { title: 'Cartera Avalian' };

export default async function AvalianPage() {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_STARTER_DEMOS !== 'true')
    notFound();
  const user = await requireSession();
  if (!user.roles.includes('ADMIN')) notFound();
  return <AvalianWorkspace initialRecords={demoAvalianRecords} />;
}
