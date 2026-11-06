# Importación inteligente de leads desde Excel

La importación comercial usa NestJS, Prisma 6.19.3 y PostgreSQL. La [guía de uso](guia-importacion-excel.md) explica la pantalla. Solo ADMIN puede operar y cada revisión pertenece al administrador que la inició. No hay sincronización permanente con Excel, Meta ni Avalian.

## Segunda etapa: revisión funcional

La [segunda etapa y su evidencia](importer-stage2-verification.md) agrega comparación por campo, administración de equivalencias en **Administrador → Importación Excel**, procedencias paginadas del lead y correcciones opcionales masivas explícitas. El recorrido real de navegador forma parte del harness de CI.

La migración nueva `20261106160000_import_mapping_audit` agrega exclusivamente el registro de auditoría de equivalencias. **No fue aplicada a la base habitual** en esta etapa. La versión debe revisarse y migrarse en un entorno autorizado antes de usar las escrituras nuevas; no se ejecutan migraciones desde la aplicación ni sus temporizadores.

## Comparación y correcciones autorizadas

Cada fila de la revisión devuelve `comparisons`: contactos coincidentes de CRM o una referencia interna del archivo, con valor actual, entrante, resultado propuesto, motivo y acción por campo. Las acciones son PRESERVE, ADD, HISTORY, CONFLICT y REVIEW. `canApply=false` indica que no hay modificación autorizada todavía; con varias identidades posibles se comparan candidatos sin elegir arbitrariamente un destino.

Nombre, responsable, estado, etapa, origen comercial y seguimientos existentes se conservan. Solo correo/teléfono vacíos pueden completarse; observaciones, asesor, origen y fecha entrantes se incorporan como procedencia. Reconocer coincidencias o usar INCLUDE no autoriza sobrescribir identidades incompatibles. Se siguen validando versión, huella y estado real al confirmar.

`PATCH /crm/lead-imports/:id` acepta `bulkCleanup`: INVALID_EMAIL, INVALID_PHONE o FORMULA_PHONE, con `version` y `reviewToken` actual. Es una acción administrativa explícita, distinta de excluir el registro. Solo actúa sobre filas REVIEW sin conflictos de identidad, con nombre/observación válidos y otro medio de contacto verificado; no borra el único contacto disponible ni usa resultados cacheados de fórmulas.

La operación conserva el valor descartado en `metadata.reviewedOriginal`, modifica solo filas pendientes del lote propio y usa una actualización SQL parametrizada dentro de la transacción comercial. No modifica leads en la etapa de revisión. La procedencia durable expone después estas correcciones. Repetir el mismo archivo y la misma corrección conserva la idempotencia. Los contadores `summary.cleanupCandidates` informan elegibilidad por categoría; las correcciones pueden aplicarse antes de resolver la configuración, pero no la sustituyen.

## Administración de equivalencias

La pestaña **Administrador → Importación Excel** permite buscar por alias, grupo u hoja, filtrar por tipo y paginar las reglas. ADMIN puede renombrar alias/grupos, cambiar destinos activos y eliminar reglas con confirmación. Las reglas por hoja conservan su ámbito; para responsables se admite reparto automático explícito. No se crean usuarios ni fuentes desde esta pantalla.

| Ruta BFF / NestJS | Contrato |
| --- | --- |
| GET `/api/crm/import-mappings` / `/crm/import-mappings` | page, pageSize, kind opcional, q; reglas paginadas con destino, autor y updatedAt |
| PATCH mismas rutas | kind, scope, key, expectedUpdatedAt; newKey/sourceId/assignedToId según tipo |
| DELETE mismas rutas | JSON con kind, scope, key, expectedUpdatedAt; no elimina destinos ni leads |

El servidor exige ADMIN tanto en guards como en servicios. Un alias/grupo normalizado que colisiona con otro devuelve 409; nunca se sobrescribe otra regla. `expectedUpdatedAt` es el token de concurrencia: cambios o eliminaciones sobre una versión anterior devuelven 409. Las mutaciones se coordinan con el bloqueo comercial y generan un evento CREATE/UPDATE/DELETE con autor, fecha y antes/después en `lead_import_mapping_events`.

