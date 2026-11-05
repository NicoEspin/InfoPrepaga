# Respuestas de la interfaz y recuperación de errores

Pasada de experiencia de uso del 3 de noviembre de 2026 sobre Leads, perfil, Seguimientos y Administración. Conserva contratos, permisos y persistencia del CRM.

## Comportamiento

- Carga inicial: esqueletos con anuncio accesible en listados, formularios y perfil. Se conserva el indicador de navegación existente.
- Actualización: indicador en el botón existente, sin cambios de ancho ni solicitudes repetidas mientras está ocupado. La paginación se bloquea durante la consulta.
- Error de consulta: mensaje en español y reintento explícito. Los estados vacíos ofrecen contexto y limpieza de filtros; el calendario distingue carga/error de ausencia de tareas.
- Guardado: controles del formulario bloqueados mientras se confirma, protección síncrona contra doble envío y confirmación global que permanece al cerrar el modal.
- Fallo de guardado: se conservan los campos para revisar. Ante un fallo de red se indica actualizar antes de volver a guardar, porque una respuesta perdida no permite asegurar si el servidor confirmó la escritura. No se reintentan mutaciones automáticamente.
- Perfil: botones indican qué acción está en curso, contador de nota de 500 caracteres, historial vacío y reintentos independientes. Se evita cerrar el perfil durante una escritura pendiente.
- Tareas: elegir un lead oculta contacto/responsable independientes; la selección se conserva al buscar otras opciones y el backend mantiene la autoridad del vínculo.
- Accesibilidad: estados anunciados, etiquetas en español, navegación con teclado y movimiento reducido en esqueletos e indicadores. Las pantallas de error de Next.js incluyen recuperación sin mostrar excepciones internas.

## Verificación

Con Node 24.22.1 y pnpm 10.32.1:

```powershell
pnpm -C frontend format:check
pnpm -C frontend lint:strict
pnpm -C frontend typecheck
node --experimental-strip-types frontend/scripts/verify-crm-profile.mjs
$env:BUILD_STANDALONE='true'
pnpm -C frontend build
```

Los chequeos anteriores pasaron. El script de perfil verifica además errores de red, respuesta HTML 503, JSON inválido, cuerpo nulo, respuesta 204, cancelación, doble envío en el mismo ciclo y liberación del bloqueo tras un fallo.

La carga permanece dentro de las pantallas: un `loading.tsx` en todo el grupo adelantaba el inicio de streaming y convertía una respuesta 404 administrativa en 200. Se retiró ese límite después de detectarlo en el harness, conservando la comprobación de acceso previa a la respuesta.

El harness `node scripts/verify-crm.mjs` pasó sus 27 comprobaciones con PostgreSQL temporal y la compilación de producción. Se reconstruyeron los artefactos locales faltantes antes de ejecutarlo; no se modificó la base habitual. En navegador se comprobaron el estado inicial de carga, la conservación del nombre tras un error de validación, la confirmación visible después de guardar/cerrar, la selección de lead con búsqueda y el cierre con Escape con foco de vuelta en «Nueva tarea». No se observaron errores ni advertencias de consola. Los servidores de prueba y PostgreSQL temporal se detuvieron al terminar.

## Límites conservados

La renovación automática de sesión y el calendario agregado para grandes volúmenes siguen como mejoras de fondo en [deuda técnica](technical-debt.md). Esta pasada no cambia la autenticación ni la autorización del backend y no agrega dependencias al proyecto. Los cambios concurrentes de adjuntos/R2 corresponden a otra unidad de trabajo.
