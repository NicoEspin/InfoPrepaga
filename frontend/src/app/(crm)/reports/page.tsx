import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { ReportsWorkspace } from '@/features/reports/components/reports-workspace';
export const metadata = { title: 'Reportes comerciales' };
export default async function ReportsPage() {
  const actor = await requireSession();
  if (!actor.roles.includes('ADMIN')) notFound();
  return <ReportsWorkspace actor={actor} />;
}
