'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { type Catalogs, type Lead, crmRequest, useRefreshCrm } from '../api';
import { Feedback, SelectField, TextField, useAction } from './shared';

export function LeadForm({
  lead,
  catalogs,
  admin,
  onClose
}: {
  lead?: Lead;
  catalogs: Catalogs;
  admin: boolean;
  onClose: () => void;
}) {
  const action = useAction();
  const refresh = useRefreshCrm();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
    >
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{lead ? 'Editar lead' : 'Nuevo lead'}</DialogTitle>
          <DialogDescription>
            {lead
              ? 'Los cambios se guardan en el CRM.'
              : 'Se asignará por rotación entre vendedores habilitados.'}
          </DialogDescription>
        </DialogHeader>
        <form
          aria-busy={action.pending}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void action.run(async () => {
              const values = {
                name: String(data.get('name')),
                email: String(data.get('email') ?? ''),
                phone: String(data.get('phone') ?? ''),
                company: String(data.get('company') ?? ''),
                observations: String(data.get('observations') ?? ''),
                ...(admin && { sourceId: String(data.get('sourceId')) })
              };
              if (!values.email.trim() && !values.phone.trim())
                throw new Error('Ingresá teléfono o correo.');
              await crmRequest(lead ? `leads/${lead.id}` : 'leads', {
                method: lead ? 'PATCH' : 'POST',
                body: JSON.stringify({ ...values, ...(lead && { version: lead.version }) })
              });
              await refresh();
              onClose();
            });
          }}
        >
          <fieldset disabled={action.pending} className='min-w-0'>
            <FieldGroup>
              <TextField label='Nombre' name='name' value={lead?.name} required />
              <TextField
                label='Correo'
                name='email'
                type='email'
                value={lead?.email}
                maxLength={254}
              />
              <TextField label='Teléfono' name='phone' value={lead?.phone} maxLength={50} />
              <TextField label='Empresa' name='company' value={lead?.company} />
              <TextField
                label='Observaciones'
                name='observations'
                value={lead?.observations}
                maxLength={2000}
              />
              {admin && (
                <SelectField
                  label='Origen'
                  name='sourceId'
                  value={lead?.sourceId}
                  options={catalogs.sources.filter(
                    (source) => source.isActive || source.id === lead?.sourceId
                  )}
                  required
                />
              )}
              <Feedback error={action.error} />
              <LoadingButton
                loading={action.pending}
                loadingLabel='Guardando lead…'
                disabled={
                  action.pending || (!lead && !catalogs.sources.some((source) => source.isActive))
                }
                type='submit'
              >
                Guardar lead
              </LoadingButton>
              <Button type='button' variant='outline' onClick={onClose}>
                Cancelar
              </Button>
            </FieldGroup>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
