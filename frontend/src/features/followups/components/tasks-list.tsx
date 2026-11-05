'use client';

import { IconCalendarEvent, IconCheck, IconClock, IconDotsVertical } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { dateKey, dayLabel, taskGroup, timeLabel, type TaskPreview } from '../data/tasks';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';

const groups = [
  { id: 'overdue', label: 'Vencidas', icon: IconClock },
  { id: 'today', label: 'Para hoy', icon: IconCalendarEvent },
  { id: 'upcoming', label: 'Próximas', icon: IconClock },
  { id: 'completed', label: 'Completadas', icon: IconCheck }
] as const;

export function TasksList({
  tasks,
  today,
  onToggle,
  onEdit
}: {
  tasks: TaskPreview[];
  today: string;
  onToggle: (id: string) => void;
  onEdit: (task: TaskPreview) => void;
}) {
  const { openLead } = useLeadProfile();
  if (!tasks.length)
    return (
      <Empty className='py-16'>
        <EmptyHeader>
          <EmptyTitle>No encontramos tareas</EmptyTitle>
          <EmptyDescription>Probá con otra búsqueda o quitá los filtros.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className='followup-groups'>
      {groups.map(({ id, label, icon: Icon }) => {
        const rows = tasks.filter((task) => taskGroup(task, today) === id);
        if (!rows.length) return null;
        return (
          <section key={id} className='task-group' data-group={id} aria-labelledby={`group-${id}`}>
            <h2 id={`group-${id}`}>
              <Icon aria-hidden='true' />
              {label} <span>({rows.length})</span>
            </h2>
            <Table>
              <caption className='sr-only'>Tareas {label.toLowerCase()}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className='task-check'>
                    <span className='sr-only'>Completada</span>
                  </TableHead>
                  <TableHead>Tarea / Prospecto</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>
                    <span className='sr-only'>Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((task) => (
                  <TableRow key={task.id} data-completed={Boolean(task.completedAt)}>
                    <TableCell className='task-check'>
                      <Checkbox
                        aria-label={`${task.completedAt ? 'Reabrir' : 'Completar'} tarea: ${task.contact} — ${task.title}`}
                        checked={Boolean(task.completedAt)}
                        onCheckedChange={() => onToggle(task.id)}
                      />
                    </TableCell>
                    <TableCell className='task-description'>
                      <button onClick={() => (task.leadId ? openLead(task.leadId) : onEdit(task))}>
                        {task.contact}
                      </button>
                      <button className='task-title-link' onClick={() => onEdit(task)}>
                        {task.title}
                      </button>
                    </TableCell>
                    <TableCell className='task-due'>
                      <time dateTime={task.dueAt}>
                        {dateKey(task.dueAt) === today
                          ? ''
                          : `${dayLabel(dateKey(task.dueAt), { weekday: 'short', day: '2-digit', month: '2-digit' })} `}
                        {timeLabel(task.dueAt)}
                      </time>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant='secondary'
                        className='followup-priority'
                        data-priority={task.priority}
                      >
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className='task-seller'>
                        <Avatar size='sm'>
                          <AvatarFallback>{task.seller.slice(-1)}</AvatarFallback>
                        </Avatar>
                        <span>{task.seller}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant='ghost'
                              size='icon-xs'
                              aria-label={`Acciones de tarea: ${task.contact}`}
                            />
                          }
                        >
                          <IconDotsVertical />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => onEdit(task)}>
                              Editar en la demo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggle(task.id)}>
                              {task.completedAt ? 'Reabrir tarea' : 'Marcar como completada'}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
