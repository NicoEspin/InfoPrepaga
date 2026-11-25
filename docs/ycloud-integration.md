# Captación de WhatsApp con YCloud

La integración incorpora contactos que envían un mensaje de WhatsApp con atribución de anuncio. Guarda primero un ingreso durable y luego crea o vincula el lead usando el reparto existente. La atención sigue siendo manual en WhatsApp/YCloud. No envía respuestas, consulta APIs de administración, descarga adjuntos, sincroniza conversaciones ni accede a Avalian.

La integración y la excepción de prueba quedan deshabilitadas por defecto. Se puede probar localmente sin campañas mediante la excepción explícita descrita abajo. La aceptación productiva con un anuncio real sigue pendiente hasta contar con servidor y canal autorizados.

## Configurar y activar

1. Revisar el SQL de `backend/prisma/migrations/20261117120000_ycloud_inbound/migration.sql` y la ampliación `20261119120000_ycloud_test_messages/migration.sql`. Respaldar y comprobar restauración antes de migrar la base habitual. Usar Node 24.22.1, pnpm 10.32.1 y Prisma **6.19.3**; generar cliente y ejecutar `pnpm -C backend prisma:deploy` exclusivamente en el entorno autorizado. No iniciar esta versión contra el esquema anterior.
2. Preparar una URL HTTPS pública que llegue al frontend, según la sección siguiente. Mantener `YCLOUD_ENABLED=false` durante la preparación.
3. En YCloud Console: **Developers → Webhook → Add Endpoints**. Registrar `https://crm.example.com/webhooks/ycloud` y suscribir únicamente `whatsapp.inbound_message.received`. Guardar el secreto de firma específico de ese endpoint en el servidor. Verificar que el endpoint esté habilitado, no `pending` ni suspendido.
4. Completar las variables siguientes en el entorno privado del servicio `api`. Reiniciar/recrear ese servicio después de cambiar variables; un cambio del archivo `.env` no modifica procesos existentes.
5. Ejecutar primero pruebas sintéticas en un CRM aislado. Activar con `YCLOUD_ENABLED=true` y realizar la aceptación real al final de esta guía. No guardar secretos en Git, el navegador, `NEXT_PUBLIC_*`, capturas o logs.

| Variable | Valor y obligatoriedad |
| --- | --- |
| `YCLOUD_ENABLED` | `false` inicial. Solo `true` o `false`; controla recepción y procesamiento. |
| `YCLOUD_ALLOW_NON_AD_TEST_MESSAGES` | `false` predeterminado. Solo `true` o `false`; excepción exclusiva del backend para mensajes comunes de prueba. Independiente de `NODE_ENV`. |
| `YCLOUD_TEST_SENDERS` | Lista separada por comas de teléfonos internacionales con `+`. Admite formato legible, normaliza con `contactKeys` y elimina duplicados. Entradas inválidas, nacionales o vacías entre comas se rechazan. Con la excepción activa debe existir y no estar vacía, incluso con `YCLOUD_ENABLED=false`. |
| `YCLOUD_WEBHOOK_SECRET` | Secreto del endpoint YCloud, hasta 512 caracteres; obligatorio al habilitar. No es una API key. |
| `YCLOUD_WABA_ID` | ID de la cuenta permitida, dígitos, hasta 64; obligatorio al habilitar. |
| `YCLOUD_BUSINESS_PHONE_NUMBER` | Número comercial receptor internacional con `+`, por ejemplo `+14155550100` **sintético**; obligatorio al habilitar. |
| `YCLOUD_LEAD_SOURCE_CODE` | Código existente y activo del catálogo, por ejemplo `META_1` si el propietario decide utilizarlo. Obligatorio al habilitar; letras, números, `_` y `-`, hasta 100 caracteres (incluye los códigos `BASE_uuid` del catálogo existente). |

Las variables se documentan en `.env.example` y `backend/.env.example`. Compose solo las entrega a `api`; el proxy Next.js no necesita el secreto. Deshabilitada, la aplicación inicia con los cuatro valores vacíos. Habilitada con campos ausentes o formatos inválidos falla la validación de entorno. Un código con formato válido pero inexistente/inactivo permite almacenar ingresos y los lleva a `REVIEW / SOURCE_UNAVAILABLE`; corregir catálogo/configuración y reintentar explícitamente.

El alta manual en el panel no requiere `YCLOUD_API_KEY`. Esa credencial solo sería necesaria para código futuro que consuma la API de administración; esta implementación no lo hace.

## Prueba desde Windows sin campañas

Requisitos: Node 24.22.1, pnpm 10.32.1, Docker Desktop iniciado, Docker Compose **2.24.4 o posterior** (por `!override`) y `cloudflared` instalado según [Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). No abrir el túnel todavía. No se necesita cuenta Cloudflare ni dominio para Quick Tunnel; la URL es temporal y cambia al recrearlo. Es un mecanismo de prueba, no el endpoint definitivo.

### 1. Crear un despliegue aislado

Desde la raíz, crear `.env.ycloud-test` **solo si no existe**, usando `.env.example` como base. Está ignorado por Git. Editarlo privadamente, sin copiar secretos a capturas o al historial de terminal:

```powershell
if (Test-Path .env.ycloud-test) { throw 'Ya existe: revisar sin sobrescribir' }
Copy-Item .env.example .env.ycloud-test
```

Configurar `POSTGRES_USER=ycloud_test`, `POSTGRES_DB=starter_test`, una contraseña aleatoria hexadecimal de prueba y `JWT_ACCESS_SECRET` aleatorio de al menos 32 caracteres. Usar `DATABASE_URL=postgresql://ycloud_test:<contraseña-de-prueba>@postgres:5432/starter_test?schema=public`, `APP_ORIGIN=http://localhost:3340`, y R2 vacío. No reutilizar credenciales ni URL de la base habitual.

Al principio, `YCLOUD_ENABLED=false`, `YCLOUD_ALLOW_NON_AD_TEST_MESSAGES=false`, `YCLOUD_TEST_SENDERS=` y el resto de YCloud vacío. Los valores con `<...>` son marcadores para reemplazar, no comandos ejecutables.

```powershell
function dc {
  docker compose --env-file .env.ycloud-test -p infoprepaga-ycloud-test -f compose.yaml -f compose.ycloud-test.yaml @args
  if ($LASTEXITCODE -ne 0) { throw 'Falló el comando del entorno YCloud aislado' }
}
dc config --quiet
dc up -d --build
dc ps
```

