import './crm-workspace.css';

export function CrmContent({
  children,
  search
}: {
  children: React.ReactNode;
  search?: React.ReactNode;
}) {
  return (
    <div className='crm-content min-w-0 flex-1'>
      {search ? <div className='crm-search-toolbar'>{search}</div> : null}
      {children}
    </div>
  );
}
