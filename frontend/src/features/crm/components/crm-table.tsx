import type { ReactNode } from 'react';
import { Table } from '@/components/ui/table';

export function CrmTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role='region'
      aria-label={label}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll wide tables.
      tabIndex={0}
      className='bg-card text-card-foreground focus-visible:outline-ring min-w-0 overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:-outline-offset-2 [&>[data-slot=table-container]]:overflow-visible'
    >
      <Table>{children}</Table>
    </div>
  );
}
