import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { CommercialLeads } from '@/features/crm/components/leads';

export const metadata: Metadata = { title: 'Gestión de leads' };

export default async function LeadsPage() {
  const actor = await requireSession();
  return <CommercialLeads actor={actor} />;
}
