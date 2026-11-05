# Reportes comerciales · contrato de cálculo 1

`/reports` permite a ADMIN configurar un análisis, generar una vista previa, guardar una fotografía definitiva y descargar su PDF mediante una acción separada. El servidor vuelve a calcular al guardar. No hay edición ni eliminación de fotografías. `/pipeline` usa leads persistidos para ambos roles; reemplaza la demo en la experiencia productiva.

## Habilitación y migración

Mantener Node 24.22.1, pnpm 10.32.1 y Prisma 6.19.3. Instalar con los lockfiles de cada paquete y ejecutar `pnpm -C backend prisma:generate`. La dependencia nueva es PDFKit 0.17.2, con sus tipos de desarrollo; las fuentes Geist se empaquetan con su licencia en `src/reports/fonts/` y Nest las copia al build.

Revisar y aplicar **solo en el entorno autorizado** la migración nueva `20261104120000_commercial_reports`, después de las migraciones existentes. No cambiar migraciones anteriores. El proceso de esta implementación no aplica migraciones a la base del propietario ni despliega aplicaciones.

La migración incorpora:

- Cinco etapas comerciales independientes del estado de contacto del lead.
- Fecha explícita de inicio del seguimiento comercial y origen de ingreso comprobable.
- Movimientos comerciales con etapa anterior/nueva, instante efectivo, responsable, origen, actor, versión y motivo de corrección.
- Fotografías agregadas JSONB, clave idempotente persistente por autor, hash del pedido e índices de consulta.
- Claves foráneas, restricciones e inmutabilidad de reportes mediante trigger de PostgreSQL. Los índices parciales y el trigger se mantienen en la migración SQL.

Los leads anteriores comienzan en Nuevo **desde la aplicación de la migración**, sin ventas inventadas. Un corte anterior muestra Sin historial de etapa. El origen previo se recupera del actual únicamente cuando el historial demuestra que no fue editado. Si hay una edición histórica de origen sin valores anteriores, queda desconocido. Las futuras ediciones registran ambos valores y no cambian el origen de ingreso.

La primera asignación se obtiene del historial persistido; una asignación posterior al corte se excluye. Si falta el historial de un lead actualmente asignado, o hay primeras asignaciones simultáneas sin un orden comprobable, se informa Sin atribución de responsable. No se reemplaza por su responsable actual. Los movimientos nuevos agregan versiones para ordenar eventos de igual precisión temporal.

No se hace backfill de etapas o ventas. El estado “Ya contrató” permanece independiente de una venta de InfoPrepaga.

## Pipeline, venta y permisos

Etapas: Nuevo, Contactado, En seguimiento, Propuesta enviada y Cerrado. Se permite saltar etapas. Entrar en Cerrado representa una venta ganada, con la fecha del movimiento y la atribución de responsable/origen de ese instante. El actor administrativo que ejecuta el movimiento no reemplaza al responsable comercial.

Solo ADMIN puede salir de Cerrado, con motivo obligatorio. Reabrir conserva el evento anterior y anula la venta vigente desde la reapertura. Un cierre posterior puede contar con su nueva fecha. En cada corte se toma **un único último movimiento por lead**, ordenado por instante y versión. Solo si ese movimiento es Cerrado existe venta vigente: las correcciones y nuevos cierres nunca duplican el lead en una población.

Las mutaciones comparten el bloqueo transaccional de reparto/reasignación y verifican la versión. El `updateMany` también valida ID, versión y alcance. VENDEDOR ve y mueve solo leads que tiene asignados; ADMIN ve toda la cartera. No se acepta fecha efectiva desde el navegador. El tablero se consulta paginado en el servidor (50 tarjetas por página); los contadores de columnas indican explícitamente las tarjetas de la página, sin importes ni prioridades ilustrativas.

La asignación manual acepta ADMIN o VENDEDOR activos. Incluye importaciones con responsable explícito y conserva el traslado de tareas pendientes y su historial. **La rotación automática conserva su consulta exclusiva de vendedores activos habilitados y excluye ADMIN**, aunque su bandera `receivesLeads` se alterara fuera de la interfaz. Las cuentas inactivas se conservan para consultas históricas.

## Período y corte

Las entradas son fechas de calendario `YYYY-MM-DD` de `America/Argentina/Buenos_Aires`. Se consulta desde las 00:00 del primer día hasta las 00:00 del siguiente al último día, con límite superior exclusivo. Para los períodos actuales, el corte es el instante de generación y se marca Parcial. Se rechazan fechas inválidas, rangos invertidos y períodos completamente futuros.

Los campos anteriores `createdAt` de leads/actividades son `timestamp` y contienen UTC. Las consultas SQL convierten explícitamente esos límites y fechas con `AT TIME ZONE 'UTC'`: el resultado no depende de la zona de la sesión PostgreSQL. Los eventos nuevos y la generación usan `timestamptz(3)`. Los límites de calendario se resuelven con la zona IANA del runtime, incluyendo los cambios históricos de horario de Buenos Aires. El día siguiente se calcula como fecha local, sin asumir siempre 24 horas de duración.

