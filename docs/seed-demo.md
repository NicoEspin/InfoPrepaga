# Probar el CRM con datos sintéticos

La seed demo carga 36 leads, 13 seguimientos, notas y movimientos comerciales. Genera también un Excel para recorrer la importación desde la revisión hasta la confirmación.

## Preparar la base demo

1. Seguí la configuración local del [README](../README.md). En PostgreSQL local, creá una base vacía llamada `infoprepaga_demo`. En una terminal dedicada al backend, configurá `DATABASE_URL` para esa base y `NODE_ENV=development`. Si hay variables `SEED_ADMIN_EMAIL` o `SEED_ADMIN_PASSWORD` en el entorno o en el archivo de configuración local, usá una configuración demo sin ellas.
2. Desde `backend/`, ejecutá:

   ```sh
   pnpm prisma:deploy
   pnpm prisma:generate
   pnpm prisma:seed:demo
   pnpm start:dev
   ```

3. Arrancá el frontend con la configuración local del README. Entrá con una de estas cuentas y la contraseña de prueba `InfoPrepaga-Demo-2026!`.

| Cuenta | Escenario |
| --- | --- |
| `admin.demo@example.test` | Administración, cartera completa, reportes e importación |
| `abril.demo@example.test` y `bruno.demo@example.test` | Carteras separadas y recepción automática habilitada |
| `clara.demo@example.test` | Cartera propia con recepción automática pausada |
| `diego.demo@example.test` | Cuenta inactiva para probar rechazo de inicio de sesión |

La primera carga requiere una base migrada sin usuarios ni leads. La seed admite conexiones por loopback a `infoprepaga_demo` y se ejecuta en una transacción. Si la volvés a ejecutar, conserva los cambios de la sesión de pruebas y genera otro Excel en una carpeta temporal cuya ruta aparece en la consola. Para volver al estado inicial, empezá con una base demo nueva y vacía.

## Recorrido de pruebas

| Módulo | Qué probar |
| --- | --- |
| Sesiones y administración | Entrá como ADMIN, revisá las cuentas y probá el rechazo de Diego. Cerrá sesión y entrá como Abril en otra ventana para comparar permisos. |
| Leads y cartera | Buscá **Contacto demo 01**, abrí su historial y editá o agregá una nota. Filtrá las carteras **En gestión**, **Histórico** y **Pendiente de clasificación**. Creá dos leads nuevos para ver el reparto entre Abril y Bruno. Probá abrir como Bruno el enlace al perfil de **Contacto demo 01**, asignado a Abril. |
| Seguimientos | Alterná lista y calendario. Filtrá las tareas vencidas, de hoy, futuras y completadas. Completá y reabrí una. Como vendedor, verificá que la lista quede limitada a tus tareas. Las fechas se calculan al cargar la base. |
| Pipeline | Revisá las cinco etapas, mové una oportunidad propia y probá reabrir un cierre como ADMIN con un motivo. |
| Reportes | Como ADMIN, elegí un período que cubra los últimos 30 días. Generá una vista previa, guardá el reporte y descargá el PDF. La seed incluye captaciones y cierres, con un cierre de cartera migrada. |
| Excel | Subí el `leads-demo.xlsx` que imprimió la seed. Mapeá **PIPA** a **Base demo Excel** si el asistente lo pide. El archivo trae una coincidencia con el CRM, dos apariciones compatibles de un alta y una fila con teléfono inválido. Probá también la modalidad histórica con las columnas de gestión, responsable actual y última gestión. Para comparar modalidades desde el mismo estado, prepará ambas revisiones antes de confirmar o usá una base demo limpia entre recorridos. |
| Adjuntos | Usá un archivo sintético en un lead propio. Para completar la carga y descarga se requiere almacenamiento de pruebas configurado. [Configuración de adjuntos](lead-attachments.md). |
| Avalian | Entrá como ADMIN en desarrollo con `ENABLE_STARTER_DEMOS=true`. La pantalla usa su simulación independiente y sus propios datos sintéticos. |

Las sesiones, procedencias importadas, fotografías de reportes y objetos de adjuntos se generan al ejecutar sus flujos desde la app. Las integraciones MCP y las notificaciones automáticas están pendientes.
