# Conectar los formularios de InfoPrepaga al CRM

Entrega para revisión, 26/11/2026. Esta guía es independiente. No se modificó la landing ni se enviaron formularios reales. El CRM registra la consulta antes de ofrecer WhatsApp. La integración queda **deshabilitada por defecto** hasta completar identidad legal, hosting, avisos y acceso.

## Recorrido y URLs

```text
Navegador → POST /procesar-cotizacion del propio sitio
          → HTTPS CRM /api/integrations/v1/leads/infoprepaga
          → Next.js → NestJS privado → PostgreSQL
          ← 201 o 200 {"ok":true}
          → «Recibimos tu solicitud» → WhatsApp opcional
```

| Entorno | Base | Endpoint |
| --- | --- | --- |
| Pruebas aisladas locales | `http://localhost:3340` | `/api/integrations/v1/leads/infoprepaga` |
| Staging | `[URL_HTTPS_STAGING_PENDIENTE]` | misma ruta; no usar producción para QA |
| Producción prevista | `https://crm.infoprepaga.com.ar` | misma ruta |

El procesador debe existir en el servidor de la landing o en una función de servidor. **Hosting y acceso al código pendientes**: elegir PHP/backend tradicional o función Node solo después de verificarlos. Un sitio estático requiere un procesador adicional aprobado; nunca incluir la credencial en JavaScript del navegador, HTML, `NEXT_PUBLIC_*`, URLs o herramientas de medición.

El checkout publica solo Next.js en `127.0.0.1:3000`; `compose.yaml` deja NestJS y PostgreSQL sin puertos públicos. `BACKEND_URL=http://api:3001`. Nginx debe continuar reenviando el dominio CRM a Next.js; no crear un proxy público directo a NestJS. La configuración real de Nginx del VPS no está versionada aquí: verificarla antes de habilitar, incluido el límite de cuerpo y timeout.

## Configuración y habilitación del CRM

Aplicar primero, en entorno autorizado, la migración `20261126120000_landing_submissions`, generar Prisma Client y reconstruir ambos paquetes. Conserva leads y orígenes existentes. El código reutiliza **`LANDING_IP` / Landing IP**, no crea `INFOPREPAGA_WEB`.

Variables del backend (ya conectadas en Compose y `.env.example`):

```dotenv
CRM_DATA_CONTROLLER_ID=entidad-demo-confirmada
LANDING_INFOPREPAGA_ENABLED=false
LANDING_INFOPREPAGA_CONTROLLER_ID=entidad-demo-confirmada
LANDING_INFOPREPAGA_TOKEN=demo-exclusivo-infoprepaga-no-usar-en-produccion
LANDING_INFOPREPAGA_PREVIOUS_TOKEN=
LANDING_INFOPREPAGA_PRIVACY_VERSION=ip-aviso-demo-v1
```

Los ejemplos son ficticios. Generar una credencial aleatoria de al menos 32 bytes; el contrato admite 32–512 caracteres ASCII visibles. Guardarla también en el gestor de secretos del procesador como `CRM_LANDING_TOKEN` y configurar `CRM_LANDING_URL` con la URL completa. No requiere secretos nuevos en el frontend del CRM.

**Bloqueo de responsable legal:** esta instancia tiene ADMIN global y reparto global; no tiene equipos ni tenants. `CRM_DATA_CONTROLLER_ID` representa al responsable de **toda la cartera existente**. La integración exige igualdad con `LANDING_INFOPREPAGA_CONTROLLER_ID`, identidad no vacía de hasta 100 caracteres `[A-Za-z0-9_-]` y `ENABLED=true`. Solo configurar esa igualdad tras confirmación documentada del responsable y de los accesos. No poner el mismo identificador a entidades distintas para evitar el bloqueo. Si el responsable difiere, mantener apagada esta integración y usar una instancia/base separada o implementar aislamiento integral primero. No cambiar el identificador de una instancia con datos para reutilizarla con otro responsable.

ADMIN puede ver todas las consultas; cada VENDEDOR solo las vinculadas a sus leads asignados. Operadores técnicos de servidor/base podrían acceder según sus permisos operativos: inventariarlos y aprobarlos. Una marca, una prestadora y un asesor no son necesariamente el responsable del tratamiento.

