export const leadStatuses = [
  { id: 'NEW', name: 'Nuevo' },
  { id: 'NO_ANSWER', name: 'No contesta' },
  { id: 'WHATSAPP', name: 'WhatsApp' },
  { id: 'OVER_BUDGET', name: 'Fuera de presupuesto' },
  { id: 'MEDICAL_PREEXISTENCE', name: 'Preexistencia médica' },
  { id: 'RETIRED', name: 'Jubilado' },
  { id: 'PROSPECT', name: 'Prospecto' },
  { id: 'OTHER_INTEREST', name: 'Buscaba otra cosa' },
  { id: 'ALREADY_CONTRACTED', name: 'Ya contrató' },
] as const;

export const initialSources = [
  ['LANDING_IP', 'Landing IP'],
  ['LANDING_CM', 'Landing CM'],
  ['WHATSAPP_CM', 'Whatsapp CM'],
  ['META_1', 'Meta 1'],
  ['META_2', 'Meta 2'],
  ['META_3', 'Meta 3'],
] as const;