El proyecto, red y volumen son propios. El override fija la base `starter_test` en PostgreSQL, API y migrador; no usa la URL de la base habitual. Publica web en `127.0.0.1:3340` y PostgreSQL en `127.0.0.1:5434`; la API sigue privada. `up` aplica las migraciones de esta base nueva, incluida `20261119120000_ycloud_test_messages`. Verificar esos puertos antes de avanzar.

Crear el primer ADMIN mediante el bootstrap existente, solo en esta base nueva:

```powershell
$env:SEED_ADMIN_EMAIL = Read-Host 'Correo del ADMIN de prueba'
$bootstrapPassword = Read-Host 'Contraseña exclusiva de prueba (mínimo 12 caracteres)' -AsSecureString
$env:SEED_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $bootstrapPassword).Password
try { dc run --rm -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD migrate pnpm prisma:seed }
finally {
  Remove-Item Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $bootstrapPassword.Dispose()
}
```

Iniciar sesión en `http://localhost:3340`. Crear la fuente desde la consola del navegador con esa sesión ADMIN, sin tokens manuales:

```js
await fetch('/api/crm/sources', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Prueba YCloud' })
}).then(r => r.json());
```

Guardar su `code` (`BASE_...`) como `YCLOUD_LEAD_SOURCE_CODE` en `.env.ycloud-test`. Para probar reparto, crear un VENDEDOR sintético con las herramientas administrativas existentes y habilitar su recepción en Configuración. Sin vendedores elegibles, el alta debe quedar sin asignar; no es un fallo del webhook.

### 2. Revisar y probar la superficie local

La ruta Next.js existente mantiene bytes, firma, tamaño y tiempos. El backend mantiene guard, validaciones, cuenta/receptor, throttler, transacciones, deduplicación y permisos ADMIN. Un túnel directo a web expondría además login, páginas y BFF; por eso se usa un proxy local de ruta fija, sin cookies ni Authorization.

```powershell
node --test scripts/ycloud-webhook-proxy.test.mjs
node frontend/scripts/verify-ycloud.mjs
# En otra terminal, mantener el proxy ejecutándose:
node scripts/ycloud-webhook-proxy.mjs
```

Antes del túnel, comprobar desde otra terminal: `curl.exe -i http://127.0.0.1:3342/` devuelve 404; `/api/crm/leads` devuelve 404; `GET /webhooks/ycloud` devuelve 405. Solo `POST /webhooks/ycloud` es reenviable. El proxy limita a 128 KiB y 5 segundos para lectura y fetch; conserva el estado HTTP upstream. No guarda cuerpos ni cabeceras. No admite destinos, rutas alternativas o parámetros de URL del remitente.

### 3. Registrar el endpoint y habilitar la prueba

Solo después de la revisión anterior, en otra terminal:

```powershell
cloudflared tunnel --url http://127.0.0.1:3342
```

Registrar `https://<hostname-temporal>.trycloudflare.com/webhooks/ycloud` en YCloud y suscribir únicamente `whatsapp.inbound_message.received`. No poner login interactivo de Cloudflare delante del receptor máquina. Copiar privadamente el secreto específico del endpoint a `YCLOUD_WEBHOOK_SECRET` del archivo local; no es una API key. Configurar WABA y número comercial receptor del canal de prueba autorizado.

En el mismo archivo, poner `YCLOUD_ENABLED=true`, `YCLOUD_ALLOW_NON_AD_TEST_MESSAGES=true` y `YCLOUD_TEST_SENDERS=+<remitente-autorizado>`; puede haber varios separados por comas. No confundir remitentes de prueba con el número comercial receptor. La excepción se limita también a ese WABA/receptor configurado.

```powershell
dc config --quiet
dc up -d --force-recreate api
```

Desde el teléfono autorizado, **el propietario** envía un mensaje común al WhatsApp de prueba. No requiere campaña Meta. Revisar entrega 200 en YCloud y el listado ADMIN descrito más abajo: `isTestMessage=true`, `PROCESSED`, `leadId` y actividad “Prueba YCloud · mensaje sin anuncio”. Conservar contacto y cuenta de prueba autorizados; no enviar información de salud. Un remitente fuera de la lista queda `IGNORED / ORGANIC_MESSAGE`, sin efectos comerciales.

### 4. Enviar un evento sintético con anuncio

En una terminal privada, cargar solo las tres variables YCloud necesarias desde `.env.ycloud-test` sin imprimirlas (Node carga el archivo para el proceso del script):

```powershell
node --env-file=.env.ycloud-test backend/scripts/send-ycloud-synthetic.cjs --url http://127.0.0.1:3342/webhooks/ycloud --id aceptacion-local-01
node --env-file=.env.ycloud-test backend/scripts/send-ycloud-synthetic.cjs --url http://127.0.0.1:3342/webhooks/ycloud --id aceptacion-local-01
```

Usar una terminal sin variables YCloud heredadas contradictorias: las variables ya presentes prevalecen sobre `--env-file`. El script existente usa un remitente sintético, referral `ad` e IDs estables; la repetición devuelve `duplicate`. Verificar `isTestMessage=false` y una sola actividad. Estos eventos demuestran el contrato sintético, no una entrega real YCloud/Meta. La fuente de las altas sintéticas también será «Prueba YCloud» en este despliegue aislado.

### 5. Consultar sin registrar datos ni secretos

Con la sesión ADMIN local, usar el listado mínimo `GET /api/crm/integrations/ycloud/events`. Devuelve `enabled`, `allowNonAdTestMessages`, `isTestMessage` por ingreso, estado, código, fechas e identificadores; no muestra la lista de remitentes, cuerpos ni secretos. Consultar el perfil por `leadId`. Evitar volcar el detalle completo: contiene metadatos personales minimizados. No habilitar logs de request, Prisma query logging ni capturas de cabeceras.

### 6. Desactivar y preparar producción

En `.env.ycloud-test`, poner `YCLOUD_ALLOW_NON_AD_TEST_MESSAGES=false` y lista vacía; recrear `api`. El listado ADMIN debe mostrar `allowNonAdTestMessages=false`. Enviar manualmente un **mensaje nuevo**, o comprobarlo con los E2E: debe quedar ignorado, sin actividad. Repetir IDs ya aceptados solo demuestra deduplicación. Los pendientes sin anuncio pierden autorización y se ignoran incluso si estaban en backoff; los confirmados permanecen intactos. Habilitar otra vez no reactiva ignorados.

