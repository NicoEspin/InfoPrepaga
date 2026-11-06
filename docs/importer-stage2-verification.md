# Importador inteligente — segunda etapa

**Fecha:** 6 de noviembre de 2026. **Estado:** implementación y validación local completadas sobre datos sintéticos; sin despliegue, limpieza de datos habituales ni commits. La nueva migración quedó preparada para revisión, sin aplicarla al entorno habitual.

## Resultado funcional

| Pedido | Implementación y garantías |
| --- | --- |
| Comparación de duplicados | Tabla de valor actual, entrante, acción, motivo y resultado. Distingue conservar, completar vacío, incorporar historia y conflicto. Compara CRM o una referencia interna del libro. Varias identidades, una revisión obsoleta o una fila omitida nunca habilitan sobrescrituras. |
| Administración de equivalencias | Pestaña Administrador → Importación Excel; búsqueda por alias/grupo/hoja, tipo y páginas. Renombrar, cambiar destinos activos o eliminar con confirmación. Guard y servicio ADMIN, colisiones normalizadas, versión updatedAt y auditoría transaccional. |
| Procedencias completas | Endpoint paginado con autorización del lead y componente de perfil. Origen, archivo/lote, hoja/fila, asesor, observaciones, fechas y correcciones autorizadas; persiste tras vencer la revisión. La primera aparición no se duplica como legacy. |
| Excepciones | Diagnóstico agregado de las 182 apariciones; correcciones opcionales masivas con autorización explícita y originales conservados. Ninguna unión adicional por similitud de nombres. |
| Pruebas y CI | Navegador real para CREATE/UPDATE/MERGE/SKIP/REVIEW, configuración y procedencias; integrado al harness de CI con Playwright/Chromium aislados. |
| Trabajos periódicos | Pruebas del siguiente tick tras contención, recuperación, no solapamiento, cierre y procesamiento durable en PostgreSQL. |

## Contratos y límites de actualización

Las comparaciones informan las operaciones propuestas; no son una API de edición libre. El cliente no puede enviar un lead destino, un rol ni un campo comercial arbitrario. Reconocer duplicados o elegir INCLUDE no permite superar conflictos. La confirmación conserva la revalidación bajo bloqueo, versiones, huellas, transacciones y bloques de hasta 100 apariciones.

Los contactos existentes conservan nombre, responsable, estado, etapa, origen comercial, observaciones comerciales y seguimientos. Solo teléfono/correo vacíos se completan. La información entrante adicional se incorpora como procedencia; los valores históricos no reemplazan decisiones comerciales actuales.

Los cambios de equivalencias se aplican a futuras cargas. No alteran retroactivamente lotes preparados ni contactos. Un alias que colisiona con otra clave normalizada devuelve 409, incluso si sería posible deduplicarlo: requiere una decisión administrativa. Una regla que cambió desde que se consultó también devuelve 409. No se crean usuarios ni fuentes desde esta pantalla.

Las escrituras de equivalencias guardan autor, fecha y snapshots antes/después. Guardar desde una importación no sobrescribe silenciosamente un destino confirmado diferente: debe editarse en Administración o elegirse una excepción `remember=false` exclusiva del lote.

## Análisis de las 182 apariciones

Se leyó `datos FACE.xlsx` localmente, sin modificarlo, cargar sus contactos ni imprimir nombres, correos o teléfonos. La base habitual no estaba disponible para consultas en esta etapa; se usó el escenario sin catálogos reales con configuración resuelta explícitamente como hipótesis, reproduciendo las 182 excepciones anteriores.

| Categoría excluyente | Apariciones |
| --- | ---: |
| Solo problemas de contacto | 80 |
| Solo conflictos de identidad | 94 |
| Ambas categorías | 8 |
| **Total** | **182** |

Motivos no excluyentes: nombres incompatibles 98, teléfonos incompatibles 8, correos incompatibles 9, teléfono inválido 30, nombre faltante/largo 22, nombre ambiguo 4, falta de contacto 27, fórmula 5 y correo inválido 9. Una aparición puede tener varios motivos; no se suman para calcular personas.

### Correcciones masivas que sí son seguras bajo confirmación

| Acción explícita | Elegibles |
| --- | ---: |
| Descartar correo inválido cuando queda teléfono válido | 3 |
| Descartar teléfono inválido cuando queda correo válido | 4 |
| Omitir fórmula de teléfono cuando queda correo válido | 3 |
| **Total** | **10** |

