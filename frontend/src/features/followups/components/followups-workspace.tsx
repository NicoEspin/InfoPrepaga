'use client';

import { useState } from 'react';
import {
  IconCalendarEvent,
  IconCircleCheck,
  IconClock,
  IconPlus,
  IconSearch
} from '@tabler/icons-react';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  dateKey,
  priorities,
  shiftDay,
  taskSellers,
  weekStart,
  type TaskPreview
} from '../data/tasks';
import { TasksList } from './tasks-list';
import { TasksCalendar } from './tasks-calendar';
import { TaskEditor } from './task-editor';
import './followups.css';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const allStatuses = 'Todas las tareas';
const allSellers = 'Todos los vendedores';
const allPriorities = 'Todas las prioridades';

export function FollowupsWorkspace({
  initialTasks,
  reference
}: {
  initialTasks: TaskPreview[];
  reference: { today: string; now: string };
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(allStatuses);
  const [seller, setSeller] = useState(allSellers);
  const [priority, setPriority] = useState(allPriorities);
  const [editor, setEditor] = useState<{ task: TaskPreview | null } | null>(null);
  const [message, setMessage] = useState('');
  const visible = tasks
    .filter(
      (task) =>
        (status === allStatuses ||
          (status === 'Pendientes' ? !task.completedAt : Boolean(task.completedAt))) &&
        (seller === allSellers || task.seller === seller) &&
        (priority === allPriorities || task.priority === priority) &&
        normalize(`${task.contact} ${task.title}`).includes(normalize(search.trim()))
    )
    .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  const monday = weekStart(reference.today);
  const nextMonday = shiftDay(monday, 7);
  const stats = [
    {
      label: 'Pendientes',
      value: visible.filter((task) => !task.completedAt).length,
      icon: IconClock,
      tone: 'pending'
    },
    {
      label: 'Para hoy',
      value: visible.filter((task) => !task.completedAt && dateKey(task.dueAt) === reference.today)
        .length,
      icon: IconCalendarEvent,
      tone: 'today'
    },
    {
      label: 'Completadas esta semana',
      value: visible.filter(
        (task) =>
          task.completedAt &&
          dateKey(task.completedAt) >= monday &&
          dateKey(task.completedAt) < nextMonday
      ).length,
      icon: IconCircleCheck,
      tone: 'completed'
    }
  ];
  const hasFilters =
    search !== '' || status !== allStatuses || seller !== allSellers || priority !== allPriorities;
  function toggle(id: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    setTasks((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, completedAt: item.completedAt ? null : reference.now } : item
      )
    );
    setMessage(
      `${task.contact}: tarea ${task.completedAt ? 'reabierta' : 'completada'} en la demo.`
    );
  }
  function save(values: Omit<TaskPreview, 'id' | 'completedAt'>) {
    const editing = editor?.task;
    if (editing)
      setTasks((previous) =>
        previous.map((task) => (task.id === editing.id ? { ...task, ...values } : task))
      );
    else
      setTasks((previous) => [
        ...previous,
        { ...values, id: `task-local-${crypto.randomUUID()}`, completedAt: null }
      ]);
    setEditor(null);
    setMessage(
      `Tarea ${editing ? 'actualizada' : 'creada'} en la demo. Los filtros actuales pueden ocultarla.`
    );
  }
  return (
    <CrmContent
      search={
        <InputGroup className='followups-search'>
          <InputGroupAddon>
            <IconSearch aria-hidden='true' />
          </InputGroupAddon>
          <InputGroupInput
            aria-label='Buscar tareas'
            placeholder='Buscar prospectos, empresas o tareas...'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
      }
    >
      <div className='followups-content'>
        <div className='followups-heading'>
          <div className='leads-heading'>
            <h1>Seguimientos y tareas</h1>
            <p>Organizá tus próximos contactos y actividades comerciales.</p>
          </div>
          <div className='followup-stats'>
            {stats.map(({ label, value, icon: Icon, tone }) => (
              <Card key={tone} size='sm' className='followup-stat' data-tone={tone}>
                <span className='followup-stat-icon'>
                  <Icon aria-hidden='true' />
                </span>
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <strong>{value}</strong>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <p className='leads-demo-note'>
          <span />
          Vista previa · Datos sintéticos. Los cambios no se guardan ni generan recordatorios.
        </p>
        <div className='followups-workspace'>
          <section className='followups-list-panel' aria-label='Listado de tareas'>
            <FieldGroup className='followup-toolbar'>
              <Field>
                <FieldLabel className='sr-only' htmlFor='filter-task-status'>
                  Estado de tareas
                </FieldLabel>
                <NativeSelect
                  id='filter-task-status'
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {[allStatuses, 'Pendientes', 'Completadas'].map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel className='sr-only' htmlFor='filter-task-seller'>
                  Vendedor de tareas
                </FieldLabel>
                <NativeSelect
                  id='filter-task-seller'
                  value={seller}
                  onChange={(event) => setSeller(event.target.value)}
                >
                  {[allSellers, ...taskSellers].map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel className='sr-only' htmlFor='filter-task-priority'>
                  Prioridad de tareas
                </FieldLabel>
                <NativeSelect
                  id='filter-task-priority'
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {[allPriorities, ...priorities].map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Button onClick={() => setEditor({ task: null })}>
                <IconPlus data-icon='inline-start' />
                Nueva tarea
              </Button>
            </FieldGroup>
            <div className='followup-filter-summary' role='status' aria-live='polite'>
              <span>{visible.length} tareas · Contadores y calendario según filtros</span>
              {hasFilters ? (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    setSearch('');
                    setStatus(allStatuses);
                    setSeller(allSellers);
                    setPriority(allPriorities);
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
            <TasksList
              tasks={visible}
              today={reference.today}
              onToggle={toggle}
              onEdit={(task) => setEditor({ task })}
            />
          </section>
          <TasksCalendar
            tasks={visible}
            today={reference.today}
            onEdit={(task) => setEditor({ task })}
          />
        </div>
        <p className='followup-feedback' role='status' aria-live='polite'>
          {message}
        </p>
        <p className='leads-pending'>
          Horario de Buenos Aires · Crear, editar y completar son acciones locales de prueba. La
          persistencia y los recordatorios requieren la API.
        </p>
        {editor ? (
          <TaskEditor
            task={editor.task}
            today={reference.today}
            onClose={() => setEditor(null)}
            onSave={save}
          />
        ) : null}
      </div>
    </CrmContent>
  );
}
