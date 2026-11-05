import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { CommercialSettings } from '@/features/crm/components/settings';

export const metadata = { title: 'Administrador' };
export default async function SettingsPage() {
  const actor = await requireSession();
  if (!actor.roles.includes('ADMIN')) notFound();
  return <CommercialSettings actor={actor} />;
}