La fotografía se calcula y guarda en una transacción `RepeatableRead`. El catálogo establece la lectura consistente y luego se toma el reloj de generación; las escrituras que no eran visibles en esa lectura quedan fuera. Las consultas devuelven agregados, sin contactos ni una carga de toda la cartera al navegador. No se mantiene una transacción al construir el PDF.

## Poblaciones y atribución

| Población | Incluye | Canal | Responsable |
| --- | --- | --- | --- |
| A: ingresados | Creación dentro del período y hasta el corte | Origen al ingresar | Primera asignación hasta el corte; si todavía no ocurrió, Sin asignar |
| B: cierres del período | Venta vigente al corte cuya fecha está dentro del período; puede ser un lead anterior | Origen del cierre vigente | Responsable del cierre vigente |

Los filtros de personas se aplican a cada población según esa tabla. Todos incluye Sin asignar y atribuciones desconocidas; elegir personas concretas las excluye. El origen desconocido se incluye como categoría propia únicamente con Todos los canales. Un filtro específico lo excluye y las advertencias identifican los registros sin origen reconstruible.

Las advertencias de historial incompleto se limitan a los ingresados del período, canales y primeros responsables seleccionados. El aviso de origen desconocido respeta el período y los primeros responsables; con canales específicos informa explícitamente los ingresos excluidos por carecer de origen, sin mezclar otras personas.

La selección Todos se resuelve al generar. Se congelan IDs concretos, nombres, estado de actividad, categorías sin atribución e inversiones. Agregar o renombrar canales/personas después no cambia una fotografía guardada.

## Fórmulas e inversión

| Métrica | Fórmula o población |
| --- | --- |
| Leads ingresados | Cantidad A |
| Distribución por etapa | Etapa de A al corte; incluye Sin historial y suma A |
| Cierres del período | Cantidad B |
| Cierres de los ingresados | Leads de A con venta vigente al corte |
| Conversión de ingresados | Cierres de A / A × 100 |
| Costo por lead | Inversión del canal / A del canal |
| Costo por cierre de ingresados | Inversión del canal / cierres de A del canal |

La conversión y los costos mantienen la atribución de ingreso de A aunque otra persona o canal cierre. Los cierres de leads antiguos no inflan la conversión. A y B pueden solaparse y no se suman entre sí.

Los importes viajan como cadenas decimales sin separador de miles, con hasta dos decimales y doce dígitos enteros. `null` significa No informada; `"0.00"` es un importe válido. Se rechazan negativos y precisión extra. Se usa `Prisma.Decimal` para sumar/dividir y los resultados se guardan como cadenas redondeadas a dos decimales.

Con denominador cero se muestra Sin datos. Si falta un canal incluido, se informa la suma conocida como inversión informada parcial y se suprimen los costos globales. Cada canal con gasto informado puede conservar sus costos. El origen desconocido también impide presentar un costo global completo. Con personas específicas, el gasto del canal es referencia y todos los costos se ocultan. Nunca se asigna inversión ni costos a personas.

En reportes parciales el gasto es el total declarado para el período completo: no se prorratea. No se calculan ingresos, ROI, ROAS, rentabilidad ni ganadores automáticos.

## API y BFF

Todas las operaciones requieren la sesión de NestJS. Los reportes exigen ADMIN mediante guard y servicio; Pipeline vuelve a aplicar alcance en consultas y escrituras. Swagger documenta DTOs y respuestas.

| Método y ruta NestJS | Contrato |
| --- | --- |
| `GET /crm/reports/catalogs` | Canales y responsables, incluidos inactivos; sin correos/contactos |
| `POST /crm/reports/preview` | `ReportInputDto` → `Snapshot` v1 |
| `POST /crm/reports` | Filtros e inversión más `operationKey` UUID → fotografía definitiva |
| `GET /crm/reports?page=1&pageSize=10` | Historial paginado, sin volver a calcular leads |
| `GET /crm/reports/:id` | Fotografía guardada |
| `GET /crm/reports/:id/pdf` | `application/pdf`, attachment de nombre seguro, privado y sin caché |
| `GET /crm/pipeline` | Filtros `q`, `sourceId`, `assignedToId`, `stage`, `page`, `pageSize` |
| `PATCH /crm/pipeline/:id` | `{ version, stage, reason? }`; 409 si cambió, 403 si no puede corregir |

Ejemplo de entrada:

```json
{
  "name": "Análisis de noviembre",
  "from": "2026-11-04",
  "to": "2026-11-30",
  "sourceIds": [],
  "responsibleIds": [],
  "investments": [{ "sourceId": "UUID-del-canal", "amount": "200000.00" }]
}
```

Arrays vacíos de filtros significan Todos. Los UUID concretos deben existir; las inversiones no pueden repetirse ni pertenecer a canales fuera de la selección. Las métricas adicionales enviadas por el cliente se rechazan. Los campos agregados y los nombres históricos provienen exclusivamente del servidor.

`operationKey` se genera una vez por intento lógico de guardado. Reintentos con la misma clave y filtros normalizados devuelven el mismo ID; reutilizarla con otro pedido devuelve 409. La unicidad en PostgreSQL también protege solicitudes concurrentes. La interfaz conserva la clave al reintentar y deshabilita guardados duplicados.

