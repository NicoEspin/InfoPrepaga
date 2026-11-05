import { requireSession } from '@/lib/session';
import { CommercialPipeline } from '@/features/pipeline/components/commercial-pipeline';
export const metadata = { title: 'Pipeline comercial' };
export default async function PipelinePage() {
  const actor = await requireSession();
  return <CommercialPipeline actor={actor} />;
}
