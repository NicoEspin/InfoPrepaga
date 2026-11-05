export interface TaskPreview {
  id: string;
  leadId?: string;
  contact: string;
  title: string;
  seller: string;
  priority: 'Alta' | 'Media' | 'Baja';
  dueAt: string;
  duration: number;
  completedAt: string | null;
}
export const taskSellers = ['Vendedor demo A', 'Vendedor demo B', 'Vendedor demo C'];
export const priorities: TaskPreview['priority'][] = ['Alta', 'Media', 'Baja'];
export const crmTimeZone = 'America/Argentina/Buenos_Aires';
const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: crmTimeZone });
const timeFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: crmTimeZone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function dateKey(iso: string): string {
  return dayFormat.format(new Date(iso));
}
export function timeLabel(iso: string): string {
  return timeFormat.format(new Date(iso));
}
export function shiftDay(day: string, offset: number): string {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -(weekday === 0 ? 6 : weekday - 1));
}
export function dayLabel(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-AR', { ...options, timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`)
  );
}
export function taskInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00-03:00`).toISOString();
}
export function taskGroup(
  task: TaskPreview,
  today: string
): 'overdue' | 'today' | 'upcoming' | 'completed' {
  if (task.completedAt) return 'completed';
  const day = dateKey(task.dueAt);
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming';
}

// Relative synthetic dates keep the preview useful on every development day.
export function createDemoTasks(today: string): TaskPreview[] {
  const contacts = [
    'María González',
    'Clínica del Sol',
    'Andrés Romero',
    'Natalia Torres',
    'Estudio Rivas',
    'Carlos Méndez',
    'Familia Castro',
    'Gabriela Suárez',
    'Empresa Andina',
    'Diego Acosta',
    'Centro Médico Norte',
    'Clínica del Valle',
    'Grupo Salud',
    'Laura Benítez',
    'Martina López',
    'Pablo Díaz',
    'Consultorio Sur',
    'Familia Pérez'
  ];
  const titles = [
    'Realizar segundo contacto',
    'Confirmar interés',
    'Enviar propuesta final',
    'Realizar segundo contacto',
    'Confirmar interés',
    'Presentar plan corporativo',
    'Responder dudas sobre cobertura',
    'Coordinar videollamada',
    'Enviar información adicional',
    'Seguimiento de propuesta',
    'Confirmar reunión presencial',
    'Reunión presencial',
    'Presentar propuesta',
    'Confirmar interés'
  ];
  const offsets = [-1, -1, -2, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 4, 0, -1, -2, 0];
  const times = [
    '16:00',
    '11:30',
    '14:00',
    '09:00',
    '10:30',
    '12:00',
    '15:00',
    '17:00',
    '10:00',
    '11:30',
    '15:00',
    '15:30',
    '14:00',
    '09:30',
    '11:00',
    '13:00',
    '16:00',
    '18:00'
  ];
  return contacts.map((contact, index) => ({
    id: `task-demo-${index + 1}`,
    leadId: `followup-lead-${index + 1}`,
    contact,
    title: titles[index % titles.length],
    seller: taskSellers[index % taskSellers.length],
    priority: priorities[index % priorities.length],
    dueAt: taskInstant(shiftDay(today, offsets[index]), times[index]),
    duration: 60,
    completedAt: index >= 14 ? taskInstant(today, '08:00') : null
  }));
}

// Allocate simultaneous appointments to separate lanes, including chained overlaps.
export function layoutAppointments(tasks: TaskPreview[]) {
  const sorted = tasks
    .map((task) => {
      const [hour, minute] = timeLabel(task.dueAt).split(':').map(Number);
      return {
        task,
        start: hour * 60 + minute,
        end: hour * 60 + minute + task.duration,
        lane: 0,
        lanes: 1
      };
    })
    .filter((item) => item.start < 19 * 60 && item.end > 8 * 60)
    .toSorted((a, b) => a.start - b.start);
  let group: typeof sorted = [];
  let ends: number[] = [];
  function flush() {
    for (const item of group) item.lanes = ends.length;
    group = [];
    ends = [];
  }
  for (const item of sorted) {
    if (group.length && ends.every((end) => end <= item.start)) flush();
    let lane = ends.findIndex((end) => end <= item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.end;
    item.lane = lane;
    group.push(item);
  }
  flush();
  return sorted;
}
