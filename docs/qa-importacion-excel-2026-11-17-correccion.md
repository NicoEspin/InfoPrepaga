# Corrección de la importación Excel del 17/11/2026

La revisión se contrastó con el [contrato de cartera histórica](historical-portfolio.md) y el [informe de QA](qa-importacion-excel-2026-11-17.md). El Excel original se usó solo para preparar la vista previa en PostgreSQL local descartable. Las confirmaciones usaron exclusivamente la seed sintética.

| Hallazgo | Cambio | Archivos principales |
| --- | --- | --- |
| Resultado e historial | Plan antes de confirmar y resultado acumulado tras cada carga. Se distinguen exclusiones, filas registradas y pendientes. Un lote sin cambios se puede cerrar; un parcial se puede retomar. | [Servicio de importación](../backend/src/crm/lead-import.service.ts), [contrato de respuesta](../backend/src/crm/lead-import.responses.ts), [asistente](../frontend/src/features/lead-imports/components/lead-import-dialog.tsx). |
| Reimportación después de corregir | Huella de origen fijada antes de la revisión. La procedencia conserva el valor anterior y el aplicado. Se preservan las huellas existentes y se recuperan las que se pueden reproducir. | [Parser](../backend/src/crm/lead-import.parser.ts), [plan](../backend/src/crm/lead-import.plan.ts), [migración](../backend/prisma/migrations/20261117000000_import_reconciliation/migration.sql), [procedencias](../frontend/src/features/lead-imports/components/import-appearances.tsx). |
| Configuración histórica | Orígenes ordenados por apariciones bloqueadas. Recordar una equivalencia global requiere marcar la opción. Asesor histórico, responsable actual y autorización de reparto se tratan como decisiones distintas. | [Asistente](../frontend/src/features/lead-imports/components/lead-import-dialog.tsx), [editor de fila](../frontend/src/features/lead-imports/components/import-row-editor.tsx), [servicio de importación](../backend/src/crm/lead-import.service.ts). |
| Verificación en Leads | El filtro por procedencia abre todas las clasificaciones. Solo ADMIN puede consultar por lote propio. El perfil usa el contrato de procedencias para mostrar las correcciones históricas. | [Consulta CRM](../backend/src/crm/crm.service.ts), [DTO](../backend/src/crm/crm.dto.ts), [listado de Leads](../frontend/src/features/crm/components/leads.tsx), [lector del perfil](../frontend/src/features/crm/api.ts). |
| Alcance y vigencia | Avisos con hoja, rango, número de filas con contenido y motivo. Se indica el máximo de filas candidatas y la vigencia por modalidad. El aviso de pendientes se oculta en cero. | [Parser](../backend/src/crm/lead-import.parser.ts), [asistente](../frontend/src/features/lead-imports/components/lead-import-dialog.tsx), [guía de importación](guia-importacion-excel.md). |

Antes del cambio se reprodujeron el reinicio de los contadores tras la primera confirmación y el regreso de la fila 7 a corrección al subir el mismo Excel. El archivo original produjo 1.613 candidatas en cinco hojas de contactos, `Pagos` y `Analisis` excluidas y cuatro avisos con rango. El lote quedó en revisión, con 0 filas procesadas. Hacen falta las equivalencias y decisiones comerciales autorizadas antes de confirmar ese archivo.

La regresión del cambio de contenido y los permisos están en [las pruebas E2E](../backend/test/lead-imports.e2e-spec.ts). El [recorrido de aceptación en navegador](../scripts/verify-import-demo-ui.cjs) usa el Excel generado por la seed demo, verifica el parcial, la reanudación, la consulta por lote, las procedencias y la reimportación. Acepta el Excel original como segundo argumento opcional de vista previa. El [harness general de navegador](../scripts/verify-import-ui.cjs) cubre exclusiones, actualización de contactos y administración de equivalencias.

También se actualizaron el [esquema Prisma](../backend/prisma/schema.prisma), los [tipos de importación de la interfaz](../frontend/src/features/lead-imports/api/types.ts) y los datos de prueba de [cartera](../backend/src/crm/import-portfolio.spec.ts), [comparación](../backend/src/crm/lead-import.comparison.spec.ts) y [planificación](../backend/src/crm/lead-import.plan.spec.ts).

## Resultados de verificación

| Comprobación | Resultado |
| --- | --- |
| Demo en Chrome con PostgreSQL descartable | 5 apariciones procesadas y 1 pendiente. Tras reabrir y corregir la fila 7: 4 altas, 1 actualización y 1 consolidación. Leads mostró los 5 contactos vinculados: las 4 altas y el contacto existente, que conservó su estado y responsable. |
| Reimportación y procedencias | 6 ya registradas, 0 altas, 0 actualizaciones, 0 consolidaciones y ningún evento nuevo. El perfil mostró las dos procedencias del alta consolidada y, para la fila 7, teléfono original `123` y teléfono aplicado vacío. Cambiar el valor a `124` dejó 5 registradas y devolvió esa fila a corrección en la vista móvil. |
| Backend | `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, `pnpm test --runInBand` (69 pasaron) y `pnpm test:e2e --runInBand` (57 pasaron). El filtro por lote devolvió 401 sin sesión, 403 a VENDEDOR y ningún resultado a otro ADMIN. |
| Frontend e integración | `pnpm lint`, `pnpm typecheck`, `pnpm format:check` y `pnpm build`. `node scripts/verify-crm.mjs` con navegador: 91 controles de integración y recorrido general de importación aprobados. |
| Prisma | `prisma validate` y `pnpm prisma:deploy` en esquemas descartables, tanto limpios como con las seis procedencias anteriores a la migración. En el esquema actualizado, el mismo Excel reconoció las seis, incluida la corrección previa de la fila 7. La generación de Prisma Client 6.19.3 pasó con salida aislada; Windows tenía bloqueada la DLL de la salida habitual. |

No se migró la base habitual ni se desplegaron los cambios.

## Corrección de integración local posterior

El reintento del 17/11/2026 detectó que la instancia de desarrollo ejecutaba el código nuevo contra un esquema anterior. El historial devolvía HTTP 500 y faltaban las tres columnas de `20261117000000_import_reconciliation`. La conexión efectiva heredada del entorno apuntaba a `localhost:5433/infoprepaga`, distinta del valor de `backend/.env`.

Se verificó que era desarrollo local y que esa era la única migración pendiente. Se generó un respaldo completo con `pg_dump -Fc`, se comprobó su catálogo con `pg_restore --list` y se aplicó `prisma migrate deploy` a esa base local. Se verificaron `alreadyRegistered`, `sourceFingerprint` y `legacyFingerprints` en el esquema. No fue necesario reiniciar los servidores.

La comprobación posterior en Chrome aprobó el historial (HTTP 200 y tres lotes recientes) y el análisis de un Excel sintético de una fila (HTTP 201), pasando de Archivo a Configuración y Revisión. El lote sintético quedó en REVIEW con cero procesados. El recuento de leads y los identificadores, estados y cantidades procesadas de los lotes de `datos FACE.xlsx` permanecieron iguales. No se confirmó ninguna importación durante esta comprobación.
