# Importar leads desde Excel

Los administradores pueden importar contactos desde **Leads → Importar Excel**. NestJS transforma el archivo, valida contactos y permisos, y guarda una revisión privada del administrador que inició el lote. No se modifica ni se almacena el Excel original.

## Uso

1. Subir un `.xlsx` de hasta 10 MB y 5.000 filas candidatas. Elegir las hojas que se cargarán.
2. Confirmar un origen activo por hoja/grupo y relacionar cada asesor original con un vendedor activo. También se puede elegir explícitamente reparto automático. Las filas sin asesor usan el reparto existente.
3. Revisar errores y posibles duplicados. Corregir o excluir filas; los duplicados se pueden cargar u omitir por fila o en bloque. Cargar un duplicado crea otro lead, sin modificar el anterior.
4. Confirmar la carga. Se procesan bloques de hasta 100 filas; se puede pausar entre bloques y reanudar desde las importaciones recientes. Ante una respuesta incierta, actualizar la revisión antes de reintentar.

La revisión vence a las 24 horas de la subida, incluso si hubo una carga parcial. Cada minuto se purgan filas temporales vencidas y se conservan identificador, autor, fechas y contadores del lote. Los leads ya creados conservan su historial y los datos de importación en el perfil. Tras vencer, subir nuevamente el archivo: las coincidencias con los leads ya creados vuelven a advertirse.

## Formatos admitidos

| Hoja | Contacto | Datos conservados |
| --- | --- | --- |
| DATOS LAN | Nombre/grupo B–E, teléfono F, correo H | Fecha A, horario G, segmento I, asesor J, observación K |
| PIPA | Nombre B, teléfono C, correo E; encabezado habitual en fila 2 | Fecha A, horario D, régimen F, asesor G, observación H |
| Fede | Nombre B, teléfono C, correo E | Fecha A, horario D, segmento F, asesor G, observación H |
| DATOS FACE | Nombre B, teléfono C | Asesor A, fecha D, observaciones E |
| folletos | Nombre B, teléfono C | Fecha A, régimen D, asesor E, observación F |

Pagos, Analisis y hojas desconocidas se excluyen con aviso. Las columnas fuera del bloque principal se ignoran con aviso; esto incluye inversión en DATOS FACE y las copias laterales de Fede. Un contacto ambiguo entre B–E de DATOS LAN exige elegir o escribir su nombre. No se rellenan asesores o fechas a partir de celdas vacías vecinas.

Se reconocen encabezados repetidos y títulos mensuales de PIPA. Las fechas completas de Excel se conservan como fecha ISO; las fechas incompletas se conservan como texto. Los horarios no crean tareas y las observaciones no cambian estados: todos los leads nuevos comienzan en `NEW`. Las fórmulas en campos de contacto u observaciones impiden cargar esa fila hasta corregirla o excluirla; sus resultados almacenados no se usan. Las fórmulas en datos complementarios se omiten con aviso. Los hipervínculos aportan únicamente su texto visible y nunca se abren. El archivo se procesa localmente en el servidor, sin servicios externos.

## Coincidencias y concurrencia

La comparación utiliza correo sin espacios exteriores y en minúsculas, o teléfono completo validado con país predeterminado Argentina y convertido a formato internacional. Los teléfonos ambiguos requieren corrección; los nombres iguales no determinan duplicidad. Los índices de contacto no son únicos porque el administrador puede autorizar duplicados.

Se comparan las hojas seleccionadas entre sí y contra los leads comerciales existentes. Con selección automática, se omiten las coincidencias externas y se conserva la primera fila válida de cada coincidencia interna, en orden estable de hoja y número de fila. Excluir o corregir filas recalcula la selección. Una decisión explícita de cargar permite repetir el contacto.

Las modificaciones llevan `version`; una revisión obsoleta devuelve 409. La vista previa devuelve `reviewToken`, una huella de las coincidencias externas. Reconocer duplicados o seleccionar duplicados en bloque exige la huella actual. Una corrección de contacto que descubre coincidencias nuevas exige revisarlas nuevamente. La confirmación revalida dentro del mismo bloqueo PostgreSQL que usan las altas y ediciones comerciales.

Cada bloque crea leads, eventos de importación/asignación y vínculos con las filas en una transacción. Una respuesta perdida no vuelve a crear filas: consultar el lote y continuar con su versión actual. Los bloques anteriores persisten si se interrumpe una carga. Después de comenzar, las hojas y los mapeos globales quedan fijos; siguen disponibles las correcciones y decisiones sobre filas pendientes.

## API y migración

Todas las rutas siguientes requieren ADMIN y lote propio. El navegador usa el prefijo `/api/crm/lead-imports`; el BFF conserva la sesión, la validación de origen y los límites de subida. Swagger documenta entradas y respuestas.

