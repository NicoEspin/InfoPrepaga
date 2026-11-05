# Archivos del perfil comercial

Los perfiles comerciales reales (identificadores UUID) permiten subir, listar con paginación, descargar, renombrar y eliminar adjuntos. NestJS valida la sesión y la asignación del lead en cada operación. ADMIN accede a todos; VENDEDOR solo a los leads asignados. Los perfiles de demostración siguen usando adjuntos temporales locales.

## Activación

1. Crear un bucket **privado** en Cloudflare R2, sin acceso público ni dominio público. Crear credenciales S3 con lectura y escritura de objetos restringidas a ese bucket.
2. Completar estas variables en `backend/.env` (no en el frontend):

   ```dotenv
   R2_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET_NAME=
   ```

3. Aplicar la nueva migración al entorno elegido mediante el procedimiento habitual: `pnpm -C backend prisma:deploy`. Generar el cliente con `pnpm -C backend prisma:generate` y reconstruir/reiniciar el backend y frontend. No se aplicaron migraciones a la base de trabajo durante la implementación.
4. Verificar con un archivo sintético: subir, descargar, renombrar y eliminar desde un lead; confirmar en R2 que desapareció el objeto. Repetir la prueba con un vendedor sin acceso al lead.

No hacen falta variables `NEXT_PUBLIC_*`, URL pública ni CORS en R2: las subidas pasan por Next.js y NestJS. La descarga usa una URL firmada. En despliegues con Docker Compose, completar las mismas cuatro variables en el `.env` raíz: `compose.yaml` las entrega únicamente al servicio `api`. El proxy debe admitir cuerpos multipart de al menos 11 MB y tiempos de respuesta compatibles con las operaciones de almacenamiento.

Sin estas variables el CRM inicia normalmente y permite consultar los adjuntos registrados; las operaciones de almacenamiento responden 503 hasta configurar R2. No se modifican archivos `.env` existentes.

La integración usa el [SDK S3 v3 compatible con R2](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) con región `auto` y el endpoint derivado del identificador de cuenta. Las [URLs firmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) vencen a los 60 segundos y deben tratarse como credenciales temporales: quien recibe una puede usarla hasta que venza, incluso si el lead se reasigna durante ese minuto.

## Contrato de API

El navegador usa `/api/crm/leads/:leadId/attachments`; NestJS expone `/crm/leads/:leadId/attachments`.

| Método y sufijo | Entrada | Respuesta |
| --- | --- | --- |
| `POST /` | Multipart con un único campo `file` | Metadatos del adjunto listo (201) |
| `GET /?page=1&pageSize=10` | Página, máximo 100 filas | `{items,total,page,pageSize}` |
| `PATCH /:id` | `{name,version}` | Metadatos, versión incrementada; 409 si cambió |
| `GET /:id/download` | Sin cuerpo | `{url,expiresIn:60}`; solo archivos READY |
| `DELETE /:id` | Sin cuerpo | `{deleted:true}` después de confirmar el borrado en R2 |

Metadatos públicos: `id`, `leadId`, `name`, `contentType`, `size`, `state`, `version`, `createdAt`, `updatedAt`. El listado no expone claves de objetos ni credenciales. Se devuelve 404 para adjuntos inexistentes o fuera del alcance del usuario. Las mutaciones del BFF exigen el origen configurado y cookies de sesión; la API exige JWT válido y rol comercial.

Se admiten PDF, PNG y JPEG no vacíos de hasta 10 MiB. El servidor reconoce sus cabeceras binarias; no confía en el MIME indicado por el navegador. Esto no equivale a un antivirus ni a validar completamente el documento. Se descargan como `application/octet-stream` con disposición `attachment`, sin vista previa incrustada. Los nombres tienen hasta 180 caracteres y no admiten separadores de ruta ni controles. Renombrar cambia el nombre visible y el de descarga; la clave del objeto permanece estable. Actualizar el contenido requiere subir un nuevo adjunto y eliminar el anterior.

