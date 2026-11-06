# Importador Excel: cambios y evidencia — 6 de noviembre de 2026

Se implementaron los cambios en backend, frontend, modelo de datos, pruebas y documentación. El Excel original se usó únicamente para lectura local. No se importaron sus contactos ni se borraron datos de la base habitual.

## Problemas encontrados

1. La lista `errors` mezclaba validación de contacto, origen pendiente y asesor sin relacionar. La selección podía seguir diciendo “Se cargará” aunque hubiera errores. Ahora hay acciones y estados separados; las filas REVIEW no se seleccionan.
2. No existía memoria de equivalencias. Diferencias de formato multiplicaban los mapeos manuales; PIPA interpretaba etiquetas de origen como personas. Ahora hay normalización, etiquetas explícitas, reglas persistentes y destinos revalidados.
3. Los duplicados solo se omitían o generaban más leads. Ahora se planifican CREATE/UPDATE/MERGE/SKIP/REVIEW y se preserva procedencia durable, con una huella única para idempotencia.
4. Se contaban títulos mensuales como contactos fuera de PIPA; se consideraban ambiguas algunas variantes equivalentes de un mismo nombre en DATOS LAN.
5. Los dos trabajos periódicos adquirían el bloqueo comercial aun sin trabajo. Las vistas previas también tomaban ese bloqueo y el reconocimiento de coincidencias hacía una escritura por fila.

## Diagnóstico de errores periódicos

Se localizaron `schedulePending` (30 segundos) y `scheduleCleanup` (60 segundos). Ambos capturaban la excepción sin conservar código ni stack y ambos usaban la transacción comercial de 15 segundos.

**Reproducción comprobada:** en PostgreSQL descartable se mantuvo ocupado el bloqueo comercial durante 16 segundos. Las dos rutas anteriores de mantenimiento agotaron el plazo de transacción y devolvieron **P2028**. Las pruebas verifican ambos rechazos, el funcionamiento del nuevo camino sin espera y el procesamiento posterior de pendientes/vencidos al liberarse el bloqueo.

**Corrección:** comprobación previa cuando no hay trabajo; cuando lo hay, `FOR UPDATE SKIP LOCKED` difiere el mantenimiento si el bloqueo está ocupado. Las escrituras del usuario mantienen el bloqueo obligatorio. La vista previa usa lectura RepeatableRead y el reconocimiento de coincidencias se actualiza con SQL parametrizado en bloque.

**Diagnóstico permanente:** nombre técnico, código Prisma/SQLSTATE y frames filtrados, sin mensajes de excepción, SQL, argumentos ni registros. Se limita la repetición del mismo fallo y se anuncia recuperación. La ausencia real de la fila de bloqueo no se confunde con contención.

**Límite de atribución:** antes del cambio, en la base local inspeccionada ambos trabajos también completaban correctamente cuando no había contención. Los mensajes históricos entregados no incluyen su excepción, por lo que no es posible demostrar que todas sus ocurrencias fueran P2028. La reproducción demuestra un defecto concreto compartido y su solución; cualquier otra falla conserva ahora evidencia técnica segura para investigarla.

`node scripts/diagnose-crm-jobs.cjs --run` confirmó, tras migrar desarrollo: ninguna migración pendiente, una fila de bloqueo, cero pendientes y vencidos, reparto resultado 0 y limpieza ok. No se conectó a producción.

## Resultado sobre el Excel original

| Dato | Resultado |
| --- | ---: |
| Candidatas anteriores | 1.616 |
| Títulos mensuales adicionales excluidos | 3 |
| Candidatas actuales | 1.613 |
| Errores de contacto anteriores / actuales | 93 / 88 |
| Filas con coincidencias | 836 |
| Repeticiones internas adicionales | 432 |
| Componentes de contacto estimados | 1.181 |
| Filas listas con catálogos y reglas actuales | 9 |
| Grupos de origen / alias de asesor pendientes | 9 / 19 |
| Escenario de configuración resuelta: altas | 1.071 |
| Escenario de configuración resuelta: consolidaciones | 360 |
| Escenario de configuración resuelta: revisión restante | 182 |

El cambio de candidatas se verificó comparando el parser anterior de Git con el actual sobre el mismo archivo: DATOS LAN filas 18 y 200, y DATOS FACE fila 149 eran títulos mensuales. La reducción adicional de dos errores se debe a nombres equivalentes en varias columnas. Los errores/conflictos se superponen y no deben sumarse sin deduplicar filas.

Las 1.614 pendientes de la ejecución citada no pudieron reproducirse como un lote existente: la base local inspeccionada tenía cero leads. No se las equipara con las candidatas del parser. Las 836 coincidencias sí se reproducen; representan apariciones, no 836 contactos nuevos.

El escenario de 1.431 apariciones procesables supone resolver los mapeos y usar reparto para asesores no identificados; no guarda reglas ni autoriza ese reparto. Confirmar responsables históricos distintos puede aumentar los conflictos. Los contactos únicos siguen siendo una estimación por claves, con identidades incompatibles pendientes de revisión.

## Migración y datos protegidos

Se agregó `20261106120000_intelligent_lead_imports`: equivalencias con autor/fecha y referencias, apariciones durables, resultado por fila y contadores. Una fila de importación deja de tener exclusividad sobre el lead, permitiendo varias apariciones. La huella de procedencia tiene restricción única. Se mantienen Prisma 6.19.3 y todas las migraciones anteriores.

La migración se ejercitó desde cero en esquemas nuevos de `localhost:55487/starter_test`, separados de la base habitual. Después se aplicó únicamente en `localhost:5433/infoprepaga`, verificando `NODE_ENV=development` y host local antes de ejecutarla.

