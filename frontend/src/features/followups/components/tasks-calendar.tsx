'use client';

import { useEffect, useState } from 'react';
import { IconCalendarEvent, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';
import {
  dateKey,
  dayLabel,
  layoutAppointments,
  shiftDay,
  timeLabel,
  weekStart,
  type TaskPreview
} from '../data/tasks';

function shiftMonth(day: string, offset: number) {
  const value = new Date(`${day}T12:00:00Z`);
  const dayOfMonth = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + offset);
  const nextMonth = new Date(value);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  value.setUTCDate(Math.min(dayOfMonth, nextMonth.getUTCDate()));
  return value.toISOString().slice(0, 10);
}

function CalendarTimeline({
  days,
  tasks,
  today,
  selected,
  onSelect,
  onEdit
}: {
  days: string[];
  tasks: TaskPreview[];
  today: string;
  selected: string;
  onSelect: (day: string) => void;
  onEdit: (task: TaskPreview) => void;
}) {
  return (
    <div className='calendar-scroll'>
      <div className='calendar-timeline' data-view={days.length === 1 ? 'day' : 'week'}>
        <div
          className='calendar-day-headings'
          style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <span />
          {days.map((day) => (
            <button
              key={day}
              data-today={day === today}
              aria-pressed={day === selected}
              onClick={() => onSelect(day)}
            >
              <span>{dayLabel(day, { weekday: 'short' })}</span>
              <strong>{Number(day.slice(-2))}</strong>
            </button>
          ))}
        </div>
        <div className='calendar-timeline-body'>
          <div className='calendar-hours'>
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} style={{ top: `${index * 50}px` }}>
                {String(index + 8).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          <div
            className='calendar-days'
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <div key={day} className='calendar-day' data-today={day === today}>
                {layoutAppointments(tasks.filter((task) => dateKey(task.dueAt) === day)).map(
                  ({ task, start, end, lane, lanes }) => (
                    <button
                      key={task.id}
                      className='calendar-event'
                      data-priority={task.priority}
                      data-completed={Boolean(task.completedAt)}
                      aria-label={`${task.contact}, ${task.title}, ${timeLabel(task.dueAt)}, ${task.duration} minutos${task.completedAt ? ', completada' : ''}`}
                      onClick={() => onEdit(task)}
                      style={{
                        top: `${((Math.max(start, 480) - 480) * 50) / 60}px`,
                        height: `${((Math.min(end, 1140) - Math.max(start, 480)) * 50) / 60}px`,
                        left: `calc(${(lane * 100) / lanes}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`
                      }}
                    >
                      <time dateTime={task.dueAt}>{timeLabel(task.dueAt)}</time>
                      <strong>{task.contact}</strong>
                      <span>{task.title}</span>
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TasksCalendar({
  tasks,
  today,
  onEdit,
  onRangeChange
}: {
  tasks: TaskPreview[];
  today: string;
  onEdit: (task: TaskPreview) => void;
  onRangeChange?: (from: string, to: string) => void;
}) {
  const { openLead } = useLeadProfile();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState('week');
  const monday = weekStart(selected);
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
  const firstOfMonth = `${selected.slice(0, 7)}-01`;
  const monthDays = Array.from({ length: 42 }, (_, index) =>
    shiftDay(weekStart(firstOfMonth), index)
  );
  const rangeFrom = view === 'month' ? monthDays[0] : view === 'week' ? monday : selected;
  const rangeTo = shiftDay(
    view === 'month' ? monthDays[41] : view === 'week' ? days[6] : selected,
    1
  );
  useEffect(() => {
    onRangeChange?.(rangeFrom, rangeTo);
  }, [onRangeChange, rangeFrom, rangeTo]);
  const selectedTasks = tasks.filter((task) => dateKey(task.dueAt) === selected);
  const outOfHours = tasks.filter((task) => {
    const localTime = timeLabel(task.dueAt);
    return (
      (view === 'day' ? dateKey(task.dueAt) === selected : days.includes(dateKey(task.dueAt))) &&
      (localTime < '08:00' || localTime >= '19:00')
    );
  });
  function navigate(direction: number) {
    setSelected(
      view === 'month'
        ? shiftMonth(selected, direction)
        : shiftDay(selected, direction * (view === 'week' ? 7 : 1))
    );
  }
  return (
    <section className='followup-calendar' aria-label='Calendario de tareas'>
      <Tabs value={view} onValueChange={(next) => setView(String(next))}>
        <div className='calendar-heading'>
          <h2>Calendario {view === 'week' ? 'semanal' : view === 'day' ? 'diario' : 'mensual'}</h2>
          <TabsList aria-label='Vista del calendario'>
            <TabsTrigger value='week'>Semana</TabsTrigger>
            <TabsTrigger value='day'>Día</TabsTrigger>
            <TabsTrigger value='month'>Mes</TabsTrigger>
          </TabsList>
        </div>
        <div className='calendar-navigation'>
          <Button
            variant='outline'
            size='icon-xs'
            aria-label='Período anterior'
            onClick={() => navigate(-1)}
          >
            <IconChevronLeft />
          </Button>
          <p aria-live='polite'>
            {view === 'week'
              ? `${dayLabel(monday, { day: 'numeric', month: 'short' })} – ${dayLabel(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}`
              : dayLabel(selected, {
                  ...(view === 'day' ? { day: 'numeric' as const } : {}),
                  month: 'long',
                  year: 'numeric'
                })}
          </p>
          <Button
            variant='outline'
            size='icon-xs'
            aria-label='Período siguiente'
            onClick={() => navigate(1)}
          >
            <IconChevronRight />
          </Button>
          <Button variant='outline' size='sm' onClick={() => setSelected(today)}>
            Hoy
          </Button>
        </div>
        <TabsContent value='week'>
          <CalendarTimeline
            days={days}
            tasks={tasks}
            today={today}
            selected={selected}
            onSelect={setSelected}
            onEdit={onEdit}
          />
        </TabsContent>
        <TabsContent value='day'>
          <CalendarTimeline
            days={[selected]}
            tasks={tasks}
            today={today}
            selected={selected}
            onSelect={setSelected}
            onEdit={onEdit}
          />
        </TabsContent>
        <TabsContent value='month'>
          <div className='calendar-month'>
            <div className='calendar-month-weekdays'>
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className='calendar-month-days'>
              {monthDays.map((day) => {
                const appointments = tasks.filter((task) => dateKey(task.dueAt) === day);
                return (
                  <div
                    key={day}
                    data-outside={day.slice(0, 7) !== selected.slice(0, 7)}
                    data-today={day === today}
                  >
                    <button
                      aria-label={`Ver tareas del ${dayLabel(day, { day: 'numeric', month: 'long' })}`}
                      aria-pressed={day === selected}
                      onClick={() => setSelected(day)}
                    >
                      {Number(day.slice(-2))}
                    </button>
                    {appointments.slice(0, 2).map((task) => (
                      <button
                        className='calendar-month-event'
                        key={task.id}
                        onClick={() => onEdit(task)}
                      >
                        {timeLabel(task.dueAt)} {task.contact}
                      </button>
                    ))}
                    {appointments.length > 2 ? (
                      <button
                        className='calendar-more-events'
                        onClick={() => {
                          setSelected(day);
                          setView('day');
                        }}
                      >
                        +{appointments.length - 2} tareas
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {view !== 'month' && outOfHours.length ? (
        <div className='calendar-outside-hours'>
          <strong>Fuera de 08:00–19:00</strong>
          {outOfHours.map((task) => (
            <button
              key={task.id}
              onClick={() => {
                setSelected(dateKey(task.dueAt));
                onEdit(task);
              }}
            >
              {dayLabel(dateKey(task.dueAt), { day: 'numeric', month: 'short' })} ·{' '}
              {timeLabel(task.dueAt)} · {task.contact}
            </button>
          ))}
        </div>
      ) : null}
      <footer className='calendar-day-summary'>
        <div>
          <IconCalendarEvent aria-hidden='true' />
          <span>
            <strong>Tareas del día</strong>
            <small>{dayLabel(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
          </span>
          <small>{selectedTasks.length} programadas</small>
        </div>
        {selectedTasks.length ? (
          <ul>
            {selectedTasks.map((task) => (
              <li key={task.id}>
                <div className='calendar-day-summary-row'>
                  <time dateTime={task.dueAt}>{timeLabel(task.dueAt)}</time>
                  <button onClick={() => (task.leadId ? openLead(task.leadId) : onEdit(task))}>
                    {task.contact}
                  </button>
                  <button onClick={() => onEdit(task)}>
                    {task.completedAt ? 'Completada' : task.title}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay tareas para este día con los filtros actuales.</p>
        )}
      </footer>
    </section>
  );
}
