'use client';

import { IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  importDate,
  importTime,
  type AvalianBatchPreview,
  type AvalianRecordPreview
} from '../data/records';

export type AvalianDetail =
  | { kind: 'record'; record: AvalianRecordPreview }
  | { kind: 'batch'; batch: AvalianBatchPreview }
  | { kind: 'history' };

export function AvalianDetailDialog({
  detail,
  batches,
  onClose
}: {
  detail: AvalianDetail;
  batches: AvalianBatchPreview[];
  onClose: () => void;
}) {
  const record = detail.kind === 'record' ? detail.record : null;
  const batch = detail.kind === 'batch' ? detail.batch : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='avalian-detail-dialog' showCloseButton={false} aria-modal='true'>
        <DialogClose
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              className='absolute top-2 right-2'
              aria-label='Cerrar consulta de Avalian'
            />
          }
        >
          <IconX />
        </DialogClose>
        <DialogHeader>
          <DialogTitle>
            {record ? record.name : batch ? 'Detalle del lote' : 'Historial de lotes'}
          </DialogTitle>
          <DialogDescription>
            Consulta de registros sintéticos de Avalian. Este módulo es independiente de los leads
            comerciales.
          </DialogDescription>
        </DialogHeader>
        {record ? (
          <dl className='avalian-detail-fields'>
            <div>
              <dt>Identificador interno</dt>
              <dd>{record.internalId}</dd>
            </div>
            <div>
              <dt>Estado del registro</dt>
              <dd>{record.status}</dd>
            </div>
            <div>
              <dt>Fecha de importación</dt>
              <dd>
                {importDate(record.importedAt)} · {importTime(record.importedAt)}
              </dd>
            </div>
            <div>
              <dt>Lote</dt>
              <dd>{record.batchId}</dd>
            </div>
            <div>
              <dt>Observaciones</dt>
              <dd>{record.observations}</dd>
            </div>
          </dl>
        ) : batch ? (
          <dl className='avalian-detail-fields'>
            <div>
              <dt>Identificador del lote</dt>
              <dd>{batch.id}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>
                {importDate(batch.importedAt)} · {importTime(batch.importedAt)}
              </dd>
            </div>
            <div>
              <dt>Registros</dt>
              <dd>{batch.records.length}</dd>
            </div>
            <div>
              <dt>En revisión</dt>
              <dd>{batch.records.filter((item) => item.status === 'En revisión').length}</dd>
            </div>
            <div>
              <dt>Inválidos</dt>
              <dd>{batch.records.filter((item) => item.status === 'Inválido').length}</dd>
            </div>
          </dl>
        ) : (
          <div className='avalian-batch-history'>
            {batches.map((item) => (
              <article key={item.id}>
                <strong>{item.id}</strong>
                <span>
                  {importDate(item.importedAt)} · {importTime(item.importedAt)}
                </span>
                <p>{item.records.length} registros sintéticos</p>
              </article>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AvalianImportPreview({
  batch,
  onClose,
  onConfirm
}: {
  batch: AvalianBatchPreview;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='avalian-import-dialog' showCloseButton={false} aria-modal='true'>
        <DialogClose
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              className='absolute top-2 right-2'
              aria-label='Cerrar vista previa de importación'
            />
          }
        >
          <IconX />
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Vista previa de importación</DialogTitle>
          <DialogDescription>
            Lote ficticio para revisar el flujo. La carga de archivos reales estará disponible al
            conectar el canal autorizado y la API.
          </DialogDescription>
        </DialogHeader>
        <div className='avalian-import-summary'>
          <strong>{batch.id}</strong>
          <span>
            {batch.records.length} registros de ejemplo · Sin archivos ni sincronización externa
          </span>
        </div>
        <Table>
          <caption className='sr-only'>Registros del lote ficticio</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Identificador</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{record.name}</TableCell>
                <TableCell>{record.internalId}</TableCell>
                <TableCell>
                  <Badge variant='secondary'>{record.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className='avalian-import-note'>
          Confirmar agrega este lote solo a la vista actual. Recargar restablece los ejemplos. No
          crea leads ni habilita contactos comerciales.
        </p>
        <div className='avalian-import-actions'>
          <Button variant='outline' onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>Simular importación</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
