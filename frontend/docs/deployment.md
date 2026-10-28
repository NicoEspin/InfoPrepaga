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
