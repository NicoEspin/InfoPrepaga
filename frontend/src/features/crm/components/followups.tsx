'use client';
import { useCallback, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TasksCalendar } from '@/features/followups/components/tasks-calendar';
import {
  dateKey,
  shiftDay,
  taskInstant,
  timeLabel,
  weekStart,
  type TaskPreview
} from '@/features/followups/data/tasks';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';
import {
  type Identity,
  type Seller,
  type Task,
  type TaskPage,
  crmRequest,
  personName,
  queryString,
  useCrmQuery,
  useIdentity,
  useRefreshCrm
} from '../api';
import { EmptyState, Feedback, LoadingState, Pagination, RefreshButton, useAction } from './shared';
import { TaskForm } from './task-form';
import '@/features/followups/components/followups.css';

const priorityLabels = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' } as const;
export function CommercialFollowups({ actor, today }: { actor: Identity; today: string }) {
  const identity = useIdentity(actor);
  const user = identity.data ?? actor;
  const admin = user.roles.includes('ADMIN');
  const [range, setRange] = useState({ from: weekStart(today), to: shiftDay(weekStart(today), 7) });
  const [filters, setFilters] = useState({ q: '', state: '', priority: '', ownerId: '' });
  const debouncedSearch = useDebounce(filters.q, 300);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ task?: Task } | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const action = useAction();
  const refresh = useRefreshCrm();
  const { openLead } = useLeadProfile();
  const onRangeChange = useCallback((from: string, to: string) => {
    setRange((previous) =>
      previous.from === from && previous.to === to ? previous : { from, to }
    );
    setPage(1);
  }, []);
  const sellers = useCrmQuery<Seller[]>(user.id, 'users', admin);
  const result = useCrmQuery<TaskPage>(
    user.id,
    `tasks?${queryString({ ...filters, q: debouncedSearch, from: taskInstant(range.from, '00:00'), to: taskInstant(range.to, '00:00'), page, pageSize: 100 })}`
  );
  const tasks = result.isError ? [] : (result.data?.items ?? []);
  const preview: TaskPreview[] = tasks.map((task) => ({
    id: task.id,
    leadId: task.leadId ?? undefined,
    contact: task.lead?.name ?? task.contact,
    title: task.title,
    seller: personName(task.owner),
    priority: priorityLabels[task.priority],
    dueAt: task.dueAt,
    duration: task.duration,
    completedAt: task.completedAt
  }));
  function filter(key: keyof typeof filters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  function toggle(task: Task) {
    void action.run(async () => {
      setActiveTaskId(task.id);
      try {
        await crmRequest(`tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: task.version, completed: !task.completedAt })
        });
        await refresh();
      } finally {
        setActiveTaskId(null);
      }
    });
  }
  return (
    <CrmContent>
      <div className='followups-content'>
        <div className='followups-heading'>
          <div className='leads-heading'>
            <h1>Seguimientos y tareas</h1>
            <p>Organizá tus próximos contactos y actividades comerciales.</p>
          </div>
          <Button onClick={() => setEditor({})}>Nueva tarea</Button>
        </div>
        <p>Agenda persistente · Hora de Buenos Aires · Sin avisos automáticos.</p>
        <div className='flex flex-wrap items-center gap-3 py-4'>
          <Input
            aria-label='Buscar tareas'
            placeholder='Prospecto, contacto o tarea'
            value={filters.q}
            onChange={(event) => filter('q', event.target.value)}
          />
          <NativeSelect
            aria-label='Estado de tareas'
            value={filters.state}
            onChange={(event) => filter('state', event.target.value)}
          >
            {[
              ['', 'Todas'],
              ['pending', 'Pendientes'],
              ['completed', 'Completadas']
            ].map(([id, name]) => (
              <NativeSelectOption key={id} value={id}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label='Prioridad'
            value={filters.priority}
            onChange={(event) => filter('priority', event.target.value)}
          >
            <NativeSelectOption value=''>Todas las prioridades</NativeSelectOption>
            {Object.entries(priorityLabels).map(([id, name]) => (
              <NativeSelectOption key={id} value={id}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {admin && (
            <NativeSelect
              aria-label='Vendedor'
              value={filters.ownerId}
              onChange={(event) => filter('ownerId', event.target.value)}
            >
              <NativeSelectOption value=''>Todos los responsables</NativeSelectOption>
              {sellers.data?.map((seller) => (
                <NativeSelectOption key={seller.id} value={seller.id}>
                  {personName(seller)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <RefreshButton fetching={result.isFetching} onRefresh={() => void result.refetch()} />
        </div>
        <Feedback
          error={identity.error ?? result.error ?? (admin ? sellers.error : null)}
          onRetry={() => {
            void identity.refetch();
            void result.refetch();
            if (admin) void sellers.refetch();
          }}
          retrying={result.isFetching}
        />
        <Feedback error={action.error} message={action.message} pending={action.pending} />
        {!result.isError && result.data && (
          <p role='status'>
            En el período y filtros seleccionados: {result.data.counts.pending} pendientes ·{' '}
            {result.data.counts.completed} completadas.
          </p>
        )}
        {result.isPending && <LoadingState label='Cargando agenda…' rows={3} />}
        <div className='followups-workspace'>
          <section className='followups-list-panel' aria-label='Listado de tareas'>
            <h2 className='font-semibold'>Tareas del período</h2>
            <p>
              {range.from} a {shiftDay(range.to, -1)}
            </p>
            {!result.isPending && !result.isError && !tasks.length && (
              <EmptyState
                title='No hay tareas en este período'
                description='Podés cambiar de fecha, quitar filtros o crear un seguimiento.'
                onReset={() => {
                  setFilters({ q: '', state: '', priority: '', ownerId: '' });
                  setPage(1);
                }}
              />
            )}
            <ul className='grid gap-3 py-3'>
              {tasks.map((task) => (
                <li key={task.id} className='border-border rounded-lg border p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <button
                      className='lead-name'
                      onClick={() => (task.leadId ? openLead(task.leadId) : setEditor({ task }))}
                    >
                      {task.lead?.name ?? task.contact}
                    </button>
                    <span>{priorityLabels[task.priority]}</span>
                  </div>
                  <p>{task.title}</p>
                  <p>
                    {dateKey(task.dueAt)} · {timeLabel(task.dueAt)} · {task.duration} min
                  </p>
                  <p>{personName(task.owner)}</p>
                  <div className='flex flex-wrap gap-2 pt-2'>
                    <Button size='sm' variant='outline' onClick={() => setEditor({ task })}>
                      Editar
                    </Button>
                    <Button size='sm' disabled={action.pending} onClick={() => toggle(task)}>
                      {action.pending && activeTaskId === task.id
                        ? 'Guardando…'
                        : task.completedAt
                          ? 'Reabrir'
                          : 'Completar'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {result.data && !result.isError && (
              <Pagination
                page={page}
                total={result.data.total}
                pageSize={100}
                onPage={setPage}
                busy={result.isFetching}
              />
            )}
            {result.data && result.data.total > 100 && (
              <p>
                Listado y calendario muestran la página {page}. Usá la paginación para consultar las
                demás tareas del período.
              </p>
            )}
          </section>
          <div className='relative min-w-0' aria-busy={result.isFetching}>
            {(result.isPending || result.isError) && (
              <div
                className='bg-background/95 absolute inset-0 z-10 grid place-content-center rounded-lg p-6'
                role='status'
              >
                <p>
                  {result.isError
                    ? 'No pudimos cargar el calendario. Usá Reintentar para volver a consultar.'
                    : 'Cargando calendario…'}
                </p>
              </div>
            )}
            <TasksCalendar
              tasks={preview}
              today={today}
              onRangeChange={onRangeChange}
              onEdit={(item) => {
                const task = tasks.find((value) => value.id === item.id);
                if (task) setEditor({ task });
              }}
            />
          </div>
        </div>
        {editor && <TaskForm actor={user} task={editor.task} onClose={() => setEditor(null)} />}
      </div>
    </CrmContent>
  );
}
