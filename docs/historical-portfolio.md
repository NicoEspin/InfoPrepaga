# Migración histórica y cartera — contrato vigente

Modalidad `NEW` conserva captación y reparto habituales. Modalidad `HISTORICAL` registra procedencia migrada sin contar el alta como captación nueva. `portfolioClass` es independiente de estado y etapa: ACTIVE (En gestión), HISTORICAL (Histórico), UNCLASSIFIED (Pendiente de clasificación). Los leads existentes conservan ACTIVE y su política de reparto; no se reconstruye su procedencia anterior.

## Preparación y uso

Usar una copia actualizada a una fecha de corte acordada. Agregar Gestion_actual, Responsable_actual y Ultima_gestion sin desplazar columnas históricas. Marcar SI solo para la cartera que sigue trabajando el equipo; NO para histórico; REVISAR o vacío para pendiente. No reconstruir fechas desconocidas. El responsable actual puede diferir del asesor histórico.

El asistente tiene Archivo, Configuración, Excepciones y Confirmación. Los cinco adaptadores siguen disponibles. Se puede elegir columna (A=1), ignorar o declarar un valor general por hoja; las nuevas cabeceras se detectan en las primeras diez filas. La configuración gobierna la lectura y se guarda por ADMIN en lead_import_configurations, sin copiar el workbook. Se revalida versión, hojas y existencia de columnas al reutilizarla. Las equivalencias de clasificación desconocida se guardan en la configuración; las de responsables actuales usan CURRENT_RESPONSIBLE, separadas de ADVISOR. SI/NO/REVISAR conservan su semántica.

Antes de comenzar la carga se puede volver a leer el archivo: reemplaza las decisiones temporales de esa revisión, con versión y propiedad verificadas. Después de incorporar registros se conserva la configuración y se corrigen las excepciones pendientes. No se conserva el Excel binario: reabrir una revisión y cambiar columnas requiere volver a seleccionar el original.

Excepciones: filtrar por hoja, clasificación y grupo de problemas; seleccionar filas o todos los resultados filtrados entre páginas. La acción muestra cantidad y exige que coincida al aplicarse. Las decisiones se revalidan en NestJS bajo el bloqueo comercial. Conflictos de marcas explícitas se revisan como grupo; una marca ausente no gana sobre una explícita. No hay fusión por nombre ni sobrescritura de cartera existente. Las correcciones opcionales conservan el original y exigen otro contacto válido.

Importar válidos conserva excepciones en estado PARTIAL. La exclusión deliberada sigue siendo una acción distinta. Se mantienen bloques de 100, versiones, pausa y reanudación. Ante una respuesta incierta actualizar el lote antes de continuar. Reimportaciones idénticas reconocen huellas; los timestamps de decisiones de revisión no cambian la huella.

El resumen previo indica lo que se va a procesar. El resultado acumulado y el historial distinguen altas, actualizaciones, consolidaciones, exclusiones, filas ya registradas y pendientes. Si todas las filas están registradas, el lote se cierra al analizarlo. **Ver leads del lote** usa las procedencias incorporadas por ese lote y abre Leads en la vista de todas las clasificaciones.

## Asignación, fechas y métricas

Histórico y pendiente nunca participan de recuperación automática. ACTIVE migrado requiere cuenta actual válida o autorización expresa de reparto. autoAssignmentEligible persiste esa autorización incluso tras reinicio. Cambiar clasificación posteriormente deshabilita reparto; activar requiere responsable ya asignado. ADMIN puede clasificar hasta 100 contactos seleccionados en Leads, con versiones y motivo auditado. Los vendedores mantienen su alcance por assignedToId en todas las vistas.

Solo ACTIVE aparece en pipeline y puede cambiar etapa. Importar o activar no crea venta. createdAt siempre representa incorporación al CRM. originDate y declaredLastManagedAt son fechas completas declaradas en Excel; las literales no interpretables se conservan en procedencia. No generan actividad, no completan años ni heredan filas. No se implementó orden por última actividad: updatedAt sigue siendo actualización técnica.

El filtro mensual de Pipeline usa `originDate` para los leads migrados en gestión y `createdAt` para la captación nueva. Si falta una fecha original válida, el lead migrado sigue disponible en Leads.

Reportes usa cálculo versión 2: la población A excluye intakeMode=HISTORICAL. La población B mantiene ventas reales posteriores según movimientos vigentes al corte. Activación/reactivación es un evento portfolio-classified, nunca una captación. Fotografías guardadas conservan su contenido y versión. El resumen de cada lote informa incorporaciones por migración; no se añadió otro dashboard: las rutas del dashboard del starter ya estaban deshabilitadas.

## Retención y despliegue

Las revisiones nuevas duran 24 horas; migraciones históricas, 90 días desde preparación. Antes del vencimiento resolver o conservar el original para re-subirlo después. La purga incluye PARTIAL, borra filas temporales y configuración del lote, vacía el nombre del archivo y conserva procedencias incorporadas y auditoría. Las configuraciones reutilizables quedan separadas del lote. No hay descarga de pendientes ni copia adicional del Excel ni deshacer indiscriminado.

Migraciones revisables: 20261107000000_historical_portfolio y 20261107001000_import_configurations. Mantener Prisma 6.19.3. Antes de despliegue: respaldo/restauración verificados, revisar SQL, aprobar aplicación a la base habitual, ejecutar prisma:deploy en ese entorno autorizado y generar cliente/build compatibles. No arrancar el código nuevo contra el esquema anterior. No hay backfill arbitrario de clasificación, fechas ni ventas. Esta tarea no aplica cambios a la base habitual, ni hace commit, push o despliegue.

La corrección de QA agrega `20261117000000_import_reconciliation`. Las filas preparadas después de la migración reciben una huella de origen antes de cualquier edición. Se conserva la huella y la procedencia previa de los registros existentes. La compatibilidad usa las huellas anteriores que se pueden reproducir, incluida la corrección de teléfono opcional del caso demo. Los borradores anteriores con datos de origen intactos y sin fórmulas reciben la nueva huella al retomar el lote. Si ya hubo ediciones o si la fórmula original no se puede recuperar, se conserva la huella anterior. Una revisión que todavía no se cargó puede volver a leer el original.

## Contratos

POST /crm/lead-imports: multipart file, mode (NEW/HISTORICAL), configuration JSON versión 1. GET /crm/lead-imports/configurations: configuraciones del ADMIN actual. POST /crm/lead-imports/:id/reconfigure: mismo multipart más version; solo lote propio REVIEW sin procesados. GET /crm/lead-imports/:id admite sheet, portfolioClass, problem y filtros anteriores. PATCH admite bulk con selection, action, expectedCount, assignedToId opcional. Las acciones son clasificación, ASSIGN, DISTRIBUTE, OMIT y AUTO; exigen reviewToken y versión. PATCH /crm/leads/portfolio recibe targets con id/version, portfolioClass y reason. GET /crm/leads admite portfolioClass=ACTIVE/HISTORICAL/UNCLASSIFIED/ALL, inicial ACTIVE. Todos conservan controles de identidad, ADMIN cuando corresponde y ámbito de propietario.

El listado de importaciones, el detalle y la confirmación devuelven `result` con `created`, `updated`, `merged`, `omitted` (exclusiones), `alreadyRegistered` y `pending`. En el detalle, `summary` sigue representando el plan que queda por ejecutar. `GET /crm/leads?portfolioClass=ALL&importBatchId=<uuid>` aplica el filtro por procedencia solo a ADMIN y a lotes propios.