Rotación: colocar la clave actual en `PREVIOUS_TOKEN`, generar otra en `TOKEN`, actualizar el procesador y comprobar en staging; retirar la anterior al terminar la ventana acordada. No reutilizar claves entre landings: el backend rechaza coincidencias entre claves actuales o anteriores. La rotación no borra recibos ni altera identificadores de envío. Cambiar la versión de aviso para nuevas consultas; los reintentos idénticos ya registrados conservan su versión anterior.

## Contrato JSON v1

`Content-Type: application/json`, `Authorization: Bearer <credencial>`, máximo **8192 bytes**, sin compresión. No enviar cookies. Campos adicionales o `null` se rechazan. Enviar números como JSON number; no se convierten strings numéricos. Los datos personales se usan para cotizar, no para campañas.

| Campo | Tipo / obligatoriedad / límite | Catálogo y mapeo |
| --- | --- | --- |
| `submissionId` | string UUID v4, obligatorio, 36 caracteres | Generar una vez por consulta; mismo valor durante todos los reintentos. Se normaliza a minúsculas. Clave única junto con landing autenticada. |
| `formId` | string obligatorio | `modal` o `inferior`; recibo e historial. |
| `name` | string obligatorio, 2–160 | Nombre completo; admite acentos, nombres compuestos, espacios, punto, apóstrofe y guion. NFC y espacios normalizados. `Lead.name` en altas; snapshot en consultas vinculadas. |
| `phone` | string obligatorio, 6–50 antes de normalizar | WhatsApp/contacto argentino válido con código de área. Convención existente `libphonenumber-js`, E.164 `+54…`; `011 15 2345-6789`, `0054 9 11 2345-6789` y `+54 9 11 2345-6789` son equivalentes. No inferir un área faltante. `Lead.phone/phoneKey` y snapshot. |
| `email` | string opcional, hasta 254 | Si se envía: email válido, trim/minúsculas; `Lead.email/emailKey` al crear. No es necesario agregarlo a estos formularios. |
| `consent` | boolean obligatorio | Únicamente `true`; casilla explícita sin premarcar. |
| `privacyVersion` | string obligatorio, 1–64 | `[A-Za-z0-9_.-]`; debe coincidir exactamente con la versión configurada y publicada. El backend no verifica el contenido del aviso. |
| `employment` | string obligatorio | `DEPENDENCIA`, `MONOTRIBUTO`, `PARTICULAR`; recibo e historial comercial. |
| `age` | integer obligatorio para InfoPrepaga | 18–120, edad del titular, sin fecha de nacimiento ni datos de familiares. Rango técnico propuesto para adultos; validar con negocio antes de activar. |
| `group` | string obligatorio para InfoPrepaga | `INDIVIDUAL`, `PAREJA`, `FAMILIAR`; recibo e historial. |
| `plan` | string obligatorio para InfoPrepaga | `BASICO`, `EQUILIBRADO`, `PREMIUM`, `SIN_DEFINIR`; interés comercial, no un plan contractual ni tarifa. |
| `budget` | integer opcional | 0–100000000 pesos ARS mensuales; solo un importe efectivamente elegido. No convertir un rango actual en un importe inventado. Omitir hasta acordar equivalencia o adaptar el contrato. |

No se aceptan UTM: todavía no hay un uso implementado en reportes que justifique su conservación. Tampoco URLs completas, texto libre, documentos, datos de salud, `sourceId`, origen, responsable, vendedor, etapa, rol o permisos. Ruta y credencial determinan origen; configuración de servidor determina responsable legal.

La recepción usa hora del servidor UTC (`receivedAt`), formulario, fuente, responsable, consentimiento, versión, snapshot normalizado y hash del contenido. El historial se muestra en horario de Argentina. Archivar la copia exacta e inmutable de cada aviso publicado con su código de versión fuera de los envíos; el código por sí solo no permite reconstruir el texto.

## Cambios en modal e inferior

Los dos recorridos y campos actuales fueron informados por el propietario; no hay código de la landing en este repositorio y el acceso web a InfoPrepaga no pudo verificarse en esta revisión. Confirmar etiquetas y `value` reales antes de mapear. Los siguientes valores son **contrato propuesto**, ya implementado en CRM, no una inspección de los `value` del sitio:

| Opción comercial | Valor a enviar |
| --- | --- |
| Individual / Pareja / Grupo familiar | `INDIVIDUAL` / `PAREJA` / `FAMILIAR` |
| Relación de dependencia / Monotributo / Particular o sin aportes | `DEPENDENCIA` / `MONOTRIBUTO` / `PARTICULAR` |
| Básico / Equilibrado / Premium / Sin definir | `BASICO` / `EQUILIBRADO` / `PREMIUM` / `SIN_DEFINIR` |

1. Agregar **WhatsApp de contacto obligatorio**, con código de área y ayuda de formato. Conservar nombre, edad del titular, grupo, situación laboral e interés; presupuesto opcional. Confirmar qué datos son indispensables para cotizar. No pedir identificadores de familiares.
2. Agregar aviso breve, enlace a política revisada y casilla no premarcada; bloquear envío sin autorización. El procesador también debe comprobarla y no fabricar `true`.
3. En modal, guardar `selectedPlan` en el estado al abrir desde un CTA. Un input deshabilitado no aparece en `FormData`: construir `plan` desde ese estado y validarlo en el procesador. CTA genérico → `SIN_DEFINIR`; limpiar el estado de un plan anterior. Probar cada CTA, cerrar/reabrir y cambiar de plan. No extraer el plan desde un texto visual o índice mutable.
4. Construir `formId=modal` o `inferior` desde el procesador según su ruta/flujo permitido. Generar UUID una vez; bloquear doble clic con estado de envío y conservar valores en pantalla si falla. Si el resultado es incierto, reintentar el **mismo snapshot y UUID**. Para corregir datos tras un resultado incierto, resolver el envío anterior antes de crear una nueva consulta.
5. Esperar respuesta confirmada del CRM. Solo con 201/200 y `ok:true`, mostrar **«Recibimos tu solicitud»**. No atar el registro a abrir WhatsApp.
6. Después ofrecer **«Continuar por WhatsApp»** con un mensaje genérico, por ejemplo «Hola, quisiera consultar por una cotización». Usar número comercial confirmado; no incluir nombre, teléfono, edad, plan, presupuesto ni UUID en `wa.me`, query strings o texto prellenado.
7. Mantener WhatsApp directo como recorrido separado: no genera por sí mismo un envío ficticio del formulario ni una autorización supuesta.

## Ejemplo y procesador de la landing

Solicitud exclusivamente con datos sintéticos, desde su servidor:

```http
POST /api/integrations/v1/leads/infoprepaga HTTP/1.1
Host: crm.infoprepaga.com.ar
Authorization: Bearer demo-exclusivo-infoprepaga-no-usar-en-produccion
Content-Type: application/json

{"submissionId":"21301608-31d9-4ea0-8e71-c1b16af4aa72","formId":"modal","name":"María José Prueba","phone":"011 15 2345-6789","age":35,"group":"INDIVIDUAL","employment":"DEPENDENCIA","plan":"SIN_DEFINIR","consent":true,"privacyVersion":"ip-aviso-demo-v1"}
```

Función Node del lado servidor (usar solo si el hosting lo admite). `validatedSnapshot` proviene de validación local estricta del mismo contrato y contiene UUID estable; este fragmento es la llamada saliente, no un procesador público completo:

