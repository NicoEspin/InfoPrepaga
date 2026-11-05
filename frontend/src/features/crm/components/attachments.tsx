'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { crmRequest, type Page, useCrmQuery, useRefreshCrm } from '../api';
import { Feedback, LoadingState, Pagination } from './shared';
import { LoadingButton } from '@/components/ui/loading-button';

type Attachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  state: 'UPLOADING' | 'READY' | 'DELETING';
  version: number;
  createdAt: string;
};
const date = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires'
});

export function Attachments({ leadId, actorId }: { leadId: string; actorId: string }) {
  const inputId = useId();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const path = `leads/${leadId}/attachments`;
  const query = useCrmQuery<Page<Attachment>>(actorId, `${path}?page=${page}&pageSize=10`);
  const refresh = useRefreshCrm();
  async function run(action: () => Promise<void>, success: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('No se pudo completar la operación'));
    } finally {
      // Also refresh after ambiguous network errors to expose interrupted uploads/deletions.
      await refresh();
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Archivos adjuntos</CardTitle>
        <CardDescription>
          PDF, JPG y PNG de hasta 10 MB. Acceso privado según la asignación del lead.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4' aria-busy={busy}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const file = new FormData(form).get('file');
            if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) {
              setError(new Error('Seleccioná un archivo de hasta 10 MB'));
              return;
            }
            const body = new FormData();
            body.set('file', file);
            void run(async () => {
              await crmRequest(path, { method: 'POST', body });
              form.reset();
              setPage(1);
            }, 'Archivo cargado.');
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={inputId}>Seleccionar archivo</FieldLabel>
              <Input
                id={inputId}
                name='file'
                type='file'
                accept='.pdf,.png,.jpg,.jpeg'
                required
                disabled={busy}
              />
            </Field>
            <LoadingButton type='submit' loading={busy} loadingLabel='Procesando…'>
              Subir archivo
            </LoadingButton>
          </FieldGroup>
        </form>
        <Feedback
          error={error ?? query.error}
          message={message}
          onRetry={query.isError ? () => void query.refetch() : undefined}
          retrying={query.isFetching}
        />
        {query.isPending && <LoadingState label='Cargando adjuntos…' rows={2} />}
        {!query.isError && query.data && (
          <>
            {query.data.items.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Sin archivos adjuntos</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className='grid gap-4'>
                {query.data.items.map((item) => (
                  <li
                    key={item.id}
                    className='flex min-w-0 flex-wrap items-center justify-between gap-3'
                  >
                    <div className='min-w-0 flex-1'>
                      <p className='break-all'>{item.name}</p>
                      <p className='text-muted-foreground text-sm'>
                        {(item.size / 1024).toFixed(1)} KB · {date.format(new Date(item.createdAt))}
                      </p>
                      {item.state !== 'READY' && (
                        <Badge variant='secondary'>
                          {item.state === 'DELETING'
                            ? 'Borrado pendiente: reintentá eliminar'
                            : 'Carga sin confirmar: eliminá el adjunto antes de volver a subir'}
                        </Badge>
                      )}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        variant='outline'
                        disabled={busy || item.state !== 'READY'}
                        aria-label={`Descargar ${item.name}`}
                        onClick={() =>
                          void run(async () => {
                            const { url } = await crmRequest<{ url: string }>(
                              `${path}/${item.id}/download`
                            );
                            const link = document.createElement('a');
                            link.href = url;
                            link.rel = 'noreferrer';
                            link.referrerPolicy = 'no-referrer';
                            link.click();
                          }, 'Descarga solicitada.')
                        }
                      >
                        Descargar
                      </Button>
                      <Button
                        variant='outline'
                        disabled={busy || item.state !== 'READY'}
                        aria-label={`Renombrar ${item.name}`}
                        onClick={() => setEditing(item)}
                      >
                        Renombrar
                      </Button>
                      <Button
                        variant='destructive'
                        disabled={busy}
                        aria-label={`Eliminar ${item.name}`}
                        onClick={() => setDeleting(item)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              page={page}
              total={query.data.total}
              pageSize={10}
              onPage={setPage}
              busy={busy || query.isFetching}
            />
          </>
        )}
        {editing && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setEditing(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Renombrar archivo</DialogTitle>
                <DialogDescription>
                  El nombre cambia en el CRM y en las próximas descargas.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get('name')).trim();
                  void run(async () => {
                    await crmRequest(`${path}/${editing.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ name, version: editing.version })
                    });
                    setEditing(null);
                  }, 'Nombre actualizado.');
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`${inputId}-name`}>Nombre del archivo</FieldLabel>
                    <Input
                      id={`${inputId}-name`}
                      name='name'
                      defaultValue={editing.name}
                      required
                      maxLength={180}
                      disabled={busy}
                    />
                  </Field>
                  <Feedback error={error} />
                  <LoadingButton type='submit' loading={busy} loadingLabel='Guardando…'>
                    Guardar nombre
                  </LoadingButton>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancelar
                  </Button>
                </FieldGroup>
              </form>
            </DialogContent>
          </Dialog>
        )}
        {deleting && (
          <AlertDialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setDeleting(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar el archivo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará «{deleting.name}» del lead y de Cloudflare R2. Esta acción no se
                  puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Feedback error={error} />
              <AlertDialogFooter>
                <Button variant='outline' disabled={busy} onClick={() => setDeleting(null)}>
                  Cancelar
                </Button>
                <LoadingButton
                  variant='destructive'
                  loading={busy}
                  loadingLabel='Eliminando…'
                  onClick={() =>
                    void run(async () => {
                      await crmRequest(`${path}/${deleting.id}`, { method: 'DELETE' });
                      setDeleting(null);
                      if (query.data?.items.length === 1 && page > 1) setPage(page - 1);
                    }, 'Archivo eliminado del lead y de R2.')
                  }
                >
                  Eliminar definitivamente
                </LoadingButton>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