Se exige nombre obligatorio resuelto, longitud válida, observación admisible, ausencia de fórmulas en otros campos y ningún conflicto de identidad. Por eso una cuarta fórmula acompañada de correo válido no se corrige masivamente: aún tiene otro dato obligatorio pendiente.

El administrador debe confirmar cada categoría. Se conserva el valor descartado en `metadata.reviewedOriginal`, se modifica únicamente la revisión privada y se registra luego en la procedencia durable. Una sola actualización SQL parametrizada evita una escritura por fila; versión y reviewToken actual protegen la decisión. No se usan resultados cacheados de fórmulas.

| Escenario hipotético | Altas | Consolidaciones | Apariciones listas | Pendientes |
| --- | ---: | ---: | ---: | ---: |
| Equivalencias resueltas, sin correcciones adicionales | 1.071 | 360 | 1.431 | 182 |
| Más las 10 correcciones opcionales autorizadas | 1.078 | 363 | 1.441 | 172 |

Los 102 casos con conflicto de identidad permanecen protegidos. No se inventaron identidades, teléfonos, áreas, años ni responsables. Confirmar responsables históricos incompatibles o consultar una cartera real puede cambiar las cifras: no son una promesa de altas definitivas ni autorizan reparto automático de asesores desconocidos.

La reconciliación del libro no cambia: 1.613 candidatas; la diferencia respecto de 1.616 sigue siendo la exclusión de tres títulos mensuales. Las 88 apariciones con error de contacto pasan a 78 únicamente en el escenario de correcciones explícitas.

## API, BFF y persistencia

- `GET/PATCH/DELETE /crm/import-mappings`: lista paginada y mutaciones por identidad kind/scope/key más expectedUpdatedAt. DELETE recibe JSON; el BFF habilita ese cuerpo solo en esta ruta y mantiene CSRF/origen, sesión y límites.
- `GET /crm/leads/:id/import-appearances`: páginas de procedencias, con el mismo alcance de lectura del lead. VENDEDOR no puede consultar IDs ajenos. No otorga acceso a revisiones privadas del autor de otro lote.
- `PATCH /crm/lead-imports/:id` agrega bulkCleanup INVALID_EMAIL/INVALID_PHONE/FORMULA_PHONE, con versión y huella actuales. Conserva la revisión de conflictos; no escribe leads hasta confirmar.
- La revisión agrega comparisons, comparisonCount, conflictReasons y summary.cleanupCandidates. Swagger y tipos frontend reflejan el contrato.

**Migración nueva:** `20261106160000_import_mapping_audit`. Agrega únicamente `lead_import_mapping_events`, con referencia al autor, snapshots JSON y fecha. No modifica ni elimina migraciones aplicadas; no cambia la versión de Prisma. Se ejercitó en esquemas nuevos de PostgreSQL descartable. **No se ejecutó prisma:deploy sobre la base habitual ni producción.** Antes de validar escrituras en un entorno compartido, debe revisarse y aplicarse en un paso autorizado.

Las procedencias usan la tabla durable existente; no requieren migración adicional. Datos anteriores a esas apariciones se muestran como legacy solo si no están representados, sin inventar referencias que ya no se conservaron.

## Verificación ejecutada

| Comando / escenario | Resultado |
| --- | --- |
| Backend `pnpm test --runInBand`, con Python PDF del runtime instalado | 15 suites, 66 pruebas aprobadas |
| Backend `pnpm test:e2e --runInBand`, CRM_TEST_DATABASE_URL local descartable | 6 suites, 48 pruebas aprobadas |
| Backend typecheck, lint y format:check | Aprobados |
| Backend build | Aprobado |
| prisma:generate y prisma validate | Aprobados, Prisma 6.19.3 |
| Frontend typecheck, lint:strict y format:check | Aprobados |
| Frontend build standalone con Node 24.22.1 | Aprobado |
| `CRM_RUN_IMPORT_UI=true node scripts/verify-crm.mjs` | Navegador completo aprobado y 91 verificaciones BFF/CSRF/persistencia aprobadas |
| Scripts frontend verify-crm-profile, verify-followups, verify-sessions y verify-reports | Aprobados |
| YAML de CI, hook E2E, sintaxis de scripts, enlaces y UTF-8 de documentación; git diff --check | Aprobados |
| Simulación offline del Excel original | 1.613 candidatas; 182 → 172 excepciones en el escenario explicitado |

