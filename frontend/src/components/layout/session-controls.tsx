'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function SessionControls() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setPending(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      window.location.assign('/auth/sign-in');
    } catch {
      setError('No se pudo cerrar la sesión. Intentá nuevamente.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className='flex items-center gap-3'>
      <Button variant='outline' onClick={logout} disabled={pending}>
        Cerrar sesión
      </Button>
      {error ? <span role='alert'>{error}</span> : null}
    </div>
  );
}