```js
const response = await fetch(process.env.CRM_LANDING_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRM_LANDING_TOKEN}` },
  body: JSON.stringify(validatedSnapshot),
  signal: AbortSignal.timeout(25000),
  redirect: 'error'
});
const confirmed = [200, 201].includes(response.status) && (await response.json()).ok === true;
// Solo confirmed permite confirmar al navegador. No reenviar errores internos.
```

Backend tradicional: hacer el mismo POST JSON por cliente HTTPS de servidor (p. ej. cURL de PHP), con verificación TLS activa, secreto desde entorno/gestor de secretos, timeout 25 s y sin seguir redirecciones. Reutilizar cuerpo y UUID en reintentos. Elegir esta opción solo si el hosting está confirmado. Ninguna opción requiere acceso directo a PostgreSQL.

El procesador público debe validar Origin/CSRF de su propio sitio, catálogo, autorización, tamaños, cantidad de intentos por IP/ventana y protección antispam (señuelo validado localmente, controles de velocidad; si hace falta un desafío, revisar proveedor/privacidad). No confiar en CORS como antispam. No usar una cola nueva sin diseño de persistencia y límites. Si se guarda una bandeja de reintentos, definir cifrado, retención y permisos; nunca confirmar al usuario solo por encolarla.

## Estados y reintentos

| HTTP | Cuerpo público CRM / acción del procesador |
| --- | --- |
| 201 | `{"ok":true}`: registrada, confirmar. |
| 200 | `{"ok":true}`: mismo envío normalizado ya registrado, confirmar. |
| 400 | `{"ok":false,"code":"LANDING_400"}`: datos, formulario, consentimiento o aviso inválidos; conservar datos y corregir. |
| 409 | `LANDING_409`: mismo UUID con contenido distinto; intervención técnica, no cambiar UUID automáticamente. |
| 401 / 403 | `LANDING_401` / `LANDING_403`: clave inválida/cruzada u Origin no admitido; intervención técnica. No pedir al usuario login del CRM. |
| 413 / 415 | `LANDING_413` / `LANDING_415`: tamaño o codificación; corregir integración. |
| 429 | `LANDING_429` y `Retry-After`: esperar ese intervalo y reintentar mismo envío. |
| 408 / 503, otro 5xx o timeout de red | Resultado temporal/incierto; conservar datos, reintentar mismo UUID/cuerpo con espera exponencial y jitter, tope de intentos; luego soporte. 503 también puede indicar configuración/habilitación pendiente: revisar tras fallos persistentes. |

Los códigos de error se devuelven dentro de `{"ok":false,"code":"…"}`. No hay ID de lead, indicación de existencia ni vendedor en ninguna respuesta pública. El procesador debe responder también con mensajes mínimos, sin copiar errores de NestJS. No registrar Authorization, email, teléfonos, cuerpos ni parámetros de formulario en Nginx, monitorización o logs de aplicación.

### CORS, login y límites

Las rutas nuevas aceptan preflight OPTIONS y POST con Origin `https://infoprepaga.com.ar` o `https://www.infoprepaga.com.ar`, sin `Access-Control-Allow-Credentials`; no admiten orígenes arbitrarios ni `null`. La ruta normal **servidor a servidor no necesita Origin**. Esto no autoriza a poner el secreto en el navegador. Staging de landing: agregar su origen exacto bajo revisión si necesita preflight; probar servidor a servidor sin Origin mientras tanto.

Login y `/api/crm/*` mantienen su comprobación `Origin === APP_ORIGIN`, sesiones y cookies. `APP_ORIGIN` debe ser exactamente `https://crm.infoprepaga.com.ar` en producción, sin slash final; **no agregar los dominios de landings al origen del login** ni a `CORS_ORIGIN` global. Este último sigue siendo el origen del frontend para NestJS privado. Revisar que Nginx preserve el Origin y no lo reescriba; probar login por el dominio CRM al activar.

NestJS usa el throttler existente: 60 peticiones/minuto por IP observada y handler de captación (ambas landings comparten bucket detrás del BFF). Es un límite conservador **en memoria por proceso**, no por teléfono ni por cabecera `X-Forwarded-For` del cliente. Con una sola API es efectivo para este recorrido; antes de escalar réplicas, aplicar límite compartido en el proxy y probarlo. Mantener adicionalmente antispam/límite por visitante en la landing; un secreto no frena abuso de su formulario público. Next y Nest limitan JSON a 8 KiB; lectura Next 5 s, llamada privada 20 s. No se habilitó confianza global en proxies.

## Alta, repetidos y evidencia

`CrmService.write` toma el bloqueo comercial PostgreSQL existente. El recibo tiene unicidad persistente `(landing, submissionId)`. Consulta, alta/vínculo, reparto, evidencia y evento de historial se confirman en una misma transacción. Mismo UUID y snapshot normalizado → 200; cualquier cambio semántico → 409. Dos solicitudes simultáneas producen un solo efecto; una caída antes del commit revierte todo y después del commit permite recuperar el resultado. No existe notificación externa automática en este alta; un futuro efecto externo deberá usar outbox/idempotencia, nunca un envío dentro del reintento.