## Consistencia y recuperación

PostgreSQL y R2 no comparten transacciones. Cada carga guarda primero una referencia `UPLOADING` con clave aleatoria sin datos personales. Solo pasa a `READY` después del PUT confirmado. Si hay un corte o una respuesta incierta, la referencia permanece visible: actualizar la lista y eliminarla antes de volver a subir. La eliminación también funciona si el objeto nunca llegó a crearse.

El borrado persiste primero `DELETING`, luego ejecuta `DeleteObject` y solo después elimina los metadatos. Si falla R2 o el commit final, la referencia permanece y permite reintentar la eliminación, incluso tras reiniciar el servidor. No hay borrado automático en segundo plano: los estados pendientes requieren reintentar desde el perfil. La eliminación es irreversible; no hay papelera.

Las escrituras comparten el bloqueo de asignación del CRM para evitar cambios de propietario durante las operaciones. Las peticiones R2 tienen timeout de 6 segundos sin reintentos automáticos y mantienen ese bloqueo mientras confirman el almacenamiento; una falla puede demorar brevemente otras escrituras comerciales. Una respuesta perdida o un timeout remoto requiere verificar el estado y reintentar; no hay garantía de transacción distribuida ante interrupciones extremas.

La FK de adjuntos restringe eliminar directamente un lead con archivos asociados. No se agregó un endpoint de borrado de leads. Las operaciones confirmadas agregan eventos al historial con el identificador del adjunto, sin nombres ni contenido sensible.

## Verificación

`backend/test/attachments.e2e-spec.ts` aplica todas las migraciones a un esquema nuevo de `localhost/starter_test`, prueba sesiones reales, CRUD, aislamiento entre vendedores, reasignación, validación y recuperación ante errores. R2 se sustituye por un almacenamiento simulado para no necesitar credenciales ni transferir datos. `backend/src/crm/r2.service.spec.ts` verifica la configuración ausente y firmas de descarga sin red. La conectividad con el bucket real debe verificarse después de configurar el entorno.

Verificación del 3 de noviembre de 2026:

| Comando | Resultado |
| --- | --- |
| `pnpm -C backend prisma:generate` y `pnpm -C backend exec prisma validate` | Cliente Prisma 6.19.3 generado y esquema válido |
| `pnpm -C backend lint`, `typecheck` y `build` | Pasaron |
| `pnpm -C backend test --runInBand` | 25 pruebas pasaron |
| `pnpm -C backend test:e2e --runInBand attachments.e2e-spec` con `CRM_TEST_DATABASE_URL` descartable | 7 pruebas de adjuntos pasaron; migraciones aplicadas en esquemas nuevos |
| `pnpm -C backend test:e2e --runInBand` con la misma base descartable | 14 pasaron y 1 falló en la prueba comercial existente `enforces scope for search, detail, history, notes, editing and task counts`: la búsqueda por nombre esperaba total 0 y recibió 1 (`backend/test/crm.e2e-spec.ts:226`). No se modificó esa prueba |
| `pnpm -C frontend typecheck`, `lint:strict` y `build` | Pasaron en la verificación final |
| `node --experimental-strip-types frontend/scripts/verify-attachments.mjs` | Pasó: multipart, CRUD del proxy, sesión, origen y límites |
| `node --experimental-strip-types frontend/scripts/verify-crm-profile.mjs` | Pasó: perfil, caché por identidad, errores, cancelación y doble envío |
| Prettier backend / oxfmt frontend sobre los archivos de la integración | Pasaron |
| `docker compose --env-file .env.example config --quiet` | Configuración válida; no se arrancaron contenedores (daemon no disponible) |
| `git diff --check` | Pasó |

El runtime disponible fue Node 24.13.0 y pnpm 10.32.1. pnpm advirtió que Node es anterior al mínimo declarado (24.15.0); no se modificó el runtime del equipo. La comprobación directa de firmas y la simulación R2 no verifican las credenciales ni el bucket real.
