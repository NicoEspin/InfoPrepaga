# Auditoría de las plantillas — 28 de octubre de 2026

Se revisaron compatibilidad, dependencias, compilación, configuración, identidad, permisos básicos y conexión HTTP con PostgreSQL. No se implementaron funcionalidades comerciales del CRM ni se accedió a registros reales.

## Hallazgos y correcciones

Las ubicaciones corresponden al código final; las versiones originales están en los ZIP locales de `.starter-baseline/`.

| ID | Prioridad | Problema original y efecto | Corrección / ubicación |
| --- | --- | --- | --- |
| S01 | Crítica | El seed usaba una contraseña de administrador pública y restablecía la cuenta al ejecutarse. Compose lo ejecutaba en cada inicio. | Bootstrap explícito con variables locales; no reemplaza cuentas. Seed transaccional y fuera del arranque. `backend/prisma/seed.ts`, `compose.yaml`. |
| S02 | Alta | Había dos sistemas de identidad independientes: Clerk y JWT de NestJS. No había conexión autenticada entre plantillas. | Se retiró Clerk con la herramienta de limpieza incluida en el starter y se conectó Next.js a NestJS. BFF limitado a login/refresh/logout, cookies HttpOnly y comprobación de origen. `frontend/src/app/api/auth/[action]/route.ts`, `frontend/src/lib/session.ts`. |
| S03 | Alta | Logout eliminaba el refresh token, pero los access tokens seguían siendo válidos. | JWT ligado a una sesión existente y comprobada en cada solicitud protegida. `backend/src/auth/strategies/jwt.strategy.ts`. |
| S04 | Alta | La rotación no era atómica: dos solicitudes podían consumir el mismo refresh token. | Claim condicional y emisión dentro de una transacción; la integración prueba que solo una solicitud gana. `backend/src/auth/auth.service.ts`. |
| S05 | Alta | Registro público en una plataforma privada, roles USER/MANAGER y creación de roles arbitrarios. | Alta restringida a ADMIN; alta de VENDEDOR; controles administrativos también en servicios; solo dos nombres de rol admitidos; los vendedores no reciben permisos administrativos. Seed rechaza roles heredados para no migrar datos silenciosamente. `backend/src/auth/auth.controller.ts`, `backend/src/roles/roles.service.ts`, `backend/src/users/users.service.ts`. |
| S06 | Alta | npm audit inicial del backend: 56 alertas agregadas (5 críticas, 12 altas, 30 moderadas, 9 bajas), principalmente por CLI 7 y Jest 25. Swagger 12 no coincidía con Nest 11. | Conjunto NestJS 12.3.2, CLI 12.0.11, herramientas compatibles, Jest 30.5.2, ts-jest 29.4.15 y TypeScript 6.0.3. Instalación limpia y lockfile pnpm. `backend/package.json`. |
| S07 | Alta | Prisma CLI 7.10.1 con Client 6.19.3 y esquema/configuración de Prisma 6. | Ambos fijados a 6.19.3; se conserva esquema y migración. Override acotado de `@prisma/config>deepmerge-ts` a 8.0.2 para su aviso de seguridad; validación, generación y migración verificadas. `backend/package.json`, `backend/pnpm-lock.yaml`. |
| S08 | Alta | No había limitación de intentos de autenticación ni headers HTTP básicos. | Throttler global y límite de 10/minuto en autenticación, Helmet y headers en Next.js. Swagger deshabilitado en producción. El login BFF limita el cuerpo a 4 KiB. `backend/src/main.ts`, `backend/src/app.module.ts`, `frontend/next.config.ts`. |
| S09 | Alta | La configuración de Compose contenía secretos literales, publicaba la base sin limitar interfaz y ejecutaba API como root. | Variables requeridas, base privada en el stack completo y loopback en el Compose local; aplicaciones no root; migrador separado; sin descarga accidental de Prisma CLI con npx al arrancar. `compose.yaml`, Dockerfiles. |
| S10 | Alta | La auditoría instalada del frontend detectó tres avisos de prototype pollution sobre object-path 0.6, traído por sort-by. | Dependencia sin uso retirada junto con sus tipos. `frontend/package.json`. |
| S11 | Media | Sentry se inicializaba por defecto y faltaban condiciones para autorizar ese procesador externo. | Integración y dependencia retiradas; no hay envío de errores a terceros. Se corrigieron referencias que el cleanup original dejaba en varios boundaries. `frontend/src/app/dashboard/overview/`. |
| S12 | Media | Mock APIs y pantallas podían confundirse con funcionalidades reales; la limpieza de Clerk eliminaba checks sin sustituirlos. | Acceso de demos solo con ADMIN, entorno de desarrollo y bandera explícita; comprobación server-side, CSRF para mutaciones, banner; rutas y APIs bloqueadas en producción. `frontend/src/lib/demo-access.ts`, `frontend/src/app/dashboard/layout.tsx`, `frontend/src/proxy.ts`. |
| S13 | Media | Ambos servidores usaban el puerto 3000; el cliente `/api` no comunicaba con NestJS. | Frontend 3000, backend 3001; `BACKEND_URL` privada; readiness comprobada desde Next.js. El API client conserva headers personalizados, maneja 204 y evita caché autenticada. |
| S14 | Media | El build dependía de descargar 17 familias de Google Fonts; podía fallar sin acceso a ese servicio. | Geist Sans/Mono empaquetadas localmente; aliases de fuentes de temas para conservar sus ejemplos sin esas descargas. `frontend/src/components/themes/font.config.ts`, `frontend/src/styles/globals.css`. |
| S15 | Media | La edición de roles/permisos borraba y recreaba relaciones sin transacción. | Reemplazos atómicos; IDs únicos, un rol por asignación y nombres admitidos. `backend/src/users/users.service.ts`, `backend/src/roles/roles.service.ts`. |
| S16 | Media | Tooling y CI usaban gestores/versiones distintos, lint modificaba archivos, lockfile de pnpm se ignoraba y las plantillas de cleanup entraban al typecheck. | pnpm 10.32.1 en ambos paquetes, lockfiles conservados, scripts de lint separados de fix, CI actualizado, exclusión de cleanup-templates y formateo compatible con Windows. `backend/.github/workflows/ci.yml`, manifiestos y tsconfig. |
| S17 | Baja | Callbacks y componentes anidados de calendario/KBar se recreaban; efectos vacíos tras retirar Sentry; avisos de hooks y ordenamientos mutables. | Componentes estables, callbacks con dependencias precisas y ordenamientos sin mutación. Validación con lint estricto del frontend. |

