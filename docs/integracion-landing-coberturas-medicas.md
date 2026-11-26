# Conectar los formularios de Coberturas Médicas al CRM

Guía independiente para quien mantiene el sitio, 26/11/2026. Entrega de código/documentación para revisión: no se modificó el sitio, no se publicaron avisos ni se enviaron formularios a producción. **Integración apagada por defecto** hasta aprobar responsable legal, accesos, hosting y tratamiento del destino anterior.

## Flujo y URLs

```text
Formulario principal o inferior → procesador del propio sitio
  → HTTPS /api/integrations/v1/leads/coberturas-medicas del CRM
  → Next.js → NestJS privado → PostgreSQL
  ← 201/200 {"ok":true} → confirmación al visitante
WhatsApp directo: recorrido separado y voluntario
```

| Entorno | Base | Endpoint |
| --- | --- | --- |
| Local aislado | `http://localhost:3340` | `/api/integrations/v1/leads/coberturas-medicas` |
| Staging | `[URL_HTTPS_STAGING_PENDIENTE]` | misma ruta |
| Producción prevista | `https://crm.infoprepaga.com.ar` | misma ruta |

El navegador llama a un procesador de **su propio sitio**, no al CRM con un secreto embebido. Acceso al código y hosting pendientes: verificar si se dispone de backend tradicional/PHP o función de servidor Node antes de elegir. Si solo hay hosting estático, falta un procesador aprobado. No instalar un servicio externo de formularios sin revisar su tratamiento de datos.

Arquitectura comprobada en checkout: `compose.yaml` publica solo Next.js en loopback, usa `BACKEND_URL=http://api:3001` y no publica NestJS ni PostgreSQL. Nginx debe dirigir el dominio CRM hacia Next.js. La configuración efectiva del VPS no está en este repositorio; verificarla, incluidos TLS, límite de cuerpo, timeout y preservación de Origin. No exponer `/integrations/...` directamente desde NestJS a Internet.

## Estado observado y decisiones previas

