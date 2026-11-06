# Guía de importación inteligente de Excel a InfoPrepaga CRM

**Referencia:** `datos FACE.xlsx` · **Revisión:** 6 de noviembre de 2026.

El importador reconoce las tablas históricas del libro, normaliza contactos, reutiliza equivalencias confirmadas y consolida repeticiones compatibles. La intervención del administrador se concentra en equivalencias desconocidas, contactos incompletos y conflictos de identidad. Subir el archivo prepara la revisión; los cambios comerciales se ejecutan después de confirmar.

## Novedades de la segunda etapa

- En **Revisar fila** se comparan el valor actual del CRM, el entrante y la acción por campo. Un conflicto conserva el bloqueo; confirmar una coincidencia no autoriza reemplazar datos incompatibles.
- En **Administrador → Importación Excel** podés consultar, buscar, editar y eliminar equivalencias recordadas. Los cambios afectan futuras cargas; no modifican leads ni revisiones ya preparadas. Si otra persona cambió la regla, actualizá la lista antes de volver a editar.
- El perfil del lead tiene **Procedencias de importación**, con todas las apariciones, archivos/lotes, orígenes, hojas/filas, asesores, fechas y observaciones. La misma reimportación no las duplica.
- **Correcciones masivas conservadoras** permite descartar un campo opcional incorrecto cuando queda otro contacto válido. Cada acción pide confirmación, conserva el original y excluye identidades conflictivas.

Esta etapa requiere revisar la migración de auditoría antes de usarla en el entorno habitual. Se probó únicamente en bases descartables y no se desplegó automáticamente. Ver el [informe de segunda etapa](importer-stage2-verification.md).

## 1. Cómo usarlo

1. Entrá como **ADMIN** a **Leads → Importar Excel** y elegí **Subir y revisar**.
2. Revisá el resumen de filas detectadas, contactos estimados, altas nuevas, existentes actualizables, coincidencias internas, omisiones, configuración y errores de contacto.
3. Abrí **Configuración de orígenes, vendedores y reglas de asignación**. Las correspondencias conocidas ya están resueltas; elegí una sola vez el destino de cada grupo desconocido.
4. Relacioná cada asesor desconocido con una cuenta activa. Podés escribir otros alias separados por coma antes de elegir el vendedor: por ejemplo, confirmar juntos Fede y Federico. La casilla **Recordar equivalencias para próximas importaciones** guarda la decisión para futuros archivos. Las diferencias Fede/FEDE se agrupan sin repetir la configuración.
5. Si una hoja tiene filas sin asesor, podés elegir un responsable predeterminado. Ese valor no reemplaza un asesor histórico informado. También podés confirmar reparto automático según las reglas del CRM.
6. La tabla abre en **Necesitan revisión**. Usá **Revisar fila** para corregir o inspeccionar datos históricos; **Omitir** excluye una aparición sin borrar contactos existentes.
7. Si querés avanzar con lo validado, marcá explícitamente **Excluir las excepciones pendientes e importar el resto**. Sin esa decisión, hay que resolver u omitir las filas pendientes.
8. Elegí **Confirmar carga**, revisá el resumen definitivo y presioná **Confirmar y procesar**. Se procesan bloques de hasta 100 apariciones.

Los filtros son **Todos**, **Listos para crear**, **Listos para actualizar**, **Apariciones para consolidar**, **Duplicados**, **Necesitan revisión** y **Omitidos**. Cada página contiene hasta 50 filas. Una fila bloqueada aparece como **Requiere configuración** o **Requiere corrección**, nunca como lista para cargar.

## 2. Cómo adapta las columnas

El sistema reconoce el nombre de la hoja y lee posiciones fijas. No cambies las columnas de lugar ni esperes que detecte un formato arbitrario.

| Hoja | Nombre | Teléfono | Correo | Asesor | Observación | Otros datos históricos |
| --- | --- | --- | --- | --- | --- | --- |
| DATOS LAN | B–E | F | H | J | K | Fecha A, horario G, segmento I |
| PIPA | B | C | E | G | H | Fecha A, horario D, régimen F |
| Fede | B | C | E | G | H | Fecha A, horario D, segmento F |
| DATOS FACE | B | C | Sin columna | A | E | Fecha D |
| folletos | B | C | Sin columna | E | F | Fecha A, régimen D |

En **DATOS LAN**, una única columna con nombre identifica también su canal: B = Datos Lan, C = Whatsapp, D = Datos IP, E = Meta. Si el mismo nombre aparece con variaciones de formato en varias columnas, se reconoce el nombre y queda por definir el canal. Si hay nombres distintos, se pide corregirlos. No se concatenan nombres ni se crean orígenes artificiales para combinaciones de columnas.

En **PIPA**, las etiquetas LAN, ref e ip lan se consideran clasificaciones históricas de origen, no vendedores. El texto original queda conservado. El nombre de la hoja **Fede** tampoco prueba que todos sus contactos pertenezcan a ese vendedor.

