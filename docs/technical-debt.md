# Deuda técnica y etapas futuras

La primera entrega cubre leads, permisos, reparto y agenda persistente. Los permisos por registro y la consistencia transaccional son parte obligatoria de la implementación, no pendientes aceptados.

## Deuda técnica

| Prioridad | Pendiente / impacto | Condición de resolución |
| --- | --- | --- |
| Alta, antes de exposición pública | Rate limiting en memoria, agregado por origen del BFF. No discrimina clientes reales y reinicia sus contadores con el proceso. | Configurar límites en proxy, frontera de confianza y pruebas de abuso; no confiar automáticamente en headers enviados por clientes. |
| Alta, antes de producción | HTTPS, backups y restauración pertenecen a operación del servidor y no se ejecutaron en esta entrega. | Proxy HTTPS comprobado y restauración de backup ensayada en entorno separado. |
| Media | Renovación automática implementada en [cuentas y sesiones](accounts-and-sessions.md), con restauración explícita como alternativa sin Web Locks. | Los borradores no se persisten entre recargas; evaluar persistencia solo con un flujo de datos aprobado. |
| Media | Un bloqueo global serializa escrituras comerciales para hacer indivisible el alcance de permisos y reparto. Favorece corrección, limita capacidad de escritura. | Medir latencia/contención antes de optimizar a bloqueos por lead, conservando orden de bloqueos y pruebas de concurrencia. |
| Media | Calendario y listado muestran la misma página de hasta 100 tareas del período; se avisa cuando hay más. | Consultas/agregados por día y navegación eficiente para volúmenes altos, sin cargar toda la cartera. |
| Media | Búsqueda PostgreSQL insensible a mayúsculas, pero no normaliza tildes como la demo local. | Aprobar normalización e índices, migración revisada y pruebas de búsquedas en español. |
| Media | La administración gestiona ambos roles y contraseñas; no incorpora recuperación por correo ni invitaciones. | Definir canales y reglas de recuperación antes de habilitarlos; nunca enviar credenciales a servicios no autorizados. |
| Baja | `/auth/register` heredado emite una sesión para el vendedor nuevo. El BFF descarta esos tokens y nunca los entrega al navegador. | Separar creación administrativa de autenticación sin romper consumidores ni pruebas del starter. |
| Baja | Documentación del starter describe herramientas y funciones que ya no coinciden totalmente con los paquetes reales. | Actualizar guías por módulos, manteniendo la prioridad de AGENTS y manifiestos actuales. |
| Baja | `package.json#prisma` está deprecado para versiones futuras; esta aplicación conserva Prisma 6. | Tratar la actualización de Prisma/configuración como cambio separado y aprobado. |
| Entorno | Node global era 24.13.0, inferior al mínimo del manifiesto. | Usar 24.22.1 de `.nvmrc`; esta entrega dispone de verificación con un ejecutable temporal sin modificar Node global. |

## Funcionalidades futuras

No representan comportamiento comercial ya implementado:

- Pipeline y Reportes están implementados según [el contrato comercial v1](commercial-reports.md); no hay importes de venta ni reportes de rentabilidad.
- Dashboard: métricas reales y fórmulas/filtros documentados para cada rol.
- Importación Excel y exportaciones: preview, duplicados, lotes, recuperación y alcance por vendedor.
- Adjuntos: almacenamiento privado, validación, límites, descarga autorizada y retención. Deshabilitados en perfiles reales.
- Avisos de recordatorio: procesamiento durable, anticipación y canal por definir; la agenda actual no envía avisos.
- Avalian: canal y autorización documentados, importación separada y sin conversión automática a leads.
- MCP: operaciones acotadas con el mismo alcance de servicios, auditoría y flujo de datos aprobado.

## Evidencia de esta entrega

Verificación local del 2 de noviembre de 2026, con Node **24.22.1**, pnpm **10.32.1** y PostgreSQL **17** temporal, limitado a localhost. No se modificó el Node global ni se migró la base configurada del propietario.

| Comprobación ejecutada | Resultado |
| --- | --- |
| Backend `format:check`, `lint`, `typecheck`, `build` | Aprobados. |
| Backend `test --runInBand` | 6 suites, 23 pruebas aprobadas. |
| Backend `test:e2e --runInBand`, con `CRM_TEST_DATABASE_URL` | 2 suites, 8 pruebas aprobadas; incluye 7 escenarios comerciales con sesiones reales y PostgreSQL. |
| Frontend `format:check`, `lint:strict`, `typecheck`, `build` standalone | Aprobados. |
| Scripts `verify-followups`, `verify-lead-profile`, `verify-avalian`, `verify-crm-profile` | Aprobados; fechas, aislamiento, cancelación, reapertura y caché. |
| `prisma:generate`, `prisma validate` | Cliente 6.19.3 generado; esquema válido. |
| `prisma:deploy` en base descartable, repetido | Migraciones aplicadas; repetir termina sin migraciones pendientes. |
| `prisma migrate diff` desde esa base al esquema, `--exit-code` | Sin diferencias, salida 0. |
| `node scripts/verify-crm.mjs` | 27 comprobaciones aprobadas de BFF, cookies, CSRF, contratos, permisos, producción y persistencia. |
| `node scripts/verify-starters.mjs` | 43 comprobaciones de regresión aprobadas; el acceso de demo se verifica en Pipeline, conservando `/dashboard/*` deshabilitado. |
| Navegador, cuentas sintéticas | ADMIN guarda nota y tarea; persisten al recargar. VENDEDOR carece de Administración y no ve la tarea privada del administrador. Sin errores ni advertencias de consola observados. |
| Navegador, compilación final | Crear tarea vinculada desde la agenda sin copiar contacto/responsable al cliente; aparece en calendario y como próxima actividad del perfil. |
| `git diff --check` | Sin errores de espacios o conflictos. |

La primera ejecución del nuevo harness detectó un problema de resolución del CLI de Prisma en las pruebas; se corrigió antes de obtener los resultados anteriores. Los primeros chequeos también detectaron tipos/formato de pruebas y una inicialización de fecha impura en React, corregidos y verificados nuevamente.

Docker no estaba disponible; no se ejecutó el stack de contenedores ni un despliegue. El workflow CI incorpora PostgreSQL descartable para no omitir los escenarios comerciales, pero **no se ejecutó GitHub Actions** desde esta sesión. No se probaron backups/restores. Los avisos de Node sobre transformación experimental de TypeScript y formato de módulos de los scripts, y la deprecación de configuración de Prisma 6, no impidieron las verificaciones.

Los servidores HTTP de los harnesses y PostgreSQL temporal se detuvieron al finalizar. Los esquemas contienen exclusivamente datos sintéticos y se conservaron en el directorio temporal para inspección; no son el entorno habitual del proyecto.
