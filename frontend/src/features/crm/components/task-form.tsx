'use client';
import { useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { Input } from '@/components/ui/input';
import {
  type Identity,
  type Lead,
  type Page,
  type Seller,
  type Task,
  crmRequest,
  personName,
  useCrmQuery,
  useRefreshCrm
} from '../api';
import { dateKey, taskInstant, timeLabel } from '@/features/followups/data/tasks';
import { Feedback, SelectField, TextField, useAction } from './shared';

export function TaskForm({
  actor,
  task,
  lead,
  onClose
}: {
  actor: Identity;
  task?: Task;
  lead?: Lead;
  onClose: () => void;
}) {
  const action = useAction();
  const refresh = useRefreshCrm();
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const [today] = useState(() => dateKey(new Date().toISOString()));
  const leads = useCrmQuery<Page<Lead>>(
    actor.id,
    `leads?pageSize=20&q=${encodeURIComponent(debouncedSearch)}`,
    !task && !lead
  );
  const sellers = useCrmQuery<Seller[]>(actor.id, 'users', actor.roles.includes('ADMIN'));
  const linked = Boolean(task?.leadId || lead || selectedLead);
  const availableLeads = leads.data?.items.filter((item) => item.assignedToId) ?? [];
  const leadOptions =
    selectedLead && !availableLeads.some((item) => item.id === selectedLead.id)
      ? [selectedLead, ...availableLeads]
      : availableLeads;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
    >
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{task ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            Agenda persistente, hora de Buenos Aires. No se envían recordatorios.
          </DialogDescription>
        </DialogHeader>
        <form
          aria-busy={action.pending}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void action.run(async () => {
              const leadId = lead?.id ?? selectedLead?.id ?? '';
              const payload = {
                title: String(data.get('title')),
                priority: String(data.get('priority')),
                dueAt: taskInstant(String(data.get('date')), String(data.get('time'))),
                duration: Number(data.get('duration')),
                ...(!linked && !leadId && { contact: String(data.get('contact')) }),
                ...(task
                  ? { version: task.version }
                  : {
                      ...(leadId && { leadId }),
                      ...(!leadId && { ownerId: String(data.get('ownerId') ?? actor.id) })
                    })
              };
              await crmRequest(task ? `tasks/${task.id}` : 'tasks', {
                method: task ? 'PATCH' : 'POST',
                body: JSON.stringify(payload)
              });
              await refresh();
              onClose();
            });
          }}
        >
          <fieldset disabled={action.pending} className='min-w-0'>
            <FieldGroup>
              {!task && !lead && (
                <>
                  <Input
                    aria-label='Buscar lead para vincular'
                    placeholder='Buscar lead para vincular'
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <SelectField
                    label='Lead vinculado (opcional)'
                    name='leadId'
                    value={selectedLead?.id ?? ''}
                    onValueChange={(id) =>
                      setSelectedLead(leadOptions.find((item) => item.id === id) ?? null)
                    }
                    options={[
                      { id: '', name: 'Tarea independiente' },
                      ...(leadOptions.map((item) => ({ id: item.id, name: item.name })) ?? [])
                    ]}
                  />
                  {leads.isFetching && (
                    <p role='status' className='text-muted-foreground text-sm'>
                      Buscando leads…
                    </p>
                  )}
                  {!leads.isPending && !leads.isError && !leadOptions.length && (
                    <p className='text-muted-foreground text-sm'>
                      No encontramos leads asignados. Podés cambiar la búsqueda o crear una tarea
                      independiente.
                    </p>
                  )}
                  <Feedback
                    error={leads.error}
                    onRetry={() => void leads.refetch()}
                    retrying={leads.isFetching}
                  />
                </>
              )}
              {linked ? (
                <p>
                  Prospecto: {lead?.name ?? task?.lead?.name ?? selectedLead?.name}. El responsable
                  se toma del lead.
                </p>
              ) : (
                <TextField
                  label='Contacto para tarea independiente'
                  name='contact'
                  value={task?.contact}
                  required
                />
              )}
              <TextField label='Tarea' name='title' value={task?.title} required />
              <div className='grid grid-cols-2 gap-3'>
                <TextField
                  label='Fecha'
                  name='date'
                  type='date'
                  value={task ? dateKey(task.dueAt) : today}
                  required
                />
                <TextField
                  label='Hora (Buenos Aires)'
                  name='time'
                  type='time'
                  value={task ? timeLabel(task.dueAt) : '09:00'}
                  required
                />
              </div>
              <SelectField
                label='Prioridad'
                name='priority'
                value={task?.priority ?? 'MEDIUM'}
                options={[
                  { id: 'HIGH', name: 'Alta' },
                  { id: 'MEDIUM', name: 'Media' },
                  { id: 'LOW', name: 'Baja' }
                ]}
              />
              <SelectField
                label='Duración'
                name='duration'
                value={String(task?.duration ?? 60)}
                options={[30, 60, 90].map((minutes) => ({
                  id: String(minutes),
                  name: `${minutes} minutos`
                }))}
              />
              {!task && !linked && actor.roles.includes('ADMIN') && (
                <SelectField
                  label='Responsable si es independiente'
                  name='ownerId'
                  value={actor.id}
                  options={[
                    { id: actor.id, name: 'Mi agenda' },
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
                />
              )}
              <Feedback error={action.error} />
              <Feedback
                error={sellers.error}
                onRetry={() => void sellers.refetch()}
                retrying={sellers.isFetching}
              />
              <LoadingButton type='submit' loading={action.pending} loadingLabel='Guardando tarea…'>
                Guardar tarea
              </LoadingButton>
              <Button type='button' variant='outline' onClick={onClose}>
                Cancelar
              </Button>
            </FieldGroup>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
