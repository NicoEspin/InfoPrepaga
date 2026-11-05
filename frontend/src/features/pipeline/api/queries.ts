import { queryOptions } from '@tanstack/react-query';
import { pipelinePage } from './service';
export const pipelineQuery = (actor: string, query: string) =>
  queryOptions({
    queryKey: ['pipeline', actor, query],
    queryFn: ({ signal }) => pipelinePage(query, signal)
  });
