'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function SignInForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function restore() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!response.ok) {
        setError('La sesión terminó. Ingresá tus credenciales.');
        return;
      }
      window.location.assign('/dashboard/overview');
    } catch {
      setError('El servidor no está disponible');
    } finally {
      setPending(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
      });
      if (!response.ok) {
        const data = (await response.json()) as { message: string };
        setError(data.message);
        return;
      }
      window.location.assign('/dashboard/overview');
    } catch {
      setError('No se pudo conectar con el servidor. Intentá nuevamente.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className='w-full max-w-sm'>
      <CardHeader>
        <CardTitle>Ingresar al entorno de pruebas</CardTitle>
        <CardDescription>InfoPrepaga · Plantillas con datos sintéticos</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='email'>Correo electrónico</FieldLabel>
              <Input
                id='email'
                name='email'
                type='email'
                autoComplete='username'
                maxLength={254}
                required
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='password'>Contraseña</FieldLabel>
              <Input
                id='password'
                name='password'
                type='password'
                autoComplete='current-password'
                maxLength={72}
                required
                disabled={pending}
              />
            </Field>
            {error ? (
              <p role='alert' className='text-destructive text-sm'>
                {error}
              </p>
            ) : null}
            <Button type='submit' disabled={pending}>
              {pending ? 'Ingresando…' : 'Ingresar'}
            </Button>
            <Button type='button' variant='outline' onClick={restore} disabled={pending}>
              Restaurar sesión
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
