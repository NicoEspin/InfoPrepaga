'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';
import {
  dateKey,
  priorities,
  taskInstant,
  taskSellers,
  timeLabel,
  type TaskPreview
} from '../data/tasks';

export function TaskEditor({
  task,
  today,
  onClose,
  onSave
}: {
  task: TaskPreview | null;
  today: string;
  onClose: () => void;
  onSave: (task: Omit<TaskPreview, 'id' | 'completedAt'>) => void;
}) {
  const [error, setError] = useState('');
  const { openLead } = useLeadProfile();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='task-editor'>
        <DialogHeader>
          <DialogTitle>{task ? 'Editar tarea de prueba' : 'Nueva tarea de prueba'}</DialogTitle>
          <DialogDescription>
            Datos sintéticos. Los cambios se conservan hasta recargar esta página. No se envían
            recordatorios.
          </DialogDescription>
        </DialogHeader>
        {task?.leadId ? (
          <Button
            type='button'
            variant='link'
            onClick={() => {
              onClose();
              openLead(task.leadId!);
            }}
          >
            Ver perfil del lead
          </Button>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const contact = String(data.get('contact') ?? '').trim();
            const title = String(data.get('title') ?? '').trim();
            const priority = String(data.get('priority'));
            const seller = String(data.get('seller'));
            const duration = Number(data.get('duration'));
            const day = String(data.get('date'));
            const time = String(data.get('time'));
            if (
              !contact ||
              !title ||
              !priorities.includes(priority as TaskPreview['priority']) ||
              !taskSellers.includes(seller) ||
              ![30, 60, 90].includes(duration) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
              !/^\d{2}:\d{2}$/.test(time)
            ) {
              setError('Revisá los campos de la tarea.');
              return;
            }
            let dueAt: string;
            try {
              dueAt = taskInstant(day, time);
            } catch {
              setError('Ingresá una fecha y hora válidas.');
              return;
            }
            if (!Number.isFinite(new Date(dueAt).getTime()) || dateKey(dueAt) !== day) {
              setError('Ingresá una fecha válida.');
              return;
            }
            onSave({
              contact,
              title,
              priority: priority as TaskPreview['priority'],
              seller,
              duration,
              dueAt
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='task-contact'>Prospecto o empresa</FieldLabel>
              <Input
                id='task-contact'
                readOnly={Boolean(task?.leadId)}
                name='contact'
                required
                maxLength={100}
                defaultValue={task?.contact ?? ''}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='task-title'>Tarea</FieldLabel>
              <Input
                id='task-title'
                name='title'
                required
                maxLength={160}
                defaultValue={task?.title ?? ''}
              />
            </Field>
            <FieldGroup className='task-form-row'>
              <Field>
                <FieldLabel htmlFor='task-date'>Fecha</FieldLabel>
                <Input
                  id='task-date'
                  type='date'
                  name='date'
                  required
                  min='2000-01-01'
                  max='2100-12-31'
                  defaultValue={task ? dateKey(task.dueAt) : today}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='task-time'>Hora (Buenos Aires)</FieldLabel>
                <Input
                  id='task-time'
                  type='time'
                  name='time'
                  required
                  defaultValue={task ? timeLabel(task.dueAt) : '09:00'}
                />
              </Field>
            </FieldGroup>
            <FieldGroup className='task-form-row'>
              <Field>
                <FieldLabel htmlFor='task-seller'>Vendedor</FieldLabel>
                <NativeSelect
                  id='task-seller'
                  name='seller'
                  defaultValue={task?.seller ?? taskSellers[0]}
                >
                  {taskSellers.map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor='task-priority'>Prioridad</FieldLabel>
                <NativeSelect
                  id='task-priority'
                  name='priority'
                  defaultValue={task?.priority ?? 'Media'}
                >
                  {priorities.map((value) => (
                    <NativeSelectOption key={value}>{value}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor='task-duration'>Duración</FieldLabel>
              <NativeSelect id='task-duration' name='duration' defaultValue={task?.duration ?? 60}>
                {[30, 60, 90].map((duration) => (
                  <NativeSelectOption key={duration} value={duration}>
                    {duration} minutos
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </FieldGroup>
          {error ? (
            <p role='alert' className='text-destructive mt-3 text-sm'>
              {error}
            </p>
          ) : null}
          <div className='task-form-actions'>
            <Button type='button' variant='outline' onClick={onClose}>
              Cancelar
            </Button>
            <Button type='submit'>Guardar en la demo</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
