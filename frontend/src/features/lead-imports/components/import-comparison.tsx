'use client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table';
import type { ImportRow } from '../api/types';
const actionLabels = {
  PRESERVE: 'Conservar',
  ADD: 'Completar vacío',
  HISTORY: 'Agregar a historia',
  CONFLICT: 'Conflicto',
  REVIEW: 'Requiere revisión'
};
export function ImportComparison({
  row,
  statuses
}: {
  row: ImportRow;
  statuses: Array<{ id: string; name: string }>;
}) {
  const display = (field: string, value: string | null) =>
    field === 'status'
      ? (statuses.find((status) => status.id === value)?.name ?? value ?? 'Sin dato')
      : field === 'stage'
        ? ((
            {
              NEW: 'Nuevo',
              CONTACTED: 'Contactado',
              FOLLOW_UP: 'Seguimiento',
              PROPOSAL: 'Propuesta',
              CLOSED: 'Cerrado'
            } as Record<string, string>
          )[value ?? ''] ??
          value ??
          'Sin dato')
        : (value ?? 'Sin dato');
  if (!row.comparisons.length)
    return (
      <p>No hay coincidencias para comparar. Se creará un contacto si la fila está validada.</p>
    );
  return (
    <section aria-label='Comparación de datos' className='grid gap-3'>
      {(!row.selected || row.requiresReview) && (
        <Alert>
          <AlertDescription>
            Esta aparición no se modificará mientras esté omitida o requiera revisión. Reconocer una
            coincidencia no autoriza sobrescribir campos incompatibles.
          </AlertDescription>
        </Alert>
      )}
      {row.comparisons.map((comparison) => (
        <div key={`${comparison.kind}:${comparison.referenceId}`}>
          <h3>
            {comparison.kind === 'CRM' ? 'Contacto actual del CRM' : 'Otra aparición del archivo'}
            {!comparison.canApply ? ' · Sin cambios autorizados' : ''}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>
                  {comparison.kind === 'CRM' ? 'Valor actual CRM' : 'Referencia del archivo'}
                </TableHead>
                <TableHead>Dato entrante</TableHead>
                <TableHead>Acción / resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.fields.map((field) => (
                <TableRow key={field.field}>
                  <TableCell>{field.label}</TableCell>
                  <TableCell className='max-w-52 whitespace-pre-wrap break-words'>
                    {display(field.field, field.current)}
                  </TableCell>
                  <TableCell className='max-w-52 whitespace-pre-wrap break-words'>
                    {display(field.field, field.incoming)}
                  </TableCell>
                  <TableCell className='max-w-64 whitespace-normal'>
                    <strong>{actionLabels[field.action]}</strong>
                    <p>{field.reason}</p>
                    {field.action === 'ADD' && <p>Resultado: {field.result}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
      {row.comparisonCount > row.comparisons.length && (
        <p>
          Hay más contactos posibles. La actualización permanece bloqueada hasta resolver la
          identidad.
        </p>
      )}
    </section>
  );
}