Guardar alias desde una importación también detecta si ya existe otro destino: hay que resolverlo en Administración o usar `remember=false` para una excepción exclusiva del lote. Las equivalencias existentes y los lotes previos no se reescriben cuando se edita o elimina una regla; la decisión aplica a futuras cargas. Los destinos inactivos se muestran, pero no pueden confirmarse como nuevos destinos válidos.

## Consulta de todas las procedencias

`GET /crm/leads/:id/import-appearances` (BFF equivalente) devuelve páginas de 10 en la interfaz, hasta 100 por contrato. Usa el alcance del lead en una transacción RepeatableRead: ADMIN ve la cartera; VENDEDOR solo sus asignados y recibe 404 para IDs ajenos. No concede acceso a revisiones privadas de otros administradores.

El perfil muestra origen histórico, archivo/lote, hoja/fila, asesor original, observaciones, fecha original literal, fecha de incorporación y correcciones autorizadas. Los datos provienen de `lead_import_appearances` y permanecen tras vencer la revisión. Las fuentes desactivadas conservan su nombre histórico de catálogo y se identifican como inactivas.

La primera aparición no se repite como un bloque legacy si ya está representada en el historial durable. Si solo queda `importData` anterior a las apariciones durables, se muestra como procedencia anterior incompleta: no se inventan archivos ni se reconstruyen filas ya purgadas. Las reimportaciones idénticas no agregan apariciones ni eventos.

## Lectura y normalización

| Hoja | Nombre / teléfono / correo | Datos históricos |
| --- | --- | --- |
| DATOS LAN | B–E / F / H | Fecha A, horario G, segmento I, asesor J, observación K |
| PIPA | B / C / E | Fecha A, horario D, régimen F, asesor o etiqueta G, observación H |
| Fede | B / C / E | Fecha A, horario D, segmento F, asesor G, observación H |
| DATOS FACE | B / C / sin columna | Asesor A, fecha D, observaciones E |
| folletos | B / C / sin columna | Fecha A, régimen D, asesor E, observación F |

El reconocimiento usa nombres de hojas sin distinguir mayúsculas ni espacios exteriores y posiciones de columnas fijas. Pagos, Analisis y hojas desconocidas se excluyen. Se ignoran bloques laterales, encabezados reconocidos, títulos mensuales reconocidos y resúmenes sin contacto. Los descartes del parser incluyen hoja, fila y motivo sin imprimir datos personales.

En DATOS LAN se conserva la columna del nombre y se clasifica B como Datos Lan, C como Whatsapp, D como Datos IP y E como Meta. Si hay varios nombres equivalentes tras normalizar mayúsculas, acentos y espacios, se resuelve el nombre; el canal queda por confirmar. Si los nombres difieren, requiere corrección. Nunca se generan combinaciones artificiales de orígenes.

En PIPA, las etiquetas exactas normalizadas LAN, ref e ip lan se clasifican como Datos Lan, Referidos y Datos IP; no se toman como vendedores. Se conserva el texto original. Las celdas vacías no heredan asesores ni fechas anteriores. Las fechas completas reconocidas se conservan en ISO; las incompletas permanecen como texto, sin inferir años. Horarios y observaciones no crean tareas ni cambian estados.

Las fórmulas en contacto u observaciones bloquean la fila hasta corregir el campo o excluirla; no se usan resultados cacheados. Las fórmulas complementarias se omiten con aviso. Los hipervínculos aportan solo texto visible, sin abrir sus destinos. Se mantienen límites de 10 MB, 5.000 candidatas, 20.000 filas físicas/256 columnas por hoja, 2.000 entradas ZIP y 64 MB descomprimidos verificados.

El correo se normaliza con trim/minúsculas. El teléfono usa libphonenumber-js/max con país predeterminado AR y `extract: false`: valida números completos con códigos de área, 0, 15, +54 y 9 donde corresponden. No extrae teléfonos de frases ni agrega códigos de área. El original se conserva en `metadata.originalPhone`; la clave y el teléfono guardado usan E.164.

## Equivalencias persistentes

`lead_import_mappings` guarda reglas confirmadas por ADMIN con autor y fecha:

- ORIGIN: hoja + grupo histórico → origen activo. Una regla por hoja con clave `*` sirve como valor general.
- ADVISOR: alias normalizado → cuenta activa ADMIN/VENDEDOR o `null` para reparto explícito.
- DEFAULT: hoja → responsable predeterminado, únicamente para filas sin asesor.