No se encontró motivo para cambiar la versión mayor de Next.js: 16.4.2 ya superaba el parche 16.4.1 del aviso del 14/10. Se aplicó el parche publicado 16.4.3. La migración mayor de NestJS permitió alinear su ecosistema y usar versiones corregidas de dependencias HTTP. Node 24.22.1 satisface también el mínimo de las herramientas de generación de Nest 12.

La imagen PostgreSQL se fijó a 16.15 dentro de la misma versión mayor; no se actualizó ningún servidor de bases existente. [Notas oficiales de PostgreSQL 16.15](https://www.postgresql.org/docs/16/release-16-15.html).

Fuentes primarias: [actualización de seguridad de Next.js](https://nextjs.org/blog/nextjs-security-update-october-14-2026), [migración de NestJS 12](https://docs.nestjs.com/migration-guide), [cambios de Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7). Los resultados de auditoría se consultaron directamente al registry con los lockfiles instalados.

## Riesgo residual conocido

Queda **una alerta baja de desarrollo**, `deepmerge@4.3.1`, mediante `jest → @jest/core → jest-config`. [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) no informa una versión corregida. El paquete mezcla configuración de tests local; no integra las dependencias de producción. No se ocultó con un allowlist ni se forzó un reemplazo incompatible. No procesar configuración de tests no confiable. Revisar el aviso cuando haya una corrección del proveedor.

La auditoría de dependencias no demuestra ausencia de vulnerabilidades futuras o de fallos de negocio. Las restricciones de leads, tareas, métricas, exportaciones y MCP deberán verificarse al implementar esos módulos.

## Evidencia de verificación

Comandos finales ejecutados con Node 24.22.1 y pnpm 10.32.1. La prueba integrada usa PostgreSQL temporal en `127.0.0.1:55489/starter_test`, sin leer ni migrar la base configurada originalmente en `backend/.env`.

| Verificación | Resultado |
| --- | --- |
| Schema Prisma 6 y migración original | Schema válido; migración aplicada a la base descartable. |
| Backend `typecheck`, `lint`, `format:check` y `build` | Pasaron, sin errores. |
| `test --runInBand` / `test:e2e --runInBand` | 23 unitarios en 6 suites y 1 e2e pasaron. |
| Frontend `typecheck`, `lint:strict`, `format:check` y `build` standalone | Pasaron, sin errores ni advertencias de lint. |
| `node scripts/verify-starters.mjs` | 43 comprobaciones pasaron: PostgreSQL, NestJS, Next.js standalone y demos en desarrollo. |
| pnpm audit frontend | 0 avisos. |
| pnpm audit backend | 0 críticos/altos/moderados; 1 bajo de desarrollo sin parche. |
| Compose completo y Compose local del backend | `docker compose config --quiet`: ambos válidos con variables sintéticas. |
| Imágenes de Node/PostgreSQL | Tags publicados confirmados mediante `docker manifest inspect`. |
| Build y salud de contenedores | Verificados con Docker Engine 29.9.2: imágenes de API, frontend y migrador construidas; PostgreSQL, API y frontend saludables; migrador terminó con código 0. |
| `scripts/verify-docker.cjs` dentro de la imagen API | 26 comprobaciones pasaron: PostgreSQL 16.15, migración, Prisma y bcrypt en Linux, assets CSS, autenticación, cookies, logout y permisos de vendedor. |
| Runtime de las imágenes | API y frontend ejecutan como usuario `node`; sin `.env` locales en las imágenes y sin Jest en la imagen API de producción. |
| Reinicio e idempotencia Docker | La migración repetida terminó sin pendientes; los tres servicios recuperaron salud tras reiniciarse. Persistieron 2 usuarios sintéticos, 2 roles y 1 sesión. Health check verificado desde el host al finalizar. |
| Instalación congelada | `pnpm install --frozen-lockfile --ignore-scripts` pasó en ambos paquetes; instalación y generación de Prisma se ejecutaron previamente con scripts autorizados. |
| `pnpm audit --prod --audit-level=low` | Sin vulnerabilidades conocidas en ambos paquetes. |
| Seed repetido | Dos ejecuciones explícitas pasaron en la base descartable, sin restablecer usuarios. |
| Inspección final | `git diff --check` del backend pasó; sin cambios de esquema/migraciones. Escaneo de 320 archivos de código sin coincidencias de claves privadas o credenciales de proveedores. |

## Límites operativos

Las demos no forman parte del producto de producción. El rate limit actual usa memoria por instancia y agrega las solicitudes del BFF; un despliegue público necesita límites por cliente en el proxy y una configuración explícita de confianza. HTTPS, backups/restores y operación del servidor se configuran en una etapa posterior. La renovación desde la UI es explícita mediante Restaurar sesión.

Con aprobación explícita se cambió únicamente `PORT=3001` y la clave JWT de desarrollo en `backend/.env`, conservando las otras variables. Se creó `frontend/.env.local` con configuración de conexión sin secretos. No se cambiaron contraseñas de bases de datos ni secretos de producción. No se ejecutó un seed sobre la base original. Los ZIP iniciales preservan los archivos del starter y los cambios locales iniciales de manifiestos del backend, sin incluir `.env`, node_modules ni el repositorio Git.

Los procesos de integración y PostgreSQL temporal se detuvieron después de verificar. La base sintética se conserva en `.starter-tools/pgdata`. La comparación local del frontend contra su ZIP distinguió cambios de contenido y cambios solo de finales de línea por el formateo LF; también se retiraron las integraciones incompatibles. Las copias originales permiten revisar o revertir estas adaptaciones.

## Validación Docker completada

Se usó exclusivamente el proyecto Compose `infoprepaga-starter-verify`, con variables de prueba en `.starter-tools/docker-test.env`, volumen separado `infoprepaga-starter-verify_starter_postgres` y frontend en `127.0.0.1:3330`. La base arrancó con 0 usuarios y 0 roles: el arranque no ejecutó un seed ni creó credenciales predeterminadas. Las cuentas se generaron después, únicamente dentro de la base sintética, para las pruebas. PostgreSQL y API no publicaron puertos al host.

Comandos principales ejecutados:

```powershell
docker compose --env-file .starter-tools/docker-test.env -p infoprepaga-starter-verify up --build -d --wait --wait-timeout 180
Get-Content -Raw scripts/verify-docker.cjs | docker compose --env-file .starter-tools/docker-test.env -p infoprepaga-starter-verify exec -T -e STARTER_DOCKER_VERIFY=true api node
docker compose --env-file .starter-tools/docker-test.env -p infoprepaga-starter-verify run --rm --no-deps migrate
docker compose --env-file .starter-tools/docker-test.env -p infoprepaga-starter-verify restart postgres api web
docker compose --env-file .starter-tools/docker-test.env -p infoprepaga-starter-verify up -d --wait --wait-timeout 120
```

Además se verificaron usuarios de ejecución, ausencia de archivos de entorno locales, conservación de los registros sintéticos y acceso a `/api/health` desde el host. No fue necesario corregir los Dockerfiles para completar esta validación. El aviso bajo de desarrollo de Jest sigue siendo el único riesgo de dependencias conocido registrado en este informe.

Al terminar se ejecutó Compose down sin eliminar volúmenes. No quedan contenedores de prueba activos; el volumen sintético y las imágenes verificadas se conservaron.
