'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AppError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      className='mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center gap-4 p-6'
      role='alert'
    >
      <h1 className='text-xl font-semibold'>No pudimos cargar esta pantalla</h1>
      <p className='text-muted-foreground'>
        Puede ser un problema temporal de conexión. Tus datos guardados siguen en el CRM.
      </p>
      <div className='flex flex-wrap gap-3'>
        <Button onClick={reset}>Volver a intentar</Button>
        <Link href='/auth/sign-in' className='inline-flex items-center underline'>
          Volver al ingreso
        </Link>
      </div>
    </main>
  );
}
