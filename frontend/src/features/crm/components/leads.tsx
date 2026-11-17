'use client';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDebounce } from '@/hooks/use-debounce';
import { CrmContent } from '@/components/layout/crm-content';
import { CrmPageHeader } from '@/components/layout/crm-page-header';
import { Icons } from '@/components/icons';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';
import {
  type Catalogs,
  type Identity,
  type Lead,
  type Page,
  type Seller,
  personName,
  queryString,
  useCrmQuery,
  useIdentity
} from '../api';
import { EmptyState, Feedback, LoadingState, Pagination, RefreshButton } from './shared';
import { LeadForm } from './lead-form';
import { LeadPhoneCell } from '@/features/leads/components/lead-phone-cell';
import { PortfolioActions } from './portfolio-actions';
import { CrmTable } from './crm-table';

const defaultFilters = {
  portfolioClass: 'ACTIVE',
  importBatchId: '',
  status: '',
  sourceId: '',
  assignedToId: '',
  unassigned: '',
  sort: 'createdAt',
  direction: 'desc'
};
const portfolioLabels = {
  ACTIVE: 'En gestión',
  HISTORICAL: 'Histórico',
  UNCLASSIFIED: 'Pendiente de clasificación'
};
const filterClass = 'min-w-0 space-y-1 text-sm font-medium';

