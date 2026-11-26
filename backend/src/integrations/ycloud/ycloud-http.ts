import type { NestExpressApplication } from '@nestjs/platform-express';
import { YCLOUD_BODY_LIMIT } from './ycloud.config';

/** Install before app.init/listen, with rawBody:true, also in HTTP tests. */
export function configureYCloudHttp(app: NestExpressApplication) {
  // Registering any jsonParser tells Nest to skip its default JSON parser.
  // Explicitly preserve that parser (100 KiB) for every other route.
  app.useBodyParser('json', {
    limit: 100 * 1024,
    type: (request) =>
      !/^\/webhooks\/ycloud\/?(?:\?|$)/.test(request.url ?? '') &&
      !/^\/integrations\/v1\/leads\//.test(request.url ?? '') &&
      /^application\/json(?:\s*;|$)/i.test(
        request.headers['content-type'] ?? '',
      ),
  });
  app.useBodyParser('json', {
    limit: 8192,
    inflate: false,
    type: (request) =>
      /^\/integrations\/v1\/leads\//.test(request.url ?? '') &&
      /^application\/json(?:\s*;|$)/i.test(
        request.headers['content-type'] ?? '',
      ),
  });
  app.useBodyParser('json', {
    limit: YCLOUD_BODY_LIMIT,
    inflate: false,
    type: (request) =>
      /^\/webhooks\/ycloud\/?(?:\?|$)/.test(request.url ?? '') &&
      /^application\/json(?:\s*;|$)/i.test(
        request.headers['content-type'] ?? '',
      ),
  });
}
