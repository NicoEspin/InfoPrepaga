'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { personName, type Seller } from '@/features/crm/api';
import type { BatchChanges, ImportPreview, ImportSelection } from '../api/types';
export function ImportBulk({
  data,
  selection,
  selectedIds,
  sellers,
  pending,
  update
}: {
  data: ImportPreview;
  selection: ImportSelection;
  selectedIds: string[];
  sellers: Seller[];
  pending: boolean;
  update: (value: BatchChanges) => void;
}) {
  const [all, setAll] = useState(false);
  const [action, setAction] = useState<NonNullable<BatchChanges['bulk']>['action']>('OMIT');
  const [owner, setOwner] = useState('');
  const [confirm, setConfirm] = useState(false);
  const count = all ? data.selectableTotal : selectedIds.length;
  return (
    <fieldset disabled={pending} className='flex flex-col gap-3 rounded-md border p-3'>
      <legend>Decisiones sobre apariciones pendientes</legend>
      <label>
        <input
          type='checkbox'
          checked={all}
          onChange={(e) => {
            setAll(e.target.checked);
            setConfirm(false);
          }}
        />{' '}
        Seleccionar todos los resultados filtrados, incluidas otras páginas ({data.selectableTotal})
      </label>
      <p>
        Alcance: {count} apariciones. Hoja: {selection.sheet || 'todas'}. Los contactos existentes
        conservan su clasificación, responsable y gestión.
      </p>
      <NativeSelect
        aria-label='Acción masiva'
        value={action}
        onChange={(e) => {
          setAction(e.target.value as typeof action);
          setConfirm(false);
        }}
      >
        <NativeSelectOption value='OMIT'>Excluir deliberadamente</NativeSelectOption>
        <NativeSelectOption value='AUTO'>Restaurar revisión</NativeSelectOption>
        {data.mode === 'HISTORICAL' && (
          <>
            <NativeSelectOption value='ACTIVE'>En gestión</NativeSelectOption>
            <NativeSelectOption value='HISTORICAL'>Histórico</NativeSelectOption>
            <NativeSelectOption value='UNCLASSIFIED'>Pendiente de clasificación</NativeSelectOption>
            <NativeSelectOption value='DISTRIBUTE'>
              Autorizar reparto al crear, solo En gestión
            </NativeSelectOption>
          </>
        )}
        <NativeSelectOption value='ASSIGN'>Asignar responsable actual</NativeSelectOption>
      </NativeSelect>
      {action === 'ASSIGN' && (
        <NativeSelect
          aria-label='Responsable actual masivo'
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setConfirm(false);
          }}
        >
          <NativeSelectOption value=''>Elegir cuenta activa</NativeSelectOption>
          {sellers.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {personName(s)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      {confirm ? (
        <div role='status'>
          <p>
            Se aplicará {action} a {count} apariciones y se volverán a validar los grupos completos.
            Las contradicciones permanecerán bloqueadas. Se conserva la decisión y su autor.
          </p>
          <Button
            disabled={!count || (action === 'ASSIGN' && !owner)}
            onClick={() => {
              update({
                bulk: {
                  selection: { ...selection, ...(!all && { ids: selectedIds }) },
                  action,
                  expectedCount: count,
                  ...(action === 'ASSIGN' && { assignedToId: owner })
                }
              });
              setConfirm(false);
            }}
          >
            Aplicar a {count} apariciones
          </Button>{' '}
          <Button variant='outline' onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant='outline' disabled={!count} onClick={() => setConfirm(true)}>
          Revisar alcance y decisión
        </Button>
      )}
    </fieldset>
  );
}
