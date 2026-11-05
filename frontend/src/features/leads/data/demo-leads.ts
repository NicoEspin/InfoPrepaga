// Synthetic UI fixtures. Never use this collection as a production data source.
export interface LeadPreview {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  status: 'Nuevo' | 'Contactado' | 'En seguimiento' | 'Propuesta enviada' | 'Cerrado';
  seller: string;
  lastActivity: string;
}

export const leadStatuses: LeadPreview['status'][] = [
  'Nuevo',
  'Contactado',
  'En seguimiento',
  'Propuesta enviada',
  'Cerrado'
];
export const leadSources = ['Web', 'Referido', 'WhatsApp', 'Instagram', 'Llamada', 'Campaña'];
export const demoSellers = [
  'Vendedor demo A',
  'Vendedor demo B',
  'Vendedor demo C',
  'Vendedor demo D'
];

const names = [
  'Lucía Fernández',
  'Martín Herrera',
  'Sofía Molina',
  'Diego Rossi',
  'Paula Gómez',
  'Javier Torres',
  'Camila Suárez',
  'Andrés Vega',
  'Valentina Castro',
  'Mateo Romero',
  'Emilia Acosta',
  'Bruno Medina',
  'Julieta Flores',
  'Santiago Silva',
  'Catalina Ríos',
  'Tomás Navarro'
];

export const demoLeads: LeadPreview[] = names.map((name, index) => ({
  id: `demo-${index + 1}`,
  name,
  company: `Empresa demo ${index + 1}`,
  phone: 'Teléfono de ejemplo',
  email: `contacto${index + 1}@example.com`,
  source: leadSources[index % leadSources.length],
  status: leadStatuses[[2, 0, 1, 3, 4, 2, 1, 0][index % 8]],
  seller: demoSellers[index % demoSellers.length],
  lastActivity: `2026-10-${String(29 - Math.floor(index / 2)).padStart(2, '0')}T${index % 2 ? '14:20' : '12:42'}:00Z`
}));
