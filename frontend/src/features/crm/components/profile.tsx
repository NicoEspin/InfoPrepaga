'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  type Activity,
  type Catalogs,
  type Page,
  type Seller,
  crmRequest,
  commercialProfileOptions,
  personName,
  useCrmQuery,
  useIdentity,
  useRefreshCrm
} from '../api';
import {
  EmptyState,
  Feedback,
  LoadingState,
  Pagination,
  RefreshButton,
  SelectField,
  useAction
} from './shared';
import { LeadForm } from './lead-form';
import { TaskForm } from './task-form';
import { Attachments } from './attachments';

const format = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires'
});
const titles: Record<string, string> = {
  registered: 'Lead creado',
  assigned: 'Asignación',
  edited: 'Datos actualizados',
  status: 'Cambio de estado',
  note: 'Nota',
  scheduled: 'Tarea programada',
  'task-edited': 'Tarea actualizada',
  'task-completed': 'Tarea completada',
  'task-reopened': 'Tarea reabierta',
  'attachment-uploaded': 'Archivo cargado',
  'attachment-renamed': 'Archivo renombrado',
  'attachment-downloaded': 'Archivo descargado',
  'attachment-deleted': 'Archivo eliminado'
};
export function CommercialProfileModal({
  leadId,
  opening,
  onClose
}: {
  leadId: string;
  opening: string;
  onClose: () => void;
}) {
  const identity = useIdentity();
  const actor = identity.data;
  const admin = actor?.roles.includes('ADMIN') ?? false;
  const [page, setPage] = useState(1);
  const [note, setNote] = useState('');
  const [editor, setEditor] = useState<'lead' | 'task' | null>(null);
  const action = useAction();
  const refresh = useRefreshCrm();
  const profile = useQuery(commercialProfileOptions(actor?.id, leadId, opening));
  const history = useCrmQuery<Page<Activity>>(
    actor?.id,
    `leads/${leadId}/history?page=${page}&pageSize=10`,
    profile.isSuccess
  );
  const catalogs = useCrmQuery<Catalogs>(actor?.id, 'catalogs');
  const sellers = useCrmQuery<Seller[]>(actor?.id, 'users', admin);
  const lead = profile.data;
  const update = (suffix: string, data: object) =>
    action.run(
      async () => {
        await crmRequest(`leads/${leadId}${suffix}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...data, version: lead?.version })
        });
        await refresh();
      },
      'Cambios guardados.',
      suffix
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
    >
      <DialogContent
        className='max-h-[90dvh] overflow-y-auto sm:max-w-5xl'
        showCloseButton={!action.pending}
        aria-busy={profile.isFetching || action.pending}
      >
        <DialogHeader>
          <DialogTitle>
            {profile.isError ? 'Perfil no disponible' : (lead?.name ?? 'Perfil del lead')}
          </DialogTitle>
          <DialogDescription>Datos comerciales e historial de seguimiento.</DialogDescription>
        </DialogHeader>
        <Feedback
          error={identity.error ?? profile.error}
          onRetry={() => {
            if (identity.error) void identity.refetch();
            else void profile.refetch();
          }}
          retrying={identity.isFetching || profile.isFetching}
        />
        {profile.isPending && !identity.error && <LoadingState label='Cargando perfil…' rows={4} />}
        {!profile.isError && lead && actor && (
          <>
            <div className='lead-profile-summary'>
              <div>
                <strong>
                  {catalogs.data?.statuses.find((status) => status.id === lead.status)?.name ??
                    lead.status}
                </strong>
                <p>
                  {lead.email || 'Sin correo'} · {lead.phone || 'Sin teléfono'}
                </p>
                <p>
                  {lead.company || 'Sin empresa'} · {lead.source.name}
                </p>
                <p>Responsable: {personName(lead.assignedTo)}</p>
                <p>Ingreso: {format.format(new Date(lead.createdAt))}</p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  disabled={action.pending || !catalogs.data}
                  onClick={() => setEditor('lead')}
                >
                  Editar
                </Button>
                <Button
                  disabled={action.pending || !lead.assignedToId}
                  onClick={() => setEditor('task')}
                >
                  Crear tarea
                </Button>
                <RefreshButton
                  fetching={profile.isFetching}
                  disabled={action.pending}
                  onRefresh={() => void profile.refetch()}
                />
              </div>
            </div>
            {lead.importData && (
              <Card>
                <CardHeader>
                  <CardTitle>Datos de importación</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className='grid gap-2 sm:grid-cols-2'>
                    {[
                      ['sheet', 'Hoja'],
                      ['rowNumber', 'Fila'],
                      ['originalDate', 'Fecha original'],
                      ['schedule', 'Horario de contacto'],
                      ['segment', 'Segmento / régimen'],
                      ['originalAdvisor', 'Asesor original']
                    ].map(([key, label]) => (
                      <div key={key}>
                        <dt className='text-muted-foreground text-sm'>{label}</dt>
                        <dd>{lead.importData?.[key] || 'Sin dato'}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}
            <Attachments leadId={leadId} actorId={actor.id} />
            <div className='grid gap-4 md:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>Estado y responsable</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-4'>
                  <form
                    key={`status-${lead.version}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void update('/status', {
                        status: String(new FormData(event.currentTarget).get('status'))
                      });
                    }}
                  >
                    <SelectField
                      label='Estado'
                      name='status'
                      value={lead.status}
                      options={catalogs.data?.statuses ?? []}
                      disabled={action.pending}
                    />
                    <LoadingButton
                      className='mt-2'
                      type='submit'
                      loading={action.pending && action.active === '/status'}
                      loadingLabel='Cambiando estado…'
                      disabled={action.pending || !catalogs.data}
                    >
                      Cambiar estado
                    </LoadingButton>
                  </form>
                  {admin && (
                    <form
                      key={`assignment-${lead.version}`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void update('/assignment', {
                          assignedToId: String(
                            new FormData(event.currentTarget).get('assignedToId')
                          )
                        });
                      }}
                    >
                      <SelectField
                        label='Responsable'
                        name='assignedToId'
                        disabled={action.pending}
                        value={lead.assignedToId ?? ''}
                        options={[
                          { id: '', name: 'Seleccioná un responsable' },
                          ...(sellers.data
                            ?.filter(
                              (seller) =>
                                seller.isActive &&
                                seller.roles.some((role) =>
                                  ['ADMIN', 'VENDEDOR'].includes(role.role.name)
                                )
                            )
                            .map((seller) => ({ id: seller.id, name: personName(seller) })) ?? [])
                        ]}
                        required
                      />
                      <LoadingButton
                        className='mt-2'
                        type='submit'
                        loading={action.pending && action.active === '/assignment'}
                        loadingLabel='Reasignando lead…'
                        disabled={action.pending || !sellers.data}
                      >
                        Reasignar y transferir pendientes
                      </LoadingButton>
                    </form>
                  )}
                  <p>{lead.observations || 'Sin observaciones.'}</p>
                  <Feedback
                    error={catalogs.error ?? sellers.error}
                    onRetry={() => {
                      void catalogs.refetch();
                      if (admin) void sellers.refetch();
                    }}
                    retrying={catalogs.isFetching || sellers.isFetching}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Próxima actividad</CardTitle>
                </CardHeader>
                <CardContent>
                  {lead.nextActivity ? (
                    <>
                      <p>{lead.nextActivity.title}</p>
                      <p>
                        {format.format(new Date(lead.nextActivity.dueAt))} ·{' '}
                        {lead.nextActivity.duration} minutos
                      </p>
                      <LoadingButton
                        loading={action.pending && action.active === 'activity'}
                        loadingLabel='Completando actividad…'
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(
                            async () => {
                              await crmRequest(`tasks/${lead.nextActivity!.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                  version: lead.nextActivity!.version,
                                  completed: true
                                })
                              });
                              await refresh();
                            },
                            'Actividad completada.',
                            'activity'
                          )
                        }
                      >
                        Marcar completada
                      </LoadingButton>
                    </>
                  ) : (
                    <p>Sin actividad pendiente.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Nueva nota</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const text = String(new FormData(form).get('text'));
                      void action.run(
                        async () => {
                          await crmRequest(`leads/${leadId}/notes`, {
                            method: 'POST',
                            body: JSON.stringify({ text })
                          });
                          form.reset();
                          setNote('');
                          setPage(1);
                          await refresh();
                        },
                        'Nota guardada.',
                        'note'
                      );
                    }}
                  >
                    <Field>
                      <FieldLabel htmlFor='commercial-note'>Observación</FieldLabel>
                      <Textarea
                        name='text'
                        id='commercial-note'
                        required
                        maxLength={500}
                        disabled={action.pending}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        aria-describedby='commercial-note-count'
                      />
                      <span id='commercial-note-count' className='text-muted-foreground text-sm'>
                        {note.length}/500 caracteres
                      </span>
                    </Field>
                    <LoadingButton
                      className='mt-2'
                      type='submit'
                      loading={action.pending && action.active === 'note'}
                      loadingLabel='Guardando nota…'
                      disabled={action.pending || !note.trim()}
                    >
                      Guardar nota
                    </LoadingButton>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Historial</CardTitle>
                </CardHeader>
                <CardContent>
                  <Feedback
                    error={history.error}
                    onRetry={() => void history.refetch()}
                    retrying={history.isFetching}
                  />
                  {history.isPending ? (
                    <LoadingState label='Cargando historial…' rows={2} />
                  ) : (
                    !history.isError && (
                      <>
                        {!history.data?.items.length && (
                          <EmptyState
                            title='Sin actividades todavía'
                            description='Los cambios y seguimientos de este lead aparecerán aquí.'
                          />
                        )}
                        <ol className='grid gap-3'>
                          {history.data?.items.map((item) => (
                            <li key={item.id}>
                              <strong>{titles[item.kind] ?? item.kind}</strong>
                              <p>
                                {format.format(new Date(item.createdAt))} ·{' '}
                                {personName(item.actor) === 'Sin asignar'
                                  ? 'Sistema'
                                  : personName(item.actor)}
                              </p>
                              {item.kind === 'note' && (
                                <p className='whitespace-pre-wrap'>
                                  {String(item.detail.text ?? '')}
                                </p>
                              )}
                              {item.kind === 'status' && (
                                <p>
                                  {
                                    catalogs.data?.statuses.find(
                                      (status) => status.id === item.detail.from
                                    )?.name
                                  }{' '}
                                  →{' '}
                                  {
                                    catalogs.data?.statuses.find(
                                      (status) => status.id === item.detail.to
                                    )?.name
                                  }
                                </p>
                              )}
                              {item.kind === 'assigned' && (
                                <p>
                                  {item.detail.automatic
                                    ? 'Reparto automático'
                                    : 'Reasignación administrativa'}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                        {history.data && (
                          <Pagination
                            page={page}
                            total={history.data.total}
                            pageSize={10}
                            onPage={setPage}
                            busy={history.isFetching}
                          />
                        )}
                      </>
                    )
                  )}
                </CardContent>
              </Card>
            </div>
            <Feedback error={action.error} message={action.message} pending={action.pending} />
            {editor === 'lead' && catalogs.data && (
              <LeadForm
                lead={lead}
                catalogs={catalogs.data}
                admin={admin}
                onClose={() => setEditor(null)}
              />
            )}
            {editor === 'task' && (
              <TaskForm actor={actor} lead={lead} onClose={() => setEditor(null)} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
