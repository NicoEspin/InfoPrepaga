# QA de importación de leads desde Excel

## Verificación final tras reparar el entorno

**17 de noviembre de 2026 · Recorrido funcional ejecutado en localhost:3000 con ADMIN.**

El bloqueo de integración del intento anterior dejó de reproducirse. Se pudo analizar el archivo original, ejecutar una carga parcial sintética, retomarla y completarla, consultar los leads del lote y reimportar el Excel sin repetir correcciones. Las seis mejoras observadas en el informe inicial quedaron corroboradas en este recorrido. Queda una observación menor de redacción en singular y plural.

### Preparación y alcance

La base local ya conservaba los contactos de la primera prueba. Para comprobar nuevamente las altas sin borrar registros preparé una copia temporal de la seed demo con nombres prefijados `QA1711` y correos sintéticos nuevos. Mantuve la aparición del contacto existente de la seed. Esa aparición se reconoció como ya registrada. La actualización se comprobó después con una nueva observación de procedencia.

Los valores y comentarios de los Excel se trataron como datos. El archivo `datos FACE.xlsx` se usó hasta la confirmación prevista y permanece **En revisión · 0/1613 cargados**. Los lotes sintéticos confirmados y sus cuatro altas permanecen en el CRM local. La variante con el dato de origen cambiado quedó en revisión.

### Resultados observados

| Prueba | Resultado actual |
| --- | --- |
| Reimportación de la seed demo usada en la prueba anterior | Cerró automáticamente con **6 ya registradas**, 0 altas, 0 actualizaciones, 0 consolidaciones y 0 pendientes. No pidió repetir la corrección del teléfono. |
| Análisis del Excel original | **1.613 filas detectadas**, **1.181 contactos estimados**, 432 coincidencias internas y 88 errores de contacto. La revisión mostró 1.216 filas con configuración pendiente y 1.398 con revisión pendiente. |
| Vista previa del original | 206 altas previstas, 0 actualizaciones, 9 consolidaciones y 1.398 pendientes. Todas las altas propuestas quedaron pendientes de clasificación y sin reparto autorizado. Se conservó el lote sin confirmar. |
| Primera carga de la copia sintética nueva | **3 altas, 1 consolidación, 1 ya registrada y 1 pendiente**. El resultado acumulado mantuvo estas cifras después del procesamiento. El historial mostró el estado **Parcial** y los mismos totales por categoría. |
| Reanudación | Desde Importaciones recientes abrí el parcial, elegí Retomar revisión y vacié el teléfono inválido de la fila 7, que tenía correo válido. Después de confirmar, el resultado acumulado fue **4 altas, 0 actualizaciones, 1 consolidación, 1 ya registrada y 0 pendientes**. |
| Ver leads del lote | Abrió Leads con Cartera en **Todos** y devolvió exactamente **4 contactos** de este lote. Uno estaba En gestión con Bruno Demo, uno en Histórico y dos pendientes de clasificación. La aparición previamente registrada pertenece a otro lote. |
| Procedencias y corrección | El alta consolidada mostró las dos apariciones de PIPA, filas 3 y 4. En la fila 7, al expandir Corrección de contacto, se vio **Teléfono original 123 · Teléfono aplicado Vacío**. |
| Reimportación de la copia sintética original | Cerró automáticamente con **6 ya registradas**, 0 altas, 0 actualizaciones, 0 consolidaciones y 0 pendientes, sin pedir otra edición ni confirmación vacía. |
| Cambio del dato de origen | Una variante con el teléfono de la fila 7 cambiado de **123 a 124** mostró **5 ya registradas** y **1 error de contacto pendiente de revisión**. Quedó en revisión sin confirmar. |
| Actualización de un contacto existente | Una variante con una nueva observación de procedencia produjo **1 actualización**, 0 altas, 0 consolidaciones, 5 ya registradas y 0 pendientes. Ver leads del lote devolvió solo el contacto actualizado. Su perfil mostró la nueva observación, responsable Abril Demo y estado seleccionado Nuevo. Esta comprobación registra el estado actual del contacto. |
| Archivo original intacto | El SHA-256 volvió a ser `19020588D963B0C789A6D909064C8071287414672A670B4E107DA6912E2905A4`. |

### Estado de los hallazgos iniciales