Una consulta nueva con UUID nuevo no es un reintento. Coincidencia única por teléfono **o email** normalizado → vincular conservando nombre, origen, estado y responsable de la ficha. Los nuevos datos de contacto quedan en el recibo y el historial para atender esa solicitud; no sobrescriben contactos automáticamente. Ficha histórica: permanece en su cartera y no se reactiva ni reasigna silenciosamente; revisar el filtro de cartera correspondiente. Sin coincidencia → alta compartida de sistema, estado Nuevo y reparto predeterminado. Sin receptor habilitado → pendiente solo visible a ADMIN, repartido por antigüedad cuando haya candidatos; reintento no consume otro turno.

Teléfono y email en fichas distintas o varias coincidencias: no fusionar; crear una ficha de consulta separada por el alta común y marcar `needsReview` en recibo/historial. ADMIN revisa con datos autorizados, sin fusión automática ni exposición pública de los candidatos. El historial y el filtro por origen incluyen la nueva procedencia; la columna origen de la ficha conserva el histórico. Los reportes comerciales existentes siguen midiendo leads/ventas por sus reglas previas, **no cuentan cada recibo como un nuevo lead**. El filtro de listado por origen ahora incluye consultas vinculadas además del origen de ficha; no debe sumarse entre fuentes como si fueran conjuntos disjuntos.

Alta manual: conserva su comportamiento de crear fichas sin esta deduplicación. Excel mantiene sus reglas de apariciones/fingerprints, revisión y cartera histórica; YCloud su inbox de mensajes y revisión de contactos ambiguos/históricos. No se cambian sus diferencias legítimas. Todos usan claves y bloqueo comercial compatibles. No existe coincidencia autorizada entre responsables distintos: el bloqueo de habilitación ocurre antes de consultar la cartera.

## Privacidad: propuestas para revisión, no publicadas

Completar **[RESPONSABLE_LEGAL_INFOPREPAGA]**, **[DOMICILIO_LEGAL_COMPLETO]**, **[CUIT]**, **[CORREO_DERECHOS]**, **[URL_POLITICA_PUBLICADA]**. InfoPrepaga puede figurar como marca; no presumir que la marca es la razón social. Confirmar relación con el titular de esta instancia CRM y quién aprueba los accesos de ADMIN, asesores y operadores.

Propuesta breve junto al formulario:

> [RESPONSABLE_LEGAL_INFOPREPAGA], con domicilio en [DOMICILIO_LEGAL_COMPLETO], usará tus datos para responder esta solicitud por [CANALES_APROBADOS]. Nombre, WhatsApp, edad del titular, grupo, situación laboral y plan de interés son necesarios en esta versión; presupuesto y email son opcionales. Sin los obligatorios o tu autorización no podemos tramitarla. Consultá destinatarios, conservación y derechos en [URL_POLITICA_PUBLICADA].

Casilla sin premarcar, propuesta:

> Autorizo a [RESPONSABLE_LEGAL_INFOPREPAGA] a usar mis datos para contactarme y responder mi solicitud de cotización, según la Política de Privacidad.

La política a revisar debe explicar finalidad; destinatarios concretos cuando corresponda cotizar/contratar; canales (llamada, WhatsApp y/o email, confirmar); criterio de conservación **[PLAZO_O_CRITERIO_APROBADO]** y rutina operativa de eliminación/anonimización, incluyendo recibos, historial y respaldos; cómo ejercer acceso, rectificación, actualización o supresión en **[CORREO_DERECHOS]**; y AAIP como autoridad de control. La entrega no implementa purga automática: acordar el procedimiento antes de activar. La autorización para responder esta consulta no habilita promociones; una futura finalidad promocional requiere opción separada.

Inventario a completar: proveedor y ubicación del hosting de landing, procesador, hosting del CRM/base/backups; acceso de operadores; WhatsApp cuando se use; prestadoras efectivamente receptoras y etapa de envío; Meta Pixel/GTM/Analytics u otros proveedores de medición. El flujo implementado solo transmite al CRM; no llama a WhatsApp ni a prestadoras. Verificar configuraciones reales y contratos con cada proveedor. Si hay destinos fuera de Argentina, validar países, garantías y flujo aplicable antes de habilitar; no presumir que el hosting es nacional.

