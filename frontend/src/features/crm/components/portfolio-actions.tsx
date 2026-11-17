'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { crmRequest, type Lead } from '../api';
export function PortfolioActions({
  selected,
  done
}: {
  selected: Lead[];
  done: () => Promise<void>;
}) {
  const [classification, setClassification] = useState('ACTIVE');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function apply() {
    setPending(true);
    setError('');
    try {
      await crmRequest('leads/portfolio', {
        method: 'PATCH',
        body: JSON.stringify({
          targets: selected.map(({ id, version }) => ({ id, version })),
          portfolioClass: classification,
          reason
        })
      });
      setConfirm(false);
      await done();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo clasificar la cartera');
    } finally {
      setPending(false);
    }
  }
  return (
    <fieldset
      disabled={pending}
      className='my-3 flex flex-wrap items-center gap-3 rounded-md border p-3'
    >
      <legend>Clasificar cartera seleccionada ({selected.length}, máximo 100)</legend>
      <NativeSelect
        aria-label='Nueva clasificación'
        value={classification}
        onChange={(e) => {
          setClassification(e.target.value);
          setConfirm(false);
        }}
      >
        <NativeSelectOption value='ACTIVE'>En gestión</NativeSelectOption>
        <NativeSelectOption value='HISTORICAL'>Histórico</NativeSelectOption>
        <NativeSelectOption value='UNCLASSIFIED'>Pendiente de clasificación</NativeSelectOption>
      </NativeSelect>
      <Input
        aria-label='Motivo de clasificación'
        placeholder='Motivo administrativo'
        value={reason}
        maxLength={500}
        onChange={(e) => {
          setReason(e.target.value);
          setConfirm(false);
        }}
      />
      <p>
        Activar requiere un responsable asignado. No ejecuta reparto ni cambia estado, etapa o fecha
        de ingreso.
      </p>
      {error && (
        <p role='alert' className='text-destructive'>
          {error}
        </p>
      )}
      {confirm ? (
        <>
          <p>
            Se cambiará la clasificación de {selected.length} contactos. El servidor verifica sus
            versiones y registra el motivo.
          </p>
          <Button disabled={pending} onClick={() => void apply()}>
            Confirmar clasificación de {selected.length}
          </Button>
          <Button variant='outline' onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
        </>
      ) : (
        <Button
          variant='outline'
          disabled={!selected.length || selected.length > 100 || !reason.trim()}
          onClick={() => setConfirm(true)}
        >
          Revisar cambio
        </Button>
      )}
    </fieldset>
  );
}
