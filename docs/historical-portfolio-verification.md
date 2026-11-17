# Verificación de migración histórica — 6 de noviembre de 2026

Se trabajó sobre el repositorio real, inicialmente limpio. No hubo commits, push, despliegue ni cambios en la base habitual.

## Evidencia ejecutada

- prisma:generate: cliente 6.19.3 generado. prisma validate: esquema válido.
- typecheck en backend y frontend: aprobado.
- lint backend y lint:strict frontend: aprobados después de corregir formato y tipos.
- format:check de ambos paquetes y git diff --check: aprobados.
- Suite unitaria completa: 16 suites, 69 pruebas aprobadas. Se usó Node 24.22.1 explícito y pypdf 6.10.0 en carpeta de herramientas aislada. El primer intento sin esa dependencia falló en dos pruebas PDF; el definitivo pasó.
- Suite E2E completa contra PostgreSQL 17 descartable: 6 suites, 50 pruebas aprobadas. Incluye permisos, ámbito, versiones, importación parcial, selección entre páginas, clasificación consolidada, aislamiento de reparto/pipeline y venta posterior sin inflación de captación. Cada suite crea su esquema aislado y aplica las migraciones revisables.
- Builds backend y frontend standalone: aprobados. Los scripts pnpm del host usaron Node 24.13.0 y avisaron que es inferior al engine requerido. Las pruebas unitarias definitivas y el harness de navegador usaron el runtime 24.22.1 ya disponible; para despliegue mantener esa versión.
- node scripts/verify-crm.mjs con CRM_RUN_IMPORT_UI=true: 91 comprobaciones BFF/CSRF/sesión/persistencia aprobadas. Chrome headless: CREATE/UPDATE/MERGE/SKIP/REVIEW, comparación por campo, procedencias, corrección opcional y administración de equivalencias. Se agregó migración histórica con excepción de responsable, importación parcial, reapertura del lote, teclado y vistas móvil/escritorio. Capturas inspeccionadas localmente; solo datos sintéticos.

## Aislamiento

PostgreSQL descartable creado con initdb y pg_ctl en TEMP/infoprepaga-historical-test-20261106, limitado a 127.0.0.1:55439 y base starter_test. No se usó la conexión habitual. Migraciones nuevas: 20261107000000_historical_portfolio y 20261107001000_import_configurations. No se editaron migraciones previas del repositorio.

El diagnóstico del Excel original se ejecutó con node scripts/simulate-lead-import.cjs sin --database. Confirmó 1.613 apariciones, 1.181 componentes estimados, 1.431 procesables hipotéticos antes de correcciones y 1.441 después (1.078 altas + 363 consolidaciones), con 172 pendientes. No son contactos garantizados ni autorización de reparto. No se guardó el Excel, no se importaron contactos ni se imprimieron sus valores.

## Límites documentados

No se ofrece exportación de pendientes ni orden por última actividad comercial. Las revisiones históricas duran 90 días; después debe conservarse y re-subirse el original. Releer columnas exige el archivo original y solo se permite antes de incorporar registros. No hay intérprete universal de hojas desconocidas ni fusión forzada. La aplicación del esquema habitual requiere aprobación del propietario. No se comprobó un despliegue remoto ni aceptación con contactos reales.
