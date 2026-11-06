'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Feedback, LoadingState, Pagination } from '@/features/crm/components/shared';
import { appearanceOptions } from '../api/queries';
export function ImportAppearances({ actorId, leadId }: { actorId: string; leadId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery(appearanceOptions(actorId, leadId, page));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Procedencias de importación</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className='grid gap-3'>
        <Feedback
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
        {query.isPending ? (
          <LoadingState label='Cargando procedencias…' rows={2} />
        ) : (
          <>
            {query.data?.legacy && (
              <details>
                <summary>Procedencia anterior disponible</summary>
                <p>
                  Este registro es anterior al historial detallado. No se infieren datos faltantes.
                </p>
                {[
                  ['sheet', 'Hoja'],
                  ['rowNumber', 'Fila'],
                  ['originalAdvisor', 'Asesor original'],
                  ['originalDate', 'Fecha original']
                ].map(([key, label]) => (
                  <p key={key}>
                    {label}: {query.data?.legacy?.[key] ?? 'No disponible'}
                  </p>
                ))}
              </details>
            )}
            {query.data?.total === 0 && !query.data.legacy && (
              <p>No hay apariciones registradas para este contacto.</p>
            )}
            {query.data?.items.map((item) => (
              <article key={item.id} className='rounded-lg border p-3'>
                <h3>
                  {item.source.name}
                  {!item.source.isActive ? ' (inactivo)' : ''} ·{' '}
                  {item.fileName || 'Archivo no disponible'}
                </h3>
                <dl className='grid gap-2 sm:grid-cols-2'>
                  {[
                    ['Lote', item.batchId],
                    ['Hoja / fila', `${item.sheet} / ${item.rowNumber}`],
                    ['Asesor original', item.originalAdvisor || 'Sin dato'],
                    ['Fecha original', item.originalDate || 'Sin dato'],
                    ['Procedencia histórica', item.group],
                    [
                      'Incorporado al CRM',
                      new Date(item.createdAt).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires'
                      })
                    ]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className='text-muted-foreground text-sm'>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {item.corrections && (
                  <details>
                    <summary>Corrección autorizada de contacto opcional</summary>
                    {item.corrections.email !== null && (
                      <p>Correo original descartado: {item.corrections.email}</p>
                    )}
                    {item.corrections.phone && (
                      <p>Teléfono original descartado: {item.corrections.phone}</p>
                    )}
                    {item.corrections.formulaPhoneOmitted && (
                      <p>Fórmula de teléfono omitida; no se utilizó su resultado guardado.</p>
                    )}
                  </details>
                )}
                <p className='whitespace-pre-wrap'>
                  {item.observations || 'Sin observaciones históricas'}
                </p>
              </article>
            ))}
            {query.data && query.data.total > 10 && (
              <Pagination
                page={page}
                pageSize={10}
                total={query.data.total}
                onPage={setPage}
                busy={query.isFetching}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