**Pagos** y **Analisis** quedan fuera. También se ignoran títulos mensuales, encabezados reconocidos, resúmenes sin contacto y bloques laterales administrativos. La inversión en F de DATOS FACE no se importa.

## 3. Cómo resuelve orígenes y asesores

Los orígenes históricos se relacionan con bases activas del CRM. Si hay una sola correspondencia conocida, se usa; si existen varias fuentes Meta, por ejemplo, el administrador debe elegir la adecuada. El sistema no crea bases nuevas.

Las equivalencias confirmadas se recuerdan por hoja/grupo para orígenes y por alias para asesores. Solo se usan destinos vigentes. Los apodos no se asignan por parecido: Fede y Federico necesitan una confirmación que los relacione. Una coincidencia inequívoca con el nombre completo configurado sí puede resolverse automáticamente.

Un asesor histórico desconocido queda pendiente de configuración. Elegir reparto automático es una decisión explícita; no se usa como reemplazo silencioso de ese asesor. Los contactos existentes conservan su vendedor actual. Las filas sin asesor pueden usar el responsable predeterminado de su hoja o el reparto global.

El reparto global rota entre vendedores activos con recepción habilitada, respetando turnos y pendientes anteriores. Si no hay candidatos, un lead nuevo puede quedar sin asignar y visible solo para ADMIN hasta poder repartirlo.

## 4. Qué hace con los contactos repetidos

| Resultado | Qué sucederá |
| --- | --- |
| Listo para importar | Se crea un lead Nuevo. |
| Listo para actualizar | Se incorpora procedencia al contacto existente y se completa teléfono/correo solo si están vacíos. |
| Listo para consolidar | Se conserva otra aparición compatible sin crear un lead adicional. |
| Requiere configuración | Falta una equivalencia global o un destino dejó de estar disponible. |
| Requiere corrección | Hay un dato inválido o una coincidencia incompatible. |
| Omitido / ya importado | No se cambia el contacto. |

La coincidencia se busca por teléfono normalizado o correo, **nunca solo por nombre**. Nombres diferentes para un mismo teléfono, correos/teléfonos incompatibles, varios contactos existentes posibles o responsables confirmados contradictorios para un alta nueva requieren revisión. El número de contactos únicos es una estimación por claves; un conflicto no confirma que dos personas sean la misma.

Las actualizaciones conservan nombre, vendedor, estado, etapas, origen comercial, observaciones comerciales y seguimientos vigentes. Las observaciones históricas se guardan con su procedencia y aparecen en el historial, sin concatenarlas a la observación actual ni crear notas repetidas. En el detalle se indica qué información se agregará y qué datos comerciales se preservan.

**Consolidar coincidencias compatibles** no fuerza conflictos ni crea duplicados nuevos. **Omitir todos los duplicados** puede excluir todas las apariciones repetidas; usá **Restablecer selección automática** o restaurá una fila para reconsiderarlas. Si el CRM cambió desde tu revisión, el sistema puede pedir **Confirmar revisión de duplicados** nuevamente.

Volver a subir la misma aparición no duplica leads, actualizaciones ni eventos. Si cambió su contenido se revisa como nueva procedencia y se vuelve a validar la coincidencia. No hay sincronización automática ni sustitución completa del contacto existente.

## 5. Normalización y errores reales

- Los textos se limpian de espacios repetidos; el correo se pasa a minúsculas.
- El teléfono completo se valida con la biblioteca existente y Argentina como país predeterminado. Por ejemplo sintético, `011 15 2345-6789` y `+54 9 11 2345 6789` coinciden como `+5491123456789`. No se inventan área ni dígitos faltantes; `15 2345-6789` sin un área inequívoca requiere revisión.
- Debe existir un nombre válido de hasta 160 caracteres y al menos teléfono o correo válido. Si un campo presente es inválido, hay que corregirlo o vaciarlo aunque el otro medio de contacto sea válido.
- Las observaciones admiten hasta 2.000 caracteres.
- Las fórmulas de contacto/observaciones requieren reemplazar el campo por texto verificado o excluir la fila. No se ejecutan ni se confía en su valor cacheado.
- Una fecha incompleta como `5/8` se conserva así, sin inventar el año. Las fechas reconocidas de Excel quedan como `AAAA-MM-DD`. La fecha histórica no reemplaza la fecha de creación del lead.
- Horarios, fechas y observaciones históricas no crean citas ni deducen estados. Las celdas vacías no heredan el asesor ni la fecha anterior.

Se conservan archivo, hoja, columna del nombre, número de fila, lote, origen histórico, texto original del asesor, teléfono original y observaciones. La revisión es temporal; la procedencia de las apariciones cargadas permanece.

## 6. Resultado de la simulación del archivo original