La [página pública](https://coberturasmedicas.com.ar/) permitió verificar dos formularios con nombre/email/teléfono, select, campo «Sitio web» y enlace de autorización; WhatsApp aparece separado. No se inspeccionó el código del procesador. **No está confirmado** que «Sitio web» sea un honeypot: verificar atributos, JavaScript y validación en servidor. Si lo es, procesarlo solo localmente y excluirlo siempre del JSON del CRM. El select no expuso sus valores internos en la lectura pública: verificar cada `value` en código/DOM y mapear explícitamente, sin inferirlo del orden de las opciones.

Antes de sustituir envíos, el mantenedor debe revisar `action`, listeners de submit, `fetch`, plugins, PHP/funciones, correo, webhooks y almacenamiento configurado. Documentar **[DESTINO_ANTERIOR]**, **[NOTIFICACIONES]**, **[RESPONSABLE_DEL_DESTINO]**, **[APROBADOR_COMERCIAL]** y **[APROBADOR_PRIVACIDAD]**. No ejecutar un POST de prueba en producción para descubrirlo. Probar con mocks/staging. Decidir si el CRM reemplaza el destino o si debe conservarse un aviso posterior; no enviar en paralelo ciegamente. Si se conserva un correo/servicio, enviarlo después del alta confirmada y con idempotencia propia durable, sin duplicarlo por cada reintento del CRM. Si ese aviso falla, la solicitud ya registrada no debe perderse ni aparentar que el alta falló.

## Configurar el CRM y el secreto

Origen definitivo reutilizado: **`LANDING_CM` / Landing CM**, existente en catálogos, filtros y migración comercial. No se crea `COBERTURAS_MEDICAS_WEB`. Aplicar en entorno autorizado la nueva migración `20261126120000_landing_submissions`, generar cliente Prisma 6.19.3 y reconstruir backend/frontend. La migración conserva datos y códigos previos.

```dotenv
# Valores ficticios; no activar hasta completar la revisión de abajo.
CRM_DATA_CONTROLLER_ID=entidad-demo-confirmada
LANDING_COBERTURAS_MEDICAS_ENABLED=false
LANDING_COBERTURAS_MEDICAS_CONTROLLER_ID=entidad-demo-confirmada
LANDING_COBERTURAS_MEDICAS_TOKEN=demo-exclusivo-coberturas-no-usar-en-produccion
LANDING_COBERTURAS_MEDICAS_PREVIOUS_TOKEN=
LANDING_COBERTURAS_MEDICAS_PRIVACY_VERSION=cm-aviso-demo-v1
```

Estas variables son exclusivamente del backend, cableadas en Compose y ejemplos de entorno. Generar clave aleatoria de al menos 32 bytes; se admiten 32–512 caracteres ASCII visibles. Guardarla en el servidor de la landing como `CRM_LANDING_TOKEN`, con `CRM_LANDING_URL` igual a la URL HTTPS completa del endpoint. Nunca incluirla en frontend, repositorio, URL, `NEXT_PUBLIC_*`, logs o analytics.

**Restricción de responsable legal:** el CRM actual tiene cartera/reparto globales, ADMIN con acceso total y vendedores limitados por asignación; no tiene equipos ni aislamiento entre entidades. `CRM_DATA_CONTROLLER_ID` identifica al responsable de toda la cartera, incluyendo la previa. La ruta exige que coincida con `LANDING_COBERTURAS_MEDICAS_CONTROLLER_ID`, no vacío, de 1–100 caracteres `[A-Za-z0-9_-]`, además de `ENABLED=true` y token válido. Si son entidades distintas, responde 503 **antes de buscar contactos o dar altas**. No falsear la igualdad ni cambiar el identificador de una instancia con datos para desbloquearla. Mantener deshabilitada y usar otra instancia/base o implementar aislamiento integral de lecturas, escrituras, búsqueda, métricas, exportaciones, asignación y administración.

Que Coberturas Médicas SAS aparezca públicamente **no demuestra** que sea responsable de la cartera actual de InfoPrepaga ni autoriza compartirla. Confirmar ambas cosas y los operadores de servidor/base. Dentro de una misma entidad confirmada, ADMIN accede a todo y el asesor VENDEDOR solo a sus leads y su historial. El filtro por origen sirve para atribución, no para conceder permisos.

Rotación: pasar clave actual a `PREVIOUS_TOKEN`, generar nueva en `TOKEN`, actualizar procesador y verificar en staging; retirar la anterior al cerrar la ventana acordada. Claves actuales/anteriores deben ser exclusivas: coincidencias entre landings bloquean la integración. Los envíos ya recibidos conservan idempotencia y versión de aviso durante la rotación.

## Contrato JSON v1

`POST`, `Content-Type: application/json`, `Authorization: Bearer <clave>`. Sin cookies, sin compresión, máximo 8192 bytes. Se rechazan claves desconocidas y `null`; omitir opcionales. No elegir origen/responsable/vendedor desde el cuerpo.

| Campo | Tipo, obligatoriedad y límite | Valor / mapeo CRM |
| --- | --- | --- |
| `submissionId` | UUID v4 string obligatorio, 36 caracteres | Generar una vez por consulta; estable en doble clic/reintentos, normalizado a minúsculas. Unicidad por landing autenticada + ID. |
| `formId` | string obligatorio | `principal` o `inferior`, según formulario; recibo/historial. `modal` no permitido aquí. |
| `name` | string obligatorio, 2–160 | Nombre completo con acentos/compuestos; letras/marcas Unicode, espacios, punto, apóstrofes y guion. NFC y espacios normalizados. `Lead.name` solo al crear y snapshot. |
| `phone` | string obligatorio, 6–50 | Teléfono argentino válido con código de área; convención existente `libphonenumber-js`, E.164 `+54…`. Acepta local `011 15 2345-6789`, internacional `+54 9 11 2345-6789` y `0054 9 11 2345-6789`; no inventar área para números incompletos. `Lead.phone/phoneKey` al crear y snapshot. |
| `email` | string **obligatorio aquí**, hasta 254 | Email válido, trim/minúsculas; `Lead.email/emailKey` al crear y snapshot. Si negocio decide hacerlo opcional, coordinar antes formulario, DTO/regla por landing y aviso. |
| `employment` | string obligatorio | `DEPENDENCIA`, `MONOTRIBUTO`, `PARTICULAR`; recibo/historial. |
| `consent` | boolean obligatorio | Solo `true`, recibido desde casilla no premarcada; no inferirlo de enviar o de abrir WhatsApp. |
| `privacyVersion` | string obligatorio, 1–64 | `[A-Za-z0-9_.-]`; valor exacto configurado para el aviso efectivamente mostrado. No es una URL. |
| `age` | integer opcional | 18–120 si se envía. No agregarlo a estos formularios en esta versión. |
| `group` | string opcional | `INDIVIDUAL`, `PAREJA`, `FAMILIAR`; contrato común, no solicitado por esta landing. |
| `plan` | string opcional | `BASICO`, `EQUILIBRADO`, `PREMIUM`, `SIN_DEFINIR`; no mapear automáticamente los planes de Coberturas a estas categorías. Omitir en estos formularios. |
| `budget` | integer opcional | 0–100000000 ARS/mes; omitir en estos formularios. |

No se aceptan UTM porque no hay reporte implementado que los utilice. No enviar `website`/«Sitio web», URLs, diagnósticos, preexistencias, documentación médica, campos de texto libre, origen, `assignedToId`, etapa, rol o permisos. Los opcionales comerciales pertenecen al contrato común y no justifican ampliar los formularios.

Catálogo de mapeo **propuesto e implementado en CRM**, pendiente de contrastar con los valores del select real:

| Etiqueta de situación laboral | Valor CRM |
| --- | --- |
| Relación de dependencia / Con aportes de empleo | `DEPENDENCIA` |
| Monotributo | `MONOTRIBUTO` |
| Particular / Sin aportes | `PARTICULAR` |

La política usa también «independiente»: el equipo debe confirmar si significa particular sin aportes o si falta una opción. No confundir independiente con monotributista. Un valor desconocido debe pedir corrección, nunca asignarse por defecto. Validar ambos formularios por separado.

## Implementar el procesador y la experiencia

1. Conservar nombre, teléfono, email obligatorio y situación laboral; validar en navegador y procesador. Fijar `formId=principal` o `inferior` desde el flujo permitido. Revisar campo señuelo antes de usarlo; si se confirma, no mandarlo al CRM.
2. Mantener visible aviso/enlace y casilla sin premarcar. Registrar versión del texto mostrado; no generar `consent:true` por defecto en el procesador.
3. Crear UUID v4 una sola vez por consulta, bloquear doble clic y conservar el snapshot y los datos ante errores. Reintentar con mismo ID/cuerpo; una consulta nueva lleva ID nuevo. Si hay timeout y el usuario quiere corregir datos, resolver el envío incierto primero para no crear una segunda consulta accidental.
4. Solo después de 201/200 con `ok:true`, mostrar **«Recibimos tu solicitud»**. Si falla, mostrar error recuperable, mantener datos y permitir reintento sin confirmación anticipada.
5. WhatsApp directo sigue separado. Si se ofrece después de confirmar, usar mensaje genérico; no copiar valores del formulario, UUID ni datos personales en enlaces ni texto prellenado.

Ejemplo sintético de llamada del servidor:

```http
POST /api/integrations/v1/leads/coberturas-medicas HTTP/1.1
Host: crm.infoprepaga.com.ar
Authorization: Bearer demo-exclusivo-coberturas-no-usar-en-produccion
Content-Type: application/json

{"submissionId":"7a291328-1cfe-46d4-baa0-59cc66b49bb5","formId":"principal","name":"Juan Martín Prueba","phone":"011 15 2345-6789","email":"consulta@example.test","employment":"MONOTRIBUTO","consent":true,"privacyVersion":"cm-aviso-demo-v1"}
```

Función Node del lado servidor, solo si el hosting la admite. Este fragmento es la llamada saliente; `validatedSnapshot` debe proceder de validación local estricta y controles antispam/consentimiento:

```js
const response = await fetch(process.env.CRM_LANDING_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRM_LANDING_TOKEN}` },
  body: JSON.stringify(validatedSnapshot),
  signal: AbortSignal.timeout(25000),
  redirect: 'error'
});
const confirmed = [200, 201].includes(response.status) && (await response.json()).ok === true;
// confirmed permite confirmar; otros estados requieren tratamiento seguro.
```

Backend tradicional: equivalente POST JSON con cURL de PHP u otro cliente HTTPS de servidor, verificación TLS activa, timeout 25 s, sin seguir redirects, URL/clave desde configuración privada. Seleccionar esta alternativa únicamente después de revisar el hosting. No requiere credenciales de PostgreSQL ni de usuario ADMIN.

El procesador público debe validar su propio Origin/CSRF, catálogo y consentimiento, limitar cuerpo y frecuencia por visitante/IP y sumar antispam local. Si usa un desafío externo, inventariar el proveedor y revisar privacidad. No reenviar cuerpos/Authorization a logs ni monitorización. Si implementa una bandeja de reintentos, debe ser durable, acotada y con acceso/retención aprobados; el simple encolado no permite confirmar alta en CRM.

## Respuestas, CORS y límites

| Estado HTTP CRM | Respuesta pública y comportamiento |
| --- | --- |
| 201 | `{"ok":true}`; consulta confirmada. |
| 200 | `{"ok":true}`; mismo envío ya confirmado. |
| 400 | `{"ok":false,"code":"LANDING_400"}`; campos, email, autorización o versión inválidos; conservar datos, corregir. |
| 409 | `LANDING_409`; ID reutilizado con contenido distinto; intervención técnica. No resolver cambiando ID automáticamente. |
| 401 / 403 | `LANDING_401` / `LANDING_403`; secreto inválido/cruzado u Origin rechazado; soporte técnico, no login CRM del visitante. |
| 413 / 415 | `LANDING_413` / `LANDING_415`; tamaño o formato incorrectos, corregir procesador. |
| 429 | `LANDING_429`; esperar `Retry-After` y reintentar mismo ID/cuerpo. |
| 408 / 503, otro 5xx o timeout | Estado temporal o incierto; reintentar mismo snapshot con espera exponencial y jitter, tope de intentos y soporte. 503 persistente puede ser bloqueo de configuración/responsable legal; no confirmar. |

Los errores usan `{"ok":false,"code":"…"}`; no revelan existencia previa, datos de lead, vendedor ni mensajes internos. El procesador debe devolver al navegador solo estado seguro y mensajes mínimos. No revelar si el teléfono/email ya existían.

CORS está preparado **solo en esta ruta de integración**: OPTIONS y POST admiten `https://coberturasmedicas.com.ar` y `https://www.coberturasmedicas.com.ar`, con Authorization/Content-Type y sin credenciales de cookies. Origin desconocido o `null` se rechaza. La llamada habitual servidor a servidor funciona **sin Origin ni cookies**; CORS no exige ni autoriza poner el token en el navegador. Para staging de landing, incorporar origen exacto bajo revisión si hace falta preflight, o probar servidor a servidor sin Origin.

