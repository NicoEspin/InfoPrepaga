export const stages = [
  { id: 'new', label: 'Nuevo' },
  { id: 'contacted', label: 'Contactado' },
  { id: 'following', label: 'En seguimiento' },
  { id: 'proposal', label: 'Propuesta enviada' },
  { id: 'closed', label: 'Cerrado' }
] as const;
export type StageId = (typeof stages)[number]['id'];
export interface OpportunityPreview {
  id: string;
  leadId: string;
  name: string;
  company: string;
  seller: string;
  source: string;
  priority: 'Alta' | 'Media' | 'Baja';
  amount: number;
  nextActivity: string;
}
export type PipelineColumns = Record<StageId, OpportunityPreview[]>;
export const sellers = ['Vendedor demo A', 'Vendedor demo B', 'Vendedor demo C', 'Vendedor demo D'];
export const sources = ['Web', 'Referido', 'LinkedIn', 'Evento', 'Llamada', 'WhatsApp'];
const names = [
  'Lucía Fernández',
  'Clínica San Rafael',
  'Andrés Ibarra',
  'Obra Social Horizonte',
  'Martín Herrera',
  'Sofía Molina',
  'Planes Belgrano',
  'Valeria Torres',
  'Diego Rossi',
  'Instituto del Pilar',
  'Sofía García',
  'Empresa Vita',
  'Paula Gómez',
  'Cobertura Plena',
  'Nuevo Amanecer',
  'Familia Salud',
  'Prevención Total',
  'Centro Médico Vida'
];

// Synthetic opportunities and illustrative amounts, never commercial production data.
export const demoOpportunities = Object.fromEntries(
  stages.map((stage, stageIndex) => {
    const start = stageIndex < 3 ? stageIndex * 4 : 12 + (stageIndex - 3) * 3;
    const count = stageIndex < 3 ? 4 : 3;
    return [
      stage.id,
      names.slice(start, start + count).map((name, offset): OpportunityPreview => {
        const index = start + offset;
        return {
          id: `opportunity-demo-${index + 1}`,
          leadId:
            (
              { 0: 'demo-1', 4: 'demo-2', 5: 'demo-3', 8: 'demo-4', 12: 'demo-5' } as Record<
                number,
                string
              >
            )[index] ?? `pipeline-lead-${index + 1}`,
          name,
          company: `Empresa de ejemplo ${index + 1}`,
          seller: sellers[index % sellers.length],
          source: sources[index % sources.length],
          priority: offset === 0 ? 'Alta' : offset === 2 ? 'Baja' : 'Media',
          amount: (index + 1) * 100000,
          nextActivity:
            index === 17
              ? ''
              : `2026-${index % 4 === 0 ? '11-02' : `10-${String(27 + (index % 5)).padStart(2, '0')}`}T15:00:00Z`
        };
      })
    ];
  })
) as PipelineColumns;
