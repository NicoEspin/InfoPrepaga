'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useDebounce } from '@/hooks/use-debounce';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [filters, setFilters] = useState({
    status: '',
    sourceId: '',
    assignedToId: '',
    unassigned: '',
    sort: 'createdAt',
    direction: 'desc'
  });
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ lead?: Lead } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const catalogs = useCrmQuery<Catalogs>(user.id, 'catalogs');
  const sellers = useCrmQuery<Seller[]>(user.id, 'users', admin);
  const leads = useCrmQuery<Page<Lead>>(
    user.id,
    `leads?${queryString({ ...filters, q, page, pageSize: 20 })}`
  );
  function filter(key: keyof typeof filters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  return (
    <CrmContent>
      <div className='leads-content'>
        <div className='leads-heading'>
          <h1>Gestión de leads</h1>
          <p>
            {admin
              ? 'Administrá tu cartera y el reparto comercial.'
              : 'Tus prospectos asignados y su seguimiento.'}
          </p>
        </div>
        <div className='leads-toolbar'>
          <Input
            aria-label='Buscar leads'
            placeholder='Nombre, contacto o empresa'
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <NativeSelect
            aria-label='Estado'
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
          <NativeSelect
            aria-label='Origen'
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
          {admin && (
            <>
              <NativeSelect
                aria-label='Responsable'
                value={filters.assignedToId}
                onChange={(event) => filter('assignedToId', event.target.value)}
              >
                <NativeSelectOption value=''>Todos los responsables</NativeSelectOption>
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
              <label className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={filters.unassigned === 'true'}
                  onChange={(event) => filter('unassigned', event.target.checked ? 'true' : '')}
                />
                Sin asignar
              </label>
            </>
          )}
          {admin && (
            <Button variant='outline' onClick={() => setImportOpen(true)}>
              Importar Excel
            </Button>
          )}
          {admin && (
            <Button disabled={!catalogs.data} onClick={() => setEditor({})}>
              Nuevo lead
            </Button>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-3 py-3'>
          <NativeSelect
            aria-label='Ordenar leads'
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
          <RefreshButton fetching={leads.isFetching} onRefresh={() => void leads.refetch()} />
        </div>
        <Feedback
          error={identity.error ?? leads.error ?? catalogs.error ?? (admin ? sellers.error : null)}
          onRetry={() => {
            void identity.refetch();
            void leads.refetch();
            void catalogs.refetch();
            if (admin) void sellers.refetch();
          }}
          retrying={leads.isFetching || catalogs.isFetching}
        />
        {leads.isPending ? (
          <LoadingState label='Cargando leads…' rows={5} />
        ) : leads.isError ? null : (
          <>
            <div className='leads-table'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Nombre',
                      'Contacto',
                      'Origen',
                      'Estado',
                      'Responsable',
                      'Actualizado',
                      'Acciones'
                    ].map((label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.data.items.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <button className='lead-name' onClick={() => openLead(lead.id)}>
                          {lead.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <LeadPhoneCell phone={lead.phone} />
                        <div>{lead.email ?? 'Sin correo'}</div>
                      </TableCell>
                      <TableCell>{lead.source.name}</TableCell>
                      <TableCell>
                        <Badge variant='secondary'>
                          {catalogs.data?.statuses.find((status) => status.id === lead.status)
                            ?.name ?? lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{personName(lead.assignedTo)}</TableCell>
                      <TableCell>{format.format(new Date(lead.updatedAt))}</TableCell>
                      <TableCell>
                        <Button
                          variant='outline'
                          disabled={!catalogs.data}
                          onClick={() => setEditor({ lead })}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!leads.data.items.length && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState
                          title='No encontramos leads'
                          description='Probá otra búsqueda o quitá los filtros. Si todavía no tenés asignaciones, tu cartera aparecerá aquí cuando recibas un lead.'
                          onReset={() => {
                            setSearch('');
                            setFilters({
                              status: '',
                              sourceId: '',
                              assignedToId: '',
                              unassigned: '',
                              sort: 'createdAt',
                              direction: 'desc'
                            });
                            setPage(1);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination
              page={page}
              total={leads.data.total}
              pageSize={20}
              onPage={setPage}
              busy={leads.isFetching}
            />
          </>
        )}
        {admin && importOpen && (
          <LeadImportDialog actorId={user.id} onClose={() => setImportOpen(false)} />
        )}
        {editor && catalogs.data && (
          <LeadForm
            lead={editor.lead}
            catalogs={catalogs.data}
            admin={admin}
            onClose={() => setEditor(null)}
          />
        )}
      </div>
    </CrmContent>
  );
}