No cambiar las protecciones del login: `APP_ORIGIN=https://crm.infoprepaga.com.ar` exacto, sin slash final, sigue siendo el único origen de mutaciones de sesión y `/api/crm/*`. No agregar dominios de landings al login ni a `CORS_ORIGIN` global. Verificar Nginx y el login a través del dominio CRM antes de activar; el 403 de Origin no se resuelve abriendo la API humana.

Next/Nest limitan esta captación a 8 KiB; Next limita lectura a 5 s y llamada privada a 20 s. El throttler existente de Nest usa 60 solicitudes/minuto por IP observada y handler, compartido entre las dos landings detrás del BFF; no confía en cabeceras IP enviadas por visitantes. Es **en memoria por proceso**: una API en esta configuración; antes de escalar réplicas, agregar/probar límite global en proxy. Mantener antispam y límites por visitante en el procesador de la landing. La clave no sustituye esos controles. 429 conserva `Retry-After` o usa 60 s.

## Alta, acceso y contactos repetidos

Ambas rutas comparten `CrmService.createSystemLeadInTransaction` y el reparto comercial. Una nueva ficha queda Nuevo y entra en rotación entre cuentas activas con recepción habilitada, sin adelantarse a pendientes existentes. Sin receptor queda sin asignar, visible solo a ADMIN hasta que el reparto existente pueda atenderla. No se inventan equipos por marca ni vendedor fijo desde el formulario.

