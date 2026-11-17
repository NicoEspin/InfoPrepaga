import type { ReactNode, Ref } from 'react';

export function CrmPageHeader({
  title,
  description,
  actions,
  headingRef
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between'>
      <div className='min-w-0 space-y-1'>
        <h1
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className='focus-visible:outline-ring text-2xl font-bold tracking-tight sm:text-3xl'
        >
          {title}
        </h1>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </div>
      {actions && <div className='flex flex-wrap items-center gap-2'>{actions}</div>}
    </header>
  );
}
