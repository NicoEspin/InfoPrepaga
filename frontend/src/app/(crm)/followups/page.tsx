import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { CommercialFollowups } from '@/features/crm/components/followups';
import { getFollowupsReferenceTime } from '@/features/followups/data/reference-time';

export const metadata: Metadata = { title: 'Seguimientos y tareas' };

export default async function FollowupsPage() {
  const user = await requireSession();
  const reference = getFollowupsReferenceTime();
  return <CommercialFollowups actor={user} today={reference.today} />;
}
