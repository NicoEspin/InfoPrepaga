// Single-process Next.js development server used only by the integration harness.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const next = require('next');
const app = next({
  dev: true,
  dir: fileURLToPath(new URL('../frontend/', import.meta.url)),
  hostname: '127.0.0.1',
  port: 3312
});
await app.prepare();
createServer(app.getRequestHandler()).listen(3312, '127.0.0.1');
