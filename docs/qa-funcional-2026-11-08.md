# QA funcional de InfoPrepaga CRM · 8 de noviembre de 2026

**Dictamen:** los recorridos comerciales implementados que se ejercitaron pasaron las pruebas de integración. La importación guarda los datos correctamente en el escenario probado, pero la pantalla final dificulta verificar qué se importó. La cobertura del producto completo queda parcial por los módulos y servicios detallados abajo.

## Hallazgos reproducibles

| ID | Severidad | Pasos y resultado observado | Resultado esperado |
| --- | --- | --- | --- |
| QA-01 | Media · interfaz | Entrar como ADMIN, abrir Leads → Importar Excel y subir el `leads-demo.xlsx` de la seed en modalidad de leads nuevos. Relacionar PIPA con Base demo Excel, actualizar la revisión, ir a Confirmación y procesar los válidos conservando la excepción. El cuadro previo anuncia 3 altas, 1 actualización y 1 aparición consolidada. Tras confirmar, aparece «Se procesaron los registros válidos» y «5 apariciones procesadas», pero también «0 nuevos» y «0 existentes para actualizar». | Mostrar las operaciones ya aplicadas y separar visualmente el resultado de la ejecución de lo que queda pendiente. El backend conservó la excepción y el listado activo devolvió 33 leads después de la carga. |
| QA-02 | Baja · prueba automatizada | Ejecutar `node --experimental-strip-types frontend/scripts/verify-attachments.mjs`. En la línea 49 el upstream simulado recibe un cuerpo de 10 MiB + 8.193 bytes y devuelve 200. El script esperaba 413. El límite de cuerpo vigente del proxy es 10 MiB + 32.768 bytes para incluir el envoltorio multipart. | Alinear el caso con el límite de cuerpo del proxy y conservar la prueba del límite de archivo en Nest. En la app levantada, un archivo de 10 MiB + 1 byte devolvió 413 de Nest; un cuerpo por encima del límite del proxy devolvió 413 con «Solicitud demasiado grande». |
| QA-03 | Pendiente de alcance · producto | Ingresar como ADMIN y buscar Resumen en la navegación comercial. El inicio abre Leads y `/dashboard` y `/dashboard/overview` devolvieron 404 en el entorno probado. La deuda técnica registra el Dashboard con métricas reales como pendiente. | Disponer de un Resumen con métricas y alcance por rol cuando se implemente el módulo aprobado. |

## Cobertura por flujo

| Flujo | Evidencia |
| --- | --- |
| Sesión y permisos | Chrome: inicio de sesión ADMIN, cierre, rechazo de Diego inactivo y acceso de Bruno. La lista de Bruno no mostró Contacto demo 01 ni el botón de importación; Settings, Avalian y Reportes mostraron 404 para ese rol. E2E: alcance de búsqueda, detalle, historial, edición, notas y conteo de tareas; revocación y bloqueo de operaciones administrativas. |
| Leads y reparto | Chrome: listado comercial con filtros de cartera y acciones administrativas. E2E y BFF: altas, reparto FIFO, usuarios pausados, reasignación de tareas pendientes, concurrencia y persistencia. |
| Perfil | Pruebas de integración y verificadores de frontend: detalle, notas, historial, aislamiento de identidad, cancelación y reapertura. El recorrido de ficha se cubrió por pruebas automatizadas. |
| Seguimientos | Chrome: agenda y listado con tareas de la semana. E2E y BFF: alta, alcance, mutaciones y fechas de Buenos Aires. Verificador de frontend: medianoche, año y superposición. Los avisos automáticos están pendientes. |
| Pipeline | Chrome: tablero y filtros. E2E y BFF: persistencia del cierre, control de versión, permisos y corrección auditada. |
| Reportes | Chrome: configuración visible para ADMIN. E2E y BFF: vista previa, guardado, PDF privado, filtros, cálculo y conservación de reportes guardados. Se comprobó la firma PDF y el texto extraído en la suite unitaria. |
| Importación Excel | Chrome: subida, mapeo, revisión, confirmación parcial y excepción retenida. E2E y BFF: deduplicación, reimportación, permisos, persistencia y cartera histórica. Se usó el Excel sintético de la seed; el archivo adjunto del usuario no se cargó. |
| Adjuntos | E2E con R2 simulado: subida, descarga, borrado, aislamiento, errores y reintentos. Pruebas HTTP directas de límites contra la app levantada. Queda pendiente el recorrido con almacenamiento R2 real de pruebas. |
| Avalian | Chrome: vista previa ADMIN con 24 registros sintéticos. El verificador de frontend pasó filtros, revisión y confirmación local. El BFF comprobó 404 en producción. No se ejercitó un canal Avalian real. |
| MCP, exportación comercial y operación | Fuera de la cobertura ejecutada. Sin validación de MCP, exportación comercial de leads, correo o avisos automáticos, Docker, HTTPS, backups, accesibilidad exhaustiva ni una matriz móvil. |

## Ejecución

PostgreSQL 17 temporal en loopback, con una base `infoprepaga_demo` para Chrome y otra `starter_test` para automatización. Frontend local en `http://localhost:3310` y Nest en el puerto 3311. `/api/health` devolvió `backend: connected`. Node 24.13.0 quedó por debajo del mínimo declarado (24.15.0), con pnpm 10.32.1. Los resultados corresponden al árbol de trabajo con los cambios locales que ya estaban presentes.

| Comando | Resultado |
| --- | --- |
| `pnpm -C backend prisma:deploy`, `prisma:generate`, `prisma:seed:demo` | 11 migraciones aplicadas, cliente generado y seed sintética cargada. |
| `pnpm -C backend test --runInBand` | 69/69 en 16 suites al configurar `PDF_TEST_PYTHON` con el Python empaquetado que incluye `pypdf`. El primer intento dio 67/69 porque el Python predeterminado carecía de ese módulo. |
| `pnpm -C backend test:e2e --runInBand` | 50/50 en 6 suites con `CRM_TEST_DATABASE_URL` apuntando a `starter_test`. El primer intento, con otro nombre de base descartable, activó el guard del harness. |
| `pnpm -C backend build` y `pnpm -C frontend build` | Ambos terminaron con código 0. El build frontend también pasó con `BUILD_STANDALONE=true`. |
| `node scripts/verify-crm.mjs` | 91 comprobaciones aprobadas en el build standalone. El intento con un build estándar no encontraba `standalone/server.js`. |
| `pnpm -C frontend typecheck` y `pnpm -C frontend lint:strict` | Sin errores observados. |
| `node --experimental-strip-types frontend/scripts/verify-*.mjs` (un archivo por ejecución) | 6 de 7 scripts aprobados. Falló únicamente el chequeo de adjuntos descrito en QA-02. |
