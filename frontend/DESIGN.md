 # Diseño de InfoPrepaga CRM

InfoPrepaga es un espacio de trabajo para consultar registros, gestionar oportunidades y completar seguimientos. La interfaz prioriza la lectura rápida, una jerarquía estable y acciones previsibles entre módulos.

Las seis pantallas aprobadas y las decisiones del proyecto definen la identidad y los flujos. El análisis `Airtable-design-analysis` aportado como referencia inspira el lienzo claro, el texto oscuro, los bordes discretos, el espaciado repetible y la jerarquía entre acciones. Su paleta comercial, tipografía Haas, botones tipo píldora y componentes de landing quedan fuera del sistema visual del CRM.

## Identidad y tokens

| Rol | Implementación |
| --- | --- |
| Workspace y texto principal | `background` y `foreground`. El contenido del CRM tiene superficie clara en la referencia aprobada. |
| Paneles y contenido secundario | `card`, `card-foreground`, `muted` y `muted-foreground`. Preferir bordes discretos y superficies planas. |
| Navegación lateral | Identidad oscura de InfoPrepaga. Reusar el layout real del módulo y verificar los estilos efectivos del sidebar. |
| Acción principal y selección | Acento verde del CRM. Reusar `primary` y `primary-foreground` donde representen esa identidad. `accent` y `accent-foreground` para superficies suaves cuando corresponda. |
| Bordes, campos y foco | `border`, `input` y `ring`. Mantener foco visible sobre superficies claras y oscuras. |
| Acciones destructivas y estados | Usar la variante `destructive` para acciones destructivas. En badges, reutilizar el mapeo del dominio y acompañar el color con una etiqueta de texto. |

Los valores efectivos viven en `src/styles/globals.css`, `src/styles/theme.css`, los temas y el CSS del layout. Revisar el tema aplicado en la ruta real antes de proponer cambios. El tema por defecto del shell general y el tema `light-green` del starter tienen alcances propios. Mantener las personalizaciones de InfoPrepaga acotadas al CRM cuando corresponda. Evitar colores literales repetidos y temas nuevos por módulo. Si falta un rol semántico recurrente, definirlo una vez en la capa compartida que lo controla.

## Tipografía, espacio y composición

- Reusar `font-sans` y la configuración tipográfica instalada. Mantener un `h1` por pantalla, títulos de sección subordinados y pesos moderados para etiquetas. Usar texto secundario para información de apoyo que siga siendo legible.
- Tomar como punto de partida el espaciado del workspace compartido: 24 px laterales en escritorio y 16 px en pantallas angostas. Usar la escala del tema para separación interna y agrupar controles relacionados antes de separar secciones.
- Reusar variantes existentes para altura, radio y tamaño de controles. Alinear los controles de una misma barra cuando cumplan funciones equivalentes. Preferir borde y superficie para agrupar, con elevación reservada a elementos flotantes como menús o diálogos.
- Resolver la cabecera con el layout que usa la ruta de producción. Inspeccionar `src/app/(crm)/layout.tsx`, `src/components/layout/crm-workspace.css` y `src/components/layout/page-container.tsx` antes de crear envoltorios o encabezados nuevos.

## Patrones de interfaz

| Patrón | Regla |
| --- | --- |
| Acciones | Una acción dominante por contexto. Usar `Button` con la variante principal para el avance esperado, una variante secundaria para acciones de apoyo y un menú para acciones por fila de menor frecuencia. |
| Listados | Encabezado y acción principal, luego búsqueda y filtros, tabla y paginación. Mantener visibles los filtros aplicados y ofrecer limpieza cuando condicionen los resultados. Conservar orden, filtros y paginación del servidor donde la ruta los usa. |
| Filas y selección | Alinear datos comparables, identificar con texto la acción de apertura y etiquetar los botones de icono. Mostrar acciones masivas al seleccionar filas cuando el flujo ya las admite, con recuento y alcance claros. |
| Formularios y diálogos | Etiquetas persistentes, ayuda junto al campo y error específico. Mantener datos al fallar, bloqueo de doble envío y devolución del foco al cerrar. Reusar los componentes shadcn en `src/components/ui/` y los campos compartidos que use el flujo. |
| Carga y feedback | Diferenciar carga inicial, actualización, error recuperable, ausencia de datos y ausencia de resultados filtrados. Reusar `Feedback`, `EmptyState`, `LoadingState` y `Pagination` de `src/features/crm/components/shared.tsx` donde encajen con la ruta. |
| Móvil y teclado | Reordenar filtros y acciones según el ancho disponible. Si la tabla necesita desplazamiento horizontal, contenerlo en su región y mantener accesibles la selección y las acciones. Verificar nombres accesibles, foco visible, contraste y navegación con teclado. |

## Aplicación por pantalla

| Pantalla | Prioridad visual |
| --- | --- |
| Leads | Referencia de listados. Priorizar búsqueda, estado, responsable y apertura de ficha. Usar la ruta real `src/app/(crm)/leads/page.tsx` para identificar el componente activo. |
| Perfil de lead | Identidad y estado al inicio, acciones existentes agrupadas y secciones distinguibles para historial, notas y próximas tareas. |
| Avalian | Aplicar el patrón de lectura de tablas en su módulo autorizado. Mantener su identidad de registros importados y sus acciones propias. |
| Importaciones | Dar jerarquía al paso actual, la vista previa, los contadores y las excepciones. Conservar la diferencia entre revisar filas y confirmar el lote. |
| Resumen y reportes | Priorizar métricas y fechas de corte. Alinear cifras comparables y rotular valores y series. Las métricas de producción provienen del backend. |
| Pipeline | Identificar etapas por su nombre y mantener una anatomía de tarjeta común. Conservar las transiciones y controles existentes. |
| Seguimientos | Distinguir fecha, prioridad y estado con texto. Mantener el contexto al navegar por el calendario o la lista. |

## Revisión antes de entregar

- Confirmar qué ruta y componentes se ejecutan en producción. Usar las pantallas aprobadas y los flujos reales como evidencia, con datos sintéticos en cualquier captura.
- Revisar si el cambio comparte tokens, variantes y componentes con la pantalla de referencia. Documentar excepciones cuando una diferencia sea necesaria para el flujo.
- Verificar escritorio y móvil, teclado, carga, errores y vacío de la pantalla afectada. En listados, probar búsqueda, filtros, paginación y acciones ya disponibles.
- Preservar contratos, permisos, alcance por vendedor, estados, validaciones y aislamiento de Avalian. Ejecutar los scripts de verificación disponibles y reportar por separado las comprobaciones pendientes.
