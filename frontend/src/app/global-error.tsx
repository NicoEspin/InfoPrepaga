'use client';
import Link from 'next/link';

export default function GlobalError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang='es-AR'>
      <body>
        <main
          style={{
            fontFamily: 'system-ui, sans-serif',
            maxWidth: '36rem',
            margin: '15vh auto',
            padding: '1.5rem'
          }}
          role='alert'
        >
          <h1>No pudimos iniciar InfoPrepaga</h1>
          <p>Intentá nuevamente en unos instantes.</p>
          <button onClick={reset}>Volver a intentar</button>
          {' · '}
          <Link href='/auth/sign-in'>Volver al ingreso</Link>
        </main>
      </body>
    </html>
  );
}