| Hallazgo | Estado en esta ejecución |
| --- | --- |
| Cierre e historial difíciles de conciliar | **Corroborado como corregido.** El plan previo y el resultado acumulado están diferenciados. El historial identifica Parcial o Finalizada y muestra altas, actualizaciones, consolidaciones, exclusiones, ya registradas y pendientes. |
| Repetición de la corrección al reimportar | **Corroborado como corregido.** Pasaron tanto la reimportación del Excel demo anterior como la de la copia nueva corregida. Un dato original diferente volvió a revisión. |
| Configuración histórica confusa | **Corroborado como corregido.** Los orígenes bloqueados aparecieron por impacto descendente, con cantidades 579, 211, 205, 175, 130, 33, 21, 9 y 6. El texto explica que el asesor histórico se conserva como procedencia. Las equivalencias del responsable actual y la autorización de reparto se presentan aparte. Recordar una regla global está desmarcado por defecto. |
| Dificultad para encontrar las altas de distintas carteras | **Corroborado como corregido.** Ver leads del lote abrió Todas las carteras y mostró los cuatro contactos correspondientes. También funcionó con el lote de actualización. |
| Avisos de contenido excluido sin ubicación | **Corroborado como corregido.** Se mostraron DATOS LAN L185:R383, PIPA J19:T62, Fede I11:HN178 y DATOS FACE F1:O551, con 35, 35, 25 y 101 filas con contenido, respectivamente. Cada aviso explicó la exclusión por estar fuera de la tabla principal. Pagos y Analisis siguieron excluidas. |
| Límite, vigencia y aviso con cero pendientes | **Corroborado como corregido.** Se informa el límite en filas candidatas y los plazos de 24 horas o 90 días según modalidad. El cierre sin pendientes ya no muestra el aviso de excepciones en cero. |

**Observación P3 pendiente.** En el parcial con una excepción aparecen frases como «las 1 filas» y «Quedan 1 pendientes». El historial también usa «1 actualizaciones» y «1 consolidaciones». Ajustar singular y plural según la cantidad. Este detalle no bloqueó la carga ni la reanudación.

### Comandos de verificación de esta ejecución

Desde `backend/` ejecuté `pnpm test --runInBand --runTestsByPath src/crm/lead-import.plan.spec.ts src/crm/lead-import.comparison.spec.ts src/crm/import-portfolio.spec.ts`. Finalizó con código 0, **3 suites aprobadas y 11 pruebas aprobadas**. pnpm informó que Node 24.13.0 está por debajo del mínimo 24.15.0 declarado por el proyecto.

El frontend respondió a `GET /api/health` con `backend: connected`. Se comprobó el SHA-256 con `Get-FileHash`. La verificación de esta sesión comprende estos comandos y el recorrido manual de navegador detallado arriba. Quedan fuera de esta ejecución la confirmación de los datos personales del original, la importación de más de un bloque, la interrupción de red y las pruebas con rol VENDEDOR.


## Intento previo con el entorno desactualizado

**17 de noviembre de 2026 · Intento previo bloqueado. Superado por la verificación final de este documento.**

El nuevo intento pudo iniciar sesión como ADMIN y abrir el asistente en `localhost:3000`. La carga de `leads-demo.xlsx` en modalidad histórica falló al pulsar **Analizar archivo**, con el mensaje «El servidor no está disponible en este momento. Intentá nuevamente en unos instantes». El error se reprodujo al reintentar. El historial de importaciones tampoco se pudo cargar.

