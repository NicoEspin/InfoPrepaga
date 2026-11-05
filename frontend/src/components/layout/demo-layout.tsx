import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
// import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { SessionControls } from '@/components/layout/session-controls';

export default async function DemoLayout({
  children,
  preview = true
}: {
  children: React.ReactNode;
  preview?: boolean;
}) {
  const user = await requireSession();
  if (
    preview &&
    (process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_STARTER_DEMOS !== 'true' ||
      !user.roles.includes('ADMIN'))
  ) {
    notFound();
  }
  // Persisting the sidebar state in the cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  return (
    <KBar>
      <SidebarProvider defaultOpen={defaultOpen}>
        <a
          href='#main-content'
          className='bg-background ring-ring sr-only rounded-md px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:ring-2'
        >
          Ir al contenido
        </a>
        <AppSidebar />
        <SidebarInset id='main-content' tabIndex={-1} className='min-w-0 scroll-mt-16'>
          <Header />
          <div
            role='status'
            className='bg-muted flex flex-wrap items-center justify-between gap-3 p-3 text-sm'
          >
            <span>
              InfoPrepaga · {preview ? 'Vista previa · Datos sintéticos · ' : ''}
              {user.email}
            </span>
            <SessionControls />
          </div>
          <InfobarProvider defaultOpen={false}>
            {children}
            {/* Panel de documentación del starter conservado: <InfoSidebar side='right' /> */}
          </InfobarProvider>
        </SidebarInset>
      </SidebarProvider>
    </KBar>
  );
}
