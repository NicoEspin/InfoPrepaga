'use client';

import type { NavItem, NavGroup } from '@/types';
import { useIdentity } from '@/features/crm/api';

export function useFilteredNavItems(items: NavItem[]) {
  const { data } = useIdentity();
  return items.filter(
    (item) =>
      (!item.access?.role || data?.roles.includes(item.access.role as 'ADMIN' | 'VENDEDOR')) &&
      (!item.title.includes('Vista previa') || data?.demosEnabled)
  );
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  const { data } = useIdentity();
  return groups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (!item.access?.role || data?.roles.includes(item.access.role as 'ADMIN' | 'VENDEDOR')) &&
        (!item.title.includes('Vista previa') || data?.demosEnabled)
    )
  }));
}
