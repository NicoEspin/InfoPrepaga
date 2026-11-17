# Prompt para Codex

Copiá el bloque completo en una sesión de Codex abierta en la raíz de InfoPrepaga.

```text
Revisá el frontend de InfoPrepaga CRM y aplicá el sistema visual de frontend/DESIGN.md por etapas. El objetivo es que las pantallas se sientan parte del mismo producto y que los vendedores puedan leer registros y actuar con rapidez.

1. Leé AGENTS.md, frontend/AGENTS.md y frontend/DESIGN.md. Revisá git status y los diffs antes de editar. Conservá el trabajo en curso. Identificá el layout, los tokens efectivos y los componentes de las rutas reales del CRM. Contrastá con las referencias aprobadas disponibles y usá Leads como piloto. Revisá también docs/frontend-feedback.md para conservar los comportamientos de recuperación ya documentados.

2. Auditá Resumen, Leads y perfil, Pipeline, Seguimientos, Avalian, importación y reportes. Para cada hallazgo indicá pantalla, componente o archivo, inconsistencia visible, impacto y patrón compartido que la resolvería. Priorizá jerarquía de acciones, densidad, contraste, estados y uso en móvil. Presentá un plan corto y seguí con la implementación.

3. Aplicá el piloto a la ruta real de Leads. Unificá los patrones pertinentes de encabezado, barra de filtros, tabla, badges, acciones por fila, paginación y estados. Reusá componentes, variantes y tokens existentes. Extraé un patrón compartido cuando haya reutilización concreta. Contrastá el piloto con el diseño aprobado y verificá el flujo antes de extenderlo a Avalian, importaciones y las demás pantallas según los hallazgos. Conservá la separación entre registros de Avalian y leads comerciales.

4. Mantené el alcance en frontend y preservá permisos, contratos, métricas, filtros, datos persistidos, transiciones y validaciones. Usá datos sintéticos para validar y capturar pantallas. Evitá dependencias nuevas, cambios de tema global por conveniencia y modificaciones en demos del starter para resolver pantallas de producción. Si una inconsistencia requiere una decisión de producto, documentala y avanzá con las mejoras independientes.

5. Verificá en escritorio y móvil. Probá teclado, foco, carga, vacío, error y reintento. En Leads probá búsqueda, filtros, paginación, apertura de ficha y acciones disponibles. En importaciones verificá selección, excepciones y confirmación. Ejecutá los scripts disponibles de formato, lint, typecheck y build según el alcance y los harness pertinentes. Revisá el diff final y reportá hallazgos, cambios, comandos ejecutados, resultados y pendientes. Adjuntá capturas antes y después cuando puedas validar con datos sintéticos.
```