Cerrar `cloudflared` y el proxy con Ctrl+C y detener este despliegue con `dc down` **sin `-v`**. Antes del servidor definitivo detener todas las instancias/worker de prueba que compartieran una bandeja; cambios de entorno requieren recreación, no basta editar el archivo. Una transacción ya en curso puede confirmar durante el apagado ordenado y no se revierte retroactivamente.

En producción usar únicamente `-f compose.yaml`, el entorno privado definitivo y la fuente comercial aprobada. Ese Compose fija la excepción en `'false'` y la lista vacía aunque haya variables de prueba heredadas. No cargar `compose.ycloud-test.yaml`, no copiar `.env.ycloud-test`, y no trasladar su base/volumen. En despliegues fuera de Compose fijar y verificar explícitamente ambos valores; `NODE_ENV=production` por sí solo no bloquea la excepción.

Antes de activar recepción productiva, aplicar migraciones autorizadas y verificar con ADMIN la excepción desactivada. Configuración definitiva: **`YCLOUD_ENABLED=true` cuando corresponda, `YCLOUD_ALLOW_NON_AD_TEST_MESSAGES=false`, `YCLOUD_TEST_SENDERS=`**. Mientras no esté listo el canal, mantener `YCLOUD_ENABLED=false`. El hostname HTTPS permanente y aceptación con anuncio real quedan pendientes del despliegue del propietario.

## Recorrido y acceso HTTPS

```mermaid
flowchart LR
  A[Anuncio Meta] --> B[Mensaje del interesado]
  B --> C[YCloud]
  C --> D[HTTPS /webhooks/ycloud en Next.js]
  D --> E[NestJS privado: firma y validación]
  E --> F[(Bandeja PostgreSQL)]
  F --> G[Worker: bloqueo comercial y deduplicación]
  G --> H[Lead nuevo o vínculo existente]
  H --> I[Reparto e historial del CRM]
  G --> J[Revisión ADMIN]
```

El Compose raíz conserva PostgreSQL y API privados. Solo publica `web` en `127.0.0.1:${WEB_PORT:-3000}`. El reverse proxy HTTPS del servidor debe llegar a ese puerto. Next.js tiene una ruta dedicada `POST /webhooks/ycloud` que transmite los mismos bytes y la cabecera `YCloud-Signature` a la ruta fija privada de NestJS, usando `BACKEND_URL=http://api:3001`. No acepta destinos, paths ni credenciales desde el remitente y rechaza redirecciones upstream. No pasa cookies ni Authorization.

Ejemplo para el bloque HTTPS **existente** de Nginx del host (reemplazar puerto si corresponde; certificados y configuración general pertenecen al despliegue):

```nginx
location = /webhooks/ycloud {
    client_max_body_size 128k;
    client_body_timeout 5s;
    proxy_connect_timeout 2s;
    proxy_read_timeout 8s;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header YCloud-Signature $http_ycloud_signature;
}
```

No usar redirección de login, autenticación de usuario o comprobación de Origin sobre **esta ruta máquina**. Preservar TLS, límite de cuerpo y cabecera; no transformar/reformatear JSON ni aplicar descompresión. La ruta debe tener certificado público válido y ser accesible desde YCloud. Verificar reglas del CDN/WAF para que permitan sus entregas. El proxy comercial `/api/crm/*` conserva sesión y origen; sus rutas operativas nuevas requieren además ADMIN en NestJS. No se publica directamente `/crm` desde Internet a través de este webhook.

## Firma, límites y respuestas

NestJS arranca con `rawBody: true`. `configureYCloudHttp` instala el parser de la ruta con **128 KiB**, sin inflación, y conserva el parser JSON de 100 KiB del resto del backend. Las pruebas HTTP usan la misma inicialización. Se acepta `application/json`, sin compresión. El proxy acumula como máximo 128 KiB, incluso con transferencia por bloques, limita lectura y fetch a 5 segundos cada uno y no registra cuerpos.

`@Public()` se aplica solo al método receptor para omitir JWT. Su guard exige una única parte `t` decimal en segundos y una o más partes `s` hexadecimales de 64 caracteres; rechaza otras partes, duplicación de timestamp y cabeceras mayores a 1024 caracteres. Calcula HMAC-SHA256 sobre `timestamp + '.' + bytes originales` y compara con `timingSafeEqual`. Espacios, saltos de línea y Unicode no se reconstruyen desde JSON.

La tolerancia es **±300 segundos** respecto del reloj del servidor, incluida la frontera. Es política del CRM, no la edad máxima del mensaje: `sendTime` y `createTime` pueden ser antiguos. Sincronizar reloj con NTP. La guía vigente del proveedor presenta esta política junto con reintentos que pueden extenderse varias horas; no se valida antigüedad de esas fechas de negocio. Cada entrega debe tener una firma con timestamp vigente; una reproducción manual de una solicitud capturada debe **volver a firmarse**, conservando IDs. Confirmar también este comportamiento en la aceptación real, especialmente si se utiliza una herramienta de replay del panel.

Se mantiene el throttler global. El receptor tiene un límite específico de **600 solicitudes/minuto por IP e instancia**, por ruta, incluyendo entregas repetidas. Detrás de Next.js la IP observada es la del proxy: es un presupuesto agregado por instancia para ese salto, no una identidad del remitente. No se confía en `X-Forwarded-For` enviado por Internet. Para varias instancias o protección de caudal en el borde, configurar el reverse proxy; no se agregó Redis. Un exceso responde 429 y permite reentrega.

| HTTP / resultado | Significado |
| --- | --- |
| `200 {result:"accepted",status,code}` | Ingreso validado y confirmado en PostgreSQL; puede quedar PENDING, IGNORED o REVIEW. No implica que ya exista el lead. |
| `200 {result:"duplicate"}` | Ya hay un ingreso durable con ese evento, mensaje o wamid; no repite efectos. |
| `400` | JSON/campos/fechas/URL publicitaria inválidos. Corregir contrato; no se almacena el cuerpo. |
| `401 YCLOUD_SIGNATURE_INVALID` | Firma ausente, inválida, mal formada, cuerpo alterado o timestamp fuera de tolerancia. |
| `403 YCLOUD_ACCOUNT_MISMATCH` | WABA o número receptor ajenos, para eventos inbound. |
| `413` / `415` | Cuerpo excedido / contenido o codificación no admitidos. |
| `429` | Límite de solicitudes. |
| `503 YCLOUD_DISABLED` | Recepción pausada; no incorpora entradas nuevas. El proveedor puede reintentar hasta su límite. |
| `503 YCLOUD_STORAGE_UNAVAILABLE` | No se confirmó almacenamiento; debe haber reentrega. |
| `503 YCLOUD_BACKEND_UNAVAILABLE` | El proxy no recibió una respuesta del backend. Una entrega incierta puede haberse guardado: repetir con los mismos IDs es seguro. |
| `408 YCLOUD_REQUEST_TIMEOUT` | El proxy agotó el tiempo de lectura del cuerpo. |

