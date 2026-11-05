# InfoPrepaga CRM

Reportes y Pipeline: [contrato de cálculo, API, migración, permisos y descarga PDF local](docs/commercial-reports.md).

Administración actual: [cuentas ADMIN/VENDEDOR, bajas restaurables y renovación automática de sesión](docs/accounts-and-sessions.md).

Mejoras de experiencia de uso: [cargas, guardados, errores y recuperación](docs/frontend-feedback.md).

Leads, perfil, notas y Seguimientos ya tienen persistencia en NestJS/PostgreSQL. ADMIN administra toda la cartera, vendedores y bases; VENDEDOR gestiona únicamente sus asignados. El reparto usa una rotación transaccional entre vendedores activos habilitados y recupera pendientes al reactivarlos o reiniciar el backend.

Documentación actual: [decisiones e implementación](docs/backend-plan.md), [contratos, migraciones y pruebas](docs/backend-api.md), [deuda técnica y próximas etapas](docs/technical-debt.md). Antes de iniciar esta versión, revisar la base de desarrollo y aplicar la nueva migración con `pnpm -C backend prisma:deploy`. No se aplicaron migraciones a la base configurada del propietario: la verificación usa exclusivamente una base descartable.

`/leads` y `/followups` funcionan con ambos roles en producción; `/settings` es administrativo. Pipeline tiene persistencia comercial y Reportes es exclusivo de ADMIN. Avalian conserva su demo restringida. Adjuntos e importación Excel tienen implementación propia; las notificaciones automáticas siguen pendientes. Los vendedores nuevos comienzan con recepción pausada y se habilitan desde Administración.

<details>
<summary>Historial de preparación de los starters y demos anteriores</summary>

Las descripciones de demos de Leads, perfil, Seguimientos y Pipeline de este bloque documentan la etapa anterior. Leads, Seguimientos y Pipeline ya usan la API persistente; Reportes utiliza esos datos y es exclusivo de ADMIN. El comportamiento vigente se describe en los documentos enlazados arriba. Se conserva este historial y el trabajo previo de frontend.