Dentro de `CrmService.write`, el bloqueo comercial PostgreSQL serializa alta, asignación y control de idempotencia. La tabla `landing_submissions` garantiza unicidad `(landing, submissionId)` y registra `receivedAt` UTC del servidor, fuente, formulario, responsable, consentimiento, versión, contenido normalizado y hash. Todo se confirma con el lead/vínculo y actividad en una sola transacción. Mismo ID/contenido normalizado → 200 sin repetir asignación; mismo ID/datos distintos → 409. Tras commit con respuesta perdida, el mismo envío recupera confirmación; antes del commit, un fallo revierte todos los efectos. El alta CRM actual no envía notificaciones externas. Una futura notificación debe ser durable/idempotente para no duplicar avisos.

Una consulta nueva con UUID nuevo de contacto existente preserva su propia fecha y origen. Una sola ficha coincide por teléfono **o email** normalizado: vincular, conservar origen histórico, nombre/contactos, estado y vendedor; los nuevos datos se guardan en recibo e historial visible al asesor autorizado. No se reactiva una cartera histórica silenciosamente: revisar el filtro de cartera. Dos fichas candidatas —incluido teléfono en una y email en otra— no se fusionan. Se crea una ficha de consulta separada por el alta normal y queda `needsReview` en recibo/historial para ADMIN; revisar sin divulgar candidatos ni automatizar fusiones.

