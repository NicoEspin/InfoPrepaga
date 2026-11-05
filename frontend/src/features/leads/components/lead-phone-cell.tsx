'use client';

import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import styles from './lead-phone-cell.module.css';

interface LeadPhoneCellProps {
  phone: string | null | undefined;
}

export function LeadPhoneCell({ phone }: LeadPhoneCellProps) {
  const number = phone?.trim() ?? '';
  const digits = number.replace(/\D/g, '').replace(/^00/, '');
  const canOpenWhatsApp = /^[+\d\s().-]+$/.test(number) && /^[1-9]\d{6,14}$/.test(digits);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(number);
      toast.success('Teléfono copiado');
    } catch {
      toast.error('No pudimos copiar el teléfono. Seleccioná el número y copialo manualmente.');
    }
  }

  return (
    <div className='flex items-center gap-2 whitespace-nowrap'>
      <span>{number || 'Sin teléfono'}</span>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          disabled={!number}
          title='Copiar teléfono'
          aria-label={`Copiar teléfono${number ? ` ${number}` : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            void copyNumber();
          }}
        >
          <Icons.copy aria-hidden='true' />
        </Button>
        {canOpenWhatsApp ? (
          <a
            href={`https://wa.me/${digits}`}
            target='_blank'
            rel='noopener noreferrer'
            title='Abrir en WhatsApp'
            aria-label={`Abrir WhatsApp para ${number} (nueva pestaña)`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), styles.whatsapp)}
            onClick={(event) => event.stopPropagation()}
          >
            <Icons.whatsapp aria-hidden='true' />
          </a>
        ) : (
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            disabled
            title='WhatsApp requiere un teléfono válido con código de país'
            aria-label='WhatsApp no disponible: teléfono ausente o inválido'
            className={styles.whatsapp}
          >
            <Icons.whatsapp aria-hidden='true' />
          </Button>
        )}
      </div>
    </div>
  );
}
