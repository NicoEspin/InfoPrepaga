import Link from 'next/link';
export default function Page() {
  return (
    <main className='mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6'>
      <h1 className='text-2xl font-semibold'>InfoPrepaga CRM</h1>
      <p>Gestión privada de leads y seguimientos comerciales.</p>
      <Link className='underline' href='/auth/sign-in'>
        Ingresar al CRM
      </Link>
      <Link className='underline' href='/api/health'>
        Verificar conexión con el backend
      </Link>
    </main>
  );
}