NestJS presenta sus errores con el formato común de la API (`message`, `statusCode`, etc.); Next.js genera errores mínimos propios antes de alcanzar el backend. YCloud debe evaluar el estado HTTP.

## Captación y atribución

La política siguiente es la predeterminada y productiva. La única excepción son los mensajes comunes del despliegue de prueba: requieren bandera explícita, remitente permitido y todas las validaciones habituales. Se guardan con `isTestMessage=true`, conservando el referral recibido sin inventar `ad`, `source_id` ni clic. El historial también guarda esa marca; los leads existentes conservan su atribución inicial. Un campo o parámetro recibido del remitente nunca habilita la excepción.

Se admite el sobre con `id`, `type`, `apiVersion`, `createTime` y, para inbound, el objeto `whatsappInboundMessage`. Los eventos conocidos ajenos y los desconocidos se almacenan como `IGNORED / EVENT_OUT_OF_SCOPE`, con metadatos del sobre únicamente. No se inspecciona ni persiste su cuerpo específico ni producen leads. Propiedades nuevas del proveedor son compatibles: se ignoran al mapear y nunca se copian por expansión al modelo.

Para inbound se verifican WABA/número, ID de mensaje, tipo y `sendTime`. `v2` es la versión admitida; otra versión inbound queda `REVIEW / API_VERSION_UNSUPPORTED` y requiere adaptar el contrato. El ID de evento admite letras, números, `_` y `-` hasta 160 caracteres. ID de mensaje hasta 160, wamid hasta 256. El número entrante admite representación internacional con/sin `+`; se normaliza con `contactKeys` y su misma biblioteca. Un teléfono mal formado devuelve 400; uno ausente o sin clave válida deja `CONTACT_INSUFFICIENT` en revisión. `fromUserId` se conserva hasta 160 caracteres para diagnóstico cuando no hay teléfono; no se usa para inventar ni fusionar contactos.

Las altas automáticas exigen **`referral.source_type === 'ad'`** y un tipo de mensaje de usuario de esta lista: `text`, `image`, `video`, `audio`, `document`, `sticker`, `location`, `contacts`, `button`, `interactive`, `order`. Se usa solo el hecho del ingreso; no se guardan contenidos de texto, ubicaciones, tarjetas de contacto, media ni sus enlaces. `system`, `reaction`, `request_welcome`, `unsupported` y tipos futuros se excluyen con `MESSAGE_OUT_OF_SCOPE`, aunque incluyan referral. Los orgánicos sin referral publicitario quedan `IGNORED / ORGANIC_MESSAGE`.

| Referral almacenado | Validación |
| --- | --- |
| `source_id` | Hasta 160 caracteres: identificador del **anuncio** según YCloud. |
| `source_type` | Hasta 32; solo `ad` habilita captación. |
| `source_url` | Hasta 2048; URL HTTP/HTTPS sin credenciales, tratada como dato. Nunca se consulta ni renderiza como enlace ejecutable. |
| `headline` | Hasta 500; texto externo sin controles. |
| `ctwa_clid` | Hasta 1024; referencia del clic, no un ID de campaña. |

Campos opcionales ausentes se omiten; campos presentes inválidos se rechazan. No se consultan nombres de campaña ni conjunto de anuncios. El origen de alta y `entrySourceId` usan exclusivamente `YCLOUD_LEAD_SOURCE_CODE`. La correspondencia anuncio→META_1/2/3 queda para una decisión comercial posterior.

## Deduplicación, reparto y fechas

Hay restricciones únicas para ID de evento, `(wabaId,messageId)` y `(wabaId,wamid)` cuando están presentes. La primera entrega válida es la canónica. Otra entrega del mismo mensaje bajo un ID distinto devuelve duplicate y no crea una fila alias ni reemplaza datos/atribución. Conservar esos identificadores para mantener la idempotencia después de reintentos o replays.

Antes de resolver contactos, el worker completa claves legacy con el backfill compartido del importador Excel, de 100 en 100, coordinado con ediciones por `assignment_state`. Un índice parcial acelera la selección de `contactKeysVersion=0`. No se procesa un evento hasta terminar ese backfill; puede demorar la primera captación de una cartera grande. No se cambia clasificación, datos ni fechas del lead durante el backfill.

| Coincidencias por `phoneKey` | Resultado |
| --- | --- |
| Ninguna | Alta con estado NEW, etapa NEW, portfolio ACTIVE y modalidad NEW. |
| Una ACTIVE | Vincula al lead; agrega actividad de ingreso. Conserva nombre, teléfono editado, responsable, estado, etapa, fechas y atribución inicial. |
| Más de una, incluso activa + histórica | REVIEW / CONTACT_AMBIGUOUS. No elige arbitrariamente. |
| Una HISTORICAL o UNCLASSIFIED | REVIEW / CONTACT_HISTORICAL. No reactiva ni crea captación nueva. |
| Contacto insuficiente | REVIEW / CONTACT_INSUFFICIENT. No fusiona por nombre ni user ID. |

Los nuevos usan nombre de perfil válido de hasta 160 caracteres; si falta o es inválido, `WhatsApp ` y los últimos cuatro dígitos. La creación comparte validación de origen y reparto de CrmService. Mantiene prioridad de pendientes previos, vendedores activos con recepción habilitada, exclusión de ADMIN y recuperación sin candidatos. Sin vendedor queda sin asignar y privado de ADMIN hasta distribuirse.

No se usa un usuario administrador técnico. Las actividades `registered`, `assigned` e `ycloud-inbound` usan `actorId=null`: el perfil las muestra como Sistema. La actividad YCloud muestra si creó o vinculó, ID de anuncio y fecha del mensaje, sin exponer contenido de conversación. El historial conserva los permisos habituales del lead y el polling comercial existente refresca los datos.

