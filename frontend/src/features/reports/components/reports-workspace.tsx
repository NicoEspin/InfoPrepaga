'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { Identity } from '@/features/crm/api';
import { catalogsQuery, historyQuery, reportKeys } from '../api/queries';
import { downloadReport, previewReport, reportDetail, saveReport } from '../api/service';
import type { ReportInput, SavedReport, Snapshot } from '../api/types';
import { ReportDetail, timestamp } from './report-detail';

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
      <div className='flex max-h-52 flex-col gap-2 overflow-auto'>
        {items.map((item) => (
          <FieldLabel key={item.id}>
            <Checkbox
              checked={all || selected.includes(item.id)}
              onCheckedChange={(checked) =>
                onChange(
                  false,
                  checked
                    ? [...selected, item.id]
                    : (all ? items.map((i) => i.id) : selected).filter((id) => id !== item.id)
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
    </FieldSet>
  );
}
export function ReportsWorkspace({ actor }: { actor: Identity }) {
  const catalogs = useQuery(catalogsQuery(actor.id));
  const client = useQueryClient();
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
  const valid =
    name.trim() &&
    from &&
    to &&
    from <= to &&
    (allSources || sources.length > 0) &&
    (allPeople || people.length > 0) &&
    input.investments.every(
      (i) => i.amount === null || /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(i.amount)
    );
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
        <div className='leads-heading'>
          <h1>Reportes comerciales</h1>
          <p>Compará canales y responsables con una fotografía inmutable.</p>
        </div>
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
                  <div className='grid gap-4 sm:grid-cols-2'>
                    <Field>
                      <FieldLabel htmlFor='report-from'>Fecha desde</FieldLabel>
                      <Input
                        id='report-from'
                        type='date'
                        required
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor='report-to'>Fecha hasta</FieldLabel>
                      <Input
                        id='report-to'
                        type='date'
                        required
                        value={to}
                        min={from}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className='grid gap-6 md:grid-cols-2'>
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
                  </div>
                  <FieldSet>
                    <FieldLegend>Inversión total declarada por canal (ARS)</FieldLegend>
                    <p className='text-muted-foreground'>
                      Dejá vacío si no está informada. $0 es válido. No se reparte entre personas ni
                      se prorratea en períodos parciales.
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
                            aria-invalid={
                              !!investment[s.id] &&
                              !/^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,2})?$/.test(investment[s.id])
                            }
                            onChange={(e) =>
                              setInvestment({ ...investment, [s.id]: e.target.value })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </FieldSet>
                  {!allSources && !sources.length && (
                    <p role='alert'>Seleccioná al menos un canal o Todos.</p>
                  )}
                  {!allPeople && !people.length && (
                    <p role='alert'>Seleccioná al menos un responsable o Todos.</p>
                  )}
                  <div className='flex flex-wrap gap-3'>
                    <Button type='submit' disabled={!valid || !!busy}>
                      {busy === 'Generando vista previa' ? busy : 'Generar vista previa'}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={!preview || stale || !!busy || !!saved}
                      onClick={() =>
                        void action('Guardando reporte', async () => {
                          if (!preview || stale) return;
                          if (operation.current?.signature !== signature)
                            operation.current = { signature, key: crypto.randomUUID() };
                          const result = await saveReport(input, operation.current.key);
                          setSaved(result);
                          setPreview({ snapshot: result.snapshot, signature });
                          setMessage(
                            'Reporte guardado. Se muestra la fotografía definitiva calculada por el servidor.'
                          );
                          await client.invalidateQueries({ queryKey: reportKeys.all(actor.id) });
                        })
                      }
                    >
                      Guardar reporte
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
        {busy && <p role='status'>{busy}…</p>}
        {error && <p role='alert'>{error}</p>}
        {message && <p role='status'>{message}</p>}
        {stale && !saved && (
          <p role='alert'>
            Vista previa desactualizada: cambiaste filtros o inversión. Generala nuevamente antes de
            guardar.
          </p>
        )}
        {saved ? (
          <>
            <Button
              className='self-start'
              disabled={!!busy}
              onClick={() => void download(saved.id)}
            >
              Descargar PDF
            </Button>
            <ReportDetail snapshot={saved.snapshot} id={saved.id} />
          </>
        ) : (
          preview && <ReportDetail snapshot={preview.snapshot} />
        )}
        <Card>
          <CardHeader>
            <CardTitle>Reportes guardados</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isPending ? (
              <p role='status'>Cargando historial…</p>
            ) : history.isError ? (
              <div role='alert'>
                No se pudo cargar el historial.{' '}
                <Button onClick={() => history.refetch()}>Reintentar</Button>
              </div>
            ) : (
              <>
                <ul className='flex flex-col gap-3'>
                  {history.data.items.map((r) => (
                    <li key={r.id} className='flex flex-wrap items-center gap-3'>
                      <span className='min-w-0 flex-1 break-words'>
                        {r.name} · {timestamp(r.generatedAt)}
                      </span>
                      <Button
                        variant='outline'
                        disabled={!!busy}
                        onClick={() =>
                          void action('Abriendo reporte', async () => {
                            setSaved(await reportDetail(r.id));
                          })
                        }
                      >
                        Ver detalle
                      </Button>
                      <Button
                        variant='outline'
                        disabled={!!busy}
                        onClick={() => void download(r.id)}
                      >
                        Descargar PDF
                      </Button>
                    </li>
                  ))}
                </ul>
                {!history.data.items.length && <p>Todavía no hay reportes guardados.</p>}
                <nav className='mt-4 flex items-center gap-3' aria-label='Paginación de reportes'>
                  <Button
                    variant='outline'
                    disabled={page === 1 || !!busy}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {page} · {history.data.total} reportes
                  </span>
                  <Button
                    variant='outline'
                    disabled={page * 10 >= history.data.total || !!busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Siguiente
                  </Button>
                </nav>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmContent>
  );
}
