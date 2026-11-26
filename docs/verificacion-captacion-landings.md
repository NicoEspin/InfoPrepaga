# Captación de landings: decisiones y evidencia

Entrega local del 26/11/2026, lista para revisión de código. No se desplegó, no se publicaron textos legales y no se hicieron POST a los sitios públicos. Guías autónomas: [InfoPrepaga](integracion-landing-infoprepaga.md) y [Coberturas Médicas](integracion-landing-coberturas-medicas.md), con contrato, integración, insumos legales y checklist propios.

## Rutas y comportamiento final

| Landing | Ruta pública Next.js | Ruta privada NestJS | Origen existente |
| --- | --- | --- | --- |
| InfoPrepaga | `/api/integrations/v1/leads/infoprepaga` | `/integrations/v1/leads/infoprepaga` | `LANDING_IP` / Landing IP |
| Coberturas Médicas | `/api/integrations/v1/leads/coberturas-medicas` | `/integrations/v1/leads/coberturas-medicas` | `LANDING_CM` / Landing CM |

POST con token exclusivo por landing, sin cookies. CORS exacto por ruta, incluyendo variante `www`; servidor a servidor admite ausencia de Origin. Los dominios no se agregaron al login ni al CORS global de NestJS. `APP_ORIGIN=https://crm.infoprepaga.com.ar` es el valor de producción previsto; el proxy y el hosting efectivos deben revisarse en su entorno autorizado.

Campos comunes obligatorios: UUID de envío, formulario permitido, nombre, teléfono AR válido, situación laboral, consentimiento true y versión configurada de aviso. InfoPrepaga requiere edad adulta, grupo e interés de plan; presupuesto es opcional. Coberturas exige email. UTM no se guarda porque no hay reporte de campaña que lo use. No se aceptan campos de autoridad, datos médicos ni texto libre. Las guías detallan tipos/límites/catálogos y valores propuestos frente a verificados.

La nueva consulta se confirma en PostgreSQL junto con evidencia y alta/vínculo. Clave única `(landing, submissionId)` más el bloqueo comercial ya existente; hash canónico de datos normalizados detecta conflictos. Una ficha coincidente conserva origen, contactos, estado y responsable; snapshot de nueva consulta y nuevos datos de contacto quedan en recibo/historial. Varias fichas candidatas crean consulta separada con revisión administrativa, sin fusionar. El reparto compartido no cambió: cuentas activas habilitadas, rotación durable, pendientes primero y espera si no hay candidatos. No hay notificación externa automática.

El listado puede filtrar por origen histórico **o** fuente de una consulta vinculada; por eso las fuentes pueden solaparse. Los reportes de leads/ventas conservan sus reglas, no incorporan conteos de consultas como leads nuevos. El historial muestra formulario, procedencia, autorización, datos de la consulta y advertencia de ambigüedad. Su endpoint mantiene autorización por vendedor.

## Acceso y bloqueo productivo

El checkout no tiene contactos separados de Lead, equipos o tenants. ADMIN es global y el reparto/coincidencia también. La integración **no implementa multi-tenancy**: exige responsable de landing explícito e igual al de toda la instancia CRM. Falta o diferencia → 503 antes de acceder a contactos. Ambas integraciones parten apagadas. Configurar la misma identidad requiere verificación/documentación legal de esa igualdad; no usarlo como interruptor para compartir carteras de entidades distintas. En ese caso mantener apagada la combinación y usar instancias/bases separadas o implementar aislamiento completo.

Alta manual conserva creación de fichas sin deduplicación de consultas. Excel conserva revisión por contactos, fingerprints de apariciones, mapeos y cartera histórica. YCloud conserva inbox y revisión de coincidencias ambiguas/históricas. La captación comparte el alta de sistema, claves normalizadas, bloqueo y reparto, sin sustituir las reglas legítimas de cada flujo. Las fichas históricas vinculadas no cambian de cartera automáticamente.

## Archivos y configuración