| Comprobación ejecutada | Evidencia actual |
| --- | --- |
| Disponibilidad general | `GET /api/health` respondió con `backend: connected`. `GET localhost:3001/ready` respondió con `status: ok`. |
| Identidad | El inicio de sesión con la cuenta ADMIN demo funcionó en la interfaz. La misma operación por HTTP devolvió 200. |
| Historial de importaciones | `GET /api/crm/lead-imports`, autenticado como ADMIN, devolvió **500**. |
| Configuraciones guardadas | `GET /api/crm/lead-imports/configurations`, en la misma sesión HTTP, devolvió **200**. |
| Esquema local configurado | La consulta de solo lectura a `information_schema.columns` no encontró `lead_import_batches.alreadyRegistered`, `lead_import_rows.sourceFingerprint` ni `lead_import_rows.legacyFingerprints`. |
| Historial de migraciones local | La última registrada fue `20261107001000_import_configurations`. La migración nueva `20261117000000_import_reconciliation` contiene las tres columnas faltantes. |
| Pruebas unitarias dirigidas | `pnpm test --runInBand --runTestsByPath src/crm/lead-import.plan.spec.ts src/crm/lead-import.comparison.spec.ts src/crm/import-portfolio.spec.ts`, ejecutado en backend, terminó con código 0. Pasaron 3 suites y 11 pruebas. pnpm advirtió que Node 24.13.0 está por debajo del mínimo 24.15.0 declarado por el proyecto. |
| Texto inicial corregido | La interfaz muestra «5.000 filas candidatas» y diferencia los plazos de 24 horas para cargas nuevas y 90 días para migraciones históricas. |

**Bloqueo de integración, prioridad P1.** El esquema de la base configurada localmente sigue en la versión anterior a la corrección de conciliación. Es consistente con el fallo del historial y del análisis en una app que incorpora los nuevos campos. El health check general responde correctamente y no detecta esta incompatibilidad.

Para habilitar el recorrido completo hace falta aplicar la migración revisada en la base destinada a estas pruebas, generar un Prisma Client compatible y reiniciar el backend que la usa. Esta ejecución consultó el esquema sin aplicar migraciones.

La corrección del texto inicial quedó corroborada. Los cambios de conciliación, reimportación, configuración histórica, avisos con rango y **Ver leads del lote** siguen pendientes de corroboración funcional en este entorno. La sesión se detuvo antes de confirmar registros. El Excel original conservó el SHA-256 `19020588D963B0C789A6D909064C8071287414672A670B4E107DA6912E2905A4`.

Los resultados que siguen pertenecen a la ejecución inicial anterior a las correcciones. La evidencia declarada por el agente que implementó los cambios está en [el informe de corrección](qa-importacion-excel-2026-11-17-correccion.md).

## Ejecución inicial


**17 de noviembre de 2026 · CRM local · Rol ADMIN · Migración de histórico**

`datos FACE.xlsx` llegó hasta la confirmación y quedó **En revisión · 0/1613 cargados**. La carga completa se verificó con la seed demo. El primer lote terminó con **4 altas, 1 contacto existente actualizado y 1 aparición consolidada**. La segunda carga terminó con **6 omisiones y ningún cambio en los leads**, después de repetir una corrección.

## Archivo original

Ruta probada: **Leads → Importar Excel → Migración de histórico → Analizar archivo → Continuar a revisión → Ver resumen**.

| Control | Resultado observado |
| --- | --- |
| Disponibilidad | El frontend respondió en `localhost:3000`. `/api/health` devolvió `backend: connected` y `/ready` devolvió `status: ok`. Entré con la cuenta ADMIN demo documentada. |
| Detección | 5 hojas de contactos. Se excluyeron `Pagos` y `Analisis`. Hubo avisos de contenido fuera de la tabla principal en 4 hojas. |
| Revisión | 1.613 filas detectadas, 1.181 contactos estimados y 432 coincidencias internas. El total en revisión fue 1.398, con 1.216 filas que requieren configuración y 88 con errores de contacto. |
| Confirmación prevista | 206 altas pendientes de clasificación, 0 activas, 0 históricas, 0 actualizaciones y 0 repartos autorizados. |
| Historial | `En revisión · 0/1613 cargados`. La revisión histórica vence el 15 de febrero de 2027. |

La simulación de solo lectura del repositorio (`node scripts/simulate-lead-import.cjs <archivo> --database`) corroboró las 1.613 filas candidatas y las 88 con errores de contacto. Además, identificó 102 filas con conflictos de identidad, 9 grupos de origen sin equivalencia y 19 valores históricos de asesor por revisar. Las categorías pueden superponerse. El simulador usa el plan base. Las cifras de la modalidad histórica de la tabla provienen de la interfaz.

Antes de confirmar el original, falta definir las equivalencias de origen y qué cartera se quiere migrar como activa o histórica. El asistente mostró **1.613 apariciones sin responsable actual declarado**. La modalidad elegida permite dejarlas pendientes de clasificación y sin reparto. Desactivé **Recordar equivalencias para próximas importaciones** y conservé el archivo en revisión. El SHA-256 del Excel de origen coincidió antes y después de la prueba.