| Entidad en desarrollo | Antes | Después |
| --- | ---: | ---: |
| Usuarios | 1 | 1 |
| Orígenes | 6 | 6 |
| Leads | 0 | 0 |
| Notas | 0 | 0 |
| Tareas | 0 | 0 |

**Limpieza ejecutada en la base habitual: ninguna; cero registros eliminados.** No había leads ni UUIDs de lotes anteriores con condición de prueba verificada. Se preparó `reset-test-imports.cjs`, con modo de simulación, procedencia exclusiva, respaldo, ensayo de restauración bajo restricciones reales y comprobación de concurrencia. La prueba de recuperación corre únicamente sobre contactos sintéticos en esquema descartable y revierte su ensayo.

## Archivos de esta entrega

| Área | Archivos |
| --- | --- |
| Persistencia | `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261106120000_intelligent_lead_imports/migration.sql` |
| Lectura y planificación | `backend/src/crm/lead-import.parser.ts`, `contact-keys.ts`, `import-normalization.ts`, `lead-import.mappings.ts`, `lead-import.plan.ts` |
| API y trabajos | `backend/src/crm/lead-import.service.ts`, `lead-import.controller.ts`, `lead-import.dto.ts`, `lead-import.responses.ts`, `crm.service.ts`, `backend/src/common/periodic-job-log.ts` |
| Pruebas backend | `lead-import.parser.spec.ts`, `lead-import.mappings.spec.ts`, `lead-import.plan.spec.ts`, `backend/src/common/periodic-job-log.spec.ts`, `backend/test/lead-imports.e2e-spec.ts` |
| Interfaz y contrato | `frontend/src/features/lead-imports/api/{types,service,queries}.ts`, `components/{lead-import-dialog,import-row-editor}.tsx`, `frontend/src/features/crm/components/profile.tsx` |
| Herramientas/pruebas de sistema | `scripts/verify-crm.mjs`, `verify-import-ui.cjs`, `simulate-lead-import.cjs`, `diagnose-crm-jobs.cjs`, `reset-test-imports.cjs` |
| Documentación | `docs/lead-imports.md`, `guia-importacion-excel.md`, este archivo |

Se conservaron las modificaciones previas de `frontend/src/features/crm/components/leads.tsx` y las personalizaciones de selects que ya existían en el diálogo. No se agregaron dependencias de la aplicación, no se modificaron secretos ni se reorganizaron frontend/backend.

## Comandos y resultados

| Verificación | Resultado observado |
| --- | --- |
| Backend `pnpm test --runInBand` | 13 suites, 60 pruebas aprobadas |
| Backend `pnpm test:e2e --runInBand`, con `CRM_TEST_DATABASE_URL` descartable | 6 suites, 45 pruebas aprobadas |
| Backend `typecheck`, `lint`, `format:check`, `build` | Aprobados |
| `pnpm prisma:generate`, `pnpm exec prisma validate` | Aprobados, Prisma 6.19.3 |
| Migraciones sobre esquemas nuevos y despliegue local de desarrollo verificado | Aprobados |
| Frontend `typecheck`, `lint:strict`, `format:check` | Aprobados |
| Frontend build standalone con `BUILD_STANDALONE=true` y Node 24.22.1 | Aprobado |
| `node scripts/verify-crm.mjs`, Node 24.22.1 | 82 verificaciones BFF, CSRF, páginas de producción, Swagger y persistencia aprobadas |
| `node scripts/verify-import-ui.cjs`, Playwright y Chrome headless | Aprobado: subida sintética, mapeo reutilizado, filtro de excepciones, exclusión explícita, confirmación y consolidación |
| `node scripts/simulate-lead-import.cjs "…/datos FACE.xlsx" --database` | Lectura sin persistencia; cifras detalladas arriba |
| `node scripts/diagnose-crm-jobs.cjs --run` | Ambos trabajos completados, sin migraciones pendientes |
| `node --check` de scripts y `git diff --check` | Aprobados |

Las pruebas cubren cinco adaptadores, fórmulas, títulos, resúmenes sintéticos, laterales, fechas incompletas, teléfonos de distintas áreas, etiquetas PIPA, alias, destinos inactivos, identidades incompatibles, reimportación concurrente, contactos existentes, preservación comercial, permisos positivos/negativos, 5.000 candidatas, bloques de 100, reanudación, vencimiento, purga y respaldo/restauración limitada.

La primera ejecución general falló por falta de `pypdf` en el Python habitual; se repitió correctamente usando `PDF_TEST_PYTHON` del runtime instalado, sin instalar dependencias. Hubo fallas transitorias del harness por compilar mientras un servidor usaba el build; se detuvo el preview y se repitió en secuencia. La prueba de navegador detectó y motivó la corrección de la etiqueta de una fila con error.

El pnpm habitual ejecuta Node 24.13.0 y emite una advertencia respecto del mínimo del proyecto; los builds standalone y el harness de producción se ejecutaron explícitamente con el Node 24.22.1 instalado. Prisma también informa la deprecación conocida de `package.json#prisma`; no se hizo una actualización de versión mayor.

## Límites y reversión

Los mapeos no confirmados y las identidades contradictorias siguen requiriendo decisiones administrativas. No hay detección de esquemas arbitrarios, años inferidos, búsqueda por parecido de nombres, fusión comercial forzada ni automatización de Avalian. El Excel real no se usa como fixture ni se imprimen sus contactos.

La interfaz puede retirarse conservando los datos. Para revertir el código persistente debe preservarse la migración aplicada y diseñarse una migración posterior que mantenga las apariciones y los vínculos; no se deben borrar tablas ni restaurar la unicidad antigua ignorando múltiples procedencias. Los cambios permanecen sin commit para conservar el trabajo previo del propietario.
