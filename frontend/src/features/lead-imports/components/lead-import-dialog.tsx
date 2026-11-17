'use client';
import { ImportColumns } from './import-columns';
import { ImportBulk } from './import-bulk';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ImportConfiguration, ImportSelection } from '../api/types';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { LeadPhoneCell } from '@/features/leads/components/lead-phone-cell';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  personName,
  useCrmQuery,
  useRefreshCrm,
  type Catalogs,
  type Seller
} from '@/features/crm/api';
import { CrmTable } from '@/features/crm/components/crm-table';
import { EmptyState, Feedback, LoadingState } from '@/features/crm/components/shared';
import { importListOptions, importPreviewOptions } from '../api/queries';
import {
  changeImport,
  changeImportRow,
  confirmImport,
  getImport,
  reviewImport,
  uploadImport
} from '../api/service';
import type { BatchChanges, ImportRow, ImportFilter, ImportResult, RowChanges } from '../api/types';
import { ImportComparison } from './import-comparison';
import { ImportRowEditor } from './import-row-editor';
const importSteps = [
  ['Elegir archivo', 'Seleccioná el Excel y el tipo de importación.'],
  ['Configurar datos', 'Revisá cómo se van a interpretar los datos del Excel.'],
  ['Revisar registros', 'Resolvé las filas que necesitan atención o dejalas para después.'],
  ['Confirmar importación', 'Revisá el resultado previsto antes de cargar los registros.']
] as const;

function resultCounts(result: ImportResult) {
  return [
    [result.created, 'altas'],
    [result.updated, 'actualizaciones'],
    [result.merged, 'consolidaciones'],
    [result.omitted, 'excluidas'],
    [result.alreadyRegistered, 'ya registradas'],
    [result.pending, 'pendientes']
  ] as const;
}

