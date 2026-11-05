import { queryOptions } from '@tanstack/react-query';
import { reportCatalogs, reportHistory } from './service';
export const reportKeys = { all: (actor: string) => ['reports', actor] as const };
export const catalogsQuery = (actor: string) =>
  queryOptions({
    queryKey: [...reportKeys.all(actor), 'catalogs'],
    queryFn: ({ signal }) => reportCatalogs(signal)
  });
export const historyQuery = (actor: string, page: number) =>
  queryOptions({
    queryKey: [...reportKeys.all(actor), 'history', page],
    queryFn: ({ signal }) => reportHistory(page, signal)
  });
