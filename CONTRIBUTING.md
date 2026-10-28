# Desarrollo de InfoPrepaga

Este repositorio contiene el frontend Next.js y la API NestJS del CRM. El README describe el arranque local, las versiones, las variables de entorno y el bootstrap administrativo. La base técnica no implementa todavía los módulos comerciales.

## Empezar desde un clon

1. Clonar `https://github.com/NicoEspin/InfoPrepaga.git` e instalar Node según `.nvmrc` y pnpm según los manifiestos.
2. Leer `AGENTS.md`, el README y la documentación del módulo que se va a modificar. Las instrucciones raíz prevalecen sobre las recetas de los starters.
3. Configurar los archivos de entorno desde `.env.example`, `backend/.env.example` y `frontend/.env.example`, sin publicar credenciales. Seguir el README para elegir la base de desarrollo, aplicar migraciones y crear el primer administrador.
4. Instalar en cada paquete con `pnpm install --frozen-lockfile`. No hace falta un workspace raíz. No se requieren los respaldos ni las herramientas privadas de la máquina original.

## Instrucciones y skills incluidas

`AGENTS.md` contiene arquitectura, alcance, permisos y flujo de trabajo; `CLAUDE.md` lo incorpora para Claude Code. Las 10 skills del proyecto y sus recursos están versionados en `.agents/skills/`, con procedencia en `skills-lock.json`. `.claude/skills/` ofrece las mismas skills para Claude; en la máquina original estas carpetas pueden ser junctions de Windows, pero Git debe publicar sus archivos, nunca rutas absolutas del equipo.

El frontend conserva además las skills y referencias de su starter en `frontend/.agents/`, `frontend/.claude/`, `frontend/AGENTS.md` y `frontend/CLAUDE.md`. Ante cualquier discrepancia, seguir las reglas raíz: identidad y persistencia en NestJS, datos sintéticos solo en demos autorizadas y ninguna conexión de Next.js a Prisma/PostgreSQL.

## Validar un cambio

Ejecutar desde la raíz los comandos de la sección **Verificación** del README. El CI en `.github/workflows/ci.yml` ejecuta formato, lint, tipos, tests del backend y builds de ambos paquetes. El build del frontend usa `BUILD_STANDALONE=true`. La revisión de dependencias de producción se mantiene en CI para ambos paquetes.

Los harness de integración real y Docker se ejecutan aparte con una base local descartable `starter_test`. Los tests unitarios y el e2e básico no sustituyen esas comprobaciones. Cada futura funcionalidad comercial requiere pruebas positivas y negativas de autorización por registro.

Trabajar en una rama, revisar el diff antes del commit y describir en el PR el comportamiento, los comandos ejecutados y cualquier límite de verificación. Mantener tests y documentación junto al cambio. Conservar licencias y atribuciones de los starters en cada paquete.

## Preparar un despliegue

Seguir el Compose y la sección de despliegue del README. El CI no despliega ni modifica bases de producción. Configurar HTTPS, secretos propios y el origen exacto del navegador; revisar migraciones antes de aplicarlas. Completar la configuración del proxy/rate limit y una estrategia de backups con restauración probada. Las demos siguen deshabilitadas en producción y no deben presentarse como funcionalidades reales del CRM.
