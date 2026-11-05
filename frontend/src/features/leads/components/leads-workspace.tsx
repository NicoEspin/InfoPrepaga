'use client';

import { useState } from 'react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconEye,
  IconMail,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSelector,
  IconUpload,
  IconX
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { CrmContent } from '@/components/layout/crm-content';
import { demoSellers, leadSources, leadStatuses, type LeadPreview } from '../data/demo-leads';
import { LeadPhoneCell } from './lead-phone-cell';

const statusTone: Record<LeadPreview['status'], string> = {
  Nuevo: 'new',
  Contactado: 'contacted',
  'En seguimiento': 'following',
  'Propuesta enviada': 'proposal',
  Cerrado: 'closed'
};
const columns = [
  ['name', 'Nombre'],
  ['email', 'Contacto'],
  ['source', 'Origen'],
  ['status', 'Estado'],
  ['seller', 'Vendedor'],
  ['lastActivity', 'Última actividad']
] as const;
type SortKey = (typeof columns)[number][0];
const activityFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const pageSize = 8;

function LeadFilter({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className='lead-filter'>
      <span id={`filter-${label}`}>{label}</span>
      <Select value={value} onValueChange={(next) => onChange(next ?? 'Todos')}>
        <SelectTrigger aria-labelledby={`filter-${label}`} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {['Todos', ...options].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function LeadsWorkspace({ leads }: { leads: LeadPreview[] }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ Estado: 'Todos', Origen: 'Todos', Vendedor: 'Todos' });
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const { openLead } = useLeadProfile();
  const filtered = leads.filter(
    (lead) =>
      (filters.Estado === 'Todos' || lead.status === filters.Estado) &&
      (filters.Origen === 'Todos' || lead.source === filters.Origen) &&
      (filters.Vendedor === 'Todos' || lead.seller === filters.Vendedor) &&
      normalize([lead.name, lead.company, lead.email, lead.phone].join(' ')).includes(
        normalize(search.trim())
      )
  );
  if (sort)
    filtered.sort(
      (a, b) =>
        a[sort.key].localeCompare(b[sort.key], 'es', { numeric: true }) * (sort.descending ? -1 : 1)
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const allSelected = visible.length > 0 && visible.every((lead) => selected.includes(lead.id));
  function changeFilter(key: keyof typeof filters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
    setSelected([]);
  }
  function resetFilters() {
    setFilters({ Estado: 'Todos', Origen: 'Todos', Vendedor: 'Todos' });
    setSearch('');
    setPage(1);
    setSelected([]);
  }

  return (
    <CrmContent>
      <div id='leads-content' tabIndex={-1} className='leads-content'>
        <div className='leads-heading'>
          <h1>Gestión de leads</h1>
          <p>Administrá todos tus prospectos desde un solo lugar</p>
        </div>
        <p className='leads-demo-note'>
          <span /> Vista previa · Datos sintéticos. Los cambios no se guardan.
        </p>
        <div className='leads-toolbar'>
          <InputGroup className='leads-search'>
            <InputGroupAddon>
              <IconSearch aria-hidden='true' />
            </InputGroupAddon>
            <InputGroupInput
              aria-label='Buscar leads'
              placeholder='Buscar por nombre, contacto o empresa'
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                setSelected([]);
              }}
            />
          </InputGroup>
          <LeadFilter
            label='Estado'
            value={filters.Estado}
            options={leadStatuses}
            onChange={(value) => changeFilter('Estado', value)}
          />
          <LeadFilter
            label='Origen'
            value={filters.Origen}
            options={leadSources}
            onChange={(value) => changeFilter('Origen', value)}
          />
          <LeadFilter
            label='Vendedor'
            value={filters.Vendedor}
            options={demoSellers}
            onChange={(value) => changeFilter('Vendedor', value)}
          />
          <div className='leads-toolbar-actions' title='Disponible al conectar la API de leads'>
            <Button variant='outline' size='lg' disabled>
              <IconUpload data-icon='inline-start' />
              Importar Excel
            </Button>
            <Button size='lg' disabled>
              <IconPlus data-icon='inline-start' />
              Nuevo lead
            </Button>
          </div>
        </div>
        <div className='leads-summary' role='status' aria-live='polite'>
          <strong>{filtered.length} registros</strong>
          <span className='leads-filter-caption'>Filtros activos:</span>
          {Object.entries(filters)
            .filter(([, value]) => value !== 'Todos')
            .map(([key, value]) => (
              <Button
                key={key}
                variant='secondary'
                size='sm'
                onClick={() => changeFilter(key as keyof typeof filters, 'Todos')}
                aria-label={`Quitar filtro ${key}: ${value}`}
              >
                {key}: {value}
                <IconX />
              </Button>
            ))}
          {search ? (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => {
                setSearch('');
                setPage(1);
                setSelected([]);
              }}
              aria-label='Quitar búsqueda'
            >
              Búsqueda: {search}
              <IconX />
            </Button>
          ) : null}
          {!search && Object.values(filters).every((value) => value === 'Todos') ? (
            <span>Sin filtros aplicados</span>
          ) : (
            <Button variant='ghost' size='sm' onClick={resetFilters}>
              Limpiar filtros
            </Button>
          )}
          {selected.length > 0 ? (
            <span className='leads-selection'>{selected.length} seleccionados</span>
          ) : null}
        </div>
        <div className='leads-table'>
          <Table>
            <caption className='sr-only'>Listado de leads de demostración</caption>
            <TableHeader>
              <TableRow>
                <TableHead className='leads-check'>
                  <Checkbox
                    aria-label='Seleccionar página actual'
                    checked={allSelected}
                    indeterminate={
                      !allSelected && visible.some((lead) => selected.includes(lead.id))
                    }
                    disabled={visible.length === 0}
                    onCheckedChange={(checked) =>
                      setSelected((previous) =>
                        checked
                          ? [...new Set([...previous, ...visible.map((lead) => lead.id)])]
                          : previous.filter((id) => !visible.some((lead) => lead.id === id))
                      )
                    }
                  />
                </TableHead>
                {columns.map(([key, label]) => (
                  <TableHead
                    key={key}
                    aria-sort={
                      sort?.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    <button
                      className='leads-sort'
                      onClick={() =>
                        setSort({ key, descending: sort?.key === key ? !sort.descending : false })
                      }
                    >
                      {label}
                      <IconSelector aria-hidden='true' />
                    </button>
                  </TableHead>
                ))}
                <TableHead className='leads-actions-heading'>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((lead) => (
                <TableRow
                  key={lead.id}
                  data-state={selected.includes(lead.id) ? 'selected' : undefined}
                >
                  <TableCell className='leads-check'>
                    <Checkbox
                      aria-label={`Seleccionar a ${lead.name}`}
                      checked={selected.includes(lead.id)}
                      onCheckedChange={(checked) =>
                        setSelected((previous) =>
                          checked ? [...previous, lead.id] : previous.filter((id) => id !== lead.id)
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <button className='lead-name' onClick={() => openLead(lead.id)}>
                      {lead.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className='lead-contact'>
                      <LeadPhoneCell phone={lead.phone} />
                      <span>
                        <IconMail aria-hidden='true' />
                        {lead.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{lead.source}</TableCell>
                  <TableCell>
                    <Badge
                      variant='secondary'
                      className='lead-status'
                      data-tone={statusTone[lead.status]}
                    >
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.seller}</TableCell>
                  <TableCell>
                    <time dateTime={lead.lastActivity}>
                      {activityFormat.format(new Date(lead.lastActivity))}
                    </time>
                  </TableCell>
                  <TableCell>
                    <div className='lead-actions'>
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`Ver a ${lead.name}`}
                        onClick={() => openLead(lead.id)}
                      >
                        <IconEye />
                      </Button>
                      <span title='Edición pendiente de conexión a la API'>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          disabled
                          aria-label={`Editar a ${lead.name} (próximamente)`}
                        >
                          <IconPencil />
                        </Button>
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`Más acciones para ${lead.name}`}
                            />
                          }
                        >
                          <IconDotsVertical />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => openLead(lead.id)}>
                              Ver datos de ejemplo
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>Reasignar (próximamente)</DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Empty className='py-16'>
                      <EmptyHeader>
                        <EmptyMedia variant='icon'>
                          <IconSearch />
                        </EmptyMedia>
                        <EmptyTitle>No encontramos leads</EmptyTitle>
                        <EmptyDescription>
                          Probá con otra búsqueda o quitá los filtros aplicados.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button variant='outline' onClick={resetFilters}>
                        Limpiar filtros
                      </Button>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <footer className='leads-pagination'>
          <p>
            Mostrando {filtered.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, filtered.length)} de {filtered.length}
          </p>
          <nav aria-label='Paginación de leads'>
            <Button
              variant='outline'
              size='icon'
              aria-label='Página anterior'
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <IconChevronLeft />
            </Button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
              <Button
                key={number}
                variant={page === number ? 'secondary' : 'outline'}
                size='icon'
                aria-label={`Página ${number}`}
                aria-current={page === number ? 'page' : undefined}
                onClick={() => setPage(number)}
              >
                {number}
              </Button>
            ))}
            <Button
              variant='outline'
              size='icon'
              aria-label='Página siguiente'
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              <IconChevronRight />
            </Button>
          </nav>
        </footer>
        <p className='leads-pending'>
          Creación, edición e importación disponibles al conectar la API de leads.
        </p>
      </div>
    </CrmContent>
  );
}