Una coincidencia inequívoca con un origen activo se resuelve por nombre/canal conocido. Datos IP reconoce Landing IP; Whatsapp y Meta solo admiten un destino automático si es único. Varias fuentes Meta requieren una decisión global. No se crean fuentes.

Para personas, solo se resuelven reglas confirmadas o coincidencias únicas con el nombre completo configurado. Fede no se presume equivalente a Federico; el administrador puede confirmar ambos alias en una operación. Diferencias de mayúsculas/acentos/espacios comparten alias. Las reglas se revalidan contra destinos activos en cada carga. Una regla de reparto explícito prevalece incluso si el alias coincide con un usuario. `remember=false` aplica solo al lote; por defecto las equivalencias se recuerdan. No se crean usuarios.

Las filas con asesor histórico desconocido quedan en configuración; no se reparten silenciosamente. Un contacto existente conserva su responsable y puede incorporar procedencia aun si su asesor histórico no está relacionado. La hoja Fede no asigna automáticamente todos los contactos a una persona.

## Planificación y políticas

El planificador puro `lead-import.plan.ts` construye componentes por correo/teléfono normalizados y se comparte con la simulación. Los nombres solos nunca unen contactos. Comparaciones de nombres solo sirven para vetar una unión ya sugerida por un medio de contacto.

| Acción | Comportamiento |
| --- | --- |
| CREATE | Crear un lead Nuevo, con origen confirmado y asignación validada o reparto existente. |
| UPDATE | Incorporar procedencia de un contacto existente compatible y completar únicamente correo/teléfono vacíos. |
| MERGE | Vincular una aparición complementaria compatible al contacto del grupo. No crear otro lead. |
| SKIP | Omitir por decisión, hoja excluida o aparición idéntica ya registrada. |
| REVIEW | Corregir contacto, resolver configuración o revisar una identidad incompatible. No queda seleccionada como importable. |

Nombres distintos, varios correos o teléfonos incompatibles, varios leads existentes o responsables históricos confirmados incompatibles para un alta nueva llevan a REVIEW. La política es conservadora: no hay unión difusa por nombres ni actualización forzada de identidades contradictorias. Para resolver un conflicto se corrige o excluye una aparición; el cliente no puede enviar un lead destino arbitrario.

UPDATE y MERGE conservan nombre existente, vendedor, estado, etapas, orígenes comerciales vigentes, tareas y observaciones comerciales. Cada aparición conserva archivo, hoja, fila, origen histórico, asesor, observaciones y metadatos en `lead_import_appearances`. Se agrega un evento `imported_history`, sin concatenar observaciones ni generar notas comerciales repetidas.

La huella de aparición incluye hoja, fila, nombre normalizado, claves de contacto, observación y metadatos ordenados. Reimportar la misma aparición no vuelve a crear ni actualizar ni agregar eventos. Cambiar su contenido produce otra aparición; la identidad se vuelve a evaluar. El nombre del archivo no fuerza una repetición ni se usa como identidad del contacto.

## Revisión, concurrencia y procesamiento

La vista muestra contadores distintos de filas, contactos estimados, altas, existentes actualizables, coincidencias internas, omisiones, configuración y errores reales de contacto. El número de contactos es una estimación por claves, no una declaración de que los conflictos sean una misma persona. El filtro inicial del frontend es REVIEW; la API pagina de a 50 y admite filtros ALL, CREATE, UPDATE, MERGE, DUPLICATES, REVIEW y SKIP.

La confirmación presenta las modificaciones antes de ejecutar. Las excepciones bloquean hasta corregirlas, omitirlas o elegir explícitamente `excludePending=true`. La exclusión se guarda en el lote y permite cargar lo validado. No se muestran filas bloqueantes como “Se cargará”. Las decisiones heredadas AUTO e INCLUDE usan la misma política segura; INCLUDE ya no autoriza crear otro lead repetido. OMIT excluye. La acción masiva de omitir duplicados puede excluir todas sus apariciones; se puede restablecer su selección automática o restaurar una fila.

Las escrituras mantienen `version`, bloqueo transaccional comercial, lotes de hasta 100 apariciones, pausa/reanudación e idempotencia. El `reviewToken` incluye ID y versión de los leads coincidentes; reconocer coincidencias o decidir en bloque exige la huella actual. Confirmar revalida todo bajo el bloqueo; si cambió la versión de un lead externo exige otra revisión. Las altas y ediciones comerciales mantienen claves en ese mismo bloqueo.