Se leyó el Excel sin modificarlo ni cargar sus contactos al CRM. El análisis consultó catálogos de la base local de desarrollo, que en ese momento tenía seis fuentes, una cuenta y ningún lead. No había equivalencias guardadas de esta nueva versión.

| Hoja | Candidatas actuales | Filas con errores de contacto | Filas con conflictos de identidad |
| --- | ---: | ---: | ---: |
| DATOS LAN | 587 | 30 | 48 |
| PIPA | 236 | 21 | 33 |
| Fede | 205 | 7 | 10 |
| DATOS FACE | 579 | 29 | 11 |
| folletos | 6 | 1 | 0 |
| **Total** | **1.613** | **88** | **102** |

Las categorías de error y conflicto pueden superponerse. Los cuatro nombres ambiguos restantes están incluidos en los errores de contacto.

La versión anterior contaba **1.616 candidatas y 93 filas con errores**. Ahora se excluyen tres títulos mensuales: DATOS LAN filas 18 y 200, y DATOS FACE fila 149. Además, se resuelven dos nombres iguales escritos en varias columnas. Por eso quedan **1.613 candidatas y 88 errores reales de contacto**. No se eliminaron registros del CRM: son diferencias de interpretación del archivo.

Se detectan **836 apariciones con coincidencias**, correspondientes a **432 repeticiones adicionales** y **1.181 componentes de contacto estimados**. Las 836 no son 836 leads que deban crearse de nuevo.

Con los catálogos actuales hay **9 apariciones listas**, **9 grupos de origen** y **19 alias históricos** pendientes de decisión. La gran cantidad de filas en revisión incluye configuración global, no solo datos inválidos.

En un escenario hipotético que completa esas equivalencias y usa reparto para los responsables aún desconocidos, quedan **1.431 apariciones procesables: 1.071 altas y 360 consolidaciones**, con **182 apariciones que requieren corrección o revisión de identidad**. No se confirmó ese reparto ni se guardaron equivalencias durante la simulación. Elegir responsables históricos incompatibles puede cambiar el resultado.

También se detectaron fórmulas en los teléfonos **DATOS LAN F219, F447 y F519; PIPA C199; Fede C72**. Estas filas están incluidas en los errores, no se suman aparte.

### Qué puede resolverse de las 182 excepciones

El análisis local distingue **80 apariciones con solo errores de contacto**, **94 con solo conflictos de identidad** y **8 con ambos**. No deben sumarse los motivos individuales: una fila puede tener varios.

Tras confirmar los mapeos, hay **10 apariciones elegibles para corrección masiva explícita**: 3 correos inválidos con teléfono válido, 4 teléfonos inválidos con correo válido y 3 fórmulas de teléfono con correo válido. Una cuarta fórmula con correo válido sigue bloqueada porque tiene otro dato obligatorio sin resolver.

Si se autorizan esas correcciones, el escenario pasa a **1.441 apariciones procesables —1.078 altas y 363 consolidaciones— y 172 pendientes**. Los 102 casos con conflictos de identidad siguen protegidos. Es una simulación, no una carga ni una autorización para usar reparto: las equivalencias y responsables reales todavía pueden cambiar la clasificación.

Las acciones masivas conservan los datos descartados para consultarlos en el perfil. No inventan nombres, teléfonos, áreas, responsables ni años, y no descartan filas completas.

## 7. Pausar, reanudar y recuperar

El archivo debe ser `.xlsx` de hasta 10 MB y 5.000 candidatas. La revisión vence a las 24 horas de la subida, aun con carga parcial. Los bloques anteriores persisten al pausar o interrumpirse la conexión.

**Pausar después del bloque actual** detiene nuevas solicitudes. Cerrar el navegador también deja de pedir bloques; el que está en curso puede finalizar. Al regresar, usá **Revisiones y cargas recientes**, actualizá y elegí **Reanudar carga**. No vuelvas a enviar una versión vieja tras una respuesta incierta.

Después de comenzar, hojas y mapeos globales quedan fijos; se pueden revisar filas pendientes. Al vencer, hay que subir el archivo nuevamente. Las apariciones ya registradas se reconocen, y los contactos e historial permanecen. No hay un botón para deshacer indiscriminadamente todos los cambios del lote.

## 8. Acceso y datos de prueba

Solo ADMIN importa y revisa sus propios lotes. Cada vendedor ve después los leads que le corresponden. El procesamiento no envía archivos ni contactos a IA externa. No importa registros Avalian ni autoriza convertirlos en leads comerciales.

No se limpiaron datos anteriores en la base habitual: no había leads y no se identificaron lotes de prueba verificables para borrar. Se preparó un procedimiento limitado por UUIDs de lote, con respaldo y ensayo de restauración. Rechaza contactos con actividad posterior o procedencia ajena. Consultá [el procedimiento técnico de limpieza](lead-imports.md).

Para resultados de pruebas, migración y diagnóstico de los procesos periódicos, consultá la [evidencia de verificación](importer-verification-2026-11-06.md).
