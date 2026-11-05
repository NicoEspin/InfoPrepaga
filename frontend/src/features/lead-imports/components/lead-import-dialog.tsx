'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { LeadPhoneCell } from '@/features/leads/components/lead-phone-cell';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  personName,
  useCrmQuery,
  useRefreshCrm,
  type Catalogs,
  type Seller
} from '@/features/crm/api';
import { Feedback, LoadingState } from '@/features/crm/components/shared';
import { importListOptions, importPreviewOptions } from '../api/queries';
import {
  changeImport,
  changeImportRow,
  confirmImport,
  getImport,
  reviewImport,
  uploadImport
} from '../api/service';
import type { BatchChanges, ImportRow, RowChanges } from '../api/types';
import { ImportRowEditor } from './import-row-editor';

export default function LeadImportDialog({
  actorId,
  onClose
}: {
  actorId: string;
  onClose: () => void;
}) {
  const [id, setId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const pause = useRef(false);
  const client = useQueryClient();
  const refreshCrm = useRefreshCrm();
  const list = useQuery(importListOptions(actorId));
  const preview = useQuery(importPreviewOptions(actorId, id, page));
  const catalogs = useCrmQuery<Catalogs>(actorId, 'catalogs');
  const accounts = useCrmQuery<Seller[]>(actorId, 'users');
  const sellers = (accounts.data ?? []).filter(
    (seller) =>
      seller.isActive && seller.roles.some((role) => ['ADMIN', 'VENDEDOR'].includes(role.role.name))
  );
  const data = preview.data;
  const reviewable = data && data.status !== 'COMPLETE';
  const configurable = data?.status === 'REVIEW';
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setMessage('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('No se pudo completar la operación'));
    } finally {
      try {
        await client.invalidateQueries({ queryKey: ['crm', actorId, 'lead-imports'] });
      } finally {
        lock.current = false;
        setPending(false);
      }
    }
  }
  function update(changes: BatchChanges) {
    if (!data) return;
    void run(async () => {
      await changeImport(id, data.version, changes, data.reviewToken);
      setEditing(null);
    });
  }
  async function save(changes: RowChanges) {
    if (!data || !editing) return;
    await run(async () => {
      await changeImportRow(id, editing.id, data.version, changes, data.reviewToken);
      setEditing(null);
    });
  }
  function start() {
    if (!data) return;
    pause.current = false;
    void run(async () => {
      let version = data.version;
      do {
        const progress = await confirmImport(id, version);
        setMessage(
          `Cargados: ${progress.imported}. ${progress.status === 'COMPLETE' ? `Carga finalizada. Omitidos: ${progress.omitted}.` : 'Podés pausar después del bloque actual.'}`
        );
        await refreshCrm();
        if (progress.status === 'COMPLETE') break;
        version = progress.version;
      } while (!pause.current);
      if (pause.current) setMessage('Carga pausada. Podés reanudarla desde este lote.');
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className='max-h-[92dvh] overflow-y-auto sm:max-w-6xl'
        showCloseButton={!pending}
        aria-busy={pending}
      >
        <DialogHeader>
          <DialogTitle>Importar leads desde Excel</DialogTitle>
          <DialogDescription>
            Subí el archivo, revisá los contactos y elegí cuáles cargar. La revisión se conserva
            durante 24 horas.
          </DialogDescription>
        </DialogHeader>
        <Feedback
          error={error ?? preview.error ?? list.error ?? catalogs.error ?? accounts.error}
          message={message}
        />
        {!id && (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const file = new FormData(event.currentTarget).get('file');
                if (!(file instanceof File) || !file.size) return;
                if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
                  setError(new Error('Seleccioná un .xlsx de hasta 10 MB'));
                  return;
                }
                void run(async () => {
                  const result = await uploadImport(file);
                  setId(result.id);
                  setPage(1);
                });
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor='import-file'>
                    Archivo Excel (.xlsx, hasta 10 MB y 5.000 contactos)
                  </FieldLabel>
                  <Input
                    id='import-file'
                    name='file'
                    type='file'
                    accept='.xlsx'
                    required
                    disabled={pending}
                  />
                </Field>
              </FieldGroup>
              <LoadingButton
                className='mt-3'
                type='submit'
                loading={pending}
                loadingLabel='Preparando revisión…'
              >
                Subir y revisar
              </LoadingButton>
            </form>
            {list.isPending && <LoadingState label='Buscando importaciones…' rows={2} />}
            {!!list.data?.length && (
              <div className='grid gap-2'>
                <h3 className='font-medium'>Revisiones y cargas recientes</h3>
                {list.data.map((batch) => (
                  <Button
                    key={batch.id}
                    variant='outline'
                    className='h-auto justify-start whitespace-normal text-left'
                    disabled={pending}
                    onClick={() => {
                      setId(batch.id);
                      setPage(1);
                    }}
                  >
                    {batch.fileName} ·{' '}
                    {batch.status === 'COMPLETE'
                      ? 'Finalizada'
                      : batch.status === 'IMPORTING'
                        ? 'Carga pendiente'
                        : 'En revisión'}{' '}
                    · {batch.imported}/{batch.total} cargados
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
        {id && preview.isPending && <LoadingState label='Revisando contactos…' rows={5} />}
        {id && !data && !preview.isPending && (
          <Button variant='outline' disabled={pending} onClick={() => void preview.refetch()}>
            Actualizar revisión
          </Button>
        )}
        {data && (
          <>
            <div className='flex flex-wrap items-center gap-2'>
              <strong>{data.fileName}</strong>
              <Badge variant='secondary'>{data.summary.imported} cargados</Badge>
              <Badge variant='secondary'>{data.summary.pending} pendientes</Badge>
              <Badge variant='secondary'>{data.summary.omitted} omitidos</Badge>
              <Badge variant='secondary'>{data.summary.duplicates} posibles duplicados</Badge>
              <Badge variant={data.summary.invalid ? 'destructive' : 'secondary'}>
                {data.summary.invalid} con errores seleccionados
              </Badge>
            </div>
            {data.warnings.length > 0 && (
              <Alert>
                <AlertDescription>
                  <ul className='list-inside list-disc'>
                    {data.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <fieldset disabled={pending || !configurable} className='flex flex-wrap gap-4'>
              <legend className='mb-2 font-medium'>Hojas a importar</legend>
              {data.availableSheets.map((sheet) => (
                <label key={sheet} className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={data.sheets.includes(sheet)}
                    onChange={(event) => {
                      const sheets = event.target.checked
                        ? [...data.sheets, sheet]
                        : data.sheets.filter((item) => item !== sheet);
                      if (sheets.length) update({ sheets });
                    }}
                  />
                  {sheet}
                </label>
              ))}
            </fieldset>
            {configurable && (
              <FieldGroup className='grid gap-3 md:grid-cols-2'>
                {data.groups.map((group) => (
                  <Field key={`${group.sheet}:${group.group}`}>
                    <FieldLabel>
                      Origen: {group.sheet} / {group.group}
                    </FieldLabel>
                    <NativeSelect
                      aria-label={`Origen ${group.sheet} ${group.group}`}
                      value={group.sourceId ?? ''}
                      disabled={pending}
                      onChange={(event) => {
                        if (event.target.value)
                          update({
                            mappings: [
                              {
                                sheet: group.sheet,
                                group: group.group,
                                sourceId: event.target.value
                              }
                            ]
                          });
                      }}
                    >
                      <NativeSelectOption value=''>Confirmá un origen</NativeSelectOption>
                      {catalogs.data?.sources
                        .filter((source) => source.isActive)
                        .map((source) => (
                          <NativeSelectOption key={source.id} value={source.id}>
                            {source.name}
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                  </Field>
                ))}
                {data.advisors.map((item) => (
                  <Field key={item.advisor}>
                    <FieldLabel>Asesor del Excel: {item.advisor}</FieldLabel>
                    <NativeSelect
                      aria-label={`Vendedor para ${item.advisor}`}
                      value={item.resolved ? (item.assignedToId ?? 'AUTO') : ''}
                      disabled={pending}
                      onChange={(event) => {
                        if (event.target.value)
                          update({
                            mappings: [
                              {
                                advisor: item.advisor,
                                assignedToId:
                                  event.target.value === 'AUTO' ? null : event.target.value
                              }
                            ]
                          });
                      }}
                    >
                      <NativeSelectOption value=''>Relacioná con un vendedor</NativeSelectOption>
                      <NativeSelectOption value='AUTO'>Reparto automático</NativeSelectOption>
                      {sellers.map((seller) => (
                        <NativeSelectOption key={seller.id} value={seller.id}>
                          {personName(seller)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                ))}
              </FieldGroup>
            )}
            {reviewable && (
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  disabled={pending || !data.summary.duplicates}
                  onClick={() => update({ duplicates: 'INCLUDE' })}
                >
                  Cargar todos los duplicados
                </Button>
                <Button
                  variant='outline'
                  disabled={pending || !data.summary.duplicates}
                  onClick={() => update({ duplicates: 'OMIT' })}
                >
                  Omitir todos los duplicados
                </Button>
                <Button
                  variant='outline'
                  disabled={pending}
                  onClick={() => update({ duplicates: 'AUTO' })}
                >
                  Restablecer selección automática
                </Button>
              </div>
            )}
            {data.summary.requiresReview && (
              <Alert>
                <AlertDescription>
                  Hay coincidencias nuevas contra el CRM. Revisá los motivos de las filas antes de
                  continuar.
                  <Button
                    className='mt-2'
                    variant='outline'
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await reviewImport(id, data.version, data.reviewToken);
                      })
                    }
                  >
                    Confirmar revisión de duplicados
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Revisión</TableHead>
                  <TableHead>Carga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.sheet}
                      <br />
                      {row.rowNumber}
                      {!row.active && <p>Hoja excluida</p>}
                    </TableCell>
                    <TableCell>
                      <strong>{row.name || 'Nombre por resolver'}</strong>
                      <LeadPhoneCell phone={row.phone} />
                      <p>{row.email}</p>
                    </TableCell>
                    <TableCell className='max-w-sm whitespace-normal'>
                      {row.leadId ? (
                        <Badge>Cargado</Badge>
                      ) : (
                        <>
                          {row.errors.map((issue) => (
                            <p key={issue} className='text-destructive'>
                              {issue}
                            </p>
                          ))}
                          {row.duplicate && (
                            <>
                              <Badge variant='secondary'>Posible duplicado</Badge>
                              <ul className='list-inside list-disc'>
                                {row.matches.slice(0, 10).map((match, index) => (
                                  <li key={index}>
                                    {match.kind === 'email' ? 'Correo' : 'Teléfono'}:{' '}
                                    {match.name || 'Sin nombre'} (
                                    {match.leadId
                                      ? 'CRM'
                                      : `${match.sheet}, fila ${match.rowNumber}`}
                                    )
                                  </li>
                                ))}
                              </ul>
                              {row.matches.length > 10 && <p>Y otras coincidencias.</p>}
                            </>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.leadId ? 'Cargado' : row.selected ? 'Se cargará' : 'Se omitirá'}
                      {!row.leadId && row.active && reviewable && (
                        <div className='mt-2 flex gap-2'>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={pending}
                            onClick={() => setEditing(row)}
                          >
                            Revisar fila
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                await changeImportRow(
                                  id,
                                  row.id,
                                  data.version,
                                  {
                                    decision: row.selected ? 'OMIT' : 'INCLUDE',
                                    acknowledgeDuplicates: true
                                  },
                                  data.reviewToken
                                );
                              })
                            }
                          >
                            {row.selected ? 'Omitir' : 'Cargar'}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className='flex items-center justify-between gap-3'>
              <Button
                variant='outline'
                disabled={pending || page === 1}
                onClick={() => {
                  setPage(page - 1);
                  setEditing(null);
                }}
              >
                Anterior
              </Button>
              <p>
                Página {page} de {Math.max(1, Math.ceil(data.rowTotal / 50))}
              </p>
              <Button
                variant='outline'
                disabled={pending || page * 50 >= data.rowTotal}
                onClick={() => {
                  setPage(page + 1);
                  setEditing(null);
                }}
              >
                Siguiente
              </Button>
            </div>
            {editing && catalogs.data && (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open && !pending) setEditing(null);
                }}
              >
                <DialogContent
                  className='max-h-[90dvh] overflow-y-auto sm:max-w-3xl'
                  showCloseButton={!pending}
                >
                  <DialogHeader>
                    <DialogTitle>Revisar fila {editing.rowNumber}</DialogTitle>
                    <DialogDescription>
                      {editing.sheet} · Corregí los datos y elegí si querés cargar este contacto.
                    </DialogDescription>
                  </DialogHeader>
                  <Feedback error={error} />
                  <ImportRowEditor
                    key={`${editing.id}:${data.version}`}
                    row={editing}
                    catalogs={catalogs.data}
                    sellers={sellers}
                    pending={pending}
                    save={save}
                    close={() => setEditing(null)}
                  />
                </DialogContent>
              </Dialog>
            )}
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                variant='outline'
                disabled={pending}
                onClick={() => {
                  setId('');
                  setEditing(null);
                  setMessage('');
                  setError(null);
                }}
              >
                Volver a importaciones
              </Button>
              <Button
                variant='outline'
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await getImport(id, page);
                    await refreshCrm();
                  })
                }
              >
                Actualizar revisión
              </Button>
              {reviewable && (
                <LoadingButton
                  loading={pending}
                  loadingLabel='Procesando…'
                  disabled={
                    pending || data.summary.invalid > 0 || data.summary.requiresReview || !!editing
                  }
                  onClick={start}
                >
                  {data.status === 'IMPORTING'
                    ? 'Reanudar carga'
                    : `Confirmar carga (${data.summary.pending})`}
                </LoadingButton>
              )}
              {pending && data.status !== 'COMPLETE' && (
                <Button
                  variant='outline'
                  onClick={() => {
                    pause.current = true;
                  }}
                >
                  Pausar después del bloque actual
                </Button>
              )}
              {!pending && data.status === 'COMPLETE' && <Button onClick={onClose}>Cerrar</Button>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
