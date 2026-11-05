'use client';
/* eslint-disable no-underscore-dangle -- Prisma relation counts are part of the API contract. */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppForm } from '@/lib/form';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  SelectField,
  Feedback,
  LoadingState,
  EmptyState,
  Pagination,
  useAction
} from '@/features/crm/components/shared';
import { accountsOptions } from '../api/queries';
import { accountAction, saveAccount } from '../api/service';
import type { Account } from '../api/types';

const roles = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'VENDEDOR', label: 'Vendedor' }
];
type Mode = 'create' | 'edit' | 'delete' | 'deactivate' | 'restore';
export function Accounts({ actorId }: { actorId: string }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ mode: Mode; user?: Account } | null>(null);
  const data = useQuery(
    accountsOptions(
      actorId,
      new URLSearchParams({
        q,
        ...(role && { role }),
        ...(state && { state }),
        page: String(page)
      }).toString()
    )
  );
  const client = useQueryClient();
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <label htmlFor='account-search' className='flex flex-col gap-1'>
          Buscar usuarios
          <Input
            id='account-search'
            value={q}
            maxLength={100}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <SelectField
          label='Rol'
          name='account-role-filter'
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          options={[
            { id: '', name: 'Todos' },
            ...roles.map((r) => ({ id: r.value, name: r.label }))
          ]}
        />
        <SelectField
          label='Estado'
          name='account-state-filter'
          value={state}
          onValueChange={(v) => {
            setState(v);
            setPage(1);
          }}
          options={[
            { id: '', name: 'No eliminadas' },
            { id: 'active', name: 'Activas' },
            { id: 'inactive', name: 'Inactivas' },
            { id: 'deleted', name: 'Eliminadas' },
            { id: 'all', name: 'Todas' }
          ]}
        />
        <Button onClick={() => setEditor({ mode: 'create' })}>Crear usuario</Button>
        <Button variant='outline' disabled={data.isFetching} onClick={() => void data.refetch()}>
          Actualizar
        </Button>
      </div>
      <Feedback error={data.error} onRetry={() => void data.refetch()} />
      {data.isPending && <LoadingState label='Cargando usuarios…' />}
      {data.data && (
        <>
          {!data.data.items.length && (
            <EmptyState
              title='Sin usuarios para estos filtros'
              description='Revisá la búsqueda o el estado seleccionado.'
            />
          )}
          <div className='overflow-auto'>
            <table className='w-full text-left text-sm'>
              <caption className='sr-only'>Cuentas del CRM</caption>
              <thead>
                <tr>
                  {['Nombre', 'Correo', 'Rol', 'Estado', 'Acciones'].map((h) => (
                    <th className='p-3' key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((user) => (
                  <tr className='border-border border-t' key={user.id}>
                    <td className='p-3'>
                      {user.firstName} {user.lastName}
                    </td>
                    <td className='p-3'>{user.email}</td>
                    <td className='p-3'>{user.roles[0]?.role.name}</td>
                    <td className='p-3'>
                      <Badge variant='secondary'>
                        {user.deletedAt ? 'Eliminada' : user.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </td>
                    <td className='flex flex-wrap gap-2 p-3'>
                      {!user.deletedAt && (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setEditor({ mode: 'edit', user })}
                        >
                          Editar
                        </Button>
                      )}
                      {user.id !== actorId && (
                        <>
                          {!user.deletedAt && user.isActive && (
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => setEditor({ mode: 'deactivate', user })}
                            >
                              Desactivar
                            </Button>
                          )}
                          {!user.deletedAt && (
                            <Button
                              size='sm'
                              variant='destructive'
                              onClick={() => setEditor({ mode: 'delete', user })}
                            >
                              Eliminar cuenta
                            </Button>
                          )}
                          {(!user.isActive || user.deletedAt) && (
                            <Button size='sm' onClick={() => setEditor({ mode: 'restore', user })}>
                              Restaurar
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={data.data.total}
            pageSize={20}
            onPage={setPage}
            busy={data.isFetching}
          />
        </>
      )}
      {editor && (
        <AccountEditor
          key={editor.mode + (editor.user?.id ?? '')}
          {...editor}
          actorId={actorId}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await client.invalidateQueries({ queryKey: ['accounts'] });
            await client.invalidateQueries({ queryKey: ['crm'] });
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
function AccountEditor({
  mode,
  user,
  actorId,
  onClose,
  onSaved
}: {
  mode: Mode;
  user?: Account;
  actorId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const action = useAction();
  const [replacementId, setReplacementId] = useState('');
  const [replacementLabel, setReplacementLabel] = useState('');
  const [search, setSearch] = useState('');
  const choices = useQuery(
    accountsOptions(
      actorId,
      new URLSearchParams({ role: 'VENDEDOR', state: 'active', q: search }).toString()
    )
  );
  const editing = mode === 'edit' || mode === 'create';
  const form = useAppForm({
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      password: '',
      role: user?.roles[0]?.role.name ?? 'VENDEDOR'
    },
    onSubmit: async ({ value }) => {
      await action.run(
        async () => {
          if (editing)
            await saveAccount(user?.id, {
              ...value,
              password: value.password || undefined,
              version: user?.version,
              replacementId: replacementId || undefined
            });
          else
            await accountAction(user!.id, mode, {
              version: user!.version,
              replacementId: replacementId || undefined,
              password: value.password || undefined
            });
          await onSaved();
        },
        'Cuenta actualizada.',
        'account-save'
      );
    }
  });
  const title =
    mode === 'create'
      ? 'Crear usuario'
      : mode === 'edit'
        ? 'Editar usuario'
        : mode === 'delete'
          ? 'Eliminar cuenta'
          : mode === 'deactivate'
            ? 'Desactivar cuenta'
            : 'Restaurar cuenta';
  const needsReplacement = Boolean(user && (user._count.assignedLeads || user._count.tasks));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
    >
      <DialogContent
        className='max-h-[90vh] overflow-auto sm:max-w-lg'
        showCloseButton={!action.pending}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'delete'
              ? 'La baja impide ingresar y cierra las sesiones. Conserva el historial y se puede restaurar.'
              : mode === 'restore'
                ? 'Se habilita el acceso con recepción pausada, sin recuperar la cartera transferida.'
                : 'Gestioná el acceso al CRM y el rol de esta cuenta.'}
          </DialogDescription>
        </DialogHeader>
        <Feedback error={action.error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <fieldset disabled={action.pending}>
            <FieldGroup>
              {editing && (
                <>
                  <form.AppField
                    name='firstName'
                    children={(f) => <f.TextField label='Nombre' required maxLength={50} />}
                  />
                  <form.AppField
                    name='lastName'
                    children={(f) => <f.TextField label='Apellido' maxLength={50} />}
                  />
                  <form.AppField
                    name='email'
                    children={(f) => (
                      <f.TextField label='Correo' type='email' required maxLength={254} />
                    )}
                  />
                  <form.AppField
                    name='role'
                    children={(f) => (
                      <f.SelectField
                        label='Rol'
                        options={roles.map((r) => ({
                          ...r,
                          disabled: user?.id === actorId && r.value !== user.roles[0]?.role.name
                        }))}
                      />
                    )}
                  />
                </>
              )}
              {(editing || mode === 'restore') && (
                <form.AppField
                  name='password'
                  children={(f) => (
                    <f.TextField
                      label={
                        mode === 'create'
                          ? 'Contraseña (mínimo 12 caracteres)'
                          : 'Nueva contraseña (opcional)'
                      }
                      type='password'
                      autoComplete='new-password'
                      required={mode === 'create'}
                      minLength={12}
                      maxLength={72}
                    />
                  )}
                />
              )}
              {needsReplacement && mode !== 'restore' && (
                <>
                  <p>
                    La cuenta tiene {user!._count.assignedLeads} leads y {user!._count.tasks} tareas
                    pendientes. Al desactivar, eliminar o cambiar de rol, deben transferirse.
                  </p>
                  <Input
                    aria-label='Filtrar reemplazos por nombre o correo'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <SelectField
                    label='Vendedor de reemplazo'
                    name='replacementId'
                    value={replacementId}
                    onValueChange={(id) => {
                      setReplacementId(id);
                      const selected = choices.data?.items.find((item) => item.id === id);
                      if (selected)
                        setReplacementLabel(`${selected.firstName ?? ''} · ${selected.email}`);
                    }}
                    options={[
                      { id: '', name: 'Seleccioná un vendedor' },
                      ...(replacementId &&
                      !choices.data?.items.some((item) => item.id === replacementId)
                        ? [{ id: replacementId, name: replacementLabel }]
                        : []),
                      ...(choices.data?.items
                        .filter((u) => u.id !== user?.id)
                        .map((u) => ({ id: u.id, name: `${u.firstName ?? ''} · ${u.email}` })) ??
                        [])
                    ]}
                  />
                  <Feedback error={choices.error} />
                  <p className='text-muted-foreground text-sm'>
                    Se muestran hasta 20 resultados; usá la búsqueda para encontrar otro vendedor.
                  </p>
                </>
              )}
              <div className='flex gap-2'>
                <Button type='button' variant='outline' onClick={onClose}>
                  Cancelar
                </Button>
                <LoadingButton type='submit' loading={action.pending} loadingLabel='Guardando…'>
                  {title}
                </LoadingButton>
              </div>
            </FieldGroup>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
