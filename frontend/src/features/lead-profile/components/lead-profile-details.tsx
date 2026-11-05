'use client';

import { useState } from 'react';
import {
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconFileText,
  IconMail,
  IconPencil,
  IconPhone,
  IconStar,
  IconUser
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { LeadActivity, LeadProfile } from '../api/types';
import { LeadProfileAttachments } from './lead-profile-attachments';

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const timeFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const longDateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const icons = {
  registered: IconFileText,
  assigned: IconUser,
  call: IconPhone,
  interest: IconStar,
  scheduled: IconCalendar,
  note: IconFileText
};

export function LeadProfileDetails({ profile }: { profile: LeadProfile }) {
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<LeadActivity[]>([]);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const activity = profile.nextActivity;
  const information = [
    ['Nombre', profile.name],
    ['Origen del lead', profile.source],
    ['Vendedor asignado', profile.seller ?? 'Sin asignar'],
    ['Fecha de ingreso', dateFormat.format(new Date(profile.createdAt))]
  ];
  return (
    <div className='lead-profile-details'>
      <div className='lead-profile-summary'>
        <div className='lead-profile-contact'>
          <Badge variant='secondary' className='lead-profile-status'>
            <span />
            {profile.status}
          </Badge>
          <span>
            <IconMail aria-hidden='true' />
            {profile.email ?? 'Sin correo'}
          </span>
          <span>
            <IconPhone aria-hidden='true' />
            {profile.phone ?? 'Sin teléfono'}
          </span>
          <span>
            <IconBuilding aria-hidden='true' />
            {profile.company ?? 'Sin empresa'}
          </span>
        </div>
        <div className='lead-profile-actions' title='Disponible al conectar la API comercial'>
          <Button variant='outline' disabled>
            <IconPencil />
            Editar
          </Button>
          <Button variant='outline' disabled>
            <IconCalendar />
            Crear tarea
          </Button>
          <Button variant='outline' disabled>
            Cambiar estado
          </Button>
        </div>
      </div>
      <div className='lead-profile-columns'>
        <Card className='lead-profile-info'>
          <CardHeader>
            <CardTitle>Información del prospecto</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              {information.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <div>
                <dt>Estado actual</dt>
                <dd>
                  <Badge variant='secondary' className='lead-profile-status'>
                    <span />
                    {profile.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Observaciones</dt>
                <dd>{profile.observations || 'Sin observaciones.'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className='lead-profile-history'>
          <CardHeader>
            <CardTitle>Historial de actividades</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.activities.length || notes.length ? (
              <ol>
                {[...profile.activities, ...notes].map((event) => {
                  const Icon = icons[event.kind];
                  return (
                    <li key={event.id} data-kind={event.kind}>
                      <span className='lead-profile-timeline-icon'>
                        <Icon aria-hidden='true' />
                      </span>
                      <div>
                        <time dateTime={event.at}>
                          {dateFormat.format(new Date(event.at))} ·{' '}
                          {timeFormat.format(new Date(event.at))}
                        </time>
                        <h3>{event.title}</h3>
                        <p>{event.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Sin actividades</EmptyTitle>
                  <EmptyDescription>El historial de este lead está vacío.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
        <div className='lead-profile-sidebar'>
          <Card>
            <CardHeader>
              <CardTitle>
                <IconCalendar aria-hidden='true' />
                Próxima actividad
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity ? (
                <>
                  <div className='lead-profile-next'>
                    <div>
                      <IconCalendar aria-hidden='true' />
                      <span>
                        <strong>{longDateFormat.format(new Date(activity.startsAt))}</strong>
                        <small>
                          {timeFormat.format(new Date(activity.startsAt))} –{' '}
                          {timeFormat.format(new Date(activity.endsAt))}
                        </small>
                      </span>
                    </div>
                    <h3>{activity.title}</h3>
                    <p>{activity.description}</p>
                  </div>
                  <Button
                    className='w-full'
                    disabled={!profile.isDemo || completed}
                    onClick={() => {
                      setCompleted(true);
                      setFeedback('Actividad completada solo en este perfil de prueba.');
                    }}
                  >
                    {completed ? (
                      <>
                        <IconCheck />
                        Completada en esta vista
                      </>
                    ) : (
                      'Marcar como completada · demo'
                    )}
                  </Button>
                </>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Sin próxima actividad</EmptyTitle>
                    <EmptyDescription>
                      No hay una actividad programada para este lead.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <IconFileText aria-hidden='true' />
                Nueva nota
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draft.trim();
                  if (!profile.isDemo || !text || text.length > 500) return;
                  setNotes((previous) => [
                    ...previous,
                    {
                      id: `note-${crypto.randomUUID()}`,
                      kind: 'note',
                      at: new Date().toISOString(),
                      title: 'Nota de prueba',
                      description: text
                    }
                  ]);
                  setDraft('');
                  setFeedback('Nota agregada solo en esta vista. Se descarta al cerrar.');
                }}
              >
                <Field>
                  <FieldLabel className='sr-only' htmlFor='lead-profile-note'>
                    Observación sobre el prospecto
                  </FieldLabel>
                  <Textarea
                    id='lead-profile-note'
                    placeholder='Escribí aquí una observación sobre el prospecto...'
                    value={draft}
                    maxLength={500}
                    disabled={!profile.isDemo}
                    onChange={(event) => setDraft(event.target.value)}
                    aria-describedby='lead-note-counter'
                  />
                  <span id='lead-note-counter' className='lead-profile-note-counter'>
                    {draft.length}/500
                  </span>
                </Field>
                <Button
                  className='w-full'
                  type='submit'
                  disabled={!profile.isDemo || !draft.trim()}
                >
                  Guardar nota · demo
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      <LeadProfileAttachments key={profile.id} />
      <p className='lead-profile-feedback' role='status' aria-live='polite'>
        {feedback}
      </p>
    </div>
  );
}
