# Actualizar InfoPrepaga en el VPS

## Primera vez

Una vez que los scripts estén publicados en `origin/main`, abrí la sesión SSH habitual como `deploy` y traelos al checkout existente del VPS.

```bash
cd ~/infoprepaga-crm
git status --short
git pull --ff-only origin main
```

Si `git status --short` muestra cambios del servidor, revisalos antes de seguir. La instalación usa el `.env` del VPS y requiere que PostgreSQL esté en ejecución.

## Actualizaciones de todos los días

Después de subir tus cambios a `main`, ejecutá desde PowerShell en la raíz del repo local:

```powershell
.\scripts\deploy.ps1
```

Si ya estás conectado al VPS, el comando equivalente desde `~/infoprepaga-crm` es `bash scripts/deploy.sh`. Usá la llave SSH habitual y completá cualquier solicitud de frase de paso o `sudo` desde la terminal.

El script toma un bloqueo para evitar despliegues simultáneos, actualiza `main` por fast-forward, valida Compose y compila las imágenes. Comprueba el historial de Prisma contra la base activa antes de recrear servicios. Compose conserva el volumen de PostgreSQL y espera la salud de los servicios. El script imprime el commit y verifica que `/api/health` responda HTTP 200 por HTTPS. Puede haber una interrupción breve mientras Compose reemplaza la API o el frontend.

## Versiones con migraciones

Si Prisma detecta migraciones pendientes, revisá qué SQL va a aplicar, probalo en una base aislada y definí cómo recuperar el servicio antes de autorizar su ejecución en producción. Si informa problemas de conexión, divergencias o una migración fallida, resolvé esa causa antes de continuar.

Una vez aprobada la migración, ejecutá:

```powershell
.\scripts\deploy.ps1 -AllowMigrations
```

Desde el VPS se usa `bash scripts/deploy.sh --allow-migrations`. Este modo genera un dump de PostgreSQL en `~/infoprepaga-backups` y comprueba que su catálogo sea legible antes de levantar la versión. El directorio contiene datos de producción. La copia local respalda este despliegue y la prueba de restauración se realiza en una base aislada.

## Si falla una actualización

El commit del checkout puede haber avanzado antes del error. Después de resolver la causa, podés repetir el mismo comando incluso si `main` ya está actualizado. Para consultar el estado en el VPS, usá:

```bash
cd ~/infoprepaga-crm
sudo docker compose -f compose.yaml ps -a
sudo docker compose -f compose.yaml logs --no-color --tail=100 migrate
sudo docker compose -f compose.yaml logs --no-color --tail=100 api web
```

Si la base quedó migrada, verificá la compatibilidad del esquema antes de volver a una versión anterior del código.
