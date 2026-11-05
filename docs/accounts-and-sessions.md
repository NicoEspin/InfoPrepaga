# Administrador y renovación de sesión

Solo ADMIN puede acceder a **Administrador → Usuarios** (`/settings`). Permite crear ADMIN y VENDEDOR, editar sus datos, desactivar, eliminar mediante baja lógica y restaurar. Reparto y Bases conservan sus controles en pestañas separadas.

## Uso

1. Crear usuario con nombre, correo, contraseña y un único rol. Apellido es opcional. La contraseña requiere al menos 12 caracteres y hasta 72 bytes UTF-8. Crear no inicia una sesión de la cuenta nueva.
2. Editar permite dejar la contraseña vacía para conservarla. Las contraseñas existentes nunca se muestran. Cambiar correo, contraseña o rol cierra todas las sesiones de esa cuenta.
3. Al eliminar, desactivar o cambiar de rol una cuenta con leads o tareas pendientes, elegir un vendedor activo de reemplazo. Puede tener el reparto pausado. Se transfieren también tareas independientes; tareas completadas y autores conservan su historia.
4. El filtro Eliminadas permite restaurar cuentas. Recuperan el acceso y conservan su rol, con recepción pausada y sin recuperar cartera transferida. Se puede establecer una contraseña nueva.

El correo de una cuenta eliminada continúa reservado. ADMIN nunca participa del reparto. Vendedores nuevos/restaurados comienzan con recepción pausada. No se permite eliminar, desactivar ni cambiar el propio rol; tampoco dejar al sistema sin ADMIN activo.

## Contratos

El navegador usa `/api/admin/users`; el BFF envía la sesión a `/users` de NestJS. Las mutaciones requieren origen válido y JSON de hasta 16 KiB. NestJS valida rol y alcance, con comprobación adicional del administrador actual dentro de la transacción de escritura.

| Método y ruta NestJS | Comportamiento |
| --- | --- |
| `GET /users?q=&role=&state=&page=1&pageSize=20` | Búsqueda por nombre/apellido/correo, rol opcional ADMIN/VENDEDOR, estados active/inactive/deleted/all. Sin estado: no eliminadas. Máximo 100 filas. Respuesta `{items,total,page,pageSize}`. Omitir filtros vacíos de rol/estado. |
| `POST /users` | `{firstName,lastName?,email,password,role}`; devuelve cuenta segura sin tokens. |
| `PATCH /users/:id` | `{version,firstName?,lastName?,email?,password?,role?,replacementId?}`. Omitir password para conservarla. |
| `POST /users/:id/deactivate` | `{version,replacementId?}`; impide acceso y transfiere pendientes. |
| `POST /users/:id/delete` | `{version,replacementId?}`; baja lógica restaurable. |
| `POST /users/:id/restore` | `{version,password?}`; reactiva y pausa recepción. |

Las cuentas incluyen `deletedAt`, `version`, roles y contadores de leads/tareas pendientes para confirmar transferencias. Una versión obsoleta devuelve 409; sin reemplazo válido cuando es necesario, 400. La confirmación revalida los vínculos bajo el bloqueo comercial; los contadores de la interfaz son informativos. Operaciones de creación, cambios, transferencias y recuperación generan auditoría sin credenciales ni tokens.

`GET /users` cambia del array heredado al contrato paginado: actualizar consumidores directos. `GET /crm/users` conserva el catálogo comercial anterior. El registro administrativo heredado `/auth/register` conserva su respuesta con tokens por compatibilidad, pero usa la creación centralizada. La nueva pantalla usa exclusivamente `/users`. Los endpoints heredados de roles y activación aplican las mismas reglas; si necesitan reemplazo, usar la nueva operación con `replacementId`.

## Sesiones

Se conservan JWT, refresh rotativo, cookies HttpOnly/SameSite Strict y Secure en producción. Los tiempos siguen configurados en el backend. No se incorporan proveedores ni almacenamiento de tokens en localStorage.

Tras 401, el cliente coordina la renovación entre consultas y pestañas mediante Web Locks. Comprueba la sesión después de tomar el bloqueo, renueva por POST si hace falta y reintenta una sola vez las lecturas. Login y logout usan el mismo bloqueo. Las escrituras no se repiten: se conservan los campos y se pide confirmar nuevamente. Las respuestas perdidas de escrituras siguen requiriendo actualizar antes de reintentar.

