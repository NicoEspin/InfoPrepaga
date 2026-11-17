import { CrmTable } from '@/features/crm/components/crm-table';
import type { ReactNode, Ref } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { stageNames, type Snapshot } from '../api/types';
export const money = (v: string | null) =>
  v === null
    ? 'No informada'
    : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(v));
const percent = (v: string | null) =>
  v === null
    ? 'Sin datos'
    : new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Number(v)
      ) + ' %';
const cost = (v: string | null) => (v === null ? 'Sin datos' : money(v));
export const timestamp = (v: string) =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(new Date(v));
const calendarDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'UTC' });
export const reportPeriod = (from: string, to: string) =>
  `${calendarDate.format(new Date(from))} al ${calendarDate.format(new Date(to))}`;

export function ReportDetail({
  snapshot: s,
  id,
  headingRef,
  actions,
  notice
}: {
  snapshot: Snapshot;
  id?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  actions: ReactNode;
  notice?: string;
}) {
  const m = s.summary;
  const indicators = [
    { label: 'Leads ingresados', value: m.entered, description: 'Ingresaron durante el período.' },
    {
      label: 'Cierres del período',
      value: m.periodClosures,
      description: 'Incluye cierres de leads que ingresaron antes.'
    },
    {
      label: 'Cierres de esos leads',
      value: m.cohortClosures,
      description: 'De los leads que ingresaron durante el período.'
    },
    {
      label: 'Conversión de esos leads',
      value: percent(m.conversion),
      description: 'Proporción de leads ingresados que cerraron.'
    }
  ];
  function breakdown(
    title: string,
    rows: Snapshot['bySource'],
    investment: boolean,
    costs: boolean
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Ingresados y su conversión: atribución de ingreso. Cierres del período: atribución al
            cerrar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <CrmTable label={title}>
              <TableHeader className='bg-muted'>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Ingresados</TableHead>
                  <TableHead>Cierres del período</TableHead>
                  <TableHead>Cierres de esos leads</TableHead>
                  <TableHead>Conversión</TableHead>
                  {investment && (
                    <TableHead>Inversión {s.allResponsibles ? '' : '(referencia)'}</TableHead>
                  )}
                  {costs && (
                    <>
                      <TableHead>Costo/lead</TableHead>
                      <TableHead>Costo por cierre de esos leads</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id ?? 'unassigned'}>
                    <TableCell className='max-w-64 whitespace-normal break-words'>
                      {r.name}
                    </TableCell>
                    <TableCell>{r.metrics.entered}</TableCell>
                    <TableCell>{r.metrics.periodClosures}</TableCell>
                    <TableCell>{r.metrics.cohortClosures}</TableCell>
                    <TableCell>{percent(r.metrics.conversion)}</TableCell>
                    {investment && <TableCell>{money(r.metrics.investment)}</TableCell>}
                    {costs && (
                      <>
                        <TableCell>{cost(r.metrics.cpl)}</TableCell>
                        <TableCell>{cost(r.metrics.cpc)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </CrmTable>
          ) : (
            <p className='text-muted-foreground'>Sin resultados para este desglose.</p>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <section className='flex min-w-0 flex-col gap-4 break-words' aria-label='Resultado del reporte'>
      <header className='flex flex-wrap items-start justify-between gap-4'>
        <div className='grid min-w-0 gap-2'>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary'>{id ? 'Guardado' : 'Vista previa'}</Badge>
            {s.partial && <Badge variant='outline'>Período parcial</Badge>}
          </div>
          <h2
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            className='text-2xl font-semibold break-words focus-visible:outline-ring'
          >
            {s.name}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {reportPeriod(s.from, s.to)} · Datos al {timestamp(s.cutoff)}
          </p>
        </div>
        {actions}
      </header>
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {s.partial && (
        <Alert>
          <AlertDescription>
            Los resultados llegan hasta la fecha de corte. La inversión corresponde al período
            completo.
          </AlertDescription>
        </Alert>
      )}
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {indicators.map(({ label, value, description }) => (
          <Card key={label} size='sm'>
            <CardHeader>
              <CardTitle className='text-sm'>{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-2xl font-semibold tabular-nums'>{value}</p>
              <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {m.entered === 0 && (
        <p className='text-sm text-muted-foreground'>
          No ingresaron leads en el período para los filtros elegidos.
        </p>
      )}
      {!!m.stages.UNKNOWN && (
        <p className='text-sm text-muted-foreground'>
          Hay leads sin historial de etapa para la fecha de corte.
        </p>
      )}
      <Tabs defaultValue='source' className='min-w-0'>
        <TabsList variant='line' aria-label='Desgloses del reporte'>
          <TabsTrigger value='source'>Por canal</TabsTrigger>
          <TabsTrigger value='person'>Por responsable</TabsTrigger>
          <TabsTrigger value='stage'>Por etapa</TabsTrigger>
        </TabsList>
        <TabsContent value='source' className='min-w-0 pt-2'>
          {breakdown('Resultados por canal', s.bySource, true, s.allResponsibles)}
          {!s.allResponsibles && (
            <p className='mt-3 text-sm text-muted-foreground'>
              La inversión corresponde a todo el canal. Los costos se muestran al incluir a todos
              los responsables.
            </p>
          )}
          <p className='mt-3 text-sm text-muted-foreground'>
            Inversión total {s.allResponsibles ? 'declarada' : 'de referencia'} ·{' '}
            {money(m.investment)}
            {m.investmentPartial && ' (información parcial)'}
            {s.allResponsibles &&
              ` · Costo por lead: ${cost(m.cpl)} · Costo por cierre de esos leads: ${cost(m.cpc)}`}
          </p>
        </TabsContent>
        <TabsContent value='person' className='min-w-0 pt-2'>
          {breakdown('Resultados por responsable', s.byResponsible, false, false)}
        </TabsContent>
        <TabsContent value='stage' className='min-w-0 pt-2'>
          <Card>
            <CardHeader>
              <CardTitle>Etapas de los leads ingresados</CardTitle>
              <CardDescription>
                La distribución incluye Sin historial de etapa y suma el total de ingresados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CrmTable label='Distribución por etapa'>
                <TableHeader className='bg-muted'>
                  <TableRow>
                    <TableHead>Población</TableHead>
                    {Object.entries(stageNames).map(([k, v]) => (
                      <TableHead key={k}>{v}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { id: 'total', name: 'Total', metrics: m },
                    ...s.bySource.map((r) => ({
                      ...r,
                      id: `source-${r.id}`,
                      name: `Canal: ${r.name}`
                    })),
                    ...s.byResponsible.map((r) => ({
                      ...r,
                      id: `person-${r.id}`,
                      name: `Responsable: ${r.name}`
                    }))
                  ].map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className='max-w-64 whitespace-normal break-words'>
                        {r.name}
                      </TableCell>
                      {Object.keys(stageNames).map((k) => (
                        <TableCell key={k}>{r.metrics.stages[k]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </CrmTable>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Collapsible className='rounded-lg border'>
        <CollapsibleTrigger render={<Button variant='ghost' className='w-full justify-between' />}>
          Detalles del reporte
          <IconChevronDown data-icon='inline-end' />
        </CollapsibleTrigger>
        <CollapsibleContent className='grid gap-4 p-4 text-sm'>
          <dl className='grid gap-3 sm:grid-cols-2'>
            <div>
              <dt className='font-medium'>Generado por</dt>
              <dd>
                {s.author.name} · {timestamp(s.generatedAt)}
              </dd>
            </div>
            <div>
              <dt className='font-medium'>Versión de cálculo</dt>
              <dd>{s.calculationVersion}</dd>
            </div>
            <div>
              <dt className='font-medium'>Canales</dt>
              <dd>
                {s.sources.map((c) => `${c.name}${c.isActive ? '' : ' (inactivo)'}`).join(', ') ||
                  'Sin canales'}
              </dd>
            </div>
            <div>
              <dt className='font-medium'>Responsables</dt>
              <dd>
                {s.responsibles
                  .map((p) => `${p.name}${p.isActive ? '' : ' (inactivo)'}`)
                  .join(', ') || 'Sin responsables'}
              </dd>
            </div>
          </dl>
          {s.warnings.length > 0 && (
            <div>
              <h3 className='font-medium'>Criterios del reporte</h3>
              <ul className='mt-1 list-disc pl-5 text-muted-foreground'>
                {s.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