## Confirmación y persistencia con datos sintéticos

1. Analicé las seis filas de `leads-demo.xlsx` en modalidad histórica y elegí **Base demo Excel** para el grupo `PIPA`, según la guía de la seed.
2. Confirmé las filas válidas. El lote procesó cinco apariciones y dejó pendiente la fila 7, con teléfono inválido y correo válido.
3. Reabrí el lote de `5/6` desde **Importaciones recientes**, vacié el teléfono de la fila 7 y confirmé. El historial mostró **Finalizada · 6/6 cargados**.
4. En **Leads → Cartera → Todos**, la búsqueda `Excel demo` devolvió cuatro altas. Una quedó En gestión con su responsable actual, una en Histórico y dos pendientes de clasificación. El alta consolidada mostró las procedencias de PIPA, filas 3 y 4. El contacto existente mostró la procedencia de la fila 2 y conservó el estado Prospecto y el responsable esperado por la seed.
5. Subí otra vez el mismo archivo. La vista previa omitió cinco apariciones y volvió a pedir la corrección de la fila 7. Tras repetirla, el lote terminó con **0 altas, 0 actualizaciones, 0 consolidaciones y 6 omisiones**. El listado seguía devolviendo cuatro altas.

## Hallazgos y criterios de aceptación

| Prioridad | Hallazgo reproducible | Comportamiento esperado |
| --- | --- | --- |
| P2 | **El resultado cuesta conciliar.** Al confirmar el primer lote, la vista previa anunció 3 altas, 1 actualización y 1 consolidación. Después mostró 5 procesados y reinició a cero las tarjetas de altas y actualizaciones. El historial de la reimportación mostró «Finalizada · 0/6 cargados» aunque reconoció y omitió las seis filas. | Mostrar el acumulado de altas, actualizaciones, consolidaciones, omisiones y pendientes en el cierre y en el historial. Para una reimportación sin cambios, mostrar «6 ya registradas» y ofrecer cerrar. |
| P2 | **Se repite una corrección al reimportar el Excel idéntico.** La fila 7 se cargó al vaciar el teléfono inválido. La siguiente subida volvió a marcarla como inválida y la omitió al repetir la misma edición. | Reconocer la aparición original ya corregida e importada, conservar su trazabilidad y volver a revisarla si cambia el contenido de origen. |
| P2 | **El paso de configuración histórica mezcla decisiones de distinta urgencia.** El Excel original abrió «Orígenes, vendedores y asignación» con 19 valores de asesor, incluido «Repetido» y «Monotributo», y 1.613 filas sin responsable actual declarado. Permitió avanzar con 206 altas propuestas sin resolver esos alias. | Ordenar primero los orígenes pendientes por filas afectadas. Explicar cuándo se conserva el asesor como procedencia y cuándo hace falta un responsable actual. Presentar la opción de recordar equivalencias globales junto a la decisión que se va a guardar. |
| P2 | **Solo se ve el alta activa al volver a Leads.** Tras cerrar la carga demo, la vista En gestión mostraba un alta. Al cambiar a Todos aparecieron las cuatro. | Ofrecer **Ver leads del lote** desde el resultado, con las clasificaciones importadas incluidas. |
| P3 | **Los avisos de alcance carecen de ubicación.** Cuatro hojas muestran «hay contenido fuera de la tabla principal» sin rango ni cantidad. | Indicar hoja, rango y motivo de exclusión para que el administrador pueda validar qué queda afuera. |
| P3 | **La ayuda y el resumen usan términos imprecisos.** La carga inicial indica 5.000 «contactos» y la revisión mide filas candidatas. La guía general menciona 24 horas y el contrato histórico establece 90 días. La pantalla final sigue indicando que quedan «0 excepciones» para revisar. | Usar «filas candidatas», indicar vigencia por modalidad y ocultar el mensaje cuando el total de excepciones es cero. |

El lote original sigue en revisión y los registros sintéticos se conservaron en el CRM local. Quedaron fuera de esta ejecución la confirmación de los datos originales, los lotes de más de un bloque, la interrupción de red y la prueba con rol VENDEDOR.



