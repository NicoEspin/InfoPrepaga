'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface LocalAttachment {
  id: string;
  file: File;
  preview: string | null;
}

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const maxSize = 10 * 1024 * 1024;
const maxFiles = 20;

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
}

export function LeadProfileAttachments() {
  const inputId = useId();
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [feedback, setFeedback] = useState('');
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  return (
    <Card className='lead-profile-attachments' aria-labelledby={`${inputId}-title`}>
      <CardHeader>
        <CardTitle id={`${inputId}-title`}>
          <Icons.paperclip aria-hidden='true' />
          Archivos e imágenes
        </CardTitle>
        <CardDescription>
          Adjuntos locales de este lead. No se suben al servidor y se descartan al cerrar el perfil.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <Field>
          <FieldLabel htmlFor={inputId}>Agregar archivos</FieldLabel>
          <Input
            id={inputId}
            type='file'
            multiple
            aria-describedby={`${inputId}-help`}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              const added: LocalAttachment[] = [];
              const errors: string[] = [];
              for (const file of files) {
                if (file.size > maxSize || file.size === 0) {
                  errors.push(`${file.name}: el tamaño debe ser mayor a 0 y hasta 10 MB.`);
                  continue;
                }
                if (attachments.length + added.length >= maxFiles) {
                  errors.push('Podés agregar hasta 20 archivos por perfil.');
                  break;
                }
                const duplicate = [...attachments, ...added].some(
                  (item) =>
                    item.file.name === file.name &&
                    item.file.size === file.size &&
                    item.file.lastModified === file.lastModified
                );
                if (duplicate) {
                  errors.push(`${file.name}: ya está agregado.`);
                  continue;
                }
                const preview = imageTypes.has(file.type) ? URL.createObjectURL(file) : null;
                if (preview) previewUrls.current.add(preview);
                added.push({ id: crypto.randomUUID(), file, preview });
              }
              setAttachments((previous) => [...previous, ...added]);
              setFeedback(
                [
                  added.length ? `${added.length} archivo(s) agregado(s) solo en esta vista.` : '',
                  ...errors
                ]
                  .filter(Boolean)
                  .join(' ')
              );
            }}
          />
          <FieldDescription id={`${inputId}-help`}>
            Hasta 20 archivos, 10 MB por archivo. Vista previa para JPG, PNG, WebP y GIF.
          </FieldDescription>
        </Field>
        {attachments.length ? (
          <ul className='lead-profile-attachment-list' aria-label='Archivos del lead'>
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <div className='lead-profile-attachment-preview'>
                  {attachment.preview ? (
                    <Image
                      src={attachment.preview}
                      alt={`Vista previa de ${attachment.file.name}`}
                      width={160}
                      height={110}
                      unoptimized
                      className='object-contain'
                    />
                  ) : (
                    <Icons.page aria-hidden='true' />
                  )}
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='wrap-anywhere'>{attachment.file.name}</p>
                  <p className='text-muted-foreground text-xs'>
                    {formatSize(attachment.file.size)}
                  </p>
                </div>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={`Quitar ${attachment.file.name}`}
                  onClick={() => {
                    if (attachment.preview) {
                      URL.revokeObjectURL(attachment.preview);
                      previewUrls.current.delete(attachment.preview);
                    }
                    setAttachments((previous) =>
                      previous.filter((item) => item.id !== attachment.id)
                    );
                    setFeedback(`${attachment.file.name} quitado de esta vista.`);
                  }}
                >
                  <Icons.trash />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Sin archivos adjuntos</EmptyTitle>
              <EmptyDescription>Agregá documentos o imágenes para este lead.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <p role='status' aria-live='polite' className='text-muted-foreground text-xs'>
          {feedback}
        </p>
      </CardContent>
    </Card>
  );
}
