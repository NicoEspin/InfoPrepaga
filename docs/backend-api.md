> Actualización: la administración de cuentas y el listado paginado `/users` se documentan en [cuentas y sesiones](accounts-and-sessions.md).

# Contrato comercial y verificación

NestJS es la autoridad de datos y permisos. Swagger en desarrollo publica entradas y respuestas de `/crm/*`; el navegador usa las rutas equivalentes `/api/crm/*`. No hay acceso directo a PostgreSQL desde Next.js.

El CRUD privado de archivos del perfil comercial se documenta en [Archivos del lead](lead-attachments.md), incluyendo configuración R2, contratos, límites y recuperación de cargas/borrados interrumpidos.

La importación administrativa de Excel, revisión de duplicados y carga reanudable se documenta en [Importar leads desde Excel](lead-imports.md).

## Operaciones

| NestJS | Entrada / respuesta | Acceso |
| --- | --- | --- |
| `GET /crm/catalogs` | `{statuses:[{id,name}], sources:[...]}`; incluye orígenes inactivos para historial | Ambos roles |
| `POST /crm/sources` | `{name}` → origen de tipo Base | ADMIN |
| `PATCH /crm/sources/:id` | `{isActive}`; solo bases configurables | ADMIN |
| `GET /crm/users` | Identidad mínima, roles, `isActive`, `receivesLeads`; nunca contraseña/tokens | ADMIN |
| `PATCH /crm/users/:id` | `{isActive?,receivesLeads?}`; configuración de vendedores | ADMIN |
| `GET /crm/leads` | Página de leads con origen y responsable | Según asignación |
| `POST /crm/leads` | `{name,sourceId,email?,phone?,company?,observations?}` → lead asignado o pendiente | ADMIN |
| `GET /crm/leads/:id` | Lead con `nextActivity` o `null` | Según asignación |
| `PATCH /crm/leads/:id` | Campos de contacto/observaciones + `version`; cambio de origen solo ADMIN | Según asignación |
| `PATCH /crm/leads/:id/status` | `{status,version}` | Según asignación |
| `PATCH /crm/leads/:id/assignment` | `{assignedToId,version}` | ADMIN |
| `GET /crm/leads/:id/history` | Página de eventos con autor, tipo, detalle y fecha | Según asignación |
| `POST /crm/leads/:id/notes` | `{text}` de 1–500 caracteres → nota con autor | Según asignación |
| `GET /crm/tasks` | Página de tareas y `counts:{pending,completed}` del conjunto filtrado | Según ámbito |
| `POST /crm/tasks` | Campos de tarea; lead o contacto independiente | Según ámbito |
| `PATCH /crm/tasks/:id` | Campos editables + `version`; `completed:true/false` completa/reabre | Según ámbito |

La identidad se consulta mediante `GET /users/me` y el BFF `GET /api/crm/session`. La creación de vendedores conserva `POST /auth/register` restringido a ADMIN; `POST /api/crm/users` lo intermedia y devuelve solo el usuario seguro, sin tokens. Las nuevas contraseñas requieren al menos 12 caracteres y como máximo 72 bytes UTF-8; no se modifican contraseñas existentes. Nombre y apellido admiten hasta 50 caracteres.

Paginación: `page` desde 1, `pageSize` de 1–100, por defecto 20. Respuesta `{items,total,page,pageSize}`. UUIDs para entidades, fechas ISO 8601 y `version` entero positivo. Campos desconocidos o `null` en campos no anulables devuelven 400. Para borrar un contacto opcional se puede enviar cadena vacía; siempre debe quedar teléfono o correo.

### Filtros de leads

`q` busca nombre, correo, teléfono o empresa sin distinguir mayúsculas. `status`, `sourceId`, `assignedToId`, `unassigned=true|false`; `sort=name|createdAt|updatedAt`, `direction=asc|desc`. Se agrega ID para desempate estable. Todos los filtros se intersectan con el alcance de la sesión. La búsqueda con equivalencia de tildes se registra como deuda, sin prometer esa equivalencia en esta entrega.

### Estados

| Código | Etiqueta |
| --- | --- |
| `NEW` | Nuevo |
| `NO_ANSWER` | No contesta |
| `WHATSAPP` | WhatsApp |
| `OVER_BUDGET` | Fuera de presupuesto |
| `MEDICAL_PREEXISTENCE` | Preexistencia médica |
| `RETIRED` | Jubilado |
| `PROSPECT` | Prospecto |
| `OTHER_INTEREST` | Buscaba otra cosa |
| `ALREADY_CONTRACTED` | Ya contrató |