El origen de ficha sigue apareciendo en su columna; las nuevas consultas se ven en historial y se incluyen al filtrar la lista por origen. La suma de listas por fuentes puede solaparse. Los reportes comerciales conservan su definición por leads/ventas; no se suman recibos como nuevos leads. Alta manual conserva creación sin esta deduplicación; Excel conserva apariciones, fingerprints, revisión y reglas históricas; YCloud conserva su inbox y revisión. No se alteraron sus comportamientos legítimos. No hay cruce permitido entre entidades: el gate de configuración bloquea antes de buscar contactos. Ese gate no sustituye multi-tenancy.

## Privacidad y autorización: insumos sin publicar

La [política vigente consultada](https://coberturasmedicas.com.ar/politica-de-privacidad.html), fechada 19/09/2026, identifica **Coberturas Médicas SAS, CUIT 30-71691586-3**, correo **contacto@coberturasmedicas.com.ar** y domicilio genérico en Córdoba; indica que falta actualizar el domicilio completo. **Confirmar vigencia de entidad y correo, y completar [DOMICILIO_LEGAL_COMPLETO]** con su responsable. El correo comercial del pie del sitio no debe asumirse como canal de derechos. No se realizó validación registral ni contacto a esos correos.

Separar marca Coberturas Médicas, responsable que decide el tratamiento, prestadora destinataria cuando corresponda y asesor asignado. Confirmar quién comercializa y quién opera el CRM. Solo si el responsable de toda esta instancia y sus permisos coinciden puede habilitarse aquí; un aviso no convierte automáticamente a dos entidades en una.

Propuesta breve junto al formulario, para revisión:

> Coberturas Médicas SAS, CUIT 30-71691586-3, con domicilio en [DOMICILIO_LEGAL_COMPLETO], utilizará tu nombre, teléfono, email y situación laboral para contactarte y responder esta solicitud por [CANALES_APROBADOS]. Son obligatorios para tramitarla en esta versión. Sin ellos o sin tu autorización no podremos procesarla. Consultá destinatarios, conservación y derechos en la Política de Privacidad.

Casilla no premarcada, propuesta:

> Autorizo a Coberturas Médicas SAS a usar mis datos para contactarme y responder mi solicitud de cotización, según la Política de Privacidad.

Confirmar estos textos con la entidad antes de usarlos. Mantener enlace visible a la política revisada y versión `privacyVersion` exactamente igual al texto mostrado y configurado; archivar cada texto de forma inmutable con su código. El servidor conserva fecha de recepción, formulario, origen y consentimiento; no confunde una fecha declarada por cliente con fecha de recepción. Reintentos ya confirmados conservan evidencia original aunque cambie la versión actual.

Revisión necesaria del aviso: concretar finalidades, destinatarios por etapa, canales (llamada/WhatsApp/email, confirmar), obligatorios/opcionales, consecuencias de no completar, **[PLAZO_O_CRITERIO_DE_CONSERVACION]** y procedimiento de eliminación/anonimización de consultas, historial y respaldos. No hay purga automática en esta entrega; aprobar rutina y responsables antes de activar. Explicar acceso, rectificación, actualización o supresión mediante canal vigente y AAIP como autoridad de control. La autorización de cotización no permite campañas; cualquier finalidad promocional futura requiere opción independiente.

Señalar para revisión jurídica dos puntos del texto actual: la mención a datos de salud durante el asesoramiento requiere un flujo específico aprobado y no pertenece a esta captación; y el intervalo de seis meses debe referirse al **ejercicio gratuito del acceso**, con la excepción legal de interés legítimo, sin extenderlo como restricción a rectificación/actualización/supresión. No pedir diagnósticos, enfermedades, declaraciones de salud, documentos médicos ni texto libre innecesario en estos formularios.

Fuentes oficiales: [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion), [AAIP: derechos](https://www.argentina.gob.ar/aaip/datospersonales/derechos), [transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales). El responsable debe revisar el texto final y el flujo aplicable; la entrega no publica documentos legales.

### Proveedores, medición y destinatarios

Inventariar **[HOSTING_LANDING/PAIS]**, **[PROCESADOR/PAIS]**, **[HOSTING_CRM/BASE/BACKUPS/OPERADORES]**, WhatsApp si se usa, prestadoras a las que efectivamente se transmiten datos y proveedores de medición. El código CRM de esta entrega no envía datos a WhatsApp ni prestadoras. La lectura pública muestra referencias a Meta/GTM; no verifica qué datos reciben. Auditar configuración real, advanced matching, eventos automáticos, dataLayer, Analytics, capturas de sesión, logs y APM.

No enviar valores de formulario a Pixel/GTM/Analytics, URLs ni monitorización, ni siquiera email/phone hasheados en este flujo. Si se necesita conversión, emitir una vez tras alta confirmada un evento como `cotizacion_registrada`, sin nombre/email/teléfono/UUID ni valores del formulario; probar con panel de red del navegador y no duplicarlo por reintentos. Confirmar destinos/garantías para cualquier transferencia internacional antes de activar, y contratos/roles de encargados. No presumir aprobación por tener una política enlazada.

## Términos y condiciones pendientes

Confirmar **[COMERCIALIZADOR_LEGAL]**, CUIT y domicilio, prestadoras efectivamente representadas y autorizaciones, alcance/validez de cotización, pasos de contratación y canales/horarios de atención. Propuesta a revisar: el envío solicita asesoramiento; no constituye contratación, aceptación de un plan ni cobertura vigente. Explicar cuándo se inicia la gestión formal, qué aceptación/documentación requiere y quién confirma el alta.

El sitio muestra **50%** y una promesa de respuesta de menos de una hora: no se verificaron condiciones ni capacidad operativa. Comercial debe aprobar y completar **[VIGENCIA]**, **[ZONA]**, **[PLANES]**, **[REQUISITOS]**, base del descuento, **[DURACION_DEL_BENEFICIO]**, exclusiones/limitaciones y responsable de la promoción; revisar plazos/horarios reales de respuesta y actualización de publicidad. [Ley 24.240, oferta y publicidad](https://www.argentina.gob.ar/normativa/nacional/638/actualizacion).

## Pruebas y checklist de activación

Harness local: construir backend/frontend y ejecutar `node scripts/verify-landing-integrations.mjs` con `CRM_TEST_DATABASE_URL` exclusivamente en `localhost/starter_test`. Crea esquema aleatorio descartable, aplica migración con datos sintéticos previos, prueba Next de producción → Nest/PostgreSQL y elimina solo ese esquema. Resultados efectivos y límites: [verificación de captación](verificacion-captacion-landings.md).

- [ ] Confirmar responsable legal vigente, correo de derechos y domicilio completo; relación con responsable/cartera/operadores de este CRM. Si difiere, **mantener deshabilitada aquí**.
- [ ] Obtener acceso al código/hosting, URL staging y revisión del Nginx real; elegir procesador, configurar secreto exclusivo y probar rotación sin exponerlo.
- [ ] Inventariar destino anterior y avisos; obtener aprobación comercial/privacidad sobre reemplazo o convivencia idempotente antes de modificar envíos.
- [ ] Verificar `principal` e `inferior`, email obligatorio, select real y semántica de «independiente»; confirmar señuelo y excluirlo del payload.
- [ ] Aprobar/publicar aviso por su responsable fuera de esta entrega, casilla no premarcada, archivo de versiones, conservación, proveedores/transferencias y condiciones del 50%/tiempos.
- [ ] Probar errores de datos/consentimiento, clave ajena, inyección de origen/vendedor, 409, 429, doble clic, timeout, dos solicitudes simultáneas y caída CRM. Confirmar solo con 201/200; conservar valores/UUID en recuperables.
- [ ] Probar consulta nueva de contacto existente, origen histórico y nuevo, filtro/historial, asignación/sin candidatos, revisión ambigua y denegación a vendedor ajeno.
- [ ] Probar ambos formularios en staging contra CRM aislado; envío sin abrir WhatsApp debe quedar durable. **Pendiente en código real de landing**, no cubierto por el cliente HTTP local.
- [ ] Validar antispam, CORS exclusivo de integración, ausencia de PII en medición/logs, login/sesión/health protegidos por Nginx/Next. Activar `ENABLED=true` solo tras cerrar estos pendientes; no se despliega desde esta tarea.