export default function LeadImportDialog({
  actorId,
  onClose,
  onViewBatch
}: {
  actorId: string;
  onClose: () => void;
  onViewBatch: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [requestedStep, setStep] = useState(1);
  const [mode, setMode] = useState('NEW');
  const [configuration, setConfiguration] = useState<ImportConfiguration>({
    version: 1,
    sheets: {},
    dateFormat: 'DMY'
  });
  const [selection, setSelection] = useState<ImportSelection>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentAliases, setCurrentAliases] = useState<string[]>([]);
  const [currentOwner, setCurrentOwner] = useState('');
  const [filter, setFilter] = useState<ImportFilter>('REVIEW');
  const [excludePending, setExcludePending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [remember, setRemember] = useState(false);
  const [aliases, setAliases] = useState<string[]>([]);
  const [cleanup, setCleanup] = useState<BatchChanges['bulkCleanup']>();
  const [id, setId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [pending, setPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const pause = useRef(false);
  const client = useQueryClient();
  const refreshCrm = useRefreshCrm();
  const list = useQuery(importListOptions(actorId));
  const preview = useQuery(importPreviewOptions(actorId, id, page, filter, selection));
  const data = preview.data;
  const noWork = !!data && data.summary.alreadyRegistered === data.summary.detected;
  const finished = !!data && (data.status === 'COMPLETE' || noWork);
  const step = finished ? 4 : requestedStep;
  const activeStep = id ? step : 1;
  const [stepTitle, stepDescription] = importSteps[activeStep - 1];

  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    if (activeStep > 1) heading.current?.focus();
  }, [activeStep]);
  const configurations = useCrmQuery<
    Array<{ id: string; configuration: ImportConfiguration; createdAt: string }>
  >(actorId, 'lead-imports/configurations');
  const catalogs = useCrmQuery<Catalogs>(actorId, 'catalogs');
  const accounts = useCrmQuery<Seller[]>(actorId, 'users');
  const sellers = (accounts.data ?? []).filter(
    (seller) =>
      seller.isActive && seller.roles.some((role) => ['ADMIN', 'VENDEDOR'].includes(role.role.name))
  );
  const reviewable = data && !finished;
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
      await changeImport(
        id,
        data.version,
        {
          ...changes,
          mappings: changes.mappings?.map((mapping) => ({
            ...mapping,
            remember: mapping.remember ?? remember,
            ...(mapping.advisor &&
              !mapping.currentResponsible && {
                aliases
              })
          }))
        },
        data.reviewToken
      );
      if (changes.mappings?.length) setRemember(false);
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
    setConfirming(false);
    pause.current = false;
    setProcessing(true);
    void run(async () => {
      let version = data.version;
      do {
        const progress = await confirmImport(id, version, excludePending);
        await refreshCrm();
        if (progress.status === 'COMPLETE' || progress.status === 'PARTIAL') {
          if (progress.status === 'PARTIAL')
            setMessage(
              'Se procesaron los registros válidos. Las excepciones siguen disponibles en este lote.'
            );
          else setMessage('Carga finalizada.');
          break;
        }
        version = progress.version;
      } while (!pause.current);
      if (pause.current) setMessage('Carga pausada. Podés reanudarla desde este lote.');
    }).finally(() => setProcessing(false));
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className='flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl'
        showCloseButton={!pending}
        aria-busy={pending}
      >
        <DialogHeader className='shrink-0 px-4 pt-5 pr-12 sm:px-6 sm:pr-12'>
          <DialogTitle>Importar leads desde Excel</DialogTitle>
          <DialogDescription>Cargá contactos desde una planilla de Excel.</DialogDescription>
        </DialogHeader>
        <nav aria-label='Pasos de importación' className='border-b px-4 pt-4 sm:px-6'>
          <p className='pb-3 text-sm font-medium sm:hidden' aria-current='step'>
            Paso {activeStep} de {importSteps.length} · {stepTitle}
          </p>
          <ol className='hidden grid-cols-4 gap-2 sm:grid'>
            {importSteps.map(([label], index) => (
              <li
                key={label}
                aria-current={activeStep === index + 1 ? 'step' : undefined}
                className='text-muted-foreground border-b-2 border-transparent px-2 pb-3 text-sm aria-[current=step]:border-primary aria-[current=step]:text-foreground aria-[current=step]:font-semibold'
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </nav>
        <div ref={body} className='min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6'>
          <div>
            <h2
              ref={heading}
              tabIndex={-1}
              className='focus-visible:outline-ring rounded-sm text-lg font-semibold'
            >
              {stepTitle}
            </h2>
            <p className='text-muted-foreground text-sm'>{stepDescription}</p>
          </div>
          <Feedback
            error={
              (id ? error : null) ?? preview.error ?? list.error ?? catalogs.error ?? accounts.error
            }
            message={message}
          />
          {!id && (
            <>
              <form
                id='lead-import-upload'
                onSubmit={(event) => {
                  event.preventDefault();
                  const file = new FormData(event.currentTarget).get('file');
                  if (!(file instanceof File) || !file.size) {
                    setError(new Error('Seleccioná un archivo Excel con datos.'));
                    return;
                  }
                  if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
                    setError(new Error('Seleccioná un archivo .xlsx de hasta 10 MB.'));
                    return;
                  }
                  void run(async () => {
                    setFile(file);
                    const result = await uploadImport(file, mode, configuration);
                    setId(result.id);
                    setStep(2);
                    setPage(1);
                  });
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel>Modalidad</FieldLabel>
                    <NativeSelect
                      aria-label='Modalidad de importación'
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                      disabled={pending}
                    >
                      <NativeSelectOption value='NEW'>Carga de leads nuevos</NativeSelectOption>
                      <NativeSelectOption value='HISTORICAL'>
                        Migración de histórico
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <p>
                    {mode === 'HISTORICAL'
                      ? 'Usá esta opción para migrar una cartera previa. El reparto requiere autorización y los registros sin gestión actual quedan pendientes de clasificación.'
                      : 'Usá esta opción para incorporar contactos al flujo comercial y al reparto vigente.'}
                  </p>
                  <Collapsible className='rounded-lg border'>
                    <CollapsibleTrigger
                      render={
                        <Button
                          variant='ghost'
                          className='group h-auto w-full justify-between whitespace-normal text-left'
                        />
                      }
                    >
                      {' '}
                      Configuraciones guardadas y ajustes opcionales{' '}
                      <Icons.chevronDown
                        aria-hidden
                        className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent keepMounted className='space-y-3 px-3 pb-3'>
                      <NativeSelect
                        aria-label='Reutilizar configuración'
                        defaultValue=''
                        onChange={(e) => {
                          const saved = configurations.data?.find(
                            (batch) => batch.id === e.target.value
                          );
                          if (saved?.configuration) setConfiguration(saved.configuration);
                        }}
                      >
                        <NativeSelectOption value=''>
                          Preconfiguración de los cinco adaptadores
                        </NativeSelectOption>
                        {configurations.data?.map((batch) => (
                          <NativeSelectOption key={batch.id} value={batch.id}>
                            Configuración guardada{' '}
                            {new Date(batch.createdAt).toLocaleDateString('es-AR')}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <ImportColumns
                        value={configuration}
                        onChange={setConfiguration}
                        disabled={pending}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                  <Field>
                    <FieldLabel htmlFor='import-file'>Archivo Excel</FieldLabel>
                    <Input
                      id='import-file'
                      name='file'
                      type='file'
                      accept='.xlsx'
                      required
                      aria-describedby='import-file-help'
                      disabled={pending}
                    />
                    <p id='import-file-help' className='text-muted-foreground text-sm'>
                      Formato .xlsx, hasta 10 MB y 5.000 filas candidatas. La revisión vence a las
                      24 horas para cargas nuevas y a los 90 días para migraciones históricas.
                    </p>
                    <Feedback error={error} />
                  </Field>
                </FieldGroup>
              </form>
              {list.isPending && <LoadingState label='Buscando importaciones…' rows={2} />}
              {!!list.data?.length && (
                <Collapsible className='rounded-lg border'>
                  <CollapsibleTrigger
                    render={
                      <Button
                        variant='ghost'
                        className='group h-auto w-full justify-between whitespace-normal text-left'
                      />
                    }
                  >
                    {' '}
                    Importaciones recientes{' '}
                    <Icons.chevronDown
                      aria-hidden
                      className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent keepMounted className='space-y-3 px-3 pb-3'>
                    <div className='grid gap-2'>
                      {list.data.map((batch) => (
                        <Button
                          key={batch.id}
                          variant='outline'
                          className='h-auto justify-start whitespace-normal text-left'
                          disabled={pending}
                          onClick={() => {
                            setId(batch.id);
                            setFile(null);
                            setStep(batch.status === 'REVIEW' ? 3 : 4);
                            setConfiguration(batch.configuration ?? { version: 1, sheets: {} });
                            setPage(1);
                          }}
                        >
                          {batch.fileName} ·{' '}
                          {batch.status === 'COMPLETE'
                            ? 'Finalizada'
                            : batch.status === 'IMPORTING'
                              ? 'Carga pendiente'
                              : batch.status === 'PARTIAL'
                                ? 'Parcial'
                                : 'En revisión'}{' '}
                          ·{' '}
                          {batch.status === 'REVIEW'
                            ? `0/${batch.total} cargados`
                            : resultCounts(batch.result)
                                .map(([count, label]) => `${count} ${label}`)
                                .join(' · ')}
                        </Button>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
          {id && preview.isPending && <LoadingState label='Revisando contactos…' rows={5} />}
          {id && !data && !preview.isPending && (
            <Button variant='outline' disabled={pending} onClick={() => void preview.refetch()}>
              Actualizar revisión
            </Button>
          )}
          {data && step === 1 && (
            <p className='rounded-lg border p-3 text-sm'>
              Archivo analizado: <strong className='break-all'>{data.fileName}</strong>
            </p>
          )}
          {data && step !== 1 && (
            <>
              <div
                className='flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm'
                aria-live='polite'
              >
                <strong className='w-full break-all'>{data.fileName}</strong>
                {step === 3 && (
                  <>
                    <Badge variant='secondary'>{data.summary.detected} filas detectadas</Badge>
                    <Badge variant='secondary'>
                      {data.summary.uniqueContacts} contactos estimados
                    </Badge>
                    <Badge variant='secondary'>{data.summary.creates} nuevos</Badge>
                    <Badge variant='secondary'>
                      {data.summary.updates} existentes para actualizar
                    </Badge>
                    <Badge variant='secondary'>
                      {data.summary.internalMatches} coincidencias internas
                    </Badge>
                    {data.summary.alreadyRegistered > 0 && (
                      <Badge variant='secondary'>
                        {data.summary.alreadyRegistered} ya registradas
                      </Badge>
                    )}
                    {data.summary.userOmitted > 0 && (
                      <Badge variant='secondary'>{data.summary.userOmitted} excluidas</Badge>
                    )}
                    <Badge variant='secondary'>
                      {data.summary.configuration} requieren configuración
                    </Badge>
                    <Badge variant={data.summary.contactErrors ? 'destructive' : 'secondary'}>
                      {data.summary.contactErrors} errores de contacto
                    </Badge>
                    <Badge variant='secondary'>{data.summary.review} requieren revisión</Badge>
                    <Badge variant='secondary'>
                      {data.summary.imported} apariciones procesadas
                    </Badge>
                  </>
                )}
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
              <div hidden={step !== 2} className={step === 2 ? 'space-y-4' : undefined}>
                <p className='text-muted-foreground text-sm'>
                  Hojas detectadas ({data.sheets.length}): {data.sheets.join(', ')}
                </p>
                {configurable && (
                  <Collapsible
                    defaultOpen={data.groups.some((group) => group.blocked > 0)}
                    className='rounded-lg border'
                  >
                    <CollapsibleTrigger
                      render={
                        <Button
                          variant='ghost'
                          className='group h-auto w-full justify-between whitespace-normal text-left'
                        />
                      }
                    >
                      {' '}
                      Equivalencias de origen y responsables{' '}
                      <Icons.chevronDown
                        aria-hidden
                        className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent keepMounted className='space-y-3 px-3 pb-3'>
                      <p>
                        Para procesar las filas con origen pendiente, elegí una base activa para su
                        grupo. Los grupos se ordenan por cantidad de filas bloqueadas. Podés cargar
                        las filas listas y retomar las demás después.
                      </p>
                      <label htmlFor='import-remember-mappings' className='flex items-center gap-2'>
                        <Checkbox
                          id='import-remember-mappings'
                          checked={remember}
                          onCheckedChange={(checked) => setRemember(checked)}
                        />
                        Recordar la próxima equivalencia como regla global para futuras
                        importaciones
                      </label>
                      <FieldGroup className='grid gap-3 md:grid-cols-2'>
                        {data.groups.map((group) => (
                          <Field key={`${group.sheet}:${group.group}`}>
                            <FieldLabel>
                              Origen: {group.sheet} / {group.group} ·{' '}
                              {group.blocked
                                ? `${group.blocked} apariciones bloqueadas`
                                : `${group.count} apariciones`}
                            </FieldLabel>
                            <Select
                              items={(catalogs.data?.sources ?? [])
                                .filter((source) => source.isActive)
                                .map((source) => ({ value: source.id, label: source.name }))}
                              value={group.sourceId ?? null}
                              disabled={pending}
                              onValueChange={(value) => {
                                if (value)
                                  update({
                                    mappings: [
                                      {
                                        sheet: group.sheet,
                                        group: group.group,
                                        sourceId: value
                                      }
                                    ]
                                  });
                              }}
                            >
                              <SelectTrigger
                                aria-label={`Origen ${group.sheet} ${group.group}`}
                                className='w-full'
                              >
                                <SelectValue placeholder='Confirmá un origen' />
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {catalogs.data?.sources
                                    .filter((source) => source.isActive)
                                    .map((source) => (
                                      <SelectItem key={source.id} value={source.id}>
                                        {source.name}
                                      </SelectItem>
                                    ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                        ))}
                      </FieldGroup>
                      {data.mode === 'NEW' && (
                        <fieldset>
                          <legend>Alias de asesores para relacionar juntos</legend>
                          {data.advisors.map((item) => (
                            <label
                              key={item.advisor}
                              htmlFor={'import-advisor-' + encodeURIComponent(item.advisor)}
                              className='mr-3 inline-flex gap-2'
                            >
                              <Checkbox
                                id={'import-advisor-' + encodeURIComponent(item.advisor)}
                                checked={aliases.includes(item.advisor)}
                                onCheckedChange={(checked) =>
                                  setAliases(
                                    checked
                                      ? [...aliases, item.advisor]
                                      : aliases.filter((a) => a !== item.advisor)
                                  )
                                }
                              />
                              {item.advisor} ({item.count})
                            </label>
                          ))}
                        </fieldset>
                      )}
                      {data.mode === 'HISTORICAL' && (
                        <fieldset className='flex flex-col gap-3'>
                          <legend>
                            Responsables actuales · independientes del asesor histórico
                          </legend>
                          <p>
                            El asesor histórico se conserva como procedencia. No hace falta asociar
                            sus alias a cuentas del CRM.
                          </p>
                          <p>
                            Si el Excel declara un responsable actual, confirmá su cuenta cuando no
                            se pueda identificar. Para un alta En gestión también podés autorizar el
                            reparto al revisar la fila. El reparto requiere una decisión explícita.
                            Histórico y Pendiente de clasificación quedan fuera del reparto.
                          </p>
                          {data.currentResponsibles
                            .filter((item) => item.alias)
                            .map((item) => (
                              <label
                                key={item.alias}
                                htmlFor={'import-owner-' + encodeURIComponent(item.alias)}
                                className='flex items-center gap-2'
                              >
                                <Checkbox
                                  id={'import-owner-' + encodeURIComponent(item.alias)}
                                  checked={currentAliases.includes(item.alias)}
                                  onCheckedChange={(checked) =>
                                    setCurrentAliases(
                                      checked
                                        ? [...currentAliases, item.alias]
                                        : currentAliases.filter((a) => a !== item.alias)
                                    )
                                  }
                                />{' '}
                                {item.alias} ({item.count} apariciones)
                              </label>
                            ))}
                          {data.currentResponsibles.some((item) => item.alias) && (
                            <>
                              <NativeSelect
                                aria-label='Relacionar responsables actuales'
                                value={currentOwner}
                                onChange={(e) => setCurrentOwner(e.target.value)}
                              >
                                <NativeSelectOption value=''>
                                  Elegir cuenta activa
                                </NativeSelectOption>
                                {sellers.map((s) => (
                                  <NativeSelectOption key={s.id} value={s.id}>
                                    {personName(s)}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <Button
                                disabled={pending || !currentAliases.length || !currentOwner}
                                onClick={() =>
                                  update({
                                    mappings: [
                                      {
                                        currentResponsible: true,
                                        advisor: currentAliases[0],
                                        aliases: currentAliases,
                                        assignedToId: currentOwner,
                                        remember
                                      }
                                    ]
                                  })
                                }
                              >
                                Guardar equivalencias actuales (
                                {data.currentResponsibles
                                  .filter((item) => currentAliases.includes(item.alias))
                                  .reduce((sum, item) => sum + item.count, 0)}{' '}
                                apariciones)
                              </Button>
                            </>
                          )}
                        </fieldset>
                      )}
                      <FieldGroup className='grid gap-3 md:grid-cols-2'>
                        {data.mode === 'NEW' &&
                          data.advisors.map((item) => (
                            <Field key={item.advisor}>
                              <FieldLabel>Asesor del Excel: {item.advisor}</FieldLabel>
                              <Select
                                items={[
                                  { value: 'AUTO', label: 'Reparto automático' },
                                  ...sellers.map((seller) => ({
                                    value: seller.id,
                                    label: personName(seller)
                                  }))
                                ]}
                                value={item.resolved ? (item.assignedToId ?? 'AUTO') : null}
                                disabled={pending}
                                onValueChange={(value) => {
                                  if (value)
                                    update({
                                      mappings: [
                                        {
                                          advisor: item.advisor,
                                          assignedToId: value === 'AUTO' ? null : value
                                        }
                                      ]
                                    });
                                }}
                              >
                                <SelectTrigger
                                  aria-label={`Vendedor para ${item.advisor}`}
                                  className='w-full'
                                >
                                  <SelectValue placeholder='Relacioná con un vendedor' />
                                </SelectTrigger>
                                <SelectContent alignItemWithTrigger={false}>
                                  <SelectGroup>
                                    <SelectItem value='AUTO'>Reparto automático</SelectItem>
                                    {sellers.map((seller) => (
                                      <SelectItem key={seller.id} value={seller.id}>
                                        {personName(seller)}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                          ))}
                        {data.mode === 'NEW' &&
                          data.sheets.map((sheet) => (
                            <Field key={`default:${sheet}`}>
                              <FieldLabel>
                                Responsable predeterminado de {sheet} (solo filas sin asesor)
                              </FieldLabel>
                              <Select
                                items={[
                                  { value: 'AUTO', label: 'Reparto automático' },
                                  ...sellers.map((seller) => ({
                                    value: seller.id,
                                    label: personName(seller)
                                  }))
                                ]}
                                onValueChange={(value) => {
                                  if (typeof value === 'string')
                                    update({
                                      mappings: [
                                        { sheet, assignedToId: value === 'AUTO' ? null : value }
                                      ]
                                    });
                                }}
                                disabled={pending}
                              >
                                <SelectTrigger
                                  className='w-full'
                                  aria-label={`Responsable predeterminado ${sheet}`}
                                >
                                  <SelectValue placeholder='Usar reparto o elegir responsable' />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectItem value='AUTO'>Reparto automático</SelectItem>
                                    {sellers.map((seller) => (
                                      <SelectItem key={seller.id} value={seller.id}>
                                        {personName(seller)}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                          ))}
                      </FieldGroup>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {data.status === 'REVIEW' && (
                  <>
                    <Collapsible className='rounded-lg border'>
                      <CollapsibleTrigger
                        render={
                          <Button
                            variant='ghost'
                            className='group h-auto w-full justify-between whitespace-normal text-left'
                          />
                        }
                      >
                        {' '}
                        Columnas y opciones de lectura{' '}
                        <Icons.chevronDown
                          aria-hidden
                          className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent keepMounted className='space-y-3 px-3 pb-3'>
                        <ImportColumns
                          managementValues={data.managementValues}
                          value={configuration}
                          onChange={setConfiguration}
                          disabled={pending}
                        />
                        <p>
                          Releer reemplaza las decisiones de esta revisión sin modificar contactos.
                          Se guarda la configuración para próximas cargas. Si reabriste el lote,
                          seleccioná otra vez el archivo original.
                        </p>
                        {!file && (
                          <Input
                            type='file'
                            aria-label='Archivo original para releer'
                            accept='.xlsx'
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                          />
                        )}
                        <Button
                          disabled={!file || pending}
                          variant='outline'
                          onClick={() =>
                            void run(async () => {
                              if (file)
                                await uploadImport(file, data.mode, configuration, {
                                  id,
                                  version: data.version
                                });
                            })
                          }
                        >
                          Aplicar columnas y volver a leer Excel
                        </Button>
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
                <fieldset disabled={pending || !configurable} className='flex flex-wrap gap-4'>
                  <legend className='mb-2 font-medium'>Hojas a importar</legend>
                  {data.availableSheets.map((sheet) => (
                    <label
                      key={sheet}
                      htmlFor={'import-sheet-' + encodeURIComponent(sheet)}
                      className='flex items-center gap-2'
                    >
                      <Checkbox
                        id={'import-sheet-' + encodeURIComponent(sheet)}
                        disabled={pending || !configurable}
                        checked={data.sheets.includes(sheet)}
                        onCheckedChange={(checked) => {
                          const sheets = checked
                            ? [...data.sheets, sheet]
                            : data.sheets.filter((item) => item !== sheet);
                          if (sheets.length) update({ sheets });
                        }}
                      />
                      {sheet}
                    </label>
                  ))}
                </fieldset>
              </div>
              <div hidden={step !== 3} className={step === 3 ? 'space-y-4' : undefined}>
                <Button
                  variant='ghost'
                  size='sm'
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
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      variant='outline'
                      disabled={pending || !data.summary.duplicates}
                      onClick={() => update({ duplicates: 'INCLUDE' })}
                    >
                      Consolidar coincidencias compatibles
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
                {reviewable && (
                  <Collapsible className='rounded-lg border'>
                    <CollapsibleTrigger
                      render={
                        <Button
                          variant='ghost'
                          className='group h-auto w-full justify-between whitespace-normal text-left'
                        />
                      }
                    >
                      {' '}
                      Correcciones masivas{' '}
                      <Icons.chevronDown
                        aria-hidden
                        className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent keepMounted className='space-y-3 px-3 pb-3'>
                      <p>
                        Solo se descarta un campo opcional incorrecto si queda otro contacto válido
                        y no hay conflictos de identidad. Se conserva el original en el historial de
                        importación.
                      </p>
                      <div className='flex flex-wrap gap-2'>
                        {(
                          [
                            ['INVALID_EMAIL', 'Descartar correo inválido'],
                            ['INVALID_PHONE', 'Descartar teléfono inválido'],
                            ['FORMULA_PHONE', 'Omitir fórmula de teléfono']
                          ] as const
                        ).map(([kind, label]) => (
                          <Button
                            key={kind}
                            variant='outline'
                            disabled={pending || !data.summary.cleanupCandidates[kind]}
                            onClick={() => setCleanup(kind)}
                          >
                            {label} ({data.summary.cleanupCandidates[kind]})
                          </Button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {cleanup && (
                  <Dialog
                    open
                    onOpenChange={(open) => {
                      if (!open) setCleanup(undefined);
                    }}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmar corrección masiva</DialogTitle>
                        <DialogDescription>
                          Se quitará el campo opcional incorrecto de{' '}
                          {data.summary.cleanupCandidates[cleanup]} apariciones. El valor original
                          se conservará como procedencia histórica. No se fusionarán identidades ni
                          se cambiarán leads existentes en esta etapa.
                        </DialogDescription>
                      </DialogHeader>
                      <Button
                        onClick={() => {
                          update({ bulkCleanup: cleanup });
                          setCleanup(undefined);
                        }}
                      >
                        Aplicar corrección a la revisión
                      </Button>
                      <Button variant='outline' onClick={() => setCleanup(undefined)}>
                        Cancelar
                      </Button>
                    </DialogContent>
                  </Dialog>
                )}
                {data.summary.requiresReview && (
                  <Alert>
                    <AlertDescription>
                      Hay coincidencias nuevas contra el CRM. Revisá los motivos de las filas antes
                      de continuar.
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
                <div className='flex flex-wrap gap-2'>
                  <NativeSelect
                    aria-label='Filtrar hoja'
                    value={selection.sheet ?? ''}
                    onChange={(e) => {
                      setSelection({ ...selection, sheet: e.target.value || undefined });
                      setPage(1);
                      setSelectedIds([]);
                    }}
                  >
                    <NativeSelectOption value=''>Todas las hojas</NativeSelectOption>
                    {data.availableSheets.map((sheet) => (
                      <NativeSelectOption key={sheet} value={sheet}>
                        {sheet}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label='Filtrar clasificación'
                    value={selection.portfolioClass ?? ''}
                    onChange={(e) => {
                      setSelection({ ...selection, portfolioClass: e.target.value || undefined });
                      setPage(1);
                      setSelectedIds([]);
                    }}
                  >
                    <NativeSelectOption value=''>Todas las clasificaciones</NativeSelectOption>
                    {[
                      ['ACTIVE', 'En gestión'],
                      ['HISTORICAL', 'Histórico'],
                      ['UNCLASSIFIED', 'Pendiente de clasificación'],
                      ['UNKNOWN', 'Valor desconocido']
                    ].map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label='Grupo de problemas'
                    value={selection.problem ?? 'ALL'}
                    onChange={(e) => {
                      setSelection({ ...selection, problem: e.target.value });
                      setFilter('ALL');
                      setPage(1);
                      setSelectedIds([]);
                    }}
                  >
                    <NativeSelectOption value='ALL'>Todos los problemas</NativeSelectOption>
                    {[
                      ['CONFIGURATION', 'Configuración pendiente'],
                      ['CONTACT', 'Nombre o contacto incorrecto'],
                      ['IDENTITY', 'Conflicto de identidad'],
                      ['OWNER', 'Responsable sin resolver'],
                      ['CLASSIFICATION', 'Clasificación pendiente']
                    ].map(([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label} ({data.problems[value] ?? 0})
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <ImportBulk
                  key={`${data.version}:${filter}:${JSON.stringify(selection)}`}
                  data={data}
                  selection={{ ...selection, actionFilter: filter }}
                  selectedIds={selectedIds}
                  sellers={sellers}
                  pending={pending}
                  update={update}
                />
                <Select
                  items={[
                    { value: 'REVIEW', label: 'Necesitan revisión' },
                    { value: 'ALL', label: 'Todos' },
                    { value: 'CREATE', label: 'Listos para crear' },
                    { value: 'UPDATE', label: 'Listos para actualizar' },
                    { value: 'MERGE', label: 'Apariciones para consolidar' },
                    { value: 'DUPLICATES', label: 'Duplicados' },
                    { value: 'SKIP', label: 'Omitidos' }
                  ]}
                  value={filter}
                  onValueChange={(value) => {
                    if (value) {
                      setFilter(value as ImportFilter);
                      setSelectedIds([]);
                      setPage(1);
                      setEditing(null);
                    }
                  }}
                >
                  <SelectTrigger aria-label='Filtrar revisión'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[
                        ['REVIEW', 'Necesitan revisión'],
                        ['ALL', 'Todos'],
                        ['CREATE', 'Listos para crear'],
                        ['UPDATE', 'Listos para actualizar'],
                        ['MERGE', 'Apariciones para consolidar'],
                        ['DUPLICATES', 'Duplicados'],
                        ['SKIP', 'Omitidos']
                      ].map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {data.rowTotal === 0 ? (
                  <EmptyState
                    title='No hay filas en este filtro'
                    description='Revisá el resumen o elegí Todos.'
                  />
                ) : (
                  <CrmTable label='Tabla de revisión de la importación'>
                    <TableHeader className='bg-muted'>
                      <TableRow>
                        <TableHead scope='col'>Fila</TableHead>
                        <TableHead scope='col'>Contacto</TableHead>
                        <TableHead scope='col'>Revisión</TableHead>
                        <TableHead scope='col'>Carga</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map((row) => (
                        <TableRow
                          key={row.id}
                          data-state={selectedIds.includes(row.id) ? 'selected' : undefined}
                        >
                          <TableCell>
                            {!row.leadId && !row.replay && row.active && (
                              <Checkbox
                                aria-label={`Seleccionar ${row.sheet} fila ${row.rowNumber}`}
                                checked={selectedIds.includes(row.id)}
                                onCheckedChange={(checked) =>
                                  setSelectedIds(
                                    checked
                                      ? [...selectedIds, row.id]
                                      : selectedIds.filter((id) => id !== row.id)
                                  )
                                }
                              />
                            )}
                            {row.sheet}
                            <br />
                            {row.rowNumber}
                            {!row.active && <p>Hoja excluida</p>}
                          </TableCell>
                          <TableCell>
                            <strong>{row.name || 'Nombre por resolver'}</strong>
                            <p>
                              {
                                {
                                  ACTIVE: 'En gestión',
                                  HISTORICAL: 'Histórico',
                                  UNCLASSIFIED: 'Pendiente de clasificación'
                                }[row.portfolioClass ?? 'UNCLASSIFIED']
                              }
                            </p>
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
                            {row.requiresReview
                              ? 'Coincidencia pendiente de revisión'
                              : row.leadId
                                ? 'Procesado'
                                : row.state === 'CONFIGURATION'
                                  ? 'Requiere configuración'
                                  : row.state === 'CORRECTION'
                                    ? 'Requiere corrección'
                                    : row.action === 'CREATE'
                                      ? 'Listo para importar'
                                      : row.action === 'UPDATE'
                                        ? 'Listo para actualizar'
                                        : row.action === 'MERGE'
                                          ? 'Listo para consolidar'
                                          : row.replay && row.active && row.decision !== 'OMIT'
                                            ? 'Ya importado: sin cambios'
                                            : 'Excluida'}
                            {!row.leadId && !row.replay && row.active && reviewable && (
                              <div className='mt-2 flex flex-wrap gap-2'>
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
                                          decision: row.action === 'SKIP' ? 'INCLUDE' : 'OMIT',
                                          acknowledgeDuplicates: true
                                        },
                                        data.reviewToken
                                      );
                                    })
                                  }
                                >
                                  {row.action === 'SKIP' ? 'Restaurar revisión' : 'Omitir'}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </CrmTable>
                )}
                <div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
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
                  <section
                    className='rounded-md border p-4'
                    aria-label={`Revisar fila ${editing.rowNumber}`}
                  >
                    <h3>
                      Revisar fila {editing.rowNumber} · {editing.sheet}
                    </h3>
                    <Feedback error={error} />
                    <ImportComparison row={editing} statuses={catalogs.data?.statuses ?? []} />
                    <Collapsible className='rounded-lg border'>
                      <CollapsibleTrigger
                        render={
                          <Button
                            variant='ghost'
                            className='group h-auto w-full justify-between whitespace-normal text-left'
                          />
                        }
                      >
                        {' '}
                        Datos históricos de la fila{' '}
                        <Icons.chevronDown
                          aria-hidden
                          className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent keepMounted className='space-y-3 px-3 pb-3'>
                        {(
                          [
                            ['originalDate', 'Fecha original'],
                            ['schedule', 'Horario'],
                            ['segment', 'Segmento / régimen'],
                            ['originalAdvisor', 'Asesor original'],
                            ['currentManagement', 'Gestión actual declarada'],
                            ['currentResponsible', 'Responsable actual declarado'],
                            ['originalLastManaged', 'Última gestión declarada (no actividad CRM)'],
                            ['originalPhone', 'Teléfono original'],
                            ['nameColumns', 'Columnas de procedencia']
                          ] as const
                        ).map(([key, label]) => (
                          <p key={key}>
                            {label}: {editing.metadata[key] || 'Sin dato'}
                          </p>
                        ))}
                        {editing.metadata.reviewedOriginal && (
                          <div>
                            <strong>Valores descartados con autorización</strong>
                            {Object.entries(editing.metadata.reviewedOriginal).map(
                              ([field, value]) => (
                                <p key={field}>
                                  {field === 'email'
                                    ? 'Correo'
                                    : field === 'phone'
                                      ? 'Teléfono'
                                      : 'Fórmula omitida'}
                                  : {String(value || 'Sin valor de texto')}
                                </p>
                              )
                            )}
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                    <ImportRowEditor
                      key={`${editing.id}:${data.version}`}
                      row={editing}
                      catalogs={catalogs.data}
                      sellers={sellers}
                      pending={pending}
                      save={save}
                      close={() => setEditing(null)}
                    />
                  </section>
                )}
              </div>
              <div hidden={step !== 4} className={step === 4 ? 'space-y-4' : undefined}>
                {(data.status !== 'REVIEW' || finished) && (
                  <section aria-label='Resultado acumulado del lote' className='grid gap-2'>
                    <h3 className='font-semibold'>Resultado acumulado del lote</h3>
                    {noWork && (
                      <p role='status'>
                        {data.result.alreadyRegistered} filas ya registradas. No se modificaron
                        leads.
                      </p>
                    )}
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                      {resultCounts(data.result).map(([count, label]) => (
                        <Card key={label} size='sm'>
                          <CardContent>
                            <p className='text-muted-foreground text-sm capitalize'>{label}</p>
                            <p className='text-xl font-semibold tabular-nums'>{count}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}
                {!finished && (data.status === 'REVIEW' || data.summary.pending > 0) && (
                  <section aria-label='Lo que se va a procesar' className='grid gap-2'>
                    <h3 className='font-semibold'>Lo que se va a procesar</h3>
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                      {[
                        ['Altas previstas', data.summary.creates],
                        ['Actualizaciones previstas', data.summary.updates],
                        ['Consolidaciones previstas', data.summary.merged],
                        [
                          'Exclusiones previstas',
                          data.summary.userOmitted + (excludePending ? data.summary.review : 0)
                        ],
                        ['Ya registradas', data.summary.alreadyRegistered],
                        ['Quedarán pendientes', excludePending ? 0 : data.summary.review]
                      ].map(([label, count]) => (
                        <Card key={label} size='sm'>
                          <CardContent>
                            <p className='text-muted-foreground text-sm'>{label}</p>
                            <p className='text-xl font-semibold tabular-nums'>{count}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    {data.mode === 'HISTORICAL' && (
                      <p>
                        Altas por clasificación: {data.summary.portfolio.ACTIVE ?? 0} En gestión,{' '}
                        {data.summary.portfolio.HISTORICAL ?? 0} históricas,{' '}
                        {data.summary.portfolio.UNCLASSIFIED ?? 0} pendientes. Repartos autorizados
                        de migración: {data.summary.distribution}. Las altas históricas no cuentan
                        como captación nueva. Solo En gestión entra al pipeline; ninguna importación
                        crea ventas. Los contactos existentes conservan su gestión.
                      </p>
                    )}
                  </section>
                )}
                {reviewable && data.summary.review > 0 && (
                  <p>
                    Podés retomar las {data.summary.review} filas que requieren revisión hasta el{' '}
                    {new Date(data.expiresAt).toLocaleDateString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires'
                    })}
                    .
                  </p>
                )}
                {reviewable && data.summary.review > 0 && (
                  <label htmlFor='import-exclude-pending' className='flex items-center gap-2'>
                    <Checkbox
                      id='import-exclude-pending'
                      checked={excludePending}
                      onCheckedChange={(checked) => setExcludePending(checked)}
                      disabled={pending}
                    />
                    Excluir explícitamente las {data.summary.review} filas pendientes
                  </label>
                )}
                {confirming && (
                  <Dialog open onOpenChange={setConfirming}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmar modificaciones</DialogTitle>
                        <DialogDescription>
                          {data.summary.creates} nuevos leads; {data.summary.updates} contactos
                          existentes actualizados; {data.summary.merged} apariciones consolidadas;{' '}
                          {data.summary.userOmitted + (excludePending ? data.summary.review : 0)}{' '}
                          excluidas; {data.summary.alreadyRegistered} ya registradas.
                          {!excludePending &&
                            data.summary.review > 0 &&
                            ` Quedan ${data.summary.review} pendientes para retomar.`}
                        </DialogDescription>
                      </DialogHeader>
                      <Button onClick={start}>Confirmar y procesar</Button>
                      <Button variant='outline' onClick={() => setConfirming(false)}>
                        Volver a revisar
                      </Button>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </>
          )}
        </div>
        {!id && (
          <footer className='flex shrink-0 justify-end border-t px-4 py-3 sm:px-6'>
            <LoadingButton
              type='submit'
              form='lead-import-upload'
              loading={pending}
              loadingLabel='Analizando archivo…'
            >
              Analizar archivo
            </LoadingButton>
          </footer>
        )}
        {id && (
          <footer className='shrink-0 space-y-2 border-t px-4 py-3 sm:px-6'>
            {step === 4 && reviewable && data.summary.unreviewedReady > 0 && (
              <p className='text-muted-foreground text-sm'>
                Revisá los cambios de los contactos existentes antes de importar.
              </p>
            )}
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Button
                variant='ghost'
                disabled={pending}
                onClick={() => {
                  setId('');
                  setStep(1);
                  setFile(null);
                  setEditing(null);
                  setExcludePending(false);
                  setSelectedIds([]);
                  setFilter('REVIEW');
                  setSelection({});
                  setMessage('');
                  setError(null);
                }}
              >
                Volver a importaciones
              </Button>
              <div className='flex flex-wrap gap-2'>
                {reviewable &&
                  step > 1 &&
                  data.status !== 'IMPORTING' &&
                  !processing &&
                  !(step === 4 && data.status === 'PARTIAL') && (
                    <Button variant='outline' disabled={pending} onClick={() => setStep(step - 1)}>
                      Atrás
                    </Button>
                  )}
                {reviewable && step < 4 && (
                  <Button disabled={pending || !!editing} onClick={() => setStep(step + 1)}>
                    {step === 1
                      ? 'Continuar a configuración'
                      : step === 2
                        ? 'Continuar a revisión'
                        : 'Ver resumen'}
                  </Button>
                )}
                {data && step === 4 && data.imported > 0 && !pending && (
                  <Button variant='outline' onClick={() => onViewBatch(data.id)}>
                    Ver leads del lote
                  </Button>
                )}
                {reviewable && step === 4 && data.status === 'PARTIAL' && !pending && (
                  <Button
                    variant='outline'
                    onClick={() => {
                      setFilter('REVIEW');
                      setPage(1);
                      setStep(3);
                    }}
                  >
                    Retomar revisión
                  </Button>
                )}
                {reviewable &&
                  step === 4 &&
                  (data.summary.pending > 0 ||
                    excludePending ||
                    (!data.summary.review && data.summary.userOmitted > 0)) && (
                    <LoadingButton
                      loading={processing}
                      loadingLabel='Procesando…'
                      disabled={pending || data.summary.unreviewedReady > 0 || !!editing}
                      onClick={() => setConfirming(true)}
                    >
                      {data.status === 'IMPORTING' ? 'Reanudar importación' : 'Importar registros'}
                    </LoadingButton>
                  )}
                {processing && (
                  <Button
                    variant='outline'
                    onClick={() => {
                      pause.current = true;
                    }}
                  >
                    Pausar después del bloque actual
                  </Button>
                )}
                {!pending && (finished || (data?.status === 'PARTIAL' && step === 4)) && (
                  <Button
                    variant={data?.status === 'PARTIAL' ? 'outline' : 'default'}
                    onClick={onClose}
                  >
                    Cerrar
                  </Button>
                )}
              </div>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