Repositorio del CRM: [NicoEspin/InfoPrepaga](https://github.com/NicoEspin/InfoPrepaga). Para incorporarse al desarrollo, leer [CONTRIBUTING.md](CONTRIBUTING.md) y [AGENTS.md](AGENTS.md). El CI de ambos paquetes está en `.github/workflows/ci.yml`.

El starter reutilizable ya está publicado como template independiente. Consultar [repositorio, reutilización y desvinculación local](docs/starter-template.md).

Frontend Next.js y backend NestJS conectados por HTTP. Esta etapa prepara las plantillas; todavía no implementa leads, Avalian, pipeline ni reglas comerciales. Las demos usan datos sintéticos y no representan métricas del CRM.

El listado de leads tiene una **vista previa frontend** en `/leads`, accesible desde la navegación del starter. Requiere sesión `ADMIN`, desarrollo y `ENABLE_STARTER_DEMOS=true`; devuelve 404 en producción. Sigue la referencia visual aprobada, con búsqueda por nombre/contacto/empresa, filtros combinados, orden, selección por página, paginación de ocho filas y consulta de datos de ejemplo. Las 16 filas son sintéticas y los contactos usan `example.com`. Los filtros inician sin restricciones para que el total y las filas sean coherentes. Las fechas se presentan en la zona de Buenos Aires. No persiste cambios ni llama a una API comercial: creación, edición, reasignación e importación quedan deshabilitadas hasta implementar contratos y autorización en NestJS. Los restantes módulos de la navegación están pendientes.

El pipeline tiene una **vista previa Kanban** en `/pipeline`, con la misma restricción de acceso que `/leads`. Comparte navegación con el listado y presenta 18 oportunidades sintéticas en las cinco etapas de la referencia. Permite arrastrar y reordenar tarjetas con mouse, táctil y teclado, o cambiar de etapa desde el menú. Busca por nombre/empresa y filtra por vendedor, próxima actividad, origen y prioridad. Los totales e importes ilustrativos en ARS se calculan sobre las tarjetas visibles. Los filtros de fecha toman el día actual de Buenos Aires, enviado desde el servidor; las fechas de ejemplo son fijas. Los filtros conservan las tarjetas ocultas durante movimientos y cancelar restaura el tablero. Los movimientos se mantienen solo en memoria y recargar restablece la demo. No hay nuevas reglas comerciales ni persistencia; crear oportunidades queda pendiente de la API de NestJS.

Seguimientos y tareas tiene una **vista previa frontend** en `/followups`, accesible desde la navegación compartida y restringida a `ADMIN` en desarrollo con `ENABLE_STARTER_DEMOS=true`. Las 18 tareas sintéticas se generan alrededor del día de Buenos Aires enviado por el servidor. Listado, contadores y calendario comparten búsqueda y filtros de estado, vendedor y prioridad. Las tareas se agrupan por fecha local: vencidas (días anteriores, sin completar), hoy, próximas y completadas. “Completadas esta semana” cuenta la fecha de finalización de lunes a domingo. El calendario ofrece semana, día y mes, navegación, selección de fecha, distribución de citas simultáneas y acceso a tareas fuera de 08:00–19:00. Se puede crear, editar, completar y reabrir tareas solo en memoria; recargar restablece la demo. Las duraciones de 30/60/90 minutos y campos del formulario son provisionales para la vista previa. No hay persistencia, notificaciones ni recordatorios; estos requieren contratos, permisos y ejecución durable en NestJS.

El **perfil reutilizable del lead** se monta una sola vez desde el proveedor global de la aplicación. Cualquier componente cliente puede usar `useLeadProfile()` de `frontend/src/features/lead-profile/components/lead-profile-provider.tsx` y llamar `openLead(leadId)`. Ya está integrado en Leads, Pipeline, prospectos de Seguimientos, contactos de la agenda y el editor de tareas. Los registros de demo tienen relaciones `leadId` explícitas; no se buscan personas por nombre. Un contacto libre creado desde una tarea no se convierte automáticamente en lead. Los datos de un prospecto vinculado no se editan desde el formulario de tareas.

Cada apertura hace una consulta HTTP independiente al endpoint provisional `GET /api/demo/lead-profiles/:leadId`, protegido por `checkDemoAccess` (sesión NestJS, `ADMIN`, demos habilitadas y nunca producción). La respuesta tipada y su ID se validan antes de mostrarse. El cliente está separado en `features/lead-profile/api/{types,service,queries}.ts` para conectar posteriormente el contrato aprobado de NestJS. Por ahora todos los perfiles, historial y actividades son sintéticos. Editar, crear tarea y cambiar estado quedan pendientes; agregar notas y completar la actividad son demostraciones locales del modal y no modifican otras pantallas.

Al cerrar o cambiar de lead, se desmontan el diálogo y sus estados locales, se aborta la consulta mediante `AbortSignal` y se elimina la caché con `gcTime: 0`. La clave combina ID y apertura; no se usa `placeholderData`. Incluso reabrir el mismo lead vuelve a consultar y reinicia notas, borrador y actividad local. Incluye carga, errores con reintento, 401/403/404, historial vacío, ausencia de próxima actividad, foco contenido en el diálogo, Escape y restauración del foco. Las pruebas de `scripts/verify-lead-profile.mjs` cubren respuestas fuera de orden, cancelación, reapertura, caché vacía e IDs incorrectos.

La **cartera Avalian** tiene una vista previa independiente en `/avalian`, restringida a `ADMIN` en desarrollo con `ENABLE_STARTER_DEMOS=true`. Presenta 24 registros sintéticos, con búsqueda por nombre/identificador sin distinción de tildes, filtros combinados por estado y lote, orden, paginación de diez filas y consulta propia de registros y lotes. Los indicadores muestran el total de la vista, la última fecha de lote y los registros `En revisión`; la tabla aplica sus filtros por separado. No se muestra una variación porcentual sin datos comparables.

“Importar registros autorizados” abre un lote ficticio de cuatro registros para revisar el flujo. Cancelar no cambia el listado; confirmar agrega el lote solo en memoria, actualiza los indicadores y el historial, conserva los filtros y vuelve a la primera página. Una confirmación repetida del mismo lote no lo agrega dos veces. Recargar restablece los ejemplos. La simulación no lee archivos, no consulta Avalian, no envía datos a IA y no implementa sincronización, validación real ni reglas de duplicados. La importación real requiere un canal autorizado y contratos de NestJS. Los registros Avalian no tienen `leadId`, no abren el perfil comercial, no crean leads ni habilitan contactos. La consulta y el historial usan sus propios diálogos y se desmontan al cerrar.

Las rutas `/leads`, `/pipeline`, `/followups` y `/avalian` comparten ahora la sidebar, cabecera, controles de sesión del dashboard original. Conservan sus URLs y funcionalidades de demo. Los estilos del contenido y del perfil de lead heredan el tema activo, incluido el modo oscuro; la navegación independiente de InfoPrepaga fue retirada.

</details>

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

El administrador puede crear vendedores desde `/settings` o `POST /auth/register` autenticado en NestJS. La pantalla de usuarios del starter sigue siendo una **demo sintética**; la administración real inicial se encuentra en `/settings`.

## Identidad y conexión

| Frontera | Comportamiento |
| --- | --- |
| Navegador → Next.js | `/api/auth/login`, `/refresh`, `/logout`; cookies HttpOnly, SameSite Strict y Secure en producción; verificación del origen configurado. |
| Next.js → NestJS | URL privada `BACKEND_URL`, tokens enviados solo desde el servidor, sin caché de sesiones. |
| NestJS → PostgreSQL | Prisma 6.19.3, cliente y CLI alineados; sin cambios del esquema ni de las migraciones originales. |
| Sesión | JWT de 15 minutos por defecto, refresh de 7 días, rotación atómica y consulta de sesión/usuario actual en cada petición protegida. Logout invalida también el JWT asociado. |
| Demos | Requieren desarrollo, `ENABLE_STARTER_DEMOS=true` y rol `ADMIN`; banner de datos sintéticos. Nunca se habilitan en producción. |

Cuando vence el acceso, se renueva automáticamente con coordinación entre pestañas. Sin soporte de Web Locks se conserva **Restaurar sesión**. Las escrituras no se reenvían automáticamente; se conservan los campos y se pide confirmar nuevamente. No se guardan tokens en localStorage ni se usan Clerk, Sentry, servicios de IA o un ORM dentro del frontend.

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
node --experimental-strip-types frontend/scripts/verify-followups.mjs
node --experimental-strip-types frontend/scripts/verify-lead-profile.mjs
node --experimental-strip-types frontend/scripts/verify-avalian.mjs
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

La navegación activa muestra únicamente los módulos de InfoPrepaga. Los accesos de ejemplo del starter están comentados y `/dashboard/*` devuelve 404; sus páginas y componentes (incluidos chat e IA) se conservan para futuras funcionalidades. El ingreso abre `/leads`. El header incluye el selector de temas junto al modo nocturno y conserva la preferencia en una cookie. Los accesos a GitHub, notificaciones ficticias y panel de documentación del starter están comentados.

El perfil comercial del lead incluye **Archivos adjuntos** con carga privada a Cloudflare R2, listado paginado, descarga temporal, cambio de nombre y eliminación del objeto en R2 junto con sus metadatos. Admite PDF, PNG y JPEG de hasta 10 MB y aplica los permisos del lead desde NestJS. Ver [configuración y recuperación de adjuntos](docs/lead-attachments.md). Los perfiles de demostración conservan sus adjuntos locales temporales, que se descartan al cerrar.
