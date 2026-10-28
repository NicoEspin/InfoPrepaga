# Starter full stack publicado

El starter reutilizable está en [NicoEspin/Nest_Next_StarterTemplate](https://github.com/NicoEspin/Nest_Next_StarterTemplate), rama `main`, con la opción **Template repository** activada. La publicación inicial corresponde al commit `97c8b73e2852884f6c77453c601d1273632ba0f4`.

Para iniciar otro sistema, usar **Use this template → Create a new repository** y seguir el README del repositorio nuevo. Cada proyecto debe tener sus propias credenciales, base de datos, volúmenes y reglas de autorización.

## Estado de esta carpeta

- `frontend/` y `backend/` conservan el código y la configuración local de InfoPrepaga.
- La raíz tiene un repositorio propio cuyo remoto es `https://github.com/NicoEspin/InfoPrepaga.git`. El backend forma parte de este repositorio, sin `.git` anidado. Su historial anterior se conservó localmente en `.starter-baseline/backend-original.git`; no fue publicado.
- La copia usada para publicar está en `.starter-tools/Nest_Next_StarterTemplate/`, con su propio `.git` y remoto del template. No usarla para desarrollar InfoPrepaga.
- `.starter-baseline/` y `.starter-tools/` están excluidos del repositorio del CRM. No son necesarios para trabajar desde un clon nuevo.

## Validación de la publicación

Con Node 24.22.1 y pnpm 10.32.1 pasaron formato, lint, tipos y builds de ambos paquetes; 23 tests unitarios y 1 e2e del backend; validación del esquema Prisma y de ambos archivos Compose; revisión del índice de Git sin archivos de entorno locales, dependencias, builds ni repositorios anidados. No se modificaron los esquemas, migraciones ni reglas de autenticación. Esta publicación no repitió los harness con una base de datos real ni el arranque de contenedores.

GitHub Actions también pasó en la [ejecución inicial del CI](https://github.com/NicoEspin/Nest_Next_StarterTemplate/actions/runs/40760965006).
