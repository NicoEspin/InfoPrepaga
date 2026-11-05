'use client';

import { useState } from 'react';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDatabase,
  IconDots,
  IconEye,
  IconFileText,
  IconFilter,
  IconHistory,
  IconInfoCircle,
  IconSearch,
  IconSelector,
  IconShield,
  IconUpload
} from '@tabler/icons-react';
import { CrmContent } from '@/components/layout/crm-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { AvalianDetailDialog, AvalianImportPreview, type AvalianDetail } from './avalian-dialogs';
import {
  appendSimulatedBatch,
  createSimulatedBatch,
  filterRecords,
  getBatches,
  importDate,
  importTime,
  recordStatuses,
  sortRecords,
  type AvalianBatchPreview,
  type AvalianRecordPreview,
  type RecordSortKey
} from '../data/records';
import './avalian.css';

const columns = [
  ['name', 'Nombre'],
  ['internalId', 'Identificador interno'],
  ['status', 'Estado del registro'],
  ['importedAt', 'Fecha de importación'],
  ['observations', 'Observaciones']
] as const;
const pageSize = 10;

export function AvalianWorkspace({ initialRecords }: { initialRecords: AvalianRecordPreview[] }) {
  const [records, setRecords] = useState(initialRecords);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Todos');
  const [batchId, setBatchId] = useState('Todos');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: RecordSortKey; descending: boolean } | null>(null);
  const [detail, setDetail] = useState<AvalianDetail | null>(null);
  const [preview, setPreview] = useState<AvalianBatchPreview | null>(null);
  const [lastSimulation, setLastSimulation] = useState<AvalianBatchPreview | null>(null);
  const [message, setMessage] = useState('');
  const batches = getBatches(records);
  const latest = batches[0];
  const reviewCount = records.filter((record) => record.status === 'En revisión').length;
  const matching = filterRecords(records, { search, status, batchId });
  const ordered = sort ? sortRecords(matching, sort.key, sort.descending) : matching;
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = ordered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = search !== '' || status !== 'Todos' || batchId !== 'Todos';
  const filterCount = Number(status !== 'Todos') + Number(batchId !== 'Todos');
  function clearFilters() {
    setSearch('');
    setStatus('Todos');
    setBatchId('Todos');
    setPage(1);
  }
  function confirmSimulation() {
    if (!preview) return;
    setRecords((previous) => appendSimulatedBatch(previous, preview));
    setLastSimulation(preview);
    setPreview(null);
    setPage(1);
    setMessage(
      `${preview.records.length} registros ficticios agregados a la vista. Los filtros actuales pueden ocultarlos. No se importaron datos reales.`
    );
  }
  return (
    <CrmContent>
      <div className='avalian-content'>
        <div className='avalian-layout'>
          <div className='avalian-main-column'>
            <div className='leads-heading'>
              <h1>Cartera Avalian</h1>
              <p>Administración y consulta de registros importados.</p>
            </div>
            <p className='leads-demo-note'>
              <span />
              Vista previa · Datos sintéticos · Módulo independiente de los leads.
            </p>
            <div className='avalian-metrics'>
              <Card className='avalian-metric'>
                <span className='avalian-metric-icon'>
                  <IconDatabase aria-hidden='true' />
                </span>
                <CardHeader>
                  <CardTitle>Registros importados</CardTitle>
                </CardHeader>
                <CardContent>
                  <strong>{records.length.toLocaleString('es-AR')}</strong>
                  <p>Total de registros en la vista</p>
                </CardContent>
              </Card>
              <Card className='avalian-metric'>
                <span className='avalian-metric-icon'>
                  <IconCalendar aria-hidden='true' />
                </span>
                <CardHeader>
                  <CardTitle>Última importación</CardTitle>
                </CardHeader>
                <CardContent>
                  <strong className='avalian-date-metric'>
                    {latest ? importDate(latest.importedAt) : 'Sin importaciones'}
                  </strong>
                  <p>
                    {latest
                      ? `${importTime(latest.importedAt)} hs · Lote de ejemplo`
                      : 'Todavía no hay lotes'}
                  </p>
                </CardContent>
              </Card>
              <Card className='avalian-metric' data-tone='review'>
                <span className='avalian-metric-icon'>
                  <IconFileText aria-hidden='true' />
                </span>
                <CardHeader>
                  <CardTitle>Registros para revisión</CardTitle>
                </CardHeader>
                <CardContent>
                  <strong>
                    {reviewCount}
                    {reviewCount > 0 ? (
                      <IconAlertTriangle aria-label='Pendientes de revisión' />
                    ) : null}
                  </strong>
                  <button
                    onClick={() => {
                      setSearch('');
                      setBatchId('Todos');
                      setStatus('En revisión');
                      setFiltersOpen(true);
                      setPage(1);
                    }}
                  >
                    Requieren validación manual
                  </button>
                </CardContent>
              </Card>
            </div>
            <section className='avalian-table-panel' aria-labelledby='avalian-records-heading'>
              <div className='avalian-table-toolbar'>
                <h2 id='avalian-records-heading'>Registros importados</h2>
                <div>
                  <InputGroup className='avalian-search'>
                    <InputGroupAddon>
                      <IconSearch aria-hidden='true' />
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label='Buscar registros de Avalian'
                      placeholder='Buscar por nombre o identificador...'
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                    />
                  </InputGroup>
                  <Button
                    variant='outline'
                    aria-controls='avalian-filters'
                    aria-expanded={filtersOpen}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                  >
                    <IconFilter />
                    Filtros{filterCount > 0 ? <span>({filterCount})</span> : null}
                  </Button>
                </div>
              </div>
              <div id='avalian-filters' hidden={!filtersOpen}>
                <FieldGroup className='avalian-filters'>
                  <Field>
                    <FieldLabel htmlFor='avalian-status'>Estado del registro</FieldLabel>
                    <NativeSelect
                      id='avalian-status'
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                      }}
                    >
                      {['Todos', ...recordStatuses].map((value) => (
                        <NativeSelectOption key={value}>{value}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor='avalian-batch'>Lote de importación</FieldLabel>
                    <NativeSelect
                      id='avalian-batch'
                      value={batchId}
                      onChange={(event) => {
                        setBatchId(event.target.value);
                        setPage(1);
                      }}
                    >
                      <NativeSelectOption>Todos</NativeSelectOption>
                      {batches.map((batch) => (
                        <NativeSelectOption key={batch.id} value={batch.id}>
                          {batch.id}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button variant='ghost' onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                </FieldGroup>
              </div>
              {hasFilters ? (
                <div className='avalian-filter-summary' role='status' aria-live='polite'>
                  <span>
                    {matching.length} registros coincidentes
                    {status !== 'Todos' ? ` · ${status}` : ''}
                    {batchId !== 'Todos' ? ` · ${batchId}` : ''}
                  </span>
                  <Button size='sm' variant='ghost' onClick={clearFilters}>
                    Limpiar búsqueda y filtros
                  </Button>
                </div>
              ) : null}
              <Table>
                <caption className='sr-only'>Registros sintéticos importados de Avalian</caption>
                <TableHeader>
                  <TableRow>
                    {columns.map(([key, label]) => (
                      <TableHead
                        key={key}
                        aria-sort={
                          sort?.key === key
                            ? sort.descending
                              ? 'descending'
                              : 'ascending'
                            : 'none'
                        }
                      >
                        <button
                          className='avalian-sort'
                          onClick={() => {
                            setSort({
                              key,
                              descending: sort?.key === key ? !sort.descending : false
                            });
                            setPage(1);
                          }}
                        >
                          {label}
                          <IconSelector aria-hidden='true' />
                        </button>
                      </TableHead>
                    ))}
                    <TableHead>
                      <span className='sr-only'>Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <button
                          className='avalian-record-name'
                          onClick={() => setDetail({ kind: 'record', record })}
                        >
                          {record.name}
                        </button>
                      </TableCell>
                      <TableCell>{record.internalId}</TableCell>
                      <TableCell>
                        <Badge
                          variant='secondary'
                          className='avalian-record-status'
                          data-status={record.status}
                        >
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <time dateTime={record.importedAt}>
                          {importDate(record.importedAt)} {importTime(record.importedAt)}
                        </time>
                      </TableCell>
                      <TableCell className='avalian-observations'>{record.observations}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-xs'
                                aria-label={`Acciones del registro ${record.internalId}`}
                              />
                            }
                          >
                            <IconDots />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => setDetail({ kind: 'record', record })}
                              >
                                <IconEye />
                                Consultar registro
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  const batch = batches.find((item) => item.id === record.batchId);
                                  if (batch) setDetail({ kind: 'batch', batch });
                                }}
                              >
                                <IconHistory />
                                Ver lote de importación
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visible.length ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Empty className='py-16'>
                          <EmptyHeader>
                            <EmptyTitle>No encontramos registros</EmptyTitle>
                            <EmptyDescription>
                              Probá con otro nombre, identificador o filtro.
                            </EmptyDescription>
                          </EmptyHeader>
                          <Button variant='outline' onClick={clearFilters}>
                            Restablecer listado
                          </Button>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <footer className='avalian-pagination'>
                <p role='status' aria-live='polite'>
                  Mostrando {ordered.length ? (currentPage - 1) * pageSize + 1 : 0} a{' '}
                  {Math.min(currentPage * pageSize, ordered.length)} de {ordered.length} registros
                </p>
                <nav aria-label='Paginación de registros de Avalian'>
                  <Button
                    variant='outline'
                    size='icon-sm'
                    aria-label='Página anterior de Avalian'
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <IconChevronLeft />
                  </Button>
                  {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                    <Button
                      key={number}
                      variant={currentPage === number ? 'secondary' : 'outline'}
                      size='icon-sm'
                      aria-label={`Página ${number} de Avalian`}
                      aria-current={currentPage === number ? 'page' : undefined}
                      onClick={() => setPage(number)}
                    >
                      {number}
                    </Button>
                  ))}
                  <Button
                    variant='outline'
                    size='icon-sm'
                    aria-label='Página siguiente de Avalian'
                    disabled={currentPage === pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <IconChevronRight />
                  </Button>
                </nav>
              </footer>
            </section>
          </div>
          <Card className='avalian-import-panel'>
            <CardHeader>
              <span className='avalian-import-icon'>
                <IconFileText aria-hidden='true' />
              </span>
              <CardTitle>Importación de datos</CardTitle>
              <CardDescription>
                Prepará la revisión de registros de Avalian mediante un canal de importación
                autorizado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Separator />
              <div className='avalian-import-info'>
                <IconCalendar aria-hidden='true' />
                <div>
                  <span>Última importación de ejemplo</span>
                  <strong>
                    {latest
                      ? `${importDate(latest.importedAt)}, ${importTime(latest.importedAt)} hs`
                      : 'Sin importaciones'}
                  </strong>
                </div>
              </div>
              <Separator />
              <div className='avalian-import-info'>
                <IconShield aria-hidden='true' />
                <div>
                  <span>Estado de la vista previa</span>
                  <div className='avalian-import-state' role='status' aria-live='polite'>
                    <IconCheck aria-hidden='true' />
                    <div>
                      <strong>
                        {lastSimulation ? 'Simulación completada' : 'Lote de ejemplo cargado'}
                      </strong>
                      <p>
                        {lastSimulation
                          ? `${lastSimulation.records.length} registros ficticios agregados a la vista.`
                          : latest
                            ? `${latest.records.length} registros sintéticos en el último lote.`
                            : 'La vista no tiene lotes.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <Button
                className='avalian-import-button'
                onClick={() => setPreview(createSimulatedBatch(records, new Date().toISOString()))}
              >
                <IconUpload data-icon='inline-start' />
                Importar registros autorizados
              </Button>
              <p className='avalian-import-caption'>
                Abrí la vista previa de un lote ficticio para probar el flujo.
              </p>
              <Button
                variant='outline'
                className='w-full'
                onClick={() => setDetail({ kind: 'history' })}
              >
                <IconHistory />
                Ver historial de lotes
              </Button>
              <div className='avalian-import-help'>
                <IconInfoCircle aria-hidden='true' />
                <p>
                  La carga de archivos reales y la importación asistida requieren autorización y
                  validación técnica. Esta demo no realiza sincronizaciones externas.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <p className='avalian-feedback' role='status' aria-live='polite'>
          {message}
        </p>
      </div>
      {detail ? (
        <AvalianDetailDialog
          key={
            detail.kind === 'record'
              ? detail.record.id
              : detail.kind === 'batch'
                ? detail.batch.id
                : 'history'
          }
          detail={detail}
          batches={batches}
          onClose={() => setDetail(null)}
        />
      ) : null}
      {preview ? (
        <AvalianImportPreview
          key={preview.id}
          batch={preview}
          onClose={() => setPreview(null)}
          onConfirm={confirmSimulation}
        />
      ) : null}
    </CrmContent>
  );
}
