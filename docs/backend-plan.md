# Backend comercial: leads y seguimientos persistentes

Esta entrega conecta Leads, perfil y Seguimientos con NestJS y PostgreSQL. Conserva `frontend/` y `backend/`, Prisma 6.19.3, identidad de NestJS y las pantallas existentes. No importa fixtures ni datos personales reales.

## Decisiones del propietario

| Tema | Decisión implementada |
| --- | --- |
| Acceso | ADMIN ve todos los registros; VENDEDOR solamente sus leads y tareas dentro de su ámbito. |
| Alta de leads | Solo ADMIN; asignación automática global, independiente del origen. |
| Reparto | Rotación entre vendedores activos con recepción habilitada por ADMIN. |
| Sin candidatos | Lead sin asignar, privado de ADMIN; se reparte al volver a haber vendedores. |
| Reasignación | Solo ADMIN; las tareas pendientes pasan al nuevo vendedor. |
| Estados | Nueve estados fijos, inicial Nuevo, cambios libres sin automatismos comerciales. |
| Bases | Orígenes con nombre propio administrados por ADMIN; desactivación sin pérdida histórica. |
| Seguimientos | Agenda persistente, sin notificaciones automáticas. |

Los seis orígenes iniciales son Landing IP, Landing CM, Whatsapp CM y Meta 1/2/3. Los estados son Nuevo, No contesta, WhatsApp, Fuera de presupuesto, Preexistencia médica, Jubilado, Prospecto, Buscaba otra cosa y Ya contrató. Los códigos de API son estables y no dependen de las etiquetas.

## Arquitectura y acceso

El navegador llama a rutas explícitas `/api/crm/*` de Next.js; el servidor agrega el token desde la cookie HttpOnly y consulta `/crm/*` de NestJS. El BFF no accede a Prisma ni acepta URLs arbitrarias. Comprueba origen para mutaciones, limita cuerpos JSON a 16 KiB y nunca devuelve tokens al crear vendedores.

NestJS valida sesión en cada petición. Guards limitan las operaciones administrativas y los servicios aplican el alcance de registros, incluyendo búsquedas, historial, tareas y contadores. Los IDs ajenos responden 404; un filtro de otro vendedor devuelve una colección vacía. Campos no admitidos, como `assignedToId` en edición, se rechazan con 400.

Las tareas vinculadas siguen al responsable actual del lead, incluso si ya están completadas. Al reasignar se actualiza el responsable de las pendientes; las completadas conservan su responsable histórico, pero pierden visibilidad para el vendedor anterior. Las notas conservan su autor. Las tareas independientes pertenecen a su responsable y nunca crean leads.

## Concurrencia y recuperación

La migración crea una fila única `assignment_state.id=1`. Las escrituras comerciales que dependen de permisos o asignación bloquean esa fila con `SELECT FOR UPDATE` dentro de la transacción. El reparto, la reasignación y las operaciones de notas/tareas no pueden intercalarse entre autorización y escritura.

El orden de candidatos es `(createdAt, id)`; el último turno se conserva como valor, sin eliminarlo cuando se pausa una cuenta. ADMIN y VENDEDOR participan del reparto si su cuenta está activa, no eliminada y tiene recepción habilitada. Solo ADMIN puede modificar esta recepción desde Reparto. La reasignación manual no consume turnos ni requiere habilitar la recepción del destinatario, pero sí una cuenta VENDEDOR activa.

Los cambios de rol del endpoint administrativo existente comparten el bloqueo y pausan la recepción; volver a participar del reparto requiere habilitarla nuevamente.

Los pendientes se procesan por `(createdAt, id)` en lotes de 50. El backend revisa al iniciar, cada 30 segundos y al cambiar la configuración de recepción del equipo comercial. Si quedan pendientes, las nuevas altas esperan también el reparto para no adelantarse. No hay Redis ni cola externa; varias instancias se coordinan con el bloqueo PostgreSQL. Los fallos se registran sin datos personales y se reintentan en la siguiente revisión.

`version` protege ediciones, cambios de estado, reasignaciones y tareas. Una versión obsoleta devuelve 409. Las notas también incrementan la versión del lead. Cada escritura de lead y su evento de historial se confirman juntas. No se implementó eliminación definitiva.

## Frontend

- `/leads`: filtros y orden del servidor, páginas de 20 filas, alta administrativa, edición y perfil compartido.
- `/followups`: lista/calendario con el mismo rango, filtros y páginas de 100 tareas. Si hay más, se indica que ambos muestran la página seleccionada. Los totales corresponden a todo el conjunto filtrado del servidor.
- `/settings`: altas de vendedores, activación, pausa/recepción y bases; solo ADMIN.
- `/pipeline` y `/avalian`: demos sintéticas de ADMIN en desarrollo, con bandera habilitada; continúan deshabilitadas en producción. No se habilita Avalian real.

El perfil real valida la respuesta y su ID, cancela al cerrar/cambiar y no conserva caché después del desmontaje. Las consultas comerciales incluyen la identidad en su clave, se invalidan tras mutaciones y actualizan cada 30 segundos. Logout cancela/limpia la caché. Los adjuntos reales permanecen deshabilitados.

## Unidades de revisión y reversión

| Unidad | Validación | Límite de reversión |
| --- | --- | --- |
| Persistencia y API | Migraciones, pruebas reales de `/crm/*`, tipos, lint y build backend | Módulo CRM, incorporación a AppModule y nueva migración. No borrar una migración aplicada: desplegar una corrección revisada. |
| Interfaz y BFF | Harness de Next.js/NestJS, tipos, lint y build frontend | Feature CRM, BFF y enlaces/rutas conectadas; mantener cambios previos del propietario. |
| Documentación | Contrastar contratos y resultados ejecutados | Los tres documentos de esta entrega y enlaces del README. |

No se crearon commits ni se mezcló el trabajo previo del propietario en uno nuevo. La autorización por registro, reparto concurrente, persistencia y estados de interfaz son criterios de aceptación, no deuda posponible. Consultar [contratos y verificaciones](backend-api.md) y [deuda y etapas futuras](technical-debt.md).

## Captación de sistema por YCloud

La excepción interna de alta automática se documenta en [YCloud](ycloud-integration.md): solo mensajes de usuario atribuibles a anuncios y firmados por el endpoint configurado. El alta humana sigue exigiendo ADMIN. CrmService comparte la inserción/reparto sin representar al sistema como usuario privilegiado. El backfill de claves de contacto se comparte con Excel; mantiene su bloqueo y lotes anteriores. Bandeja, efectos comerciales y reintentos usan PostgreSQL. No se agregan servicios externos, respuestas automáticas ni acceso a Avalian.
