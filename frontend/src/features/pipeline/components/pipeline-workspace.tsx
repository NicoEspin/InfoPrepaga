'use client';

import { useRef, useState } from 'react';
import type { UniqueIdentifier } from '@dnd-kit/core';
import { IconAdjustmentsHorizontal, IconPlus, IconSearch } from '@tabler/icons-react';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Kanban, KanbanBoard, KanbanColumn, KanbanOverlay } from '@/components/ui/kanban';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';

import { PipelineCard } from './pipeline-card';
import {
  sellers,
  sources,
  stages,
  type OpportunityPreview,
  type PipelineColumns,
  type StageId
} from '../data/demo-opportunities';
import './pipeline.css';

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
});
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const all = 'Todos';

function PipelineFilter({
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
  const id = `pipeline-filter-${normalize(label).replaceAll(' ', '-')}`;
  return (
    <Field className='pipeline-filter'>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next ?? all)}>
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {[all, ...options].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function PipelineWorkspace({
  initialColumns,
  referenceDate
}: {
  initialColumns: PipelineColumns;
  referenceDate: string;
}) {
  const [columns, setColumns] = useState(initialColumns);
  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState(all);
  const [source, setSource] = useState(all);
  const [date, setDate] = useState(all);
  const [priority, setPriority] = useState(all);
  const [moreFilters, setMoreFilters] = useState(false);
  const { openLead } = useLeadProfile();
  const [message, setMessage] = useState('');
  const beforeDrag = useRef(columns);
  const dayStart = new Date(`${referenceDate}T00:00:00-03:00`).getTime();
  const hasFilters =
    search !== '' || [seller, source, date, priority].some((value) => value !== all);
  function matches(opportunity: OpportunityPreview) {
    const timestamp = opportunity.nextActivity
      ? new Date(opportunity.nextActivity).getTime()
      : null;
    const dayEnd = dayStart + 86400000;
    const dateMatches =
      date === all ||
      (date === 'Sin actividad' && timestamp === null) ||
      (timestamp !== null &&
        ((date === 'Vencidas' && timestamp < dayStart) ||
          (date === 'Hoy' && timestamp >= dayStart && timestamp < dayEnd) ||
          (date === 'Próximos 7 días' &&
            timestamp >= dayEnd &&
            timestamp < dayEnd + 7 * 86400000)));
    return (
      (seller === all || opportunity.seller === seller) &&
      (source === all || opportunity.source === source) &&
      (priority === all || opportunity.priority === priority) &&
      dateMatches &&
      normalize(`${opportunity.name} ${opportunity.company}`).includes(normalize(search.trim()))
    );
  }
  const filtered = Object.fromEntries(
    stages.map(({ id }) => [id, columns[id].filter(matches)])
  ) as PipelineColumns;
  const total = Object.values(filtered).flat().length;
  const allCount = Object.values(columns).flat().length;
  function move(id: string, target: StageId) {
    const opportunity = Object.values(columns)
      .flat()
      .find((item) => item.id === id);
    if (!opportunity) return;
    setColumns(
      (previous) =>
        Object.fromEntries(
          stages.map(({ id: stage }) => [
            stage,
            stage === target
              ? [...previous[stage].filter((item) => item.id !== id), opportunity]
              : previous[stage].filter((item) => item.id !== id)
          ])
        ) as PipelineColumns
    );
    setMessage(
      `${opportunity.name}: ${stages.find((stage) => stage.id === target)?.label}. Cambio temporal.`
    );
  }
  function updateVisible(next: Record<UniqueIdentifier, OpportunityPreview[]>) {
    // Drag only changes matching cards; keep every filtered-out opportunity.
    const visibleIds = new Set(
      Object.values(filtered)
        .flat()
        .map((item) => item.id)
    );
    setColumns(
      (previous) =>
        Object.fromEntries(
          stages.map(({ id }) => [
            id,
            [...(next[id] ?? []), ...previous[id].filter((item) => !visibleIds.has(item.id))]
          ])
        ) as PipelineColumns
    );
  }
  function clearFilters() {
    setSearch('');
    setSeller(all);
    setSource(all);
    setDate(all);
    setPriority(all);
  }

  return (
    <CrmContent
      search={
        <InputGroup className='pipeline-search'>
          <InputGroupAddon>
            <IconSearch aria-hidden='true' />
          </InputGroupAddon>
          <InputGroupInput
            aria-label='Buscar oportunidades'
            placeholder='Buscar contactos, empresas u oportunidades...'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
      }
    >
      <div className='pipeline-content'>
        <div className='pipeline-heading'>
          <div className='leads-heading'>
            <h1>Pipeline comercial</h1>
            <p>Visualizá y gestioná cada oportunidad de venta.</p>
          </div>
          <span title='Disponible al conectar la API de oportunidades'>
            <Button size='lg' disabled>
              <IconPlus data-icon='inline-start' />
              Nueva oportunidad
            </Button>
          </span>
        </div>
        <p className='leads-demo-note'>
          <span />
          Vista previa · Datos e importes sintéticos. Los movimientos no se guardan.
        </p>

        <FieldGroup className='pipeline-filters'>
          <div className='pipeline-total' role='status' aria-live='polite'>
            <span>{hasFilters ? 'Oportunidades filtradas' : 'Total de oportunidades'}</span>
            <strong>{total}</strong>
            {hasFilters ? <small>de {allCount} en total</small> : null}
          </div>
          <PipelineFilter label='Vendedor' value={seller} options={sellers} onChange={setSeller} />
          <PipelineFilter
            label='Fecha de próxima actividad'
            value={date}
            options={['Vencidas', 'Hoy', 'Próximos 7 días', 'Sin actividad']}
            onChange={setDate}
          />
          <PipelineFilter
            label='Origen del contacto'
            value={source}
            options={sources}
            onChange={setSource}
          />
          <Button
            variant='outline'
            className='pipeline-more'
            aria-expanded={moreFilters}
            aria-controls='pipeline-extra-filters'
            onClick={() => setMoreFilters(!moreFilters)}
          >
            <IconAdjustmentsHorizontal />
            {priority !== all ? `Prioridad: ${priority}` : 'Más filtros'}
          </Button>
        </FieldGroup>
        <div id='pipeline-extra-filters' hidden={!moreFilters}>
          <FieldGroup className='pipeline-extra'>
            <PipelineFilter
              label='Prioridad'
              value={priority}
              options={['Alta', 'Media', 'Baja']}
              onChange={setPriority}
            />
            <Button variant='ghost' onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </FieldGroup>
        </div>
        <div className='pipeline-instructions'>
          <span>
            Arrastrá desde el ícono de agarre o usá el menú de la tarjeta para cambiar de etapa.
          </span>
          {hasFilters ? (
            <Button size='sm' variant='ghost' onClick={clearFilters}>
              Limpiar filtros
            </Button>
          ) : null}
        </div>
        {total === 0 ? (
          <Empty className='pipeline-empty'>
            <EmptyHeader>
              <EmptyTitle>No encontramos oportunidades</EmptyTitle>
              <EmptyDescription>Probá con otra búsqueda o quitá los filtros.</EmptyDescription>
            </EmptyHeader>
            <Button variant='outline' onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </Empty>
        ) : null}
        <div className='pipeline-scroll' role='region' aria-label='Tablero Kanban de oportunidades'>
          <Kanban
            value={filtered}
            onValueChange={updateVisible}
            getItemValue={(item) => item.id}
            onDragStart={() => {
              beforeDrag.current = columns;
            }}
            onDragCancel={() => {
              setColumns(beforeDrag.current);
              setMessage('Movimiento cancelado.');
            }}
            onDragEnd={({ active, over }) => {
              if (!over) {
                setColumns(beforeDrag.current);
                setMessage('Movimiento cancelado.');
                return;
              }
              const name = Object.values(columns)
                .flat()
                .find((item) => item.id === active.id)?.name;
              setMessage(`${name ?? 'Oportunidad'}: movimiento temporal realizado.`);
            }}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  'Para mover una oportunidad, presioná espacio en el agarre, usá las flechas y confirmá con espacio. Escape cancela. También podés usar el menú Acciones de la tarjeta.'
              }
            }}
          >
            <KanbanBoard className='pipeline-board'>
              {stages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  value={stage.id}
                  className='pipeline-column'
                  data-stage={stage.id}
                  aria-label={`Etapa ${stage.label}`}
                >
                  <div className='pipeline-column-heading'>
                    <div>
                      <h2>
                        <span />
                        {stage.label}
                      </h2>
                      <span
                        className='pipeline-count'
                        aria-label={`${filtered[stage.id].length} oportunidades`}
                      >
                        {filtered[stage.id].length}
                      </span>
                    </div>
                    <p aria-label={`Importe ilustrativo de ${stage.label}`}>
                      {currency.format(
                        filtered[stage.id].reduce((sum, item) => sum + item.amount, 0)
                      )}
                    </p>
                  </div>
                  <div className='pipeline-column-cards'>
                    {filtered[stage.id].map((opportunity) => (
                      <PipelineCard
                        key={opportunity.id}
                        opportunity={opportunity}
                        stage={stage.id}
                        onMove={move}
                        onDetail={(opportunity) => openLead(opportunity.leadId)}
                      />
                    ))}
                    {filtered[stage.id].length === 0 ? (
                      <p className='pipeline-column-empty'>Sin oportunidades en esta etapa</p>
                    ) : null}
                  </div>
                </KanbanColumn>
              ))}
            </KanbanBoard>
            <KanbanOverlay>
              {({ value }) => {
                const opportunity = Object.values(columns)
                  .flat()
                  .find((item) => item.id === value);
                if (!opportunity) return null;
                return (
                  <div className='pipeline-drag-preview'>
                    <strong>{opportunity.name}</strong>
                    <span>{opportunity.company}</span>
                  </div>
                );
              }}
            </KanbanOverlay>
          </Kanban>
        </div>
        <p className='pipeline-feedback' role='status' aria-live='polite'>
          {message}
        </p>
        <p className='leads-pending'>
          Importes ilustrativos en ARS. Creación y persistencia pendientes de la API comercial.
        </p>
      </div>
    </CrmContent>
  );
}