| Método y ruta NestJS | Entrada / resultado |
| --- | --- |
| `POST /crm/lead-imports` | Multipart `file` → `{id}` |
| `GET /crm/lead-imports` | Últimos 20 lotes propios no vencidos |
| `GET /crm/lead-imports/:id?page=1` | 50 filas, errores, motivos de coincidencia, selección, mapeos, resumen, `version`, `reviewToken` |
| `PATCH /crm/lead-imports/:id` | `{version,sheets?,mappings?,duplicates?,reviewToken?}` |
| `PATCH /crm/lead-imports/:id/rows/:rowId` | `{version,name?,email?,phone?,observations?,sourceId?,assignedToId?,decision?,acknowledgeDuplicates?,reviewToken?}` |
| `POST /crm/lead-imports/:id/review` | `{version,reviewToken}` reconoce las coincidencias vistas |
| `POST /crm/lead-imports/:id/confirm` | `{version}` → `{id,status,version,imported,omitted}`; repetir mientras `status=IMPORTING` |

`mappings` acepta filtros por `sheet`, `group` o `advisor`, con `sourceId` y/o `assignedToId`. Un responsable `null` confirma reparto automático. `decision`/`duplicates` admiten `AUTO`, `INCLUDE` u `OMIT`. No se aceptan identidad, rol, autor o lead destino desde el cliente.

La migración `20261103140000_lead_imports` agrega lotes/filas y claves normalizadas de contacto; mantiene Prisma 6.19.3. Los contactos anteriores se marcan para completar sus claves con el normalizador de la aplicación, en bloques de 100 bajo el bloqueo comercial, antes de preparar la primera importación. Las altas y ediciones posteriores mantienen las claves en la misma transacción. No se actualizan los valores originales de contacto durante ese proceso.

Aplicar la migración solamente en la base de desarrollo/despliegue autorizada mediante los comandos existentes `prisma:generate` y `prisma:deploy`; no se aplican migraciones a producción desde las pruebas. El archivo comprimido se valida antes del parser: hasta 2.000 entradas y 64 MB descomprimidos, verificando tamaños reales de descompresión. Cada hoja admite hasta 20.000 filas físicas y 256 columnas.

## Verificación y límites de reversión

Las pruebas usan exclusivamente libros sintéticos. `src/crm/lead-import.parser.spec.ts` cubre adaptadores, validación, normalización y archivos inválidos. `test/lead-imports.e2e-spec.ts` usa un esquema nuevo de `localhost/starter_test` para comprobar permisos, revisión, concurrencia, reanudación y limpieza. `scripts/verify-crm.mjs` comprueba además subida multipart, CSRF, límites y carga a través del BFF de producción.

La unidad funcional comprende parser, revisión persistida, claves de contacto, API/BFF y diálogo de importación con sus pruebas. Para retirar la interfaz se puede quitar el botón y el diálogo sin afectar leads existentes; para retirar el backend se deben conservar las columnas/tablas y la migración aplicada hasta definir una migración de reversión que preserve el historial y los metadatos ya cargados. No borrar migraciones aplicadas ni datos importados como parte de una reversión de código.

### Evidencia de desarrollo — 3 de noviembre de 2026

| Verificación ejecutada | Resultado |
| --- | --- |
| Backend `test --runInBand` | 8 suites, 30 pruebas aprobadas |
| Backend `test:e2e --runInBand` con PostgreSQL descartable | 4 suites, 24 pruebas aprobadas; incluye preparación de 5.000 filas, bloques de 100 y migraciones desde cero |
| `node scripts/verify-crm.mjs` con Node 24.22.1 | 45 verificaciones BFF, CSRF, contratos y persistencia aprobadas |
| Backend: `typecheck`, `lint`, `format:check`, `build`, `prisma validate` | Aprobados |
| Frontend: `typecheck`, `lint:strict`, `format:check`, build standalone con Node 24.22.1 | Aprobados |
| Scripts frontend `verify-crm-profile`, `verify-followups`, `verify-lead-profile`, `verify-avalian`, `verify-attachments` | Aprobados |
| Navegador contra build de producción y cuentas sintéticas | Subida, mapeos, aviso de duplicados y carga de una fila con otra omitida verificados |

El comando habitual `pnpm` usa Node 24.13.0 en este equipo y avisa que queda por debajo del mínimo del proyecto. Las compilaciones de Next.js y el harness de producción se verificaron con el Node 24.22.1 local ya disponible. No se aplicaron migraciones a la base habitual ni se cargaron contactos reales; Docker estaba detenido y se utilizó un clúster PostgreSQL separado en el puerto local 55487.