La vista previa usa una transacción de lectura RepeatableRead, sin tomar el bloqueo comercial. El reconocimiento de coincidencias se actualiza en una operación SQL parametrizada en lugar de una escritura por fila. Las filas apuntan a un lead compartido, y las huellas durables son únicas en base de datos. Los contadores distinguen apariciones procesadas, leads creados, contactos actualizados, apariciones consolidadas y pendientes excluidos.

La revisión vence a las 24 horas desde la subida, también tras carga parcial. La purga elimina solo filas temporales; conserva lotes, contadores y procedencia durable. Cerrar el navegador deja de pedir bloques nuevos; el bloque en curso puede finalizar. Se consulta el lote y se reanuda con su versión actual. No hay ejecución permanente de todo el archivo en segundo plano.

## API

Todas las rutas exigen ADMIN y lote propio. El BFF `/api/crm/lead-imports` mantiene sesión HttpOnly, CSRF por origen, límites multipart y ausencia de caché. No se agregan rutas de SQL ni de acceso a datos ajenos.

| Método / ruta NestJS | Entrada / resultado |
| --- | --- |
| POST /crm/lead-imports | Multipart `file` → `{id}` |
| GET /crm/lead-imports | Últimos 20 lotes propios vigentes |
| GET /crm/lead-imports/:id?page=1&filter=ALL | Filas paginadas, acciones, estados, errores separados, cambios preservados, resumen, mapeos, version y reviewToken |
| PATCH /crm/lead-imports/:id | version, sheets, mappings, duplicates y reviewToken según operación |
| PATCH /crm/lead-imports/:id/rows/:rowId | Correcciones/decisión/origen/responsable, version y huella al reconocer coincidencias |
| POST /crm/lead-imports/:id/review | `{version,reviewToken}` |
| POST /crm/lead-imports/:id/confirm | `{version,excludePending?}` → estado, version, imported, omitted, created, updated, merged y excluded |

Cada mapping acepta sheet/group/advisor, sourceId/assignedToId, `remember` y `aliases` (hasta 20 textos). Un responsable null significa reparto automático confirmado. Los responsables por hoja afectan solo filas sin asesor. Los alias de una misma operación se aplican masivamente y se guardan con el destino confirmado.

Swagger documenta las respuestas y DTOs; las interfaces TypeScript frontend reflejan el contrato. No se aceptan identidad/rol/autor del cliente ni un ID arbitrario de lead para fusionar.

## Procesos periódicos y diagnóstico

CrmService revisa pendientes cada 30 segundos; LeadImportService purga revisiones vencidas cada minuto. Antes ambos entraban al bloqueo comercial incluso sin trabajo. Ahora hacen una comprobación previa: si no hay pendientes/vencidos, retornan sin competir por ese bloqueo. Cuando hay trabajo, intentan `FOR UPDATE SKIP LOCKED`: si el bloqueo está ocupado, difieren la ejecución al siguiente ciclo sin esperar el vencimiento de la transacción. Verifican que la fila de bloqueo exista para no ocultar una migración faltante. Las escrituras de usuario siguen usando el bloqueo obligatorio.

`PeriodicJobLog` registra nombre de excepción, código técnico y frames de stack filtrados, sin mensajes crudos de Prisma, consultas, argumentos, credenciales ni registros. Registra fallas nuevas inmediatamente, resume repeticiones cada cinco minutos y anuncia recuperación. Los intervalos siguen reintentando; no se ocultan clases nuevas de fallo.

Desde la raíz:

```powershell
node scripts/diagnose-crm-jobs.cjs
# Ejecuta mantenimiento normal solo en entorno local development/test verificado:
node scripts/diagnose-crm-jobs.cjs --run
```

El diagnóstico muestra migraciones pendientes, existencia de la fila de bloqueo y contadores, sin datos personales. Una migración faltante o una conexión caída requiere corregir la instalación; nunca se crea una base ni se aplican migraciones automáticamente desde el temporizador. La reproducción de contención y sus límites de atribución están en la [evidencia de esta entrega](importer-verification-2026-11-06.md).

