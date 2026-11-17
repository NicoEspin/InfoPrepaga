'use client';
import { useState } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ImportConfiguration } from '../api/types';

const fields = {
  name: 'Nombre',
  phone: 'Teléfono',
  email: 'Correo',
  advisor: 'Asesor histórico',
  observations: 'Observaciones',
  originalDate: 'Fecha de origen',
  currentManagement: 'Gestion_actual',
  currentResponsible: 'Responsable_actual',
  lastManaged: 'Ultima_gestion'
} as const;
export function ImportColumns({
  value,
  onChange,
  disabled,
  managementValues = []
}: {
  value: ImportConfiguration;
  onChange: (value: ImportConfiguration) => void;
  disabled: boolean;
  managementValues?: Array<{ value: string; count: number }>;
}) {
  const [aliases, setAliases] = useState<string[]>([]);
  const [target, setTarget] = useState<'ACTIVE' | 'HISTORICAL' | 'UNCLASSIFIED'>('UNCLASSIFIED');
  const [sheet, setSheet] = useState('DATOS FACE');
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button
            variant='ghost'
            className='group h-auto w-full justify-between whitespace-normal text-left'
          />
        }
      >
        Ajustar columnas y transformaciones
        <Icons.chevronDown
          aria-hidden
          className='shrink-0 transition-transform group-data-[panel-open]:rotate-180'
        />
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-3'>
        <p>
          Las reglas se aplican a todas las candidatas de la hoja elegida. Sin regla, se conserva el
          adaptador original y se detectan las tres cabeceras nuevas. No se desplazan las columnas
          históricas. La compatibilidad se valida al leer el archivo.
        </p>
        <NativeSelect
          aria-label='Hoja para configurar columnas'
          value={sheet}
          onChange={(e) => setSheet(e.target.value)}
          disabled={disabled}
        >
          {['DATOS LAN', 'PIPA', 'Fede', 'DATOS FACE', 'folletos'].map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className='grid gap-3 md:grid-cols-3'>
          {Object.entries(fields).map(([name, label]) => {
            const key = name as keyof typeof fields;
            const rule = value.sheets[sheet]?.[key];
            const mode = !rule
              ? 'preset'
              : rule.column
                ? 'column'
                : rule.value !== undefined
                  ? 'value'
                  : 'ignore';
            function change(next: { column?: number; value?: string } | undefined) {
              const rules = { ...value.sheets[sheet] };
              if (next) rules[key] = next;
              else delete rules[key];
              const sheets = { ...value.sheets };
              if (Object.keys(rules).length) sheets[sheet] = rules;
              else delete sheets[sheet];
              onChange({ ...value, sheets });
            }
            return (
              <Field key={key}>
                <FieldLabel>{label}</FieldLabel>
                <NativeSelect
                  aria-label={`Lectura de ${label}`}
                  disabled={disabled}
                  value={mode}
                  onChange={(e) =>
                    change(
                      e.target.value === 'preset'
                        ? undefined
                        : e.target.value === 'ignore'
                          ? {}
                          : e.target.value === 'column'
                            ? { column: 1 }
                            : { value: '' }
                    )
                  }
                >
                  <NativeSelectOption value='preset'>Preconfiguración</NativeSelectOption>
                  <NativeSelectOption value='column'>Elegir columna</NativeSelectOption>
                  <NativeSelectOption value='ignore'>Ignorar</NativeSelectOption>
                  <NativeSelectOption value='value'>Valor general de la hoja</NativeSelectOption>
                </NativeSelect>
                {mode === 'column' && (
                  <Input
                    aria-label={`Columna de ${label} (A=1)`}
                    type='number'
                    min={1}
                    max={256}
                    value={rule?.column ?? 1}
                    onChange={(e) => change({ column: Number(e.target.value) })}
                  />
                )}
                {mode === 'value' && (
                  <Input
                    aria-label={`Valor general de ${label}`}
                    maxLength={2000}
                    value={rule?.value ?? ''}
                    onChange={(e) => change({ value: e.target.value })}
                  />
                )}
                <small>
                  Excel{' '}
                  {mode === 'column'
                    ? `columna ${rule?.column}`
                    : mode === 'value'
                      ? `valor general: ${rule?.value || '(vacío)'}`
                      : mode === 'ignore'
                        ? '(ignorado)'
                        : '(adaptador)'}{' '}
                  → {label}
                </small>
              </Field>
            );
          })}
        </div>
        <Field>
          <FieldLabel>Fechas completas admitidas</FieldLabel>
          <NativeSelect
            value={value.dateFormat ?? 'DMY'}
            onChange={(e) => onChange({ ...value, dateFormat: e.target.value as 'DMY' | 'ISO' })}
            disabled={disabled}
          >
            <NativeSelectOption value='DMY'>Día/mes/año de cuatro dígitos e ISO</NativeSelectOption>
            <NativeSelectOption value='ISO'>Solo ISO (AAAA-MM-DD)</NativeSelectOption>
          </NativeSelect>
        </Field>
        {managementValues.length > 0 && (
          <fieldset>
            <legend>Equivalencias de Gestión_actual · todas las hojas seleccionadas</legend>
            {managementValues
              .filter((item) => item.value)
              .map((item) => (
                <label key={item.value} className='mr-3 inline-flex gap-2'>
                  <input
                    type='checkbox'
                    checked={aliases.includes(item.value)}
                    onChange={(e) =>
                      setAliases(
                        e.target.checked
                          ? [...aliases, item.value]
                          : aliases.filter((a) => a !== item.value)
                      )
                    }
                  />
                  {item.value} ({item.count})
                </label>
              ))}
            <NativeSelect
              aria-label='Destino de equivalencias de gestión'
              value={target}
              onChange={(e) => setTarget(e.target.value as typeof target)}
            >
              <NativeSelectOption value='ACTIVE'>En gestión</NativeSelectOption>
              <NativeSelectOption value='HISTORICAL'>Histórico</NativeSelectOption>
              <NativeSelectOption value='UNCLASSIFIED'>
                Pendiente de clasificación
              </NativeSelectOption>
            </NativeSelect>
            <Button
              disabled={!aliases.length || disabled}
              variant='outline'
              onClick={() =>
                onChange({
                  ...value,
                  managementAliases: {
                    ...value.managementAliases,
                    ...Object.fromEntries(
                      aliases.map((alias) => [
                        alias
                          .normalize('NFD')
                          .replace(/\p{M}/gu, '')
                          .toLowerCase()
                          .replace(/\s+/g, ' ')
                          .trim(),
                        target
                      ])
                    )
                  }
                })
              }
            >
              Preparar equivalencias (
              {managementValues
                .filter((item) => aliases.includes(item.value))
                .reduce((n, item) => n + item.count, 0)}{' '}
              apariciones)
            </Button>
            <p>
              Se aplicarán al volver a leer el Excel y quedarán en la configuración guardada. SI,
              NO, REVISAR y vacío conservan su significado.
            </p>
          </fieldset>
        )}
        <p>
          Fechas incompletas o inválidas se conservan como texto, sin inventar años ni actividades.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
