# Frontend del entorno base

Next.js 16.4.3, React 19.3, TypeScript 7, Tailwind 4 y componentes shadcn/Base UI. Node 24.22.1 y pnpm 10.32.1.

La identidad proviene exclusivamente de NestJS. La conexión se configura con `.env.local`, usando `.env.example` como referencia. No requiere Clerk, Sentry ni PostgreSQL dentro de Next.js.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Para habilitar los ejemplos sintéticos: `ENABLE_STARTER_DEMOS=true`, entorno de desarrollo y cuenta ADMIN del backend. Las demos están deshabilitadas en producción.

La [guía raíz](../README.md) explica la base de datos, bootstrap, sesiones y Docker. El [informe](../docs/starter-audit.md) lista problemas, correcciones y verificaciones. Los ejemplos conservados no son módulos del CRM.

Validación: `pnpm format:check`, `pnpm lint:strict`, `pnpm typecheck`, `pnpm build`. Para Docker se activa `BUILD_STANDALONE=true` antes del build. Las fuentes Geist se sirven localmente desde su paquete.

Se conserva la licencia y atribución del starter original en LICENSE. El contenido original está respaldado localmente en `.starter-baseline/frontend-original.zip`.