`createdAt` y `commercialStartedAt` de un alta nueva son los instantes del alta comercial; `originDate` queda nulo. `messageAt`, `emittedAt` y `receivedAt` del ingreso conservan la procedencia por separado en UTC. Un mensaje antiguo no retrodata captación ni reportes. Vincular un lead existente no agrega una segunda población A ni cambia `entrySourceId`. No se generan movimientos, ventas ni conversiones por recibir un mensaje.

## Worker, fallos y recuperación

Antes de buscar contactos o producir efectos comerciales, el worker vuelve a comprobar la política actual. Los ingresos sin anuncio requieren además la marca durable de admisión de prueba; filas antiguas sin esa marca no obtienen autorización retroactiva. Al desactivar la excepción o retirar un remitente, los PENDING correspondientes pasan a IGNORED / ORGANIC_MESSAGE, aun con `nextAttemptAt` futuro. REVIEW/EXHAUSTED solo se encolan por reintento ADMIN auditado y atraviesan el mismo control. PROCESSED no se modifica y habilitar la excepción no reactiva IGNORED. No desplegar simultáneamente workers con políticas diferentes sobre la misma bandeja.

PostgreSQL es la bandeja durable; no hay cola externa. El receptor confirma `200` después del INSERT y no espera al reparto. Un worker revisa al iniciar y cada **10 segundos**, hasta **50 transacciones por tick**; cada transacción procesa un ingreso o un bloque de backfill. Un proceso no superpone ticks y espera el tick activo al cerrar.

Todas las instancias adquieren primero `assignment_state.id=1` mediante `CrmService.maintenanceWrite` y después la fila de inbox con `FOR UPDATE SKIP LOCKED`. Si el bloqueo comercial está ocupado, el worker cede hasta el próximo tick. Admin retry usa el mismo orden. La selección de ingresos vencidos es `(receivedAt,id)`; los que están esperando backoff no bloquean ingresos posteriores.

Dentro de esa transacción hay un savepoint: alta/vínculo, reparto, actividades y estado PROCESSED se confirman juntos. Ante un fallo comercial se revierte todo hasta el savepoint y se guarda el intento fallido; una caída o pérdida de la transacción completa deja el evento pendiente para el próximo inicio/tick. Ningún estado PROCESSING permanente puede quedar abandonado.

Hay **8 intentos por ciclo**. La espera progresiva es `min(1 hora, 10 segundos × 2^(intentos−1))`: tras los primeros siete fallos, 10, 20, 40, 80, 160, 320 y 640 segundos, más la resolución del polling. Al octavo queda EXHAUSTED. Los fallos guardan `PROCESSING_FAILED`; los logs usan `PeriodicJobLog` con nombre/código/stack técnico y supresión de repetidos, sin mensajes de excepción, argumentos de Prisma, secretos ni payloads. Una avería de base que impida guardar el intento deja su estado anterior y se reintenta en el tick siguiente.

REVIEW identifica decisiones recuperables de catálogo/configuración o contacto; no consume reintentos automáticos. `ACCOUNT_CONFIG_CHANGED` exige comprobar que el ingreso pendiente pertenece a la cuenta ahora configurada. Los datos almacenados no se vuelven a interpretar desde un payload crudo inexistente.

## Inspección y reproceso de ADMIN

Disponible por la API autenticada de NestJS o por su BFF con sesión; no se agregó una pantalla de operación nueva. Las dos capas conservan sus controles. Ejemplo desde la consola del navegador **con sesión ADMIN abierta** en el CRM, sin copiar tokens:

```js
// Listado mínimo paginado; pageSize máximo 100.
await fetch('/api/crm/integrations/ycloud/events?status=REVIEW&page=1&pageSize=20')
  .then(r => r.json());
// Sustituir por el ID del listado.
const id = 'evt_synthetic_ejemplo';
await fetch(`/api/crm/integrations/ycloud/events/${encodeURIComponent(id)}`)
  .then(r => r.json());
// Después de resolver la causa. El navegador suministra el Origin habitual.
await fetch(`/api/crm/integrations/ycloud/events/${encodeURIComponent(id)}/retry`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
}).then(r => r.json());
```

El listado incluye ID, estado, código, intentos, fechas, lead vinculado y bandera enabled; no incluye teléfonos ni nombres. El detalle devuelve solo los campos minimizados del ingreso y los últimos 20 reintentos. VENDEDOR recibe 403 incluso si conoce el ID, y sin sesión se recibe 401. La autorización se verifica en guard y servicio. Para paginar se admiten `page`, `pageSize` y filtro `status`; no hay búsqueda por contacto ni exportación de inbox.

`POST .../:id/retry` permite solo REVIEW o EXHAUSTED: crea `YCloudInboundRetry` con actor, estado/código/intentos anteriores y fecha, y devuelve `{result:"queued"}`. Reinicia el contador del ciclo y la espera. PROCESSED, IGNORED y PENDING devuelven 409; tampoco se reintenta CONTACT_INSUFFICIENT o API_VERSION_UNSUPPORTED, que requieren datos/contrato adicionales. No hay endpoint para editar payload, forzar fusión, cambiar vendedor o ignorar una colisión.

Para SOURCE_UNAVAILABLE corregir código o reactivar la fuente, recrear `api` si cambió el entorno y reintentar. Para ambigüedad revisar los contactos por los flujos administrativos existentes y corregir sus datos; si no hay resolución inequívoca, mantener REVIEW. Una cartera histórica no se activa automáticamente: cualquier cambio de clasificación/responsable requiere la decisión comercial y sus rutas auditadas habituales. Registrar fuera de la bandeja las decisiones que no puedan resolverse por esas rutas; no editar SQL para forzar un vínculo.

## Pausa, retención y protección de datos

Para pausar: `YCLOUD_ENABLED=false` y recrear `api`. Se conserva toda entrada pendiente y se detiene su procesamiento. Los endpoints ADMIN siguen disponibles y pueden encolar reintentos, que esperan la reanudación. Un trabajo ya confirmado antes del reinicio conserva sus efectos; el apagado ordenado espera la transacción en curso. No es una cancelación retroactiva.

El receptor pausado devuelve 503; no es una cola de nuevos mensajes mientras esté deshabilitado. YCloud tiene reintentos limitados y puede suspender un endpoint con fallos sostenidos. Para pausas largas coordinar captura/replay autorizado con el proveedor antes de agotar sus entregas; al volver a habilitar comprobar también su estado en el panel. La guía oficial publica un objetivo de respuesta menor a 6 segundos y reintentos predeterminados espaciados hasta varias horas. El límite de firma no debe confundirse con ese período.