Next mantiene rutas explícitas para reportes y una lista cerrada para Pipeline, reutilizando el BFF de cookies HttpOnly y validación de origen. No expone tokens ni accede a Prisma. El BFF transmite el cuerpo PDF y sus encabezados; la descarga del navegador usa un blob y enlace temporal, sin obligar a abrir otra pestaña. Los pedidos de reportes admiten hasta 60 segundos; el resto conserva sus límites anteriores.

Los cuerpos JSON de creación y vista previa de reportes admiten hasta 128 KiB, suficientes para las tres listas de hasta 500 elementos del contrato. Las otras rutas JSON conservan 16 KiB y las cargas mantienen su límite anterior. `frontend/scripts/verify-reports.mjs` comprueba selecciones completas, exceso de tamaño y rechazo de solicitudes sin sesión o con origen inválido.

Cambiar filtros/inversión invalida la vista previa y bloquea el guardado hasta recalcularla. La respuesta al guardar reemplaza la vista con el resultado definitivo. Una falla de PDF no elimina el reporte ni crea otro: se puede repetir Descargar PDF desde el detalle o historial.

## PDF y almacenamiento

PDFKit genera en memoria usando exclusivamente `snapshot`, con identidad InfoPrepaga, autor, filtros, corte, inversión, tablas, etapas, definiciones y páginas numeradas. Las fuentes Geist se cargan desde archivos empaquetados y se embeben: no hay descargas de recursos. El documento se envía como attachment y el buffer se libera al finalizar la petición. No se crean objetos R2, adjuntos ni archivos permanentes. Los archivos de QA son sintéticos y pertenecen únicamente al harness de pruebas cuando se configura explícitamente su ruta temporal.

## Verificación reproducible

Usar solo una base descartable local llamada `starter_test`. Cada suite crea su propio esquema y aplica migraciones allí; se niega a ejecutarse sobre otros hosts/nombres. No usar credenciales ni datos del propietario.

Las pruebas unitarias del PDF extraen texto del archivo emitido con Python y `pypdf==6.10.0`; instalarlo en el entorno de pruebas con `python -m pip install pypdf==6.10.0`. Si ese intérprete no está en PATH, configurar `PDF_TEST_PYTHON` con su ruta. CI prepara Python 3.13 y esa dependencia antes de las pruebas. Comprueban cifras, acentos, filtros, documentos vacíos y numeración de todas las páginas. El job backend también construye Next y ejecuta `scripts/verify-crm.mjs` con PostgreSQL descartable, para cubrir BFF, permisos, guardado idempotente y descarga PDF además de los E2E de NestJS.

```powershell
$env:CRM_TEST_DATABASE_URL='postgresql://reports_test@127.0.0.1:55519/starter_test'
pnpm -C backend prisma:generate
pnpm -C backend exec prisma validate
pnpm -C backend lint
pnpm -C backend typecheck
pnpm -C backend test --runInBand
pnpm -C backend test:e2e --runInBand
pnpm -C backend build
pnpm -C frontend lint:strict
pnpm -C frontend typecheck
$env:BUILD_STANDALONE='true'
pnpm -C frontend build
node scripts/verify-crm.mjs
node frontend/scripts/verify-reports.mjs
```

Las pruebas de reportes cubren ambas poblaciones, bordes de Buenos Aires, reaperturas y recierres, origen/responsable independientes, inactivos, primera asignación posterior, inversiones, inmutabilidad, reintentos concurrentes, PDF sin R2 y permisos de Pipeline. Las pruebas de PDF ejercitan nombres largos, acentos, tablas multipágina y vacío. Revisar visualmente los PDFs generados con `REPORT_PDF_QA_DIR` y verificar sus textos contra la fotografía, además de las pruebas automatizadas.

El límite de rollback del cambio es Reportes y Pipeline persistente con su migración, rutas, navegación y ampliación de destinatarios manuales. Desactivar primero el acceso nuevo antes de una reversión. No eliminar tablas ni eventos para revertir código: la auditoría y las fotografías deben conservarse. No hay rollback automático ni migración destructiva preparada.

## Correcciones verificadas el 5 de noviembre de 2026

Se reprodujeron los rechazos de selecciones grandes y las advertencias de otros responsables antes de corregirlos. Con Node 24.22.1 y PostgreSQL 17 descartable en localhost pasaron 38 pruebas unitarias, 40 E2E y 82 comprobaciones del harness Next/Nest, incluida una selección de 500 canales. También pasaron tipos, lint, formato y builds de ambos paquetes, la prueba aislada del BFF de reportes y la regresión de adjuntos. Los PDFs vacío y extenso se extrajeron, renderizaron y revisaron visualmente. El workflow fue actualizado y su YAML validado; no se ejecutó GitHub Actions ni se migró la base del propietario.

Estas correcciones no agregan migraciones. Su reversión se limita al límite JSON de reportes en el BFF, los diagnósticos filtrados del servicio, las pruebas y su configuración de CI/documentación; no requiere borrar datos ni fotografías.