El navegador verifica valores actuales/entrantes, adición de teléfono vacío, conservación de estado/responsable, tres procedencias sin duplicar tras reimportación, corrección opcional autorizada, edición/eliminación de alias y edición de origen sin cambiar los leads existentes.

Las pruebas de backend incluyen identidades ambiguas que siguen bloqueadas aun con INCLUDE, controles de versiones y colisiones, destinos inexistentes y tipos de mapeo inválidos, preservación de entidades ajenas, trazabilidad tras vencimiento, permiso positivo del vendedor asignado y 404 de vendedor ajeno, auditoría de cambios/eliminaciones y reimportación idempotente de filas corregidas.

Los trabajos se prueban con temporizadores controlados y con PostgreSQL real: no inician otra ejecución mientras una anterior sigue en curso, reintentan en el siguiente ciclo tras diferimiento, anuncian recuperación y no pierden el trabajo durable al liberar el bloqueo.

La ejecución inicial de navegador detectó una expectativa de encabezado que se corrigió agregando semántica de título a la tarjeta. Otra ejecución detectó que la prueba asumía clave Fede en vez de la regla general `*`; se corrigió la selección y se amplió la búsqueda por hoja. Las ejecuciones finales aprobadas corresponden al recorrido completo. El lint también detectó un valor de prueba no usado y una composición redundante, corregidos antes del resultado final.

## CI

El workflow instala Playwright 1.62.1 y Chromium en un prefijo temporal, sin modificar manifests ni lockfiles de la aplicación. Configura NODE_PATH, CRM_RUN_IMPORT_UI=true y CRM_UI_BROWSER=bundled. El harness espera al navegador y cierra sus servidores incluso si falla.

La misma ruta del harness se ejecutó localmente con Playwright 1.62.1 y Chrome headless. **No se lanzó GitHub Actions**: no hubo commit ni push. La instalación Linux de Chromium y su ejecución remota quedarán verificadas cuando corra el workflow; no se presenta la prueba local como un resultado remoto.

## Archivos principales

| Área | Archivos |
| --- | --- |
| Equivalencias | backend/src/crm/import-mapping.{controller,dto,responses,service,store}.ts; crm.module.ts |
| Comparación y excepciones | backend/src/crm/lead-import.{comparison,exceptions,plan,service,dto,responses}.ts; lead-import.comparison.spec.ts |
| Procedencias | backend/src/crm/crm.{service,controller,responses}.ts; frontend/src/features/lead-imports/components/import-appearances.tsx; features/crm/components/profile.tsx |
| Configuración y revisión | frontend/src/features/lead-imports/components/import-mappings.tsx, import-comparison.tsx y lead-import-dialog.tsx; features/crm/components/settings.tsx |
| Contratos/BFF | frontend/src/features/lead-imports/api/{types,service,queries}.ts; frontend/src/lib/crm-proxy.ts |
| Persistencia | backend/prisma/schema.prisma; migrations/20261106160000_import_mapping_audit/migration.sql |
| Pruebas y herramientas | backend/test/lead-imports.e2e-spec.ts; backend/src/crm/import-jobs.spec.ts; scripts/verify-import-ui.cjs, verify-crm.mjs y simulate-lead-import.cjs; .github/workflows/ci.yml |
| Documentación | docs/lead-imports.md, guia-importacion-excel.md y este informe |

Se conservaron las modificaciones anteriores del repositorio y se añadieron componentes/servicios acotados en vez de reemplazar el módulo. No se modificaron secretos ni se incorporaron dependencias a la aplicación.

## Antes de una validación con contactos reales

1. Revisar la migración y aplicarla únicamente en el entorno autorizado; no fue desplegada en esta tarea.
2. Confirmar las equivalencias y responsables reales con ADMIN. Las reglas de simulación no se guardaron.
3. Revisar los conflictos de identidad restantes; no se implementó una fusión forzada.
4. Ejecutar la aceptación funcional sobre una copia autorizada y verificar el resultado contra la cartera existente antes de usar contactos reales.

No se ejecutaron limpiezas sobre datos habituales, despliegues ni commits. Solo se utilizaron contactos sintéticos en las pruebas de persistencia y navegador. Retirar estas pantallas no debe borrar procedencias ni auditoría; una reversión de persistencia exige una migración posterior que conserve datos, sin editar las ya aplicadas.
