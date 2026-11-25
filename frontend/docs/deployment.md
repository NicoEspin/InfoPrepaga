# Despliegue del frontend preparado

La configuración soportada usa Node 24.22.1, pnpm 10.32.1 y el Dockerfile principal. El frontend produce una salida standalone y ejecuta como usuario no root. Las fuentes se incluyen localmente.

La [guía raíz](../../README.md) documenta el stack completo, las variables y los límites operativos. El [Compose raíz](../../compose.yaml) conecta Next.js con NestJS mediante `BACKEND_URL=http://api:3001`, sin publicar la API ni PostgreSQL.

- Definir `APP_ORIGIN` con la URL HTTPS exacta del navegador.
- Mantener secretos y `.env` fuera de las imágenes y del repositorio.
- Usar un proxy HTTPS delante del puerto de loopback del frontend.
- Las demos están bloqueadas en producción, incluso si se define `ENABLE_STARTER_DEMOS=true`.
- No existen integraciones Clerk ni Sentry en esta adaptación.
- El endpoint `/api/health` verifica la conexión real al backend y la disponibilidad de PostgreSQL.

Validar configuración con `docker compose config --quiet` desde la raíz. No publicar credenciales al inspeccionar la configuración expandida. No ejecutar seeds al iniciar servicios.

Las imágenes y su ejecución conjunta se verificaron en un stack Docker aislado, incluidos los health checks y el reinicio. El [informe de auditoría](../../docs/starter-audit.md) registra los comandos y resultados.

## Webhook YCloud en el despliegue privado

La integración opcional usa `https://crm.example.com/webhooks/ycloud` en el mismo frontend público. Su ruta Next.js transmite bytes/cabecera de firma a la API privada, sin cookies ni destinos variables. El reverse proxy HTTPS del host debe llegar al puerto loopback de `web`, permitir POST JSON de hasta 128 KiB y conservar `YCloud-Signature`. El resto del proxy comercial conserva sesión y origen. Las variables `YCLOUD_*` se entregan solo a `api` desde Compose. Ver [configuración, ejemplo Nginx, pausa y aceptación](../../docs/ycloud-integration.md). No se expone la base ni la API completa para recibir el webhook.

Para pruebas locales sin campañas, seguir la guía YCloud: proyecto/base separados, fuente «Prueba YCloud», override `compose.ycloud-test.yaml` explícito y proxy local que publica solo el webhook por Quick Tunnel. En producción usar únicamente `compose.yaml`: fija `YCLOUD_ALLOW_NON_AD_TEST_MESSAGES=false` y `YCLOUD_TEST_SENDERS` vacío, independientemente de `NODE_ENV`. Activar `YCLOUD_ENABLED` cuando el canal definitivo esté preparado; verificar por ADMIN la excepción apagada antes de procesar ingresos. No copiar el entorno ni los datos del despliegue de prueba.
