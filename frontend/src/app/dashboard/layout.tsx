import type { Metadata } from 'next';
// import DemoLayout from '@/components/layout/demo-layout';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'InfoPrepaga',
  description: 'CRM InfoPrepaga',
  robots: {
    index: false,
    follow: false
  }
};

export default function DashboardLayout() {
  // Rutas del starter fuera del CRM deshabilitadas. Se conservan páginas y componentes.
  // return <DemoLayout>{children}</DemoLayout>;
  notFound();
}
