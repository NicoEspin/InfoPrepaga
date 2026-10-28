# InfoPrepaga — base técnica de los starters

Repositorio del CRM: [NicoEspin/InfoPrepaga](https://github.com/NicoEspin/InfoPrepaga). Para incorporarse al desarrollo, leer [CONTRIBUTING.md](CONTRIBUTING.md) y [AGENTS.md](AGENTS.md). El CI de ambos paquetes está en `.github/workflows/ci.yml`.

El starter reutilizable ya está publicado como template independiente. Consultar [repositorio, reutilización y desvinculación local](docs/starter-template.md).

Frontend Next.js y backend NestJS conectados por HTTP. Esta etapa prepara las plantillas; todavía no implementa leads, Avalian, pipeline ni reglas comerciales. Las demos usan datos sintéticos y no representan métricas del CRM.

## Arranque local

Requisitos: Node **24.22.1** (ver `.nvmrc`), pnpm **10.32.1** y PostgreSQL. No hace falta un workspace de paquetes: `frontend/` y `backend/` conservan sus propios manifiestos y lockfiles.

1. Revisar `backend/.env.example` y configurar `backend/.env`. Si ya existe, conservar sus valores y revisar las diferencias; no sobrescribirlo. Usar `PORT=3001`, una clave JWT aleatoria de al menos 32 caracteres y una base de desarrollo autorizada. No usar datos personales reales.
2. Copiar `frontend/.env.example` a `frontend/.env.local`. Los valores locales son `BACKEND_URL=http://127.0.0.1:3001`, `APP_ORIGIN=http://localhost:3000` y `ENABLE_STARTER_DEMOS=true`.
3. Instalar y preparar el backend:

   ```powershell
   cd backend
   pnpm install --frozen-lockfile
   pnpm prisma:generate
   # Solo sobre la base de desarrollo elegida y revisada:
   pnpm prisma:deploy
   pnpm prisma:seed
   pnpm start:dev
   ```

4. En otra terminal:

   ```powershell
   cd frontend
   pnpm install --frozen-lockfile
   pnpm dev
   ```

5. Abrir [el entorno local](http://localhost:3000). [El health check](http://localhost:3000/api/health) debe devolver `backend: connected`. NestJS consulta PostgreSQL en `/ready`; `/` es solo liveness. Swagger está en [localhost:3001/docs](http://localhost:3001/docs) durante desarrollo y se deshabilita en producción.

Para una base local con Docker puede usarse `pnpm db:up` dentro de `backend/`, tras configurar las variables `POSTGRES_*`. Publica PostgreSQL solamente en `127.0.0.1:5433`. Este comando conserva el volumen existente: verificar sus credenciales y contenido antes de usarlo.

## Primer administrador

No existen credenciales predeterminadas ni registro público. Sobre una base nueva, ejecutar el seed explícitamente con `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` definidos en el entorno local. La contraseña debe tener al menos 12 caracteres y como máximo 72 bytes UTF-8. El seed crea `ADMIN`, `VENDEDOR` y permisos administrativos; no restablece contraseñas ni modifica usuarios existentes. Después, retirar las variables de bootstrap del entorno.

Si el correo ya existe, el bootstrap falla sin cambiar la cuenta. Si hay roles antiguos `USER`/`MANAGER`, falla para exigir una migración de datos revisada. No elimina roles ni datos existentes automáticamente.

El administrador puede crear vendedores desde `POST /auth/register` autenticado en NestJS. No hay todavía interfaz de administración del CRM. La pantalla de usuarios del starter es una **demo sintética**, no la administración real de cuentas.

## Identidad y conexión

| Frontera | Comportamiento |
| --- | --- |
| Navegador → Next.js | `/api/auth/login`, `/refresh`, `/logout`; cookies HttpOnly, SameSite Strict y Secure en producción; verificación del origen configurado. |
| Next.js → NestJS | URL privada `BACKEND_URL`, tokens enviados solo desde el servidor, sin caché de sesiones. |
| NestJS → PostgreSQL | Prisma 6.19.3, cliente y CLI alineados; sin cambios del esquema ni de las migraciones originales. |
| Sesión | JWT de 15 minutos por defecto, refresh de 7 días, rotación atómica y consulta de sesión/usuario actual en cada petición protegida. Logout invalida también el JWT asociado. |
| Demos | Requieren desarrollo, `ENABLE_STARTER_DEMOS=true` y rol `ADMIN`; banner de datos sintéticos. Nunca se habilitan en producción. |

Cuando vence el acceso, la pantalla de ingreso permite **Restaurar sesión**. La renovación es explícita; no hay todavía renovación automática en segundo plano. No se guardan tokens en localStorage ni se usan Clerk, Sentry, servicios de IA o un ORM dentro del frontend.

Las cookies `Secure` requieren HTTPS en producción. `APP_ORIGIN` debe coincidir exactamente con la URL que usa el navegador, incluyendo protocolo y puerto. Las demos mantienen sus ejemplos originales en inglés; las nuevas pantallas de conexión usan español.

## Verificación

```powershell
pnpm -C backend prisma:generate
pnpm -C backend format:check
pnpm -C backend lint
pnpm -C backend typecheck
pnpm -C backend test --runInBand
pnpm -C backend test:e2e --runInBand
pnpm -C backend build
pnpm -C frontend format:check
pnpm -C frontend lint:strict
pnpm -C frontend typecheck
$env:BUILD_STANDALONE='true'
pnpm -C frontend build
```

La prueba de integración completa requiere una base **local y descartable llamada `starter_test`**, con la migración aplicada. El harness rechaza otros nombres y hosts. Crea exclusivamente cuentas sintéticas, arranca servidores en los puertos 3310/3311 y los detiene al finalizar; los registros quedan en esa base descartable.

```powershell
# Usar credenciales de esa base descartable, nunca las de producción.
$env:DATABASE_URL='postgresql://starter_test@127.0.0.1:55489/starter_test?schema=public'
pnpm -C backend prisma:deploy
node scripts/verify-starters.mjs
```

El harness usa el frontend standalone construido y un servidor de desarrollo en el puerto 3312, y comprueba cookies, autorización negativa de vendedores, registro restringido, rotación concurrente, revocación, CSRF, rate limit y conectividad real con PostgreSQL. La ausencia de módulos comerciales hace que las pruebas de aislamiento de leads, tareas, métricas y MCP correspondan a su futura implementación.

## Docker y despliegue posterior

`compose.yaml` prepara PostgreSQL, migraciones, API y frontend. Requiere un `.env` raíz propio, basado en `.env.example`, con credenciales únicas. La URL de la base debe usar el host `postgres` y coincidir con `POSTGRES_*`. Nunca publicar esos valores.

```powershell
docker compose config --quiet
docker compose up --build -d
```

El volumen raíz `starter_postgres` está separado del volumen del Compose local del backend. La base y API del stack completo no publican puertos al host. El frontend publica solo `127.0.0.1:3000` (o el puerto definido en `WEB_PORT`): delante debe existir un proxy HTTPS. Ambos contenedores de aplicación ejecutan como usuario no root. El proceso de migración es independiente y no hace seed al arrancar. No ejecutar `down -v` sobre datos que deban conservarse.

El rate limit usa memoria y el backend ve al BFF como origen de las peticiones. Para un despliegue público habrá que configurar límites por cliente en el proxy y su frontera de confianza; no se agregan Redis ni servicios externos en esta etapa. También quedan fuera de esta preparación la operación de backups/restores y la configuración del servidor HTTPS.

Las imágenes y el stack completo se verificaron también con Docker durante la preparación de los starters: 26 comprobaciones dentro de los contenedores, migraciones repetibles y persistencia tras reinicio. El harness `scripts/verify-docker.cjs` requiere una base descartable llamada `starter_test` y la bandera explícita `STARTER_DOCKER_VERIFY=true`. Consultar el [informe de auditoría](docs/starter-audit.md) para comandos, resultados y límites de esa verificación. Las copias originales se conservan localmente en `.starter-baseline/`, excluidas de Git y de las imágenes; no son necesarias para clonar, compilar o ejecutar el proyecto.