## Migración y reinicio de pruebas

La migración nueva `20261106120000_intelligent_lead_imports` agrega equivalencias y apariciones durables, contadores y outcome; retira la unicidad por lead de las filas temporales para permitir varias apariciones del mismo contacto. Conserva las migraciones anteriores y Prisma 6.19.3. Se valida primero en un esquema descartable. En despliegue hay que aplicar `prisma:deploy` y generar el cliente antes de usar el nuevo importador.

La limpieza está en `scripts/reset-test-imports.cjs`. **No selecciona automáticamente todos los importados**: exige UUIDs explícitos de lotes cuya condición de prueba haya sido verificada. Solo admite entorno development/test en localhost/127.0.0.1.

```powershell
# Primero revisar y documentar cuáles lotes fueron exclusivamente pruebas:
node scripts/reset-test-imports.cjs --batch UUID-LOTE-PRUEBA
# Solo con procedencia confirmada; exporta respaldo en TEMP y ensaya su restauración:
node scripts/reset-test-imports.cjs --batch UUID-LOTE-PRUEBA --execute
```

El modo normal solo informa cantidades. Rechaza lotes que actualizaron contactos preexistentes, procedencia incompleta, relaciones con otros lotes, notas, tareas, adjuntos, movimientos, cambios comerciales o reasignaciones posteriores. No elimina usuarios, fuentes, mapeos, configuraciones ni otros leads. Se toman el bloqueo comercial y una nueva comprobación antes de borrar.

Antes de la eliminación se escribe un JSON de recuperación fuera del repositorio, se ensaya borrar/restaurar bajo las restricciones reales de la base y se revierte deliberadamente ese ensayo. Si cambió el snapshot o falla restaurarlo, se aborta. El módulo exporta `restore(tx, backup)` para recuperar el JSON mediante una transacción Prisma en ese mismo entorno, manteniendo usuarios y fuentes referenciados. El respaldo contiene datos personales: conservarlo únicamente en almacenamiento local autorizado y borrarlo cuando deje de necesitarse.

En esta entrega no se identificaron lotes anteriores con prueba inequívoca de su carácter descartable; no se ejecutó limpieza sobre la base habitual. El ensayo automatizado usa únicamente datos sintéticos descartables.

## CI y procesos periódicos

El workflow instala Playwright 1.62.1 y Chromium en un prefijo temporal aislado; no agrega dependencias a la aplicación. Ejecuta el harness con `CRM_RUN_IMPORT_UI=true`, `CRM_UI_BROWSER=bundled` y NODE_PATH al directorio temporal. El mismo harness inicia NestJS/Next.js con cuentas y PostgreSQL sintéticos, ejecuta BFF/CSRF, espera la finalización del navegador y cierra los procesos en finally. No se publica ni se importa el Excel real en CI.

El navegador recorre CREATE, UPDATE, MERGE, SKIP y REVIEW, inspecciona valores actuales/entrantes, verifica conservación del estado/responsable, revisa procedencias y configura/elimina equivalencias. Las pruebas de temporizadores comprueban diferimiento, siguiente ejecución, recuperación de fallos, ausencia de solapamientos y parada limpia. La integración PostgreSQL verifica además el trabajo durable pendiente durante un bloqueo y su procesamiento después de liberarlo.

## Verificación y límites conocidos

Ver [resultados y comandos ejecutados](importer-verification-2026-11-06.md). La simulación es de lectura:

```powershell
node scripts/simulate-lead-import.cjs "C:\ruta\datos FACE.xlsx" --database
```

Sin `--database` no consulta catálogos ni contactos y todas las equivalencias quedan sin resolver. El escenario `afterExplicitConfiguration` es hipotético: supone que se resuelven las equivalencias pendientes, usando reparto para responsables desconocidos. No autoriza esos mapeos ni garantiza el mismo resultado si el administrador confirma responsables incompatibles. La simulación no persiste datos, no modifica el Excel y solo imprime agregados.

El formato sigue siendo fijo; no se detectan esquemas arbitrarios, responsables por apodos desconocidos ni identidades por similitud. No se crean citas, se interpretan estados escritos en observaciones ni se importan finanzas o registros Avalian. Las apariciones viejas creadas antes de esta migración conservan su importData e historial; no se inventa retrospectivamente una huella de contenido que ya no existe.
