import { demoLeads, type LeadPreview } from '@/features/leads/data/demo-leads';
import { demoOpportunities, stages } from '@/features/pipeline/data/demo-opportunities';
import { createDemoTasks } from '@/features/followups/data/tasks';
import type { LeadProfile } from '../api/types';

function createProfile(lead: LeadPreview): LeadProfile {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    source: lead.source,
    seller: lead.seller,
    status: lead.status,
    createdAt: '2026-10-12T13:24:00Z',
    isDemo: true,
    observations:
      'Prospecto sintético interesado en conocer las opciones de cobertura. Solicitó información y una llamada de seguimiento. Sin datos personales reales.',
    activities: [
      {
        id: 'registered',
        kind: 'registered',
        at: '2026-10-12T13:24:00Z',
        title: 'Lead registrado',
        description: `Se creó el registro de prueba desde el origen ${lead.source}.`
      },
      {
        id: 'assigned',
        kind: 'assigned',
        at: '2026-10-12T13:35:00Z',
        title: `Asignado a ${lead.seller}`,
        description: 'Asignación ilustrativa para revisar el historial comercial.'
      },
      {
        id: 'call',
        kind: 'call',
        at: '2026-10-13T14:20:00Z',
        title: 'Primer contacto realizado',
        description:
          'Se presentó la propuesta y se respondieron las primeras consultas en una llamada de ejemplo.'
      },
      {
        id: 'interest',
        kind: 'interest',
        at: '2026-10-14T19:15:00Z',
        title: 'Interés confirmado',
        description: 'El prospecto de prueba solicitó información adicional por correo.'
      },
      {
        id: 'scheduled',
        kind: 'scheduled',
        at: '2026-10-15T12:30:00Z',
        title: 'Seguimiento programado',
        description: 'Se agendó una llamada de ejemplo para continuar la presentación.'
      }
    ],
    nextActivity:
      lead.status === 'Cerrado'
        ? null
        : {
            id: `next-${lead.id}`,
            title: 'Llamada de seguimiento',
            description:
              'Continuar con la presentación de opciones y responder las consultas del prospecto de prueba.',
            startsAt: '2026-10-30T14:00:00Z',
            endsAt: '2026-10-30T14:30:00Z'
          }
  };
}

// IDs are explicit relationships from the preview records, never name-based matching.
export function findDemoLeadProfile(id: string): LeadProfile | null {
  const lead = demoLeads.find((item) => item.id === id);
  if (lead) return createProfile(lead);
  for (const stage of stages) {
    const opportunity = demoOpportunities[stage.id].find((item) => item.leadId === id);
    if (opportunity)
      return createProfile({
        id,
        name: opportunity.name,
        company: opportunity.company,
        source: opportunity.source,
        seller: opportunity.seller,
        status: stage.label,
        phone: 'Teléfono de ejemplo',
        email: `${opportunity.id}@example.com`,
        lastActivity: '2026-10-29T15:00:00Z'
      });
  }
  const task = createDemoTasks('2026-10-29').find((item) => item.leadId === id);
  if (task)
    return createProfile({
      id,
      name: task.contact,
      company: 'Empresa de ejemplo',
      source: 'Web',
      seller: task.seller,
      status: 'En seguimiento',
      phone: 'Teléfono de ejemplo',
      email: `${task.id}@example.com`,
      lastActivity: '2026-10-29T15:00:00Z'
    });
  return null;
}