const LeadImportDialog = dynamic(
  () => import('@/features/lead-imports/components/lead-import-dialog')
);
const format = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires'
});
export function CommercialLeads({ actor }: { actor: Identity }) {
  const identity = useIdentity(actor);
  const user = identity.data ?? actor;
  const admin = user.roles.includes('ADMIN');
  const { openLead } = useLeadProfile();
  const [selected, setSelected] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const results = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ lead?: Lead } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const catalogs = useCrmQuery<Catalogs>(user.id, 'catalogs');
  const sellers = useCrmQuery<Seller[]>(user.id, 'users', admin);
  const leads = useCrmQuery<Page<Lead>>(
    user.id,
    `leads?${queryString({ ...filters, importBatchId: admin ? filters.importBatchId : '', q, page, pageSize: 20 })}`
  );
  function filter(key: keyof typeof filters, value: string) {
    setSelected([]);
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  const hasFilters =
    Boolean(search || q) ||
    (Object.keys(defaultFilters) as (keyof typeof defaultFilters)[]).some(
      (key) => filters[key] !== defaultFilters[key]
    );
  function resetFilters() {
    setSearch('');
    setFilters(defaultFilters);
    setSelected([]);
    setPage(1);
  }
  function rememberFocus(trigger: HTMLElement) {
    returnFocus.current = trigger;
  }
  function restoreFocus() {
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    });
  }
  return (
    <CrmContent>
      <div className='grid min-w-0 gap-5 px-4 pt-4 pb-6 sm:px-6'>
        <CrmPageHeader
          title='Gestión de leads'
          description={
            admin
              ? 'Administrá tu cartera y el reparto comercial.'
              : 'Tus prospectos asignados y su seguimiento.'
          }
          actions={
            admin && (
              <>
                <Button
                  variant='outline'
                  onClick={(event) => {
                    rememberFocus(event.currentTarget);
                    setImportOpen(true);
                  }}
                >
                  Importar Excel
                </Button>
                <Button
                  disabled={!catalogs.data}
                  onClick={(event) => {
                    rememberFocus(event.currentTarget);
                    setEditor({});
                  }}
                >
                  Nuevo lead
                </Button>
              </>
            )
          }
        />
        <fieldset className='bg-card min-w-0 space-y-3 rounded-lg border p-3 sm:p-4'>
          <legend className='sr-only'>Filtros de leads</legend>
          <div className='grid grid-cols-2 items-end gap-3 lg:grid-cols-3 xl:grid-cols-6'>
            <label htmlFor='leads-search' className={`${filterClass} col-span-2 xl:col-span-2`}>
              <span>Buscar leads</span>
              <Input
                id='leads-search'
                ref={searchInput}
                type='search'
                placeholder='Nombre, contacto o empresa'
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label htmlFor='leads-portfolio' className={filterClass}>
              <span>Cartera</span>
              <NativeSelect
                id='leads-portfolio'
                className='w-full'
                value={filters.portfolioClass}
                onChange={(event) => filter('portfolioClass', event.target.value)}
              >
                <NativeSelectOption value='ACTIVE'>En gestión</NativeSelectOption>
                <NativeSelectOption value='HISTORICAL'>Histórico</NativeSelectOption>
                <NativeSelectOption value='UNCLASSIFIED'>Por clasificar</NativeSelectOption>
                <NativeSelectOption value='ALL'>Todos</NativeSelectOption>
              </NativeSelect>
            </label>
            <label htmlFor='leads-status' className={filterClass}>
              <span>Estado</span>
              <NativeSelect
                id='leads-status'
                className='w-full'
                value={filters.status}
                onChange={(event) => filter('status', event.target.value)}
              >
                <NativeSelectOption value=''>Todos los estados</NativeSelectOption>
                {catalogs.data?.statuses.map((status) => (
                  <NativeSelectOption key={status.id} value={status.id}>
                    {status.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label htmlFor='leads-source' className={filterClass}>
              <span>Origen</span>
              <NativeSelect
                id='leads-source'
                className='w-full'
                value={filters.sourceId}
                onChange={(event) => filter('sourceId', event.target.value)}
              >
                <NativeSelectOption value=''>Todos los orígenes</NativeSelectOption>
                {catalogs.data?.sources.map((source) => (
                  <NativeSelectOption key={source.id} value={source.id}>
                    {source.name}
                    {source.isActive ? '' : ' (inactivo)'}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {admin && (
              <label htmlFor='leads-owner' className={filterClass}>
                <span>Responsable</span>
                <NativeSelect
                  id='leads-owner'
                  className='w-full'
                  value={filters.assignedToId}
                  onChange={(event) => filter('assignedToId', event.target.value)}
                >
                  <NativeSelectOption value=''>Todos</NativeSelectOption>
                  {sellers.data
                    ?.filter((seller) =>
                      seller.roles.some((role) => ['ADMIN', 'VENDEDOR'].includes(role.role.name))
                    )
                    .map((seller) => (
                      <NativeSelectOption key={seller.id} value={seller.id}>
                        {personName(seller)}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </label>
            )}
          </div>
          <div className='flex flex-wrap items-end gap-3'>
            <label htmlFor='leads-sort' className={filterClass}>
              <span>Ordenar leads</span>
              <NativeSelect
                id='leads-sort'
                value={`${filters.sort}:${filters.direction}`}
                onChange={(event) => {
                  const [sort, direction] = event.target.value.split(':');
                  setFilters((previous) => ({ ...previous, sort, direction }));
                  setPage(1);
                }}
              >
                <NativeSelectOption value='createdAt:desc'>Más recientes</NativeSelectOption>
                <NativeSelectOption value='createdAt:asc'>Más antiguos</NativeSelectOption>
                <NativeSelectOption value='name:asc'>Nombre A–Z</NativeSelectOption>
                <NativeSelectOption value='name:desc'>Nombre Z–A</NativeSelectOption>
                <NativeSelectOption value='updatedAt:desc'>Última actividad</NativeSelectOption>
              </NativeSelect>
            </label>
            {admin && (
              <label htmlFor='leads-unassigned' className='flex min-h-8 items-center gap-2 text-sm'>
                <Checkbox
                  id='leads-unassigned'
                  checked={filters.unassigned === 'true'}
                  onCheckedChange={(checked) => filter('unassigned', checked ? 'true' : '')}
                />
                Sin asignar
              </label>
            )}
            <div className='flex flex-wrap items-center gap-2 sm:ml-auto'>
              {hasFilters && (
                <Button
                  variant='ghost'
                  onClick={() => {
                    searchInput.current?.focus();
                    resetFilters();
                  }}
                >
                  Limpiar filtros
                </Button>
              )}
              <RefreshButton fetching={leads.isFetching} onRefresh={() => void leads.refetch()} />
            </div>
          </div>
        </fieldset>
        <Feedback
          error={identity.error ?? leads.error ?? catalogs.error ?? (admin ? sellers.error : null)}
          onRetry={() => {
            void identity.refetch();
            void leads.refetch();
            void catalogs.refetch();
            if (admin) void sellers.refetch();
          }}
          retrying={
            identity.isFetching ||
            leads.isFetching ||
            catalogs.isFetching ||
            (admin && sellers.isFetching)
          }
        />
        <section
          ref={results}
          aria-label='Resultados de leads'
          tabIndex={-1}
          className='focus-visible:outline-ring min-w-0 space-y-3 rounded-lg'
        >
          {admin && filters.importBatchId && (
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>Leads del lote</Badge>
              <Button size='sm' variant='ghost' onClick={resetFilters}>
                Quitar filtro de lote
              </Button>
            </div>
          )}
          {admin && selected.length > 0 && (
            <PortfolioActions
              selected={selected}
              done={async () => {
                setSelected([]);
                await leads.refetch();
              }}
            />
          )}
          {leads.isPending ? (
            <LoadingState label='Cargando leads…' rows={5} />
          ) : leads.isError ? null : (
            <>
              {leads.data.items.length === 0 ? (
                <EmptyState
                  title={hasFilters ? 'No encontramos leads' : 'Todavía no hay leads en gestión'}
                  description={
                    hasFilters
                      ? 'Probá otra búsqueda o limpiá los filtros.'
                      : admin
                        ? 'Creá un lead o importá un archivo para empezar.'
                        : 'Tus prospectos van a aparecer acá cuando se te asignen.'
                  }
                />
              ) : (
                <CrmTable label='Tabla de leads'>
                  <TableHeader className='bg-muted'>
                    <TableRow>
                      {admin && (
                        <TableHead scope='col' className='w-10'>
                          <span className='sr-only'>Selección</span>
                        </TableHead>
                      )}
                      {['Nombre', 'Estado', 'Responsable', 'Contacto', 'Origen', 'Actualizado'].map(
                        (label) => (
                          <TableHead key={label} scope='col'>
                            {label}
                          </TableHead>
                        )
                      )}
                      <TableHead scope='col' className='w-12'>
                        <span className='sr-only'>Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.data.items.map((lead) => {
                      const checked = selected.some((item) => item.id === lead.id);
                      return (
                        <TableRow key={lead.id} data-state={checked ? 'selected' : undefined}>
                          {admin && (
                            <TableCell className='px-3'>
                              <Checkbox
                                aria-label={`Seleccionar ${lead.name}`}
                                checked={checked}
                                onCheckedChange={(checked) =>
                                  setSelected((previous) =>
                                    checked
                                      ? [...previous, lead]
                                      : previous.filter((item) => item.id !== lead.id)
                                  )
                                }
                              />
                            </TableCell>
                          )}
                          <TableCell className='w-60 min-w-48 whitespace-normal'>
                            <div className='space-y-1'>
                              <Button
                                variant='link'
                                className='h-auto min-h-7 max-w-full justify-start px-0 text-left break-words whitespace-normal'
                                onClick={() => openLead(lead.id)}
                              >
                                {lead.name}
                              </Button>
                              <div className='flex flex-wrap gap-1'>
                                <Badge variant='outline' className='h-auto whitespace-normal'>
                                  {portfolioLabels[lead.portfolioClass ?? 'ACTIVE']}
                                </Badge>
                                {lead.intakeMode === 'HISTORICAL' && (
                                  <Badge variant='outline'>Migración</Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant='secondary'>
                              {catalogs.data?.statuses.find((status) => status.id === lead.status)
                                ?.name ?? lead.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{personName(lead.assignedTo)}</TableCell>
                          <TableCell>
                            <LeadPhoneCell phone={lead.phone} />
                            <div className='text-muted-foreground'>
                              {lead.email ?? 'Sin correo'}
                            </div>
                          </TableCell>
                          <TableCell>{lead.source.name}</TableCell>
                          <TableCell className='text-muted-foreground tabular-nums'>
                            {format.format(new Date(lead.updatedAt))}
                          </TableCell>
                          <TableCell className='text-right'>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                aria-label={`Acciones de ${lead.name}`}
                                render={<Button variant='ghost' size='icon' />}
                                id={`lead-actions-${lead.id}`}
                              >
                                <Icons.dots aria-hidden='true' />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end'>
                                <DropdownMenuGroup>
                                  <DropdownMenuItem
                                    disabled={!catalogs.data}
                                    onClick={() => {
                                      const trigger = document.getElementById(
                                        `lead-actions-${lead.id}`
                                      );
                                      if (trigger) rememberFocus(trigger);
                                      setEditor({ lead });
                                    }}
                                  >
                                    Editar lead
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </CrmTable>
              )}
              {(leads.data.total > 0 || page > 1) && (
                <Pagination
                  page={page}
                  total={leads.data.total}
                  pageSize={20}
                  onPage={(nextPage) => {
                    results.current?.focus({ preventScroll: true });
                    setPage(nextPage);
                  }}
                  busy={leads.isFetching}
                />
              )}
            </>
          )}
        </section>
        {admin && importOpen && (
          <LeadImportDialog
            actorId={user.id}
            onViewBatch={(id) => {
              setImportOpen(false);
              setSelected([]);
              setSearch('');
              setFilters({ ...defaultFilters, portfolioClass: 'ALL', importBatchId: id });
              setPage(1);
              requestAnimationFrame(() => results.current?.focus());
            }}
            onClose={() => {
              setImportOpen(false);
              restoreFocus();
            }}
          />
        )}
        {editor && catalogs.data && (
          <LeadForm
            lead={editor.lead}
            catalogs={catalogs.data}
            admin={admin}
            onClose={() => {
              setEditor(null);
              restoreFocus();
            }}
          />
        )}
      </div>
    </CrmContent>
  );
}