Política operativa de esta versión: conservar pendientes, REVIEW y EXHAUSTED hasta resolución; revisar esas poblaciones periódicamente con ADMIN. Para PROCESSED e IGNORED, minimizar **a los 90 días** teléfono/nombre/user ID y referral del inbox, conservando IDs, cuenta/número comercial, tipo/versión, fechas, estado, código, leadId y auditoría de reprocesos. No hay limpieza automática en esta entrega; el operador autorizado ejecuta la minimización por lotes, con respaldo y un conteo previo, sin exportar datos personales. Ejemplo revisable en PostgreSQL:

```sql
-- Conteo previo: no muestra contactos.
SELECT count(*) FROM ycloud_inbound_events
WHERE status IN ('PROCESSED','IGNORED')
  AND "receivedAt" < now() - interval '90 days'
  AND ("phoneKey" IS NOT NULL OR "profileName" IS NOT NULL
       OR "externalUserId" IS NOT NULL OR attribution IS NOT NULL);

-- Lote de 100; repetir hasta agotar el conteo autorizado.
WITH batch AS (
  SELECT id FROM ycloud_inbound_events
  WHERE status IN ('PROCESSED','IGNORED')
    AND "receivedAt" < now() - interval '90 days'
    AND ("phoneKey" IS NOT NULL OR "profileName" IS NOT NULL
         OR "externalUserId" IS NOT NULL OR attribution IS NOT NULL)
  ORDER BY "receivedAt", id LIMIT 100 FOR UPDATE SKIP LOCKED
)
UPDATE ycloud_inbound_events e
SET "phoneKey"=NULL, "profileName"=NULL, "externalUserId"=NULL, attribution=NULL
FROM batch WHERE e.id=batch.id;
```

No borrar filas, IDs de evento, messageId ni wamid: son tombstones de deduplicación. Un replay sigue sin producir captación después de minimizar. Las actividades del lead y sus datos tienen la política de la cartera; esta limpieza no los borra. Cualquier retención/eliminación distinta necesita coordinar la ventana de replay y obligaciones de privacidad. Los backups también contienen metadatos de contacto y requieren acceso restringido. No se envían registros a servicios de IA.

## Pruebas sintéticas

Las pruebas E2E se habilitan explícitamente con `CRM_TEST_DATABASE_URL`; rechazan hosts distintos de localhost/127.0.0.1 y bases distintas de `starter_test`. Cada suite aplica toda la cadena de migraciones en un schema aleatorio. No apuntar esta variable a la base del propietario.

```powershell
# En backend/, con una base starter_test desechable disponible:
$env:CRM_TEST_DATABASE_URL='postgresql://ycloud_test:synthetic-ycloud-test@127.0.0.1:5434/starter_test'
pnpm test:e2e --runInBand ycloud
pnpm test --runInBand ycloud
```

Para probar además el proxy completo en un despliegue de staging aislado, configurar en backend un WABA/número sintéticos (`123456789` y `+14155550100`), un secreto de prueba y `META_1` activo. Iniciar web y api de esa instancia. Cargar las mismas tres variables de firma/cuenta en el entorno de la terminal **sin imprimirlas** y ejecutar desde la raíz:

```powershell
node backend/scripts/send-ycloud-synthetic.cjs --url http://127.0.0.1:3000/webhooks/ycloud --id aceptacion-01
# Repetir: debe devolver duplicate y conservar un solo ingreso/lead.
node backend/scripts/send-ycloud-synthetic.cjs --url http://127.0.0.1:3000/webhooks/ycloud --id aceptacion-01
node frontend/scripts/verify-ycloud.mjs
```

El script usa exclusivamente el contacto sintético `+14155550198`, genera IDs trazables y firma actual; no imprime secreto ni cuerpo. Cambiar solo `--id` genera otro mensaje para el mismo contacto y debe vincularlo. Verificar por ADMIN estado PROCESSED, `leadId`, origen y actividad Sistema. Probar también recepción pausada y reanudación de pendientes. No ejecutar el script sobre producción para simular actividad comercial.

## Aceptación con un anuncio real

Esta comprobación requiere al propietario y **no fue ejecutada por el agente**. En un horario acordado:

1. Confirmar autorización del canal YCloud/Meta, cuenta, número, origen elegido, vendedor habilitado y URL HTTPS. Verificar estado del endpoint y reloj del servidor.
2. Desde un contacto de prueba autorizado, abrir un anuncio real de Meta que dirija a ese WhatsApp y **enviar** un mensaje. Un clic sin mensaje no debe crear un lead.
3. Comprobar entrega 200 en YCloud; buscar el ID en la API ADMIN; en un tick debería pasar de PENDING a PROCESSED o mostrar su causa concreta en REVIEW.
4. Verificar nombre/teléfono, origen configurado, responsable, estado/etapa NEW, modalidad NEW, fechas de captación y actividad Sistema con ID de anuncio. Confirmar que referral.source_id y ctwa_clid coinciden con el ingreso, sin atribuir nombres de campaña no consultados.
5. Reentregar el mismo evento desde el mecanismo autorizado de YCloud: mismo ingreso comercial y ninguna actividad repetida. Comprobar timestamp de firma vigente en reintentos tardíos/replay, sin registrar el secreto. Otro mensaje publicitario del mismo contacto debe vincularse sin modificar sus datos editados.
6. Acceder con el vendedor asignado y otro vendedor: solo el primero debe ver el lead/historial. Comprobar que el reporte cuenta una sola captación nueva.
7. Responder manualmente por WhatsApp/YCloud. Verificar que el CRM no envió mensajes. Registrar fecha, IDs técnicos, resultado y responsable de la aceptación sin copiar conversaciones ni datos personales a Git.

## Diagnóstico rápido