| Unidad de revisión | Archivos / razón |
| --- | --- |
| Persistencia, contrato y alta | `backend/prisma/schema.prisma`, migración `20261126120000_landing_submissions`, `backend/src/integrations/landings/*`, `backend/src/app.module.ts`: recibo, evidencia, idempotencia, credenciales y alta compartida. |
| Límite HTTP y procedencia | `backend/src/integrations/ycloud/ycloud-http.ts`: parser separado de 8 KiB, conserva parser YCloud y resto; `backend/src/crm/crm.service.ts`: filtro de fuente incluyendo consultas. No cambia reparto. |
| Frontera pública e historial | `frontend/src/app/api/integrations/v1/leads/[landing]/route.ts`, `frontend/src/features/crm/components/profile.tsx`: proxy acotado sin cookies, CORS, respuestas mínimas y lectura de eventos. |
| Configuración | `.env.example`, `backend/.env.example`, `compose.yaml`: variables solo en backend, deshabilitadas. Sin nuevas dependencias ni cambios de versión Prisma. |
| Pruebas/documentación | `landing.spec.ts`, `scripts/verify-landing-integrations.mjs`, estas tres guías y enlace en `README.md`. |

Variables nuevas: `CRM_DATA_CONTROLLER_ID`; por prefijo `LANDING_INFOPREPAGA_` y `LANDING_COBERTURAS_MEDICAS_`: `ENABLED`, `CONTROLLER_ID`, `TOKEN`, `PREVIOUS_TOKEN`, `PRIVACY_VERSION`. Ejemplos ficticios y rotación en cada guía. Procesador de cada landing: `CRM_LANDING_URL` y `CRM_LANDING_TOKEN`, no forman parte del frontend CRM.

Migración aditiva: tabla con FK a lead/fuente, índice único por landing/envío, índices por lead/fecha y fuente/fecha, CHECK consentimiento true. Conserva fuentes existentes, migraciones anteriores y Prisma 6.19.3. No aplica migraciones al entorno habitual del propietario ni a producción.

## Comandos y resultados efectivamente ejecutados

| Verificación | Resultado |
| --- | --- |
| `pnpm -C backend prisma:generate` | Cliente Prisma 6.19.3 generado. |
| `pnpm -C backend exec prisma validate` | Esquema válido. |
| `pnpm -C backend format:check`, `lint`, `typecheck`, `build` | Aprobados tras corregir una aserción de tipo y una propiedad privada usada por el test nuevo. |
| `pnpm -C backend test --runInBand landing.spec` | 8/8 pruebas aprobadas. |
| `pnpm -C backend test --runInBand` con `PDF_TEST_PYTHON` apuntando al Python del runtime que incluye pypdf | 18 suites, 124/124 pruebas aprobadas. Primer intento con Python del sistema: 122 aprobadas y 2 fallos de PDF por falta de pypdf; se resolvió seleccionando runtime existente, sin instalar dependencias. |
| `pnpm -C backend test:e2e --runInBand` con PostgreSQL local descartable | 6 suites aprobadas y 1 suite con fallo: 77/78 pruebas. CRM, cuentas, importaciones, adjuntos, aplicación y YCloud aprobaron. |
| Repetición de `test:e2e --runInBand reports.e2e-spec` | 15/16; repite la expectativa de responsable en `backend/test/reports.e2e-spec.ts:612`. |
| Control del fallo de reportes con `CrmService` original de `git show HEAD:backend/src/crm/crm.service.ts` | Misma prueba falla, 15/16. Se transpila copia temporal y se inyecta como provider usando los servicios actuales; las copias de verificación se retiran al terminar. Esto reproduce el fallo con el alta/reparto originales. No se modificó la prueba ni el algoritmo para ocultarlo. Un primer intento de este control no resolvió identidades DI de la copia compilada; se corrigió el harness mediante factory/inyección explícita. |
| `pnpm -C frontend format:check`, `lint:strict`, `typecheck` | Aprobados. |
| Build Next.js con Node del runtime | Aprobado, incluye la nueva ruta dinámica y el perfil. |
| `node scripts/verify-landing-integrations.mjs` con `CRM_TEST_DATABASE_URL` local y Node del runtime | 72 comprobaciones HTTP aprobadas, exit 0; detalle abajo. |
| `docker compose config --quiet` con placeholders sintéticos | Configuración válida. Docker avisa que no puede leer configuración personal del usuario. |
| `docker info` | No hay daemon disponible; no se arrancaron contenedores. |
| `git diff --check` | Sin errores de whitespace. |

Node global/pnpm del equipo usa 24.13.0 y advierte sobre el mínimo del manifiesto. Para el build final de Next y el harness HTTP se utilizó el Node existente del runtime (24.22.3), sin cambiar dependencias. Python de pruebas PDF: `…/codex-primary-runtime/dependencies/python/python.exe`, con pypdf ya disponible.

Reproducción del harness:

```powershell
# Solo una base descartable local, nunca la base habitual ni producción.
$env:CRM_TEST_DATABASE_URL='postgresql://USUARIO_TEST:CLAVE_TEST@localhost:5432/starter_test'
pnpm -C backend prisma:generate
pnpm -C backend build
pnpm -C frontend build
node scripts/verify-landing-integrations.mjs
```

El harness rechaza host remoto y otra base. Crea esquema aleatorio `landing_test_*`, aplica la cadena previa de migraciones desde una copia temporal, inserta ficha sintética y luego aplica la nueva migración y repite deploy. Inicia Nest en 3341 y Next de producción en 3340 y elimina únicamente su esquema. Se corrigió el cierre del harness para reconocer procesos ya terminados por señal; el esquema de la ejecución inicial se retiró expresamente y la ejecución final terminó con limpieza y exit 0. La base contenedora local `starter_test` se creó vacía para pruebas, sin modificar las bases previas.

Cobertura HTTP real:

- Los cuatro formularios, fuentes persistidas/filtrables y trazabilidad sin cambiar origen histórico.
- Cookies y login por Next, login sin Origin o con origen de landing devuelve 403; API humana sin sesión conserva 401 y mutación desde landing 403.
- Credenciales ausentes, incorrectas y cruzadas; campos de vendedor/origen/responsable/etapa, consentimiento, aviso, tipos, teléfono y campos extra rechazados.
- Formatos locales/internacionales y UUID en mayúsculas equivalentes; reintento idéntico 200 y cambio de contenido 409.
- JSON inválido, MIME y límite de 8 KiB en BFF y Nest; preflight CORS exacto y rechazo de origen ajeno.
- Dos solicitudes idénticas simultáneas → 201/200, una consulta/alta/turno; dos distintas con mismo UUID → 201/409.
- Alta sin candidatos y recuperación mediante reparto existente; alta manual ADMIN y denegación a VENDEDOR.
- Vendedor ajeno no accede a perfil/historial/edición ni infiere coincidencia por búsqueda filtrada.
- Teléfono/email de fichas distintas: revisión sin fusión y sin alterar fichas anteriores.
- Falla de PostgreSQL inyectada al insertar recibo después del alta: rollback de lead y turno; reintento posterior registra una sola vez.
- 429 con Retry-After, sin bloquear health/login; responsable legal distinto bloqueado antes de crear recibos; CRM caído responde 503 sin confirmar.
- Salida de aplicaciones revisada durante el harness para claves y valores sintéticos de contacto, sin coincidencias observadas. No sustituye auditoría de logs de Nginx/hosting reales.

## Límites y pendientes

No se validó Nginx real, TLS o contenedores de producción, hosting/procesadores de las landings, comportamiento visual móvil/teclado ni telemetría real del sitio. La UI del perfil pasó tipos/lint/build; su revisión visual sigue pendiente. No se provocó timeout de red real del sitio: se verificaron reintentos del mismo envío, concurrencia, rollback y caída del backend en el equivalente local. Probar respuesta perdida/timeout del procesador y la UX de reintento en staging antes de activar.

InfoPrepaga: sin código/hosting ni identidad legal confirmada; verificar campos/valores reales, estado de plan del modal, presupuesto por rangos y cierre sin WhatsApp. Coberturas: página/política leídas en modo solo lectura; confirmar entidad/correo/domicilio completo, select y honeypot, destino previo y convivencia de avisos. Ambas: aprobar acceso respecto de toda la cartera, conservación y proveedores, publicar avisos mediante su responsable, verificar condiciones/promociones/plazos y completar checklist específico.

El límite de frecuencia reutiliza el throttler en memoria por proceso; no es un límite distribuido. El BFF comparte su IP hacia Nest y las landings comparten bucket conservador de 60/minuto. Antes de múltiples réplicas, probar control global en infraestructura. La retención/purga de evidencia no se automatizó: definir procedimiento aprobado con recibos, historial y respaldos. No hay autorización para enviar estos datos a servicios externos de IA.

Unidades sugeridas de revisión: (1) persistencia/servicio/pruebas backend, (2) frontera HTTP/configuración/harness, (3) presentación de historial y guías. No se crearon commits ni PRs; el cambio completo supera 400 líneas por incluir dos guías autónomas y pruebas de frontera. Para una PR única, el mantenedor deberá aceptar el tamaño o dividir por estas unidades sin recortar validaciones/documentación. Reversión operativa: deshabilitar las variables `ENABLED`; no borrar recibos ni una migración ya aplicada. La ruta/UI puede retirarse en una corrección revisada manteniendo evidencia histórica.
