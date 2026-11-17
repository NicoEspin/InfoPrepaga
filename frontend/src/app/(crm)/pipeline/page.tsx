import { requireSession } from '@/lib/session';
import { CommercialPipeline } from '@/features/pipeline/components/commercial-pipeline';
import { getPipelineReferenceDate } from '@/features/pipeline/data/reference-date';
export const metadata = { title: 'Pipeline comercial' };
export default async function PipelinePage() {
  const actor = await requireSession();
  const currentMonth = getPipelineReferenceDate().slice(0, 7);
  return <CommercialPipeline actor={actor} currentMonth={currentMonth} />;
}
