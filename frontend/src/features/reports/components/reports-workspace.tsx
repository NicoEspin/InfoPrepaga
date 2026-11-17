'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CrmContent } from '@/components/layout/crm-content';
import { CrmPageHeader } from '@/components/layout/crm-page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldError
} from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState, Feedback, LoadingState } from '@/features/crm/components/shared';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { IconChevronDown, IconDownload, IconPlus } from '@tabler/icons-react';
import { CrmTable } from '@/features/crm/components/crm-table';
import type { Identity } from '@/features/crm/api';
import { catalogsQuery, historyQuery, reportKeys } from '../api/queries';
import { downloadReport, previewReport, reportDetail, saveReport } from '../api/service';
import type { ReportInput, SavedReport, Snapshot } from '../api/types';
import { ReportDetail, reportPeriod, timestamp } from './report-detail';

const investmentAmount = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

function Selection({
  label,
  items,
  all,
  selected,
  onChange
}: {
  label: string;
  items: { id: string; name: string; isActive: boolean }[];
  all: boolean;
  selected: string[];
  onChange: (all: boolean, ids: string[]) => void;
}) {
  return (
    <FieldSet>
      <FieldLegend>{label}</FieldLegend>
      <FieldLabel>
        <Checkbox checked={all} onCheckedChange={(checked) => onChange(!!checked, [])} />
        Todos {label === 'Responsables' ? '(incluye Sin asignar)' : ''}
      </FieldLabel>
      {!all && (
        <div className='flex max-h-52 flex-col gap-2 overflow-auto'>
          {items.map((item) => (
            <FieldLabel key={item.id}>
              <Checkbox
                checked={selected.includes(item.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    false,
                    checked ? [...selected, item.id] : selected.filter((id) => id !== item.id)
                  )
                }
              />
              <span className='min-w-0 break-words'>
                {item.name}
                {item.isActive ? '' : ' (inactivo)'}
              </span>
            </FieldLabel>
          ))}
        </div>
      )}
      {!all && selected.length === 0 && (
        <FieldError>Elegí una opción o volvé a marcar Todos.</FieldError>
      )}
    </FieldSet>
  );
}
export function ReportsWorkspace({ actor }: { actor: Identity }) {
  const catalogs = useQuery(catalogsQuery(actor.id));
  const client = useQueryClient();
  const [view, setView] = useState<'history' | 'create' | 'detail'>('history');
  const heading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  function navigate(next: typeof view) {
    setError('');
    setMessage('');
    focusHeading.current = true;
    setView(next);
  }
  useEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      (view === 'detail' ? detailHeading : heading).current?.focus();
    }
  }, [view]);
  const [page, setPage] = useState(1);
  const history = useQuery(historyQuery(actor.id, page));
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allSources, setAllSources] = useState(true);
  const [sources, setSources] = useState<string[]>([]);
  const [allPeople, setAllPeople] = useState(true);
  const [people, setPeople] = useState<string[]>([]);
  const [investment, setInvestment] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ snapshot: Snapshot; signature: string } | null>(null);
  const [saved, setSaved] = useState<SavedReport | null>(null);
  const [opened, setOpened] = useState<SavedReport | null>(null);
  useEffect(() => {
    if (preview) resultHeading.current?.focus();
  }, [preview]);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useRef<{ signature: string; key: string } | null>(null);
  const included = (catalogs.data?.sources ?? []).filter(
    (s) => allSources || sources.includes(s.id)
  );
  const input: ReportInput = {
    name,
    from,
    to,
    sourceIds: allSources ? [] : sources,
    responsibleIds: allPeople ? [] : people,
    investments: included.map((s) => ({
      sourceId: s.id,
      amount: investment[s.id]?.trim().replace(',', '.') || null
    }))
  };
  const signature = JSON.stringify(input);
  const stale = preview !== null && preview.signature !== signature;
  const invalidInvestments = new Set(
    input.investments
      .filter(({ amount }) => amount !== null && !investmentAmount.test(amount))
      .map(({ sourceId }) => sourceId)
  );
  const valid =
    name.trim() &&
    from &&
    to &&
    from <= to &&
    (allSources || sources.length > 0) &&
    (allPeople || people.length > 0) &&
    invalidInvestments.size === 0;
  async function action(label: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operación. Reintentá.');
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }
  function startReport() {
    if (saved) {
      setName('');
      setFrom('');
      setTo('');
      setAllSources(true);
      setSources([]);
      setAllPeople(true);
      setPeople([]);
      setInvestment({});
      setSaved(null);
      setPreview(null);
      operation.current = null;
    }
    navigate('create');
  }
  async function download(id: string) {
    await action('Descargando PDF', async () => {
      const file = await downloadReport(id);
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage('Descarga iniciada. El reporte permanece guardado.');
    });
  }
  return (
    <CrmContent>
      <div className='leads-content flex flex-col gap-6'>
        <CrmPageHeader
          headingRef={heading}
          title={view === 'create' ? 'Nuevo reporte' : 'Reportes comerciales'}
          description={
            view === 'create'
              ? 'Elegí el período que querés analizar.'
              : 'Consultá los resultados de tu equipo comercial.'
          }
          actions={
            view === 'history' ? (
              <Button disabled={!!busy} onClick={startReport}>
                <IconPlus data-icon='inline-start' /> Nuevo reporte
              </Button>
            ) : (
              <Button variant='outline' disabled={!!busy} onClick={() => navigate('history')}>
                Volver a guardados
              </Button>
            )
          }
        />
        {busy && (
          <p role='status' className='text-sm text-muted-foreground'>
            {busy}…
          </p>
        )}
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <p role='status' className='text-sm text-muted-foreground'>
            {message}
          </p>
        )}
        {view === 'create' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Configurar análisis</CardTitle>
              </CardHeader>
              <CardContent>
                {catalogs.isPending ? (
                  <p role='status'>Cargando catálogos…</p>
                ) : catalogs.isError ? (
                  <div role='alert'>
                    No se pudieron cargar los filtros.{' '}
                    <Button onClick={() => catalogs.refetch()}>Reintentar</Button>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!valid) return;
                      void action('Generando vista previa', async () => {
                        const result = await previewReport(input);
                        operation.current = null;
                        setPreview({ snapshot: result, signature });
                        setSaved(null);
                        setMessage('Vista previa generada. Revisala antes de guardar.');
                      });
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor='report-name'>Nombre del reporte</FieldLabel>
                        <Input
                          id='report-name'
                          value={name}
                          required
                          maxLength={160}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </Field>
                      <FieldSet>
                        <FieldLegend>Período</FieldLegend>
                        <div className='grid gap-4 sm:grid-cols-2'>
                          <Field>
                            <FieldLabel htmlFor='report-from'>Desde</FieldLabel>
                            <Input
                              id='report-from'
                              type='date'
                              required
                              value={from}
                              onChange={(e) => setFrom(e.target.value)}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor='report-to'>Hasta</FieldLabel>
                            <Input
                              id='report-to'
                              type='date'
                              required
                              value={to}
                              min={from}
                              aria-invalid={!!from && !!to && from > to}
                              aria-describedby={
                                from && to && from > to ? 'report-to-error' : undefined
                              }
                              onChange={(e) => setTo(e.target.value)}
                            />
                            {from && to && from > to && (
                              <FieldError id='report-to-error'>
                                Elegí una fecha igual o posterior a la de inicio.
                              </FieldError>
                            )}
                          </Field>
                        </div>
                      </FieldSet>
                      <Collapsible className='rounded-lg border'>
                        <CollapsibleTrigger
                          render={
                            <Button
                              type='button'
                              variant='ghost'
                              className='h-auto w-full justify-between whitespace-normal p-3 text-left'
                            />
                          }
                        >
                          <span>
                            Filtros opcionales{' '}
                            <span className='block text-xs font-normal text-muted-foreground'>
                              {allSources
                                ? 'Todos los canales'
                                : `${sources.length} canales seleccionados`}{' '}
                              ·{' '}
                              {allPeople
                                ? 'Todos los responsables'
                                : `${people.length} responsables seleccionados`}
                            </span>
                          </span>
                          <IconChevronDown data-icon='inline-end' />
                        </CollapsibleTrigger>
                        <CollapsibleContent className='grid gap-6 p-4 md:grid-cols-2'>
                          <Selection
                            label='Canales'
                            items={catalogs.data.sources}
                            all={allSources}
                            selected={sources}
                            onChange={(all, ids) => {
                              setAllSources(all);
                              setSources(ids);
                            }}
                          />
                          <Selection
                            label='Responsables'
                            items={catalogs.data.responsibles}
                            all={allPeople}
                            selected={people}
                            onChange={(all, ids) => {
                              setAllPeople(all);
                              setPeople(ids);
                            }}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                      <Collapsible className='rounded-lg border'>
                        <CollapsibleTrigger
                          render={
                            <Button
                              type='button'
                              variant='ghost'
                              className='w-full justify-between'
                            />
                          }
                        >
                          Inversión por canal (opcional)
                          <IconChevronDown data-icon='inline-end' />
                        </CollapsibleTrigger>
                        <CollapsibleContent className='p-4'>
                          <FieldSet>
                            <FieldLegend>Importes en pesos (ARS)</FieldLegend>
                            <p className='text-muted-foreground'>
                              Dejá vacío si no está informada. $0 es válido. No se reparte entre
                              personas ni se prorratea en períodos parciales.
                            </p>
                            <div className='grid gap-4 sm:grid-cols-2'>
                              {included.map((s) => (
                                <Field key={s.id}>
                                  <FieldLabel htmlFor={`investment-${s.id}`}>
                                    {s.name}
                                    {s.isActive ? '' : ' (inactivo)'}
                                  </FieldLabel>
                                  <Input
                                    id={`investment-${s.id}`}
                                    inputMode='decimal'
                                    placeholder='No informada'
                                    value={investment[s.id] ?? ''}
                                    aria-invalid={invalidInvestments.has(s.id)}
                                    aria-describedby={
                                      invalidInvestments.has(s.id)
                                        ? `investment-error-${s.id}`
                                        : undefined
                                    }
                                    onChange={(e) =>
                                      setInvestment({ ...investment, [s.id]: e.target.value })
                                    }
                                  />
                                  {invalidInvestments.has(s.id) && (
                                    <FieldError id={`investment-error-${s.id}`}>
                                      Ingresá un importe de hasta 12 cifras y 2 decimales.
                                    </FieldError>
                                  )}
                                </Field>
                              ))}
                            </div>
                          </FieldSet>
                        </CollapsibleContent>
                      </Collapsible>
                      <div className='flex flex-wrap gap-3'>
                        <Button type='submit' disabled={!valid || !!busy}>
                          {busy === 'Generando vista previa' ? busy : 'Generar vista previa'}
                        </Button>
                      </div>
                    </FieldGroup>
                  </form>
                )}
              </CardContent>
            </Card>
            {preview && (
              <ReportDetail
                snapshot={preview.snapshot}
                id={saved?.id}
                headingRef={resultHeading}
                actions={
                  saved ? (
                    <Button
                      variant='outline'
                      disabled={!!busy}
                      onClick={() => void download(saved.id)}
                    >
                      <IconDownload data-icon='inline-start' /> Descargar PDF
                    </Button>
                  ) : (
                    <Button
                      type='button'
                      disabled={!valid || stale || !!busy}
                      onClick={() =>
                        void action('Guardando reporte', async () => {
                          if (!preview || stale) return;
                          if (operation.current?.signature !== signature)
                            operation.current = { signature, key: crypto.randomUUID() };
                          const result = await saveReport(input, operation.current.key);
                          setSaved(result);
                          setPreview({ snapshot: result.snapshot, signature });
                          setMessage('Reporte guardado. Ya podés descargar el PDF.');
                          await client.invalidateQueries({ queryKey: reportKeys.all(actor.id) });
                        })
                      }
                    >
                      Guardar reporte
                    </Button>
                  )
                }
                notice={
                  stale && !saved
                    ? 'Cambiaste la configuración. Generá una nueva vista previa para poder guardarla.'
                    : undefined
                }
              />
            )}
          </>
        )}
        {view === 'detail' && opened && (
          <ReportDetail
            snapshot={opened.snapshot}
            headingRef={detailHeading}
            id={opened.id}
            actions={
              <Button variant='outline' disabled={!!busy} onClick={() => void download(opened.id)}>
                <IconDownload data-icon='inline-start' /> Descargar PDF
              </Button>
            }
          />
        )}
        {view === 'history' && (
          <Card>
            <CardHeader>
              <CardTitle>Reportes guardados</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isPending ? (
                <LoadingState label='Cargando reportes guardados…' rows={2} />
              ) : history.isError ? (
                <Feedback
                  error={new Error('No se pudieron cargar los reportes guardados.')}
                  onRetry={() => void history.refetch()}
                  retrying={history.isFetching}
                />
              ) : !history.data.items.length ? (
                <EmptyState
                  title='Todavía no hay reportes guardados'
                  description='Creá un reporte para consultar tus resultados y descargarlo en PDF.'
                />
              ) : (
                <>
                  <CrmTable label='Listado de reportes guardados'>
                    <TableHeader className='bg-muted'>
                      <TableRow>
                        <TableHead scope='col'>Nombre</TableHead>
                        <TableHead scope='col'>Período</TableHead>
                        <TableHead scope='col'>Generado el</TableHead>
                        <TableHead scope='col' className='text-right'>
                          Acciones
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.data.items.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className='min-w-36 max-w-72 whitespace-normal break-words font-medium'>
                            {r.name}
                          </TableCell>
                          <TableCell>
                            {r.from && r.to ? reportPeriod(r.from, r.to) : 'Sin datos'}
                          </TableCell>
                          <TableCell>{timestamp(r.generatedAt)}</TableCell>
                          <TableCell>
                            <div className='flex justify-end gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={!!busy}
                                aria-label={`Ver reporte ${r.name}`}
                                onClick={() =>
                                  void action('Abriendo reporte', async () => {
                                    setOpened(await reportDetail(r.id));
                                    navigate('detail');
                                  })
                                }
                              >
                                Ver reporte
                              </Button>
                              <Button
                                size='sm'
                                variant='ghost'
                                disabled={!!busy}
                                aria-label={`Descargar PDF de ${r.name}`}
                                onClick={() => void download(r.id)}
                              >
                                <IconDownload data-icon='inline-start' /> Descargar PDF
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </CrmTable>
                  <nav
                    className='mt-4 flex flex-wrap items-center justify-between gap-2 text-sm'
                    aria-label='Paginación de reportes'
                  >
                    <span className='text-muted-foreground'>
                      Página {page} de {Math.ceil(history.data.total / history.data.pageSize)} ·{' '}
                      {history.data.total} reportes
                    </span>
                    <div className='flex gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={page === 1 || !!busy || history.isFetching}
                        onClick={() => setPage(page - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={
                          page * history.data.pageSize >= history.data.total ||
                          !!busy ||
                          history.isFetching
                        }
                        onClick={() => setPage(page + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </nav>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </CrmContent>
  );
}
