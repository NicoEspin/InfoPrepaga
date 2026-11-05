'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CrmContent } from '@/components/layout/crm-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { useLeadProfile } from '@/features/lead-profile/components/lead-profile-provider';
import { useDebounce } from '@/hooks/use-debounce';
import {
  type Catalogs,
  type Identity,
  type Seller,
  personName,
  useCrmQuery
} from '@/features/crm/api';
import { Feedback, LoadingState, Pagination, EmptyState } from '@/features/crm/components/shared';
import { pipelineQuery } from '../api/queries';
import { moveStage } from '../api/service';
import { stages, type PipelineLead, type Stage } from '../api/types';
import './pipeline.css';

export function CommercialPipeline({ actor }: { actor: Identity }) {
  const admin = actor.roles.includes('ADMIN');
  const client = useQueryClient();
  const { openLead } = useLeadProfile();
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [source, setSource] = useState('');
  const [owner, setOwner] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    q,
    sourceId: source,
    assignedToId: owner,
    stage,
    page: String(page),
    pageSize: '50'
  });
  for (const key of ['q', 'sourceId', 'assignedToId', 'stage']) {
    if (!query.get(key)) query.delete(key);
  }
  const leads = useQuery(pipelineQuery(actor.id, query.toString()));
  const catalogs = useCrmQuery<Catalogs>(actor.id, 'catalogs');
  const users = useCrmQuery<Seller[]>(actor.id, 'users', admin);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [correction, setCorrection] = useState<{ lead: PipelineLead; stage: Stage } | null>(null);
  const [reason, setReason] = useState('');
  async function move(lead: PipelineLead, target: Stage, correctionReason?: string) {
    if (lead.commercialStage === target || lock.current) return;
    if (lead.commercialStage === 'CLOSED' && !correctionReason) {
      if (admin) {
        setCorrection({ lead, stage: target });
        setReason('');
      }
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await moveStage(lead.id, lead.version, target, correctionReason);
      setCorrection(null);
      setMessage(`${lead.name}: ${stages[target]}. Movimiento guardado.`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['pipeline', actor.id] }),
        client.invalidateQueries({ queryKey: ['crm', actor.id] })
      ]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('No se pudo mover el lead'));
      await leads.refetch();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <CrmContent>
      <div className='pipeline-content flex flex-col gap-4'>
        <div className='pipeline-heading'>
          <div className='leads-heading'>
            <h1>Pipeline comercial</h1>
            <p>Un recorrido por lead. Entrar en Cerrado registra una venta ganada.</p>
          </div>
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <Field>
            <FieldLabel htmlFor='pipeline-search'>Buscar lead</FieldLabel>
            <Input
              id='pipeline-search'
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='pipeline-source'>Origen</FieldLabel>
            <NativeSelect
              id='pipeline-source'
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value=''>Todos</NativeSelectOption>
              {catalogs.data?.sources.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                  {s.isActive ? '' : ' (inactivo)'}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {admin && (
            <Field>
              <FieldLabel htmlFor='pipeline-owner'>Responsable</FieldLabel>
              <NativeSelect
                id='pipeline-owner'
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  setPage(1);
                }}
              >
                <NativeSelectOption value=''>Todos</NativeSelectOption>
                {users.data?.map((u) => (
                  <NativeSelectOption key={u.id} value={u.id}>
                    {personName(u)}
                    {u.isActive ? '' : ' (inactivo)'}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor='pipeline-stage'>Etapa</FieldLabel>
            <NativeSelect
              id='pipeline-stage'
              value={stage}
              onChange={(e) => {
                setStage(e.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value=''>Todas</NativeSelectOption>
              {Object.entries(stages).map(([k, v]) => (
                <NativeSelectOption key={k} value={k}>
                  {v}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Feedback
          error={error ?? leads.error}
          message={message}
          pending={busy}
          onRetry={() => void leads.refetch()}
        />
        <p className='pipeline-instructions'>
          Los estados de contacto son independientes de estas etapas. Solo ADMIN puede corregir un
          cierre. El responsable de la venta es quien tenía asignado el lead.
        </p>
        {leads.isPending ? (
          <LoadingState />
        ) : (
          leads.data && (
            <>
              <p role='status'>{leads.data.total} leads · Se muestran hasta 50 por página.</p>
              {!leads.data.total ? (
                <EmptyState title='Sin leads' description='No hay leads para estos filtros.' />
              ) : (
                <div
                  className='pipeline-scroll'
                  role='region'
                  aria-label='Tablero comercial con desplazamiento horizontal'
                >
                  <div className='pipeline-board'>
                    {Object.entries(stages).map(([key, label]) => {
                      const items = leads.data.items.filter((l) => l.commercialStage === key);
                      return (
                        <section
                          key={key}
                          className='pipeline-column'
                          data-stage={key === 'FOLLOW_UP' ? 'following' : key.toLowerCase()}
                          aria-label={label}
                        >
                          <div className='pipeline-column-heading'>
                            <div>
                              <h2>
                                <span />
                                {label}
                              </h2>
                              <span className='pipeline-count'>{items.length}</span>
                            </div>
                            <p>En esta página</p>
                          </div>
                          <div className='pipeline-column-cards'>
                            {items.map((l) => (
                              <Card key={l.id} className='pipeline-card'>
                                <CardHeader>
                                  <CardTitle>
                                    <button
                                      type='button'
                                      className='text-left break-words underline-offset-2 hover:underline'
                                      onClick={() => openLead(l.id)}
                                    >
                                      {l.name}
                                    </button>
                                  </CardTitle>
                                  {l.company && <CardDescription>{l.company}</CardDescription>}
                                </CardHeader>
                                <CardContent className='flex flex-col gap-2'>
                                  <p className='text-muted-foreground text-sm'>
                                    {l.source.name} ·{' '}
                                    {l.assignedTo
                                      ? [l.assignedTo.firstName, l.assignedTo.lastName]
                                          .filter(Boolean)
                                          .join(' ') || 'Responsable asignado'
                                      : 'Sin asignar'}
                                  </p>
                                  <NativeSelect
                                    aria-label={`Etapa de ${l.name}`}
                                    value={l.commercialStage}
                                    disabled={busy || (l.commercialStage === 'CLOSED' && !admin)}
                                    onChange={(e) => void move(l, e.target.value as Stage)}
                                  >
                                    {Object.entries(stages).map(([k, v]) => (
                                      <NativeSelectOption key={k} value={k}>
                                        {v}
                                      </NativeSelectOption>
                                    ))}
                                  </NativeSelect>
                                </CardContent>
                              </Card>
                            ))}
                            {!items.length && (
                              <p className='pipeline-column-empty'>Sin leads en esta página.</p>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
              <Pagination
                page={page}
                total={leads.data.total}
                pageSize={50}
                busy={busy}
                onPage={setPage}
              />
            </>
          )
        )}
        <Dialog
          open={!!correction}
          onOpenChange={(open) => {
            if (!open && !busy) setCorrection(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Corregir cierre</DialogTitle>
              <DialogDescription>
                Reabrir elimina la venta vigente desde este movimiento. El cierre previo se conserva
                para cortes históricos.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor='correction-reason'>Motivo de la corrección</FieldLabel>
              <Input
                id='correction-reason'
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button variant='outline' disabled={busy} onClick={() => setCorrection(null)}>
                Cancelar
              </Button>
              <Button
                disabled={busy || !reason.trim()}
                onClick={() => correction && void move(correction.lead, correction.stage, reason)}
              >
                Guardar corrección
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CrmContent>
  );
}
