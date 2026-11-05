'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CrmError } from '../api';
import { createActionRunner } from '../actions';
import { LoadingButton } from '@/components/ui/loading-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent
} from '@/components/ui/empty';

export function Feedback({
  error,
  message,
  onRetry,
  retrying = false,
  pending = false
}: {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  pending?: boolean;
}) {
  return (
    <>
      {pending && (
        <p role='status' className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Spinner aria-hidden='true' />
          Guardando cambios…
        </p>
      )}
      {error && (
        <Alert variant='destructive' className='flex flex-wrap items-center justify-between gap-3'>
          <AlertDescription className='min-w-0 flex-1'>
            <p>
              {error.message}{' '}
              {error instanceof CrmError && error.status === 401 && (
                <Link href='/auth/sign-in' className='underline'>
                  Acceder
                </Link>
              )}
            </p>
          </AlertDescription>
          {onRetry && (
            <LoadingButton
              type='button'
              variant='outline'
              size='sm'
              loading={retrying}
              loadingLabel='Reintentando…'
              onClick={onRetry}
            >
              Reintentar
            </LoadingButton>
          )}
        </Alert>
      )}
      {message && (
        <p role='status' className='text-muted-foreground text-sm'>
          {message}
        </p>
      )}
    </>
  );
}
export function EmptyState({
  title,
  description,
  onReset
}: {
  title: string;
  description: string;
  onReset?: () => void;
}) {
  return (
    <Empty className='border border-dashed p-6'>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onReset && (
        <EmptyContent>
          <Button type='button' variant='outline' size='sm' onClick={onReset}>
            Limpiar filtros
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
export function LoadingState({
  label = 'Cargando datos…',
  rows = 4
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role='status' aria-label={label} className='grid gap-3 py-4'>
      <span className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Spinner aria-hidden='true' className='motion-reduce:animate-none' />
        {label}
      </span>
      <div aria-hidden='true' className='grid gap-3'>
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className='h-12 w-full motion-reduce:animate-none' />
        ))}
      </div>
    </div>
  );
}
export function RefreshButton({
  fetching,
  onRefresh,
  disabled = false
}: {
  fetching: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  return (
    <LoadingButton
      variant='outline'
      type='button'
      loading={fetching}
      loadingLabel='Actualizando datos…'
      disabled={disabled}
      onClick={onRefresh}
    >
      Actualizar
    </LoadingButton>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  busy = false
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <nav
      aria-label='Paginación'
      aria-busy={busy}
      className='flex flex-wrap items-center gap-3 py-3'
    >
      <Button variant='outline' disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span>
        Página {page} · {total} registros
      </span>
      <Button
        variant='outline'
        disabled={busy || page * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
export function TextField({
  label,
  name,
  value,
  type = 'text',
  required = false,
  maxLength = 160,
  minLength
}: {
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ''}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
      />
    </Field>
  );
}
export function SelectField({
  label,
  name,
  value,
  options,
  required = false,
  onValueChange,
  disabled = false
}: {
  label: string;
  name: string;
  value?: string;
  options: { id: string; name: string }[];
  required?: boolean;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <NativeSelect
        id={name}
        name={name}
        {...(onValueChange ? { value: value ?? '' } : { defaultValue: value ?? '' })}
        required={required}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
export function useAction() {
  const runner = useRef(createActionRunner());
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<void>, success = 'Cambios guardados.', key?: string) {
    return runner.current(async () => {
      setPending(true);
      setActive(key ?? null);
      setError(null);
      setMessage('');
      try {
        await action();
        setMessage(success);
        toast.success(success);
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error('No se pudo guardar'));
      } finally {
        setPending(false);
        setActive(null);
      }
    });
  }
  return { pending, active, error, message, run };
}