| Síntoma | Comprobación y acción |
| --- | --- |
| 401 | Secreto del endpoint correcto, reloj sincronizado, cabecera intacta, bytes sin cambios, timestamp de entrega vigente. No firmar JSON reserializado. |
| 403 | WABA y número `to` corresponden exactamente al entorno configurado. |
| 400 | Revisar nombres de campos, formato de fecha/IDs y límites; una extensión nueva se ignora, un campo requerido inválido se rechaza. |
| 503 deshabilitado | Cambiar la bandera y recrear api cuando corresponda; controlar reintentos/suspensión en YCloud. |
| 503 almacenamiento / PENDING que no avanza | Disponibilidad PostgreSQL, migración aplicada, fila assignment_state y contención por importaciones; logs técnicos `ycloud-*`. |
| ACCOUNT_CONFIG_CHANGED | La cuenta o el número cambiaron después de guardar el ingreso. Revisar el entorno original antes de reintentar. |
| SOURCE_UNAVAILABLE | Catálogo existente y activo, código exacto; no crear fuente automáticamente. Corregir y reencolar como ADMIN. |
| CONTACT_AMBIGUOUS / CONTACT_HISTORICAL | Resolver por administración comercial; no crea ni reasigna leads de forma arbitraria. |
| CONTACT_INSUFFICIENT | Falta teléfono válido; un BSUID no basta para identificar un lead. Mantener revisión. |
| IGNORED | Revisar EVENT_OUT_OF_SCOPE, MESSAGE_OUT_OF_SCOPE u ORGANIC_MESSAGE; no son fallos transitorios. |
| EXHAUSTED | Corregir causa técnica, consultar detalle y reintentar como ADMIN; el historial del ciclo anterior se conserva. |
| No llegan eventos | Suscripción exacta, endpoint activo y público, certificado, reverse proxy/CDN, número/cuenta correctos; un anuncio sin mensaje no genera captación. |
| Lead sin responsable | No hay vendedor habilitado o existen pendientes anteriores; consultar reglas actuales y la recuperación de reparto. |

## Archivos, verificación y límites de entrega

### Ampliación local verificada el 19 de noviembre de 2026

| Comando / escenario | Resultado |
| --- | --- |
| `pnpm -C backend test --runInBand` | 116 pruebas, 17 suites aprobadas. El primer intento falló en 2 PDF por `pypdf` ausente; pasó reutilizando la caché preexistente: `$env:PYTHONPATH=(Resolve-Path backend/.cache/ycloud-test-python).Path`. Sin instalar paquetes. |
| `pnpm -C backend test:e2e --runInBand ycloud` con `CRM_TEST_DATABASE_URL` local aislada | 20 pruebas aprobadas. Incluyen excepción apagada, permitidos/excluidos, firma/cuenta/receptor, deduplicación, vínculo, atribución, permisos, pendientes diferidos, retiro de remitente, reintento ADMIN y fila antigua sin marca de prueba. |
| `pnpm -C backend prisma:generate`, `pnpm -C backend exec prisma validate` | Cliente Prisma 6.19.3 generado y esquema válido. Migraciones completas aplicadas en schemas nuevos de una instancia PostgreSQL **17.4** exclusiva, base `starter_test`, puerto loopback 55494. No se accedió a la base habitual. |
| Backend y frontend: `lint`, `typecheck`, `format:check`, `build` | Aprobados con los scripts existentes; sin cambios de dependencias. |
| `node --test scripts/ycloud-webhook-proxy.test.mjs` | Aprobado: rutas/métodos, cuerpo exacto y alterado, Unicode, no reenvío de credenciales, límites normales/chunked, timeout y upstream caído. |
| `node frontend/scripts/verify-ycloud.mjs` y `node frontend/scripts/verify-crm-profile.mjs` | Relay, sesión/origen, validación, errores y aislamiento del perfil aprobados. |
| `node scripts/verify-ycloud-live.mjs` con la misma base descartable | Proxy local → Next.js compilado → NestJS compilado con `NODE_ENV=production` → PostgreSQL; anuncio sintético y mensaje sin anuncio permitido, worker, duplicados, marca durable/actividad y consulta ADMIN. Un primer arranque agotó el tiempo de readiness; la repetición y el harness ampliado pasaron. No es una entrega real del proveedor. |
| Compose principal y override: `config --quiet` y comprobaciones sobre JSON mantenido en memoria | Válidos. Se comprobó que producción fuerza excepción falsa/lista vacía aun heredando `true`, y que el override usa proyecto separado, `starter_test` y puertos de prueba. No se imprimió configuración expandida. |
| `node --check backend/scripts/send-ycloud-synthetic.cjs`, `node --check scripts/verify-ycloud-live.mjs`, `git diff --check` | Sin errores. |

Limitaciones actuales: Node disponible **24.13.0**, inferior al mínimo 24.15.0 y al declarado 24.22.1; repetir validación en el runtime soportado. Docker Compose pudo validar configuración, pero el daemon Docker no está disponible y no se ejecutaron contenedores ni health checks. PostgreSQL 16.15 del Compose queda pendiente de prueba en Docker. `cloudflared` no está en PATH y no se abrió túnel. La entrega real de WhatsApp/YCloud y la aceptación productiva con anuncio necesitan intervención del propietario. No se modificaron secretos, migraciones previas ni datos habituales; no se enviaron mensajes ni se activaron campañas.

Para retirar solo esta ampliación operativa, apagar primero la excepción y recrear todos los workers, detener proxy/túnel y dejar de cargar el override local. Conservar la migración nueva, la marca de procedencia y las auditorías; no borrar columnas, bandeja ni leads para deshabilitar pruebas. La integración publicitaria existente puede seguir habilitada.

### Verificación anterior de la integración base

El módulo cohesivo vive en `backend/src/integrations/ycloud/`: config, guard, mapping, HTTP setup, controllers, DTO, service y module. Se registra en AppModule; CrmModule exporta CrmService. La extracción comercial mínima mantiene ADMIN en los métodos humanos y comparte el backfill con Excel. El esquema agrega `YCloudInboundEvent` y `YCloudInboundRetry`, relaciones restringidas e índices. Next.js aporta el relay dedicado, las rutas ADMIN permitidas en el BFF y la actividad en el perfil.

Pruebas: `backend/src/integrations/ycloud/ycloud.spec.ts`, `backend/test/ycloud.e2e-spec.ts`, `frontend/scripts/verify-ycloud.mjs`. El script `backend/scripts/send-ycloud-synthetic.cjs` permite pruebas operativas sin API de envío. El harness `scripts/verify-ycloud-live.mjs` inicia las dos aplicaciones compiladas en puertos 3340/3341 contra otro schema aleatorio de la misma base desechable, prueba el relay y las detiene al terminar. Se ejecuta con `CRM_TEST_DATABASE_URL` después de ambos builds: `node scripts/verify-ycloud-live.mjs`.

Resultados ejecutados el 17 de noviembre de 2026:

| Comando / escenario | Resultado final |
| --- | --- |
| `pnpm -C backend format:check`, `lint`, `typecheck`, `build` | Pasaron. |
| `pnpm -C backend test --runInBand` | **111 pruebas**, 17 suites aprobadas. |
| `pnpm -C backend test:e2e --runInBand` | **74 pruebas**, 7 suites aprobadas. |
| `pnpm -C backend prisma:generate` y `pnpm -C backend exec prisma validate` | Pasaron. Para evitar la DLL en uso en Windows, se copió el mismo motor instalado a `.cache` con otro nombre y se definió `PRISMA_QUERY_ENGINE_LIBRARY` solo durante generate, sin detener procesos existentes. |
| Migraciones desde cero en PostgreSQL 16.15 | Aplicadas en schemas aleatorios de un contenedor exclusivo starter_test; base habitual intacta. |
| `docker compose config --quiet` | Pasó con valores sintéticos temporales para variables obligatorias. |
| `pnpm -C frontend typecheck`, `lint`, `format:check` | Pasaron. |
| `pnpm -C frontend exec next build` | Build de producción aprobado, incluida `/webhooks/ycloud`. El paquete no tiene script build: se usó la CLI instalada. |
| `node frontend/scripts/verify-ycloud.mjs` | Pasó: bytes, firma, límites por bloques, errores, sesión y origen. |
| `node frontend/scripts/verify-crm-profile.mjs` y `verify-reports.mjs` | Pasaron las regresiones de perfil y BFF comercial. |
| `node scripts/verify-ycloud-live.mjs` | Pasó con ambas aplicaciones compiladas, PostgreSQL, worker, duplicados, historial Sistema y consulta ADMIN por BFF. |
| `node --check backend/scripts/send-ycloud-synthetic.cjs` | Sintaxis válida; el envío manual de ese script queda disponible para el operador. |
| Diff y revisión de datos | Sin errores de git diff --check ni patrones de secretos detectados; manifiestos/lockfiles intactos. |

El primer test unitario completo falló en dos pruebas PDF existentes porque faltaba pypdf. Se preparó **pypdf 6.1.1** únicamente en caché ignorada de pruebas y se repitió con PYTHONPATH apuntando a la ruta absoluta `backend/.cache/ycloud-test-python`: las 111 pruebas pasaron. No se agregó una dependencia productiva. Los logs de ERROR en E2E corresponden a fallos inyectados; las pruebas comprueban su recuperación. No se reiniciaron servicios habituales del propietario.

Matriz de requisitos verificados:

| Área | Evidencia automatizada |
| --- | --- |
| Firma, timestamp, bytes alterados, espacios y Unicode | Unitarias del guard y solicitudes HTTP reales del E2E; relay compilado en harness. |
| Cuenta, número, esquema, límites y extensiones | E2E con 400/403/413/415 y extensión de 110 KiB aceptada sin almacenarse. |
| Configuración vacía deshabilitada / incompleta habilitada | Unitarias Joi por cada campo obligatorio; E2E de pausa/reanudación. |
| Captación, orgánicos, tipos excluidos y eventos desconocidos | Unitarias del mapping y estados durables del E2E. |
| ID de evento, mensaje, wamid y concurrencia | Restricciones aplicadas en PostgreSQL; entregas simultáneas y dos workers. |
| Contactos normalizados, legacy, múltiples e históricos | E2E con backfill, vinculación y revisión sin sobrescritura. |
| Origen inicial y fuentes del catálogo | E2E con fuente válida/inactiva/inexistente y código BASE_uuid; fechas y atribución previas intactas. |
| Reparto, ausencia de candidatos y pendientes anteriores | E2E YCloud más regresión comercial existente. |
| Rollback, errores SQL, espera, agotamiento, recuperación y reinicio | E2E con fallo después del alta, división por cero PostgreSQL, reintento auditado y lifecycle de nuevo worker. |
| ADMIN, vendedores e historial | E2E de consulta/retry administrativo, rechazo a vendedor y ámbito de lead/historial; regresiones de CRM/reportes/importaciones. |
| Topología privada y BFF | Configuración Compose silenciosa, test del relay y harness de Next.js → NestJS → PostgreSQL sin secretos en web. |

Revisión visual ejecutada con el CRM de prueba aislado: perfil a 1280×720 y 390×844, actividad YCloud legible con actor Sistema, anuncio, fecha del mensaje y atención manual; estados vacíos de agenda/importaciones/adjuntos conservados. Escape cierra el modal y devuelve el foco al lead; Enter lo reabre con foco visible. Se restableció el viewport al terminar. La aceptación real, TLS del servidor del propietario y replay tardío del panel dependen de su configuración y credenciales. El entorno de ejecución disponible fue **Node 24.13.0**, por debajo del mínimo declarado 24.15.0 y de `.nvmrc` 24.22.1; pnpm emitió esa advertencia. Repetir validación en el runtime declarado antes del despliegue.

Límites operativos: la limpieza a 90 días es un procedimiento manual; no hay panel de revisión específico ni resolución forzada de contactos. La activación real, publicación HTTPS y migración sobre la base habitual requieren el despliegue autorizado del propietario. No se ejecutan envíos a contactos ni llamadas a YCloud/Meta desde este código.

Para retirar la funcionalidad, primero pausar recepción/procesamiento y coordinar entregas con YCloud. Revertir módulo/import en AppModule, setup raw HTTP, extracción de CrmService/backfill, configuración/env/Compose, relay/BFF e interfaz junto con sus pruebas/documentación. No revertir cambios ajenos. Conservar las tablas y la migración aplicada como historial; no hacer DROP ni editar migraciones aplicadas para desactivar una integración. Los leads ya creados y auditorías son datos comerciales y se conservan.

## Fuentes oficiales contrastadas

Consultadas el 17 de noviembre de 2026:

- [Configurar webhooks de YCloud](https://docs.ycloud.com/en/api-reference/guides/api-fundamentals/configure-webhooks): registro y suscripción.
- [Implementar un receptor](https://docs.ycloud.com/en/api-reference/guides/api-fundamentals/implement-a-webhook-receiver): contrato de firma, aceptación durable y reentregas.
- [Ejemplos inbound, incluidos anuncios CTWA](https://docs.ycloud.com/en/api-reference/guides/examples/webhook-examples/whatsapp-inbound-message-webhook-examples): sobre, whatsappInboundMessage y referral.

Los valores de tamaño, tolerancia, backoff interno, tipología admitida y retención son decisiones de esta aplicación; no se presentan como límites comerciales del proveedor.
