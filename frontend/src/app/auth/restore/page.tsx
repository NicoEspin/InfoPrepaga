'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { restoreSession, safeReturnPath } from '@/lib/session-client';

export default function RestorePage() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  async function restore(manual = false) {
    setError('');
    setPending(true);
    try {
      if (await restoreSession(manual))
        window.location.replace(
          safeReturnPath(new URLSearchParams(window.location.search).get('returnTo'))
        );
      else window.location.replace('/auth/sign-in');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo renovar la sesión.');
      setPending(false);
    }
  }
  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((ok) => {
        if (!active) return;
        window.location.replace(
          ok
            ? safeReturnPath(new URLSearchParams(window.location.search).get('returnTo'))
            : '/auth/sign-in'
        );
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'No se pudo renovar la sesión.');
          setPending(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className='mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6'>
      <h1>Restaurando sesión</h1>
      <p role='status'>{pending ? 'Verificando tu acceso…' : error}</p>
      {!pending && <Button onClick={() => void restore(true)}>Restaurar sesión</Button>}
    </main>
  );
}
