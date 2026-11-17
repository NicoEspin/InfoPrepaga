# Auditoría visual del CRM

Leads es el piloto para los listados comerciales. La revisión tomó como referencia las reglas de [DESIGN.md](../DESIGN.md) y los recorridos de recuperación de [frontend-feedback.md](../../docs/frontend-feedback.md). Las seis capturas aprobadas y el análisis de Airtable mencionado en el diseño no estaban disponibles en el árbol revisado. Queda pendiente cotejar las capturas del piloto con esos originales.

## Rutas y tokens

El grupo `src/app/(crm)` monta `DemoLayout` con `preview={false}`. Ese shell provee el encabezado de navegación, el sidebar y la sesión. `CrmContent` y `crm-workspace.css` definen el área de trabajo. `PageContainer` se usa en las pantallas del starter. Los nuevos encabezados del CRM conservan el espaciado de 16 px en móvil y 24 px en escritorio.

El tema inicial `vercel` del layout raíz aporta Geist, un fondo claro y tokens de superficie neutros. Antes del piloto, también usaba negro para la acción principal y un sidebar claro. El shell comercial ahora usa los tokens de Tailwind para dar acento verde a `primary` y `ring`, un fondo oscuro a la navegación y más contraste a `input`. Las superficies, la tipografía, el tema seleccionado y el modo siguen viniendo del shell general. La región de tabla reutiliza `Table` y permite desplazarla con teclado dentro de su propio contenedor.

## Hallazgos y patrón aplicado

| Pantalla y componente activo | Inconsistencia e impacto | Patrón |
| --- | --- | --- |
| Navegación del CRM · `layout/header.tsx` y `crm-workspace.css` | El tema inicial dejaba el menú lateral claro y la acción principal en negro. El selector de tema desbordaba el encabezado de Seguimientos a 390 px. | Tokens de navegación y foco aplicados al shell comercial. Selector compacto en móvil con nombre accesible y el tema activo visible. |
| Leads · `/leads`, `crm/components/leads.tsx` | Controles de ancho variable y sin etiquetas persistentes. En móvil, editar requería desplazarse hasta la última columna. El vacío de una búsqueda se presentaba dentro de una tabla ancha. | Encabezado con acción principal, filtros etiquetados y limpieza visible. Apertura por nombre y menú de edición junto al nombre, estado y responsable al principio de la tabla, selección rotulada y acciones masivas al seleccionar. Vacío fuera de la tabla, carga y reintento por separado. |
| Perfil · `crm/components/profile.tsx`, diálogo abierto desde Leads y otras rutas | El estado era texto en negrita y procedencias y adjuntos desplazaban las tareas, notas e historial. Los contactos largos competían por el ancho de la ficha. | Badge con etiqueta, resumen con ajuste de línea, acciones agrupadas y tarjetas de trabajo comercial antes del material de consulta. |
| Pipeline · `/pipeline`, `pipeline/components/commercial-pipeline.tsx` | El tablero se podía desplazar con puntero, pero la región carecía de una parada de foco explícita. Los fallos de catálogos no tenían recuperación visible y el tablero podía paginar durante una consulta. | Región enfocada para desplazamiento, filtros alineados y reintento de consultas, con la paginación bloqueada durante carga o guardado. |
| Seguimientos · `/followups`, `crm/components/followups.tsx` | El estado de cada tarea se infería de la acción disponible. Prioridad, fecha y responsable tenían un peso visual parecido. El ancho mínimo de las dos columnas competía con el sidebar. | Badges de prioridad y estado, metadatos secundarios, encabezado compartido y columnas que se apilan antes de comprimir la agenda. |
| Avalian · `/avalian`, `avalian/components/avalian-workspace.tsx` | La tabla de la vista previa tenía desplazamiento horizontal sin una región de teclado rotulada. El menú de registro tenía un objetivo táctil menor al de Leads. | Encabezado y región de tabla compartidos, columnas semánticas y botón de menú de tamaño estándar. Se conservan los filtros, el orden y el conteo propios de registros importados. |
| Importación Excel · `lead-imports/components/lead-import-dialog.tsx` | Selección y excepciones en una tabla ancha. La revisión vacía aún mostraba encabezados y el foco del paso se ocultaba. | Región desplazable rotulada, selección de fila visible, vacío explícito y foco visible en el paso. El pie del diálogo sigue ofreciendo revisión y confirmación según el paso y la validación del lote. |
| Reportes · `/reports`, `reports/components/reports-workspace.tsx` y `report-detail.tsx` | El historial tenía sus propias convenciones de carga y vacío, y el reintento podía repetirse durante la consulta. | Encabezado, estados y región de tabla compartidos. Las tablas distinguen encabezados y conservan el período, las fechas de corte y el formato de las cifras existentes. |
| Resumen · `/dashboard/overview`, grupo `src/app/dashboard` | El único Resumen es el del starter, con datos sintéticos. La navegación comercial inicia en Leads y carece de una pantalla que reúna métricas por rol. | Cuando haya métricas comerciales respaldadas por el backend, usar el encabezado, las tarjetas de métricas y los estados del CRM. La ruta comercial queda pendiente de esa decisión de producto. |

## Verificación

- Node 24.22.1 y pnpm 10.32.1. Pasaron `format:check`, `lint:strict`, `typecheck`, el build standalone y `git diff --check`.
- `node scripts/verify-crm.mjs` con `CRM_RUN_IMPORT_UI=true` pasó 91 comprobaciones BFF con PostgreSQL descartable y el recorrido de Excel en Chrome. La reapertura del lote parcial entra directamente en revisión. El harness comprobó el alcance de selección y la conservación de dos excepciones.
- Pasaron `verify-crm-profile.mjs`, `verify-lead-profile.mjs`, `verify-followups.mjs`, `verify-avalian.mjs` y `verify-reports.mjs` de `frontend/scripts`.
- Chrome verificó escritorio y móvil a 390 px. En Leads se probaron búsqueda, filtros, paginación, ficha, edición, selección, carga, vacío y reintento. También se probaron el desplazamiento del tablero por teclado, los filtros de Seguimientos, el foco al abrir un reporte y la simulación local de Avalian.
- En el tema claro inicial, Chrome midió relaciones de contraste de 4,95:1 para la acción principal, 18,40:1 para el texto de la navegación y 3,50:1 para el borde del campo de búsqueda.

## Decisiones pendientes

- Avalian requiere un canal de importación documentado y autorizado para tener una ruta de producción. El módulo auditado sigue limitado a la vista previa sintética de ADMIN en desarrollo y separado del flujo comercial.
- Resumen requiere métricas y filtros por rol acordados para alimentar una ruta comercial real.
