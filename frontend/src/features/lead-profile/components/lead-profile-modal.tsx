'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { IconRefresh, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { leadProfileOptions } from '../api/queries';
import { LeadProfileError } from '../api/service';
import type { LeadProfileLoader } from '../api/types';
import { LeadProfileDetails } from './lead-profile-details';
import './lead-profile.css';

const errors = {
  'not-found': 'No encontramos este lead.',
  unauthorized: 'Tu sesión venció. Volvé a ingresar para consultar el perfil.',
  forbidden: 'No tenés permiso para consultar este lead.',
  network: 'No pudimos cargar el perfil. Intentá nuevamente.',
  'invalid-response': 'No pudimos verificar los datos del perfil. Intentá nuevamente.'
};

export function LeadProfileModal({
  leadId,
  opening,
  loader,
  onClose
}: {
  leadId: string;
  opening: string;
  loader: LeadProfileLoader;
  onClose: () => void;
}) {
  // This observer only exists while open. Unmount aborts its consumed signal and gcTime=0 removes it.
  const query = useQuery(leadProfileOptions(leadId, opening, loader));
  const reason = query.error instanceof LeadProfileError ? query.error.reason : 'network';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className='lead-profile-modal'
        showCloseButton={false}
        finalFocus={false}
        aria-modal='true'
      >
        <DialogHeader className='lead-profile-topbar'>
          <span>Leads / Perfil del prospecto</span>
          <DialogTitle>{query.data?.name ?? 'Perfil del lead'}</DialogTitle>
          <DialogDescription>
            {query.data?.isDemo
              ? 'Vista previa · Datos sintéticos. Las notas y acciones locales se descartan al cerrar.'
              : 'Información, historial y próximas actividades del prospecto.'}
          </DialogDescription>
          <Button
            variant='ghost'
            size='icon'
            className='lead-profile-close'
            aria-label='Cerrar perfil del lead'
            onClick={onClose}
          >
            <IconX />
          </Button>
        </DialogHeader>
        {query.isPending ? (
          <div className='lead-profile-loading' role='status' aria-label='Cargando perfil del lead'>
            <p>Cargando perfil del lead…</p>
            <Skeleton className='h-8 w-2/3' />
            <div>
              <Skeleton className='h-72' />
              <Skeleton className='h-72' />
              <Skeleton className='h-72' />
            </div>
          </div>
        ) : query.isError ? (
          <div className='lead-profile-error'>
            <Alert variant='destructive'>
              <AlertTitle>No se pudo abrir el perfil</AlertTitle>
              <AlertDescription>{errors[reason]}</AlertDescription>
            </Alert>
            {reason === 'unauthorized' ? (
              <Button
                onClick={onClose}
                render={<Link href='/auth/sign-in' aria-label='Ingresar' />}
              >
                Ingresar
              </Button>
            ) : reason !== 'forbidden' && reason !== 'not-found' ? (
              <Button
                variant='outline'
                onClick={() => {
                  void query.refetch();
                }}
                disabled={query.isFetching}
              >
                <IconRefresh />
                Reintentar
              </Button>
            ) : null}
          </div>
        ) : (
          <LeadProfileDetails key={query.data.id} profile={query.data} />
        )}
      </DialogContent>
    </Dialog>
  );
}
