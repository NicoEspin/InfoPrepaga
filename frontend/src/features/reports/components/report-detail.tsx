import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
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
export function ReportDetail({ snapshot: s, id }: { snapshot: Snapshot; id?: string }) {
  const m = s.summary;
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Ingresados</TableHead>
                <TableHead>Cierres del período</TableHead>
                <TableHead>Cierres de ingresados</TableHead>
                <TableHead>Conversión</TableHead>
                {investment && (
                  <TableHead>Inversión {s.allResponsibles ? '' : '(referencia)'}</TableHead>
                )}
                {costs && (
                  <>
                    <TableHead>Costo/lead</TableHead>
                    <TableHead>Costo/cierre de ingresados</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id ?? 'unassigned'}>
                  <TableCell className='max-w-64 whitespace-normal break-words'>{r.name}</TableCell>
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
          </Table>
          {!rows.length && <p>Sin resultados.</p>}
        </CardContent>
      </Card>
    );
  }
  return (
    <section className='flex min-w-0 flex-col gap-4 break-words' aria-label='Resultado del reporte'>
      <div>
        <h2 className='text-xl font-semibold break-words'>{s.name}</h2>
        <Badge>{s.partial ? 'Parcial' : 'Período completo'}</Badge>
        <p>{id ? `Reporte ${id}` : 'Vista previa sin guardar'}</p>
        <p>
          {s.from} al {s.to} · Corte: {timestamp(s.cutoff)} · {s.timezone}
        </p>
        <p>
          Generado por {s.author.name} · {timestamp(s.generatedAt)} · Cálculo v
          {s.calculationVersion}
        </p>
        <p>
          Canales:{' '}
          {s.sources.map((c) => `${c.name}${c.isActive ? '' : ' (inactivo)'}`).join(', ') ||
            'Sin canales'}
        </p>
        <p>
          Responsables:{' '}
          {s.responsibles.map((p) => `${p.name}${p.isActive ? '' : ' (inactivo)'}`).join(', ') ||
            'Sin responsables'}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Resumen general</CardTitle>
          <CardDescription>
            {m.entered === 0
              ? 'Sin leads ingresados en la selección.'
              : 'Evolución de la población ingresada y cierres del período.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {[
              ['Leads ingresados', m.entered],
              ['Cierres del período', m.periodClosures],
              ['Cierres de los ingresados', m.cohortClosures],
              ['Conversión de los ingresados', percent(m.conversion)],
              [
                'Inversión declarada' + (m.investmentPartial ? ' (informada parcial)' : ''),
                money(m.investment)
              ],
              ...(s.allResponsibles
                ? [
                    ['Costo por lead', cost(m.cpl)],
                    ['Costo por cierre de los ingresados', cost(m.cpc)]
                  ]
                : [])
            ].map(([label, value]) => (
              <div key={label}>
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='text-xl font-semibold'>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {breakdown('Comparación por canal', s.bySource, true, s.allResponsibles)}
      {breakdown('Desglose por responsable', s.byResponsible, false, false)}
      <Card>
        <CardHeader>
          <CardTitle>Etapa de los ingresados al corte</CardTitle>
          <CardDescription>
            La distribución incluye Sin historial de etapa y suma el total de ingresados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
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
                  <TableCell className='max-w-64 whitespace-normal break-words'>{r.name}</TableCell>
                  {Object.keys(stageNames).map((k) => (
                    <TableCell key={k}>{r.metrics.stages[k]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <aside aria-label='Definiciones y advertencias'>
        <h3 className='font-semibold'>Criterios del reporte</h3>
        <ul className='list-disc pl-5'>
          {s.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