### Tareas

Crear con `{title,priority,dueAt,duration,leadId?,ownerId?,contact?}`. Prioridad `HIGH|MEDIUM|LOW`, duración 30/60/90 minutos. `dueAt` requiere zona horaria explícita y se guarda como `timestamptz`.

Con lead: debe estar asignado y ser visible; el responsable y contacto se resuelven desde el lead. Sin lead: se requiere contacto; VENDEDOR solo puede crear para sí mismo, ADMIN puede elegir otro vendedor activo. Editar no cambia el vínculo ni el propietario; el contacto vinculado se edita desde el lead.

`createdById` se obtiene de la sesión y conserva el autor aunque cambie el responsable; no se acepta en entradas. Es anulable únicamente para no inventar autoría si existieran registros anteriores a esta migración.

Filtros: `q`, `leadId`, `ownerId`, `priority`, `state=pending|completed`, `from` inclusivo y `to` exclusivo sobre `dueAt`, además de paginación. El calendario convierte sus límites de Buenos Aires a instantes UTC. Los contadores incluyen rango y filtros, independientemente de la página; no representan el dashboard ni conversiones.

### Errores y caché

400 entrada inválida; 401 sesión ausente, vencida o revocada; 403 operación administrativa prohibida; 404 registro inexistente o ajeno; 409 versión obsoleta o nombre de base repetido; 429 límite de solicitudes. Refrescar el registro antes de reintentar un 409; nunca sobrescribir automáticamente.

El BFF valida origen de mutaciones, limita cuerpo y rutas, usa `Cache-Control: private, no-store` y no reenvía cookies/headers arbitrarios. Se conserva la restauración manual de sesión; no se reejecutan mutaciones tras renovar.

## Migraciones de desarrollo

Usar Node 24.22.1 y pnpm 10.32.1. Verificar que `DATABASE_URL` señale una base local de desarrollo autorizada, nunca producción. Conservar los secretos existentes fuera de Git.

```powershell
pnpm -C backend prisma:generate
pnpm -C backend exec prisma validate
# Solo después de revisar la URL de una base de desarrollo:
pnpm -C backend prisma:deploy
```

La nueva migración agrega tablas, índices, FKs, catálogos iniciales y fila de coordinación. Conserva usuarios y sesiones; todos los vendedores empiezan con recepción pausada. El seed de administrador sigue siendo una operación explícita separada. Repetir `prisma:deploy` no duplica orígenes ni aplica nuevamente la migración.

## Verificación reproducible

```powershell
pnpm -C backend format:check
pnpm -C backend lint
pnpm -C backend typecheck
pnpm -C backend test --runInBand
pnpm -C backend build
pnpm -C frontend format:check
pnpm -C frontend lint:strict
pnpm -C frontend typecheck
node --experimental-strip-types frontend/scripts/verify-followups.mjs
node --experimental-strip-types frontend/scripts/verify-lead-profile.mjs
node --experimental-strip-types frontend/scripts/verify-avalian.mjs
node --experimental-strip-types frontend/scripts/verify-crm-profile.mjs
$env:BUILD_STANDALONE='true'
pnpm -C frontend build
# Credenciales únicamente de una base descartable localhost/starter_test:
$env:CRM_TEST_DATABASE_URL='postgresql://crm_test@127.0.0.1:55487/starter_test'
pnpm -C backend test:e2e --runInBand
node scripts/verify-crm.mjs
```

Las pruebas comerciales solo se ejecutan con `CRM_TEST_DATABASE_URL`; sin ella Jest las marca omitidas. Cada ejecución usa un esquema nuevo en `starter_test`, aplica migraciones y conserva los registros sintéticos para inspección. No borra ni usa esquemas existentes. El harness BFF arranca y detiene sus propios servidores 3320/3321; requiere builds actuales. `CRM_BROWSER_PREVIEW=true` los mantiene disponibles para inspección con cuentas sintéticas hasta Ctrl+C. No usar esos ejemplos fuera del entorno descartable.

Los resultados concretos de esta entrega y las limitaciones operativas se registran en [deuda técnica](technical-debt.md).

## Reportes y Pipeline persistente

Ver [contrato comercial v1](commercial-reports.md) para endpoints, selección histórica, asignación manual a ADMIN, fotografía inmutable, idempotencia y PDF sin R2. Las operaciones están documentadas en Swagger.
