import DemoLayout from '@/components/layout/demo-layout';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <DemoLayout preview={false}>{children}</DemoLayout>;
}
