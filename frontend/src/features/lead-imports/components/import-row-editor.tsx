'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LoadingButton } from '@/components/ui/loading-button';
import { personName, type Catalogs, type Seller } from '@/features/crm/api';
import type { ImportRow, RowChanges } from '../api/types';

export function ImportRowEditor({
  row,
  catalogs,
  sellers,
  pending,
  save,
  close
}: {
  row: ImportRow;
  catalogs: Catalogs;
  sellers: Seller[];
  pending: boolean;
  save: (changes: RowChanges) => Promise<void>;
  close: () => void;
}) {
  const [name, setName] = useState(row.name);
  return (
    <form
      className='rounded-lg border p-4'
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const assigned = String(values.get('assignedToId'));
        void save({
          name,
          email: String(values.get('email')),
          phone: String(values.get('phone')),
          observations: String(values.get('observations')),
          decision: String(values.get('decision')) as ImportRow['decision'],
          ...(values.get('sourceId') && { sourceId: String(values.get('sourceId')) }),
          ...(assigned && { assignedToId: assigned === 'AUTO' ? null : assigned }),
          acknowledgeDuplicates: true
        });
      }}
    >
      <FieldGroup className='grid gap-4 md:grid-cols-2'>
        <Field>
          <FieldLabel htmlFor='import-name'>Nombre</FieldLabel>
          <Input
            id='import-name'
            required
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
          />
          {row.nameCandidates.length > 1 && (
            <NativeSelect
              aria-label='Elegir nombre del Excel'
              value=''
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            >
              <NativeSelectOption value=''>
                Elegí un candidato o escribí el nombre
              </NativeSelectOption>
              {row.nameCandidates.map((candidate, index) => (
                <NativeSelectOption key={index} value={candidate}>
                  {candidate}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor='import-email'>Correo</FieldLabel>
          <Input
            id='import-email'
            name='email'
            type='email'
            maxLength={254}
            defaultValue={row.email}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='import-phone'>Teléfono</FieldLabel>
          <Input
            id='import-phone'
            name='phone'
            maxLength={50}
            defaultValue={row.phone}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='import-source'>Origen</FieldLabel>
          <NativeSelect
            id='import-source'
            name='sourceId'
            defaultValue={row.sourceId ?? ''}
            disabled={pending}
          >
            <NativeSelectOption value=''>Sin confirmar</NativeSelectOption>
            {catalogs.sources
              .filter((source) => source.isActive)
              .map((source) => (
                <NativeSelectOption key={source.id} value={source.id}>
                  {source.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor='import-seller'>Responsable</FieldLabel>
          <NativeSelect
            id='import-seller'
            name='assignedToId'
            defaultValue={row.assignmentResolved ? (row.assignedToId ?? 'AUTO') : ''}
            disabled={pending}
          >
            <NativeSelectOption value=''>Resolver asesor</NativeSelectOption>
            <NativeSelectOption value='AUTO'>Reparto automático</NativeSelectOption>
            {sellers.map((seller) => (
              <NativeSelectOption key={seller.id} value={seller.id}>
                {personName(seller)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor='import-decision'>Carga</FieldLabel>
          <NativeSelect
            id='import-decision'
            name='decision'
            defaultValue={row.decision}
            disabled={pending}
          >
            <NativeSelectOption value='AUTO'>Automática: omitir repetidos</NativeSelectOption>
            <NativeSelectOption value='INCLUDE'>Cargar, aunque esté repetido</NativeSelectOption>
            <NativeSelectOption value='OMIT'>Omitir</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className='md:col-span-2'>
          <FieldLabel htmlFor='import-observations'>Observaciones</FieldLabel>
          <Textarea
            id='import-observations'
            name='observations'
            maxLength={2000}
            defaultValue={row.observations}
            disabled={pending}
          />
        </Field>
      </FieldGroup>
      <p className='text-muted-foreground my-3 text-sm'>
        Fecha original: {row.metadata.originalDate || 'Sin fecha'} · Horario:{' '}
        {row.metadata.schedule || 'Sin horario'} · Segmento/régimen:{' '}
        {row.metadata.segment || 'Sin dato'} · Asesor original: {row.advisor || 'Sin asesor'}
      </p>
      <div className='flex gap-2'>
        <LoadingButton type='submit' loading={pending} loadingLabel='Guardando…'>
          Guardar y revisar
        </LoadingButton>
        <Button type='button' variant='outline' disabled={pending} onClick={close}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
