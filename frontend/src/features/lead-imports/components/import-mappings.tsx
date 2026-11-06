'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import { LoadingButton } from '@/components/ui/loading-button';
import { useCrmQuery, type Catalogs, type Seller } from '@/features/crm/api';
import {
  Feedback,
  LoadingState,
  Pagination,
  SelectField,
  TextField,
  useAction
} from '@/features/crm/components/shared';
import { mappingListOptions } from '../api/queries';
import { updateImportMapping, deleteImportMapping } from '../api/service';
import type { ImportMapping } from '../api/types';
const name = (
  person: { firstName: string | null; lastName: string | null; email?: string } | null
) =>
  person
    ? [person.firstName, person.lastName].filter(Boolean).join(' ') ||
      person.email ||
      'Cuenta sin nombre'
    : 'Reparto automático';
const destination = (rule: ImportMapping) =>
  rule.kind === 'ORIGIN' ? (rule.source?.name ?? 'Origen no disponible') : name(rule.assignedTo);
const kindLabel = {
  ADVISOR: 'Alias de vendedor',
  ORIGIN: 'Origen',
  DEFAULT: 'Responsable de hoja'
};

const identity = (rule: ImportMapping) => ({
  kind: rule.kind,
  scope: rule.scope,
  key: rule.key,
  expectedUpdatedAt: rule.updatedAt
});
export function ImportMappings({ actorId }: { actorId: string }) {
  const [page, setPage] = useState(1),
    [kind, setKind] = useState(''),
    [q, setQ] = useState('');
  const [editing, setEditing] = useState<ImportMapping | null>(null),
    [removing, setRemoving] = useState<ImportMapping | null>(null);
  const query = useQuery(mappingListOptions(actorId, page, kind, q));
  const catalogs = useCrmQuery<Catalogs>(actorId, 'catalogs'),
    users = useCrmQuery<Seller[]>(actorId, 'users');
  const client = useQueryClient(),
    action = useAction();
  const refresh = () => client.invalidateQueries({ queryKey: ['crm', actorId, 'import-mappings'] });

  return (
    <section className='grid gap-4' aria-label='Equivalencias de importación'>
      <h2>Equivalencias de importación Excel</h2>
      <p>
        Los cambios se aplican a futuras importaciones. No modifican leads ni decisiones ya
        guardadas en otros lotes.
      </p>
      <Feedback
        error={query.error ?? catalogs.error ?? users.error ?? action.error}
        message={action.message}
        pending={action.pending}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(String(new FormData(event.currentTarget).get('mapping-search') ?? ''));
          setPage(1);
        }}
      >
        <FieldGroup className='grid gap-3 sm:grid-cols-2'>
          <TextField name='mapping-search' label='Buscar alias o grupo' value={q} />
          <SelectField
            name='mapping-kind'
            label='Tipo de equivalencia'
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { id: '', name: 'Todos' },
              { id: 'ADVISOR', name: 'Alias de vendedores' },
              { id: 'ORIGIN', name: 'Orígenes' },
              { id: 'DEFAULT', name: 'Responsables predeterminados' }
            ]}
          />
        </FieldGroup>
        <Button type='submit'>Buscar equivalencias</Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            setEditing(null);
            setRemoving(null);
            void query.refetch();
          }}
        >
          Actualizar lista
        </Button>
      </form>
      {query.isPending ? (
        <LoadingState label='Cargando equivalencias…' rows={3} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo / ámbito</TableHead>
                <TableHead>Alias o grupo</TableHead>
                <TableHead>Destino confirmado</TableHead>
                <TableHead>Última confirmación</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((rule) => (
                <TableRow key={JSON.stringify([rule.kind, rule.scope, rule.key])}>
                  <TableCell>
                    {kindLabel[rule.kind]} · {rule.scope === '*' ? 'Todas las hojas' : rule.scope}
                  </TableCell>
                  <TableCell>{rule.key === '*' ? 'Predeterminado' : rule.key}</TableCell>
                  <TableCell>
                    {destination(rule)}
                    {((rule.source && !rule.source.isActive) ||
                      (rule.assignedTo && !rule.assignedTo.isActive)) &&
                      ' · Inactivo'}
                  </TableCell>
                  <TableCell>
                    {name(rule.confirmedBy)} ·{' '}
                    {new Date(rule.updatedAt).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires'
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='outline'
                      disabled={action.pending}
                      onClick={() => setEditing(rule)}
                    >
                      Editar equivalencia
                    </Button>
                    <Button
                      variant='outline'
                      disabled={action.pending}
                      onClick={() => setRemoving(rule)}
                    >
                      Eliminar equivalencia
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {query.data?.total === 0 && (
            <p>
              No hay equivalencias para este filtro. Se crean al confirmar correspondencias en una
              importación.
            </p>
          )}
          {query.data && (
            <Pagination
              page={page}
              pageSize={20}
              total={query.data.total}
              onPage={setPage}
              busy={query.isFetching || action.pending}
            />
          )}
        </>
      )}
      {editing && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !action.pending) setEditing(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar equivalencia</DialogTitle>
              <DialogDescription>
                {kindLabel[editing.kind]} · {editing.scope}. Destino actual: {destination(editing)}.
                No se sobrescriben otras equivalencias.
              </DialogDescription>
            </DialogHeader>
            <Feedback error={action.error} />
            <form
              key={editing.updatedAt}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void action.run(async () => {
                  await updateImportMapping({
                    ...identity(editing),
                    ...(editing.kind !== 'DEFAULT' && { newKey: String(data.get('mapping-key')) }),
                    ...(editing.kind === 'ORIGIN'
                      ? { sourceId: String(data.get('mapping-target')) }
                      : {
                          assignedToId:
                            data.get('mapping-target') === 'AUTO'
                              ? null
                              : String(data.get('mapping-target'))
                        })
                  });
                  setEditing(null);
                  await refresh();
                });
              }}
            >
              <FieldGroup>
                {editing.kind !== 'DEFAULT' && (
                  <TextField
                    name='mapping-key'
                    label='Alias o grupo'
                    value={editing.key}
                    required
                    maxLength={editing.kind === 'ADVISOR' ? 160 : 300}
                  />
                )}
                <SelectField
                  name='mapping-target'
                  label={editing.kind === 'ORIGIN' ? 'Origen destino' : 'Responsable destino'}
                  value={
                    editing.kind === 'ORIGIN'
                      ? (editing.sourceId ?? '')
                      : (editing.assignedToId ?? 'AUTO')
                  }
                  required
                  options={
                    editing.kind === 'ORIGIN'
                      ? (catalogs.data?.sources ?? [])
                          .filter((source) => source.isActive || source.id === editing.sourceId)
                          .map((source) => ({
                            id: source.id,
                            name: source.name + (source.isActive ? '' : ' (inactivo)')
                          }))
                      : [
                          { id: 'AUTO', name: 'Reparto automático' },
                          ...(users.data ?? [])
                            .filter((user) => user.isActive || user.id === editing.assignedToId)
                            .map((user) => ({
                              id: user.id,
                              name: name(user) + (user.isActive ? '' : ' (inactivo)')
                            }))
                        ]
                  }
                />
              </FieldGroup>
              <LoadingButton
                type='submit'
                loading={action.pending}
                disabled={catalogs.isPending || users.isPending}
              >
                Guardar equivalencia
              </LoadingButton>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {removing && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !action.pending) setRemoving(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar equivalencia</DialogTitle>
              <DialogDescription>
                Se eliminará {removing.key} → {destination(removing)}. Los próximos archivos
                volverán a pedir confirmación si no existe otra correspondencia inequívoca. Se
                conservan el destino, los leads, los lotes y la auditoría.
              </DialogDescription>
            </DialogHeader>
            <Feedback error={action.error} />
            <LoadingButton
              variant='destructive'
              loading={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await deleteImportMapping(identity(removing));
                  setRemoving(null);
                  await refresh();
                })
              }
            >
              Confirmar eliminación
            </LoadingButton>
            <Button variant='outline' disabled={action.pending} onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