Una navegación con acceso vencido y cookie refresh pasa por `/auth/restore`, que renueva por POST y vuelve a una ruta interna validada. Sin Web Locks se ofrece restauración explícita. Una sesión inválida limpia cookies y caché privada; errores temporales ofrecen reintento sin eliminar credenciales potencialmente válidas. Cambios sensibles, bajas y desactivaciones se serializan con login/refresh en PostgreSQL; ninguna renovación concurrente conserva sesiones revocadas.

La pantalla de recuperación no persiste formularios entre recargas: los borradores permanecen mientras el formulario cliente sigue montado. Recuperación por correo, invitaciones y cambio autónomo de contraseña quedan fuera de esta entrega.

## Despliegue y compatibilidad

Migración nueva: `20261103160000_account_management`, con Prisma 6.19.3. Agrega versión/baja lógica, auditoría y unicidad de rol por cuenta. Normaliza correos existentes a minúsculas y elimina espacios exteriores. Antes de escribir, la migración se detiene si encuentra cuentas sin rol, con múltiples roles, con roles distintos a ADMIN/VENDEDOR o correos que colisionarían al normalizar. No convierte roles automáticamente.

Revisar en el entorno autorizado, sin publicar correos ni contraseñas:

```sql
SELECT u.id, array_agg(r.name) AS roles
FROM users u LEFT JOIN user_roles ur ON ur."userId" = u.id
LEFT JOIN roles r ON r.id = ur."roleId"
GROUP BY u.id
HAVING count(ur."roleId") <> 1
   OR bool_or(r.name NOT IN ('ADMIN', 'VENDEDOR'));

SELECT array_agg(id) AS conflicting_account_ids
FROM users GROUP BY lower(trim(email)) HAVING count(*) > 1;
```

Resolver incompatibilidades mediante una decisión revisada antes de desplegar. Coordinar el despliegue de backend/frontend y consumidores de `/users`; generar cliente, aplicar migraciones en el entorno autorizado y reconstruir. No borrar migraciones aplicadas ni la auditoría al revertir la interfaz. No se aplicó esta entrega a la base habitual ni a producción.

## Validación

- `backend/test/accounts.e2e-spec.ts`: roles, validación, versiones, transferencias, restauración, sesiones y carreras entre login/refresh y revocación; PostgreSQL local descartable.
- `frontend/scripts/verify-sessions.mjs`: bloqueo compartido simulado entre pestañas, rotación única, reintento de lectura, ausencia de reenvío de escrituras, fallos temporales y rutas de retorno.
- `scripts/verify-crm.mjs`: contratos BFF, CSRF, cookies, permisos, producción, bajas/restauración y recuperación con JWT vencido.
- Navegador: formulario de cuenta, edición del nombre sin contraseña y controles de Reparto/Bases con cuentas sintéticas.

La comparación completa del esquema también puede mostrar diferencias anteriores en `onUpdate` de las FK de importaciones de leads; esa migración anterior no se modifica como parte de cuentas/sesiones.


### Resultados del 3 de noviembre de 2026

| Comprobación ejecutada | Resultado |
| --- | --- |
| Backend `format:check`, `lint`, `typecheck`, `build` | Aprobados |
| Backend `test --runInBand` | 8 suites, 30 pruebas aprobadas |
| Backend `test:e2e --runInBand` con `CRM_TEST_DATABASE_URL` local descartable | 5 suites, 32 pruebas aprobadas, incluyendo prevalidación de migración |
| Frontend `format:check`, `lint:strict`, `typecheck` y build standalone | Aprobados; build con Node 24.22.1 |
| Scripts frontend de sesiones, perfil CRM, seguimientos, perfil demo, Avalian y adjuntos | Aprobados |
| Harness BFF con Node 24.22.1 | 63 verificaciones aprobadas |
| Migraciones desde cero y repetición | Aplicadas; repetir no deja migraciones pendientes |
| `prisma validate` | Esquema válido |
| `prisma migrate diff --exit-code` | Detecta únicamente diferencias previas en tres FK de importaciones; ninguna diferencia de cuentas/auditoría |
| Navegador contra producción | ADMIN ve Usuarios/Reparto/Bases; vendedor sin enlace y 404 por URL directa; edición de nombre persistente sin contraseña; consola sin errores/advertencias observados |

No se ejecutaron Docker ni GitHub Actions ni se desplegó el cambio. El pnpm global usa Node 24.13.0 y advierte sobre el mínimo del manifiesto; se usó el ejecutable local 24.22.1 para build de Next.js y harness de producción. Las pruebas y migraciones usaron datos sintéticos en esquemas nuevos de `localhost/starter_test`, nunca la base habitual.
