import { z } from 'zod';

const activitySchema = z.object({
  id: z.string(),
  kind: z.enum(['registered', 'assigned', 'call', 'interest', 'scheduled', 'note']),
  at: z.string().datetime({ offset: true }),
  title: z.string(),
  description: z.string()
});

export const leadProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  source: z.string(),
  seller: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  status: z.enum(['Nuevo', 'Contactado', 'En seguimiento', 'Propuesta enviada', 'Cerrado']),
  observations: z.string(),
  activities: z.array(activitySchema),
  nextActivity: z
    .object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true })
    })
    .nullable(),
  isDemo: z.boolean()
});

export type LeadProfile = z.infer<typeof leadProfileSchema>;
export type LeadActivity = z.infer<typeof activitySchema>;
export type LeadProfileLoader = (id: string, signal: AbortSignal) => Promise<LeadProfile>;