Excluir diagnósticos, preexistencias, declaraciones de salud, documentación médica y texto libre innecesario. La captación no recibe esos campos. Revisar DOM, dataLayer, GTM, Meta Pixel, Analytics, eventos automáticos de formularios, advanced matching, URLs, capturas de sesión, APM y logs: **ningún valor del formulario debe enviarse allí**. Si se mide conversión, disparar solo después de 200/201 un evento como `cotizacion_registrada`, sin nombre, teléfono, email, UUID ni valores comerciales; verificar en herramientas de red del navegador. No dispararlo de nuevo por cada reintento técnico.

Fuentes para revisión jurídica: [Ley 25.326, información y derechos](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion), [AAIP: derechos](https://www.argentina.gob.ar/aaip/datospersonales/derechos), [transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales). Revisar el consentimiento y las obligaciones aplicables con el responsable; estos textos son insumos, no una política publicada.

## Términos y condiciones pendientes

Reunir **[COMERCIALIZADOR_LEGAL/CUIT/DOMICILIO]**, prestadoras que representa y autorización correspondiente, alcance orientativo de cotización, validez/precio y canales de atención **[CANALES/HORARIOS]**. Describir pasos: solicitud → contacto del asesor → cotización → aceptación/documentación por canal autorizado → aprobación/alta formal según prestadora y condiciones confirmadas. Propuesta para revisión: enviar el formulario solicita asesoramiento; no constituye aceptación de plan ni inicia cobertura por sí mismo.

Verificar cualquier promoción, incluido un eventual 50%: **[VIGENCIA]**, **[ZONA]**, **[PLANES]**, **[REQUISITOS]**, **[DURACION]**, precio/base del descuento y **[LIMITACIONES]**, quién ofrece el beneficio y quién aprueba su publicación. Contrastar promesas de tiempo de respuesta con capacidad y horarios comerciales. No presumir que una promoción de otra marca se aplica aquí. [Ley 24.240: oferta y publicidad](https://www.argentina.gob.ar/normativa/nacional/638/actualizacion).

## Pruebas y checklist de activación

Prueba automatizada local: `CRM_TEST_DATABASE_URL` debe apuntar exclusivamente a `localhost/starter_test`; ejecutar `node scripts/verify-landing-integrations.mjs` después de construir backend y frontend. Crea un esquema aleatorio, migra con datos sintéticos previos, inicia Next de producción y Nest local y elimina solo su esquema al terminar. Resultados efectivos: [verificación de esta entrega](verificacion-captacion-landings.md).

- [ ] Confirmar responsable legal de landing y cartera existente, operadores, avisos, retención y acceso. Si difiere, **no activar en esta instancia**.
- [ ] Confirmar hosting/código, procesador elegido, secreto exclusivo y rotación, URL de staging y Nginx real; migrar en entorno autorizado, sin abrir API/base al público.
- [ ] Validar `modal` e `inferior`, los catálogos reales y cada CTA/plan deshabilitado; aprobar rango de edad y tratamiento del presupuesto por rangos.
- [ ] Revisar aviso/casilla/publicación por su responsable, archivo de versiones, términos, promociones, proveedores, transferencias y medición sin PII.
- [ ] Probar 201/200/400/401/403/409/413/429/503, doble clic, timeout y concurrencia en staging; reusar UUID y conservar campos en error.
- [ ] Confirmar origen visible/filtrable, historial, nueva consulta de contacto existente, revisión ambigua, reparto/sin vendedores y vendedor ajeno sin acceso.
- [ ] **Pendiente en la landing real:** enviar en staging, recibir confirmación, cerrar sin abrir WhatsApp y comprobar consulta durable. El contrato local se prueba sin WhatsApp; no sustituye esta prueba de UI.
- [ ] Probar login, sesión, health y rutas protegidas por el camino Nginx/Next real, CORS solo en integración y antispam local. Habilitar `ENABLED=true` solo tras completar estas decisiones; esta entrega no despliega.
