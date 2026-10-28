# Backend del entorno base

NestJS 12.3.2, TypeScript 6 y Prisma 6.19.3 con PostgreSQL. Node 24.22.1 y pnpm 10.32.1. El CLI y Prisma Client tienen la misma versión; no se alteró el esquema ni la migración original.

```powershell
pnpm install --frozen-lockfile
pnpm prisma:generate
# Configurar .env y revisar la base de desarrollo antes de migrar:
pnpm prisma:deploy
pnpm prisma:seed
pnpm start:dev
```

El backend usa puerto 3001. `/` comprueba el proceso y `/ready` consulta la base; `/docs` se publica solamente fuera de producción. Crear un administrador requiere el bootstrap explícito documentado en la [guía raíz](../README.md); no hay contraseña predeterminada.

| Ruta | Acceso |
| --- | --- |
| `POST /auth/login` | Público, limitado a 10 intentos por minuto. |
| `POST /auth/refresh` | Refresh válido, rotación atómica. |
| `POST /auth/logout` | Revoca sesión y JWT asociado. |
| `POST /auth/register` | ADMIN; crea una cuenta VENDEDOR. |
| `GET /users/me` | Sesión vigente. |
| `/users`, `/roles`, `/permissions` | ADMIN y permisos aplicables, según los controladores. |

Cada JWT está ligado a una fila de sesión revocable y se contrasta con el usuario activo y sus roles actuales. El navegador opera a través de Next.js y cookies HttpOnly; la API REST acepta Bearer para integraciones controladas. No existen módulos comerciales ni herramientas MCP todavía.

Validación: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test --runInBand`, `pnpm test:e2e --runInBand`, `pnpm build`. Jest se ejecuta con el soporte VM Modules que requiere Nest 12. La CI usa esas mismas herramientas. El [informe de auditoría](../docs/starter-audit.md) registra un aviso bajo sin parche en una dependencia de desarrollo de Jest.

Docker: `Dockerfile` tiene targets separados para migraciones y runtime sin usuario root. `docker-compose.yml` levanta solamente una base local en loopback; el [Compose raíz](../compose.yaml) conecta ambas aplicaciones y PostgreSQL sin publicar la base ni ejecutar seeds al arrancar.
