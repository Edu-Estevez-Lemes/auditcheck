# auditcheck

## Personalización de checklist, plantillas y categorías (Revisiones Manuales)

El módulo de Revisiones Manuales permite adaptar la checklist de cada revisión en lugar de usar siempre el catálogo fijo por defecto.

### Categorías

- Compartidas por toda la aplicación (no son privadas por usuario). Cualquier usuario autenticado puede crear, renombrar, reordenar o eliminar categorías desde **Configuración → Checklist**.
- Las 7 categorías originales (Hardware, Máquinas Virtuales, VM Idecnet, Redes, Almacenamiento, Backup, Antivirus) se marcan como predefinidas (`is_system`), pero también pueden eliminarse si ya no se necesitan.
- Si una categoría está en uso (en configuraciones de cliente, revisiones ya realizadas o plantillas), al eliminarla se pide confirmación explícita mostrando dónde se usa, antes de permitir el borrado forzado.

### Ítems de checklist personalizados

- Dentro del wizard de revisión, cada ítem tiene un botón para eliminarlo y cada categoría/tipo de dispositivo tiene un botón "Añadir ítem" para crear ítems personalizados (marcados visualmente como "Personalizado").
- **Alcance de "Eliminar":** afecta solo a la revisión que se está rellenando en ese momento — el catálogo por defecto no cambia para otras revisiones. Para que la personalización persista hacia adelante hay que guardarla como configuración del cliente o como plantilla.
- Las claves de los ítems personalizados las genera siempre el servidor (nunca se confía en las que envía el cliente), para evitar colisiones con el catálogo base.

### Plantillas de checklist

- Una plantilla guarda: qué categorías incluye, qué ítems predefinidos se ocultan (`removed_items`) y qué ítems personalizados se añaden (`custom_items`), todo por categoría y tipo de dispositivo.
- Son **privadas**: solo el usuario que las creó puede verlas, aplicarlas, editarlas o eliminarlas (404 para cualquier otro usuario).
- Se pueden guardar desde el resumen final del wizard de revisión, y se aplican al iniciar una nueva revisión (diálogo previo → "Aplicar una plantilla de checklist").
- Al guardar la configuración de un cliente con una plantilla aplicada, esa configuración queda vinculada a la plantilla (`template_id`). Si luego se edita la plantilla, en **Configuración → Checklist → Mis plantillas** se puede ver qué clientes la usan y previsualizar/propagar los cambios cliente a cliente (con confirmación).

### Dónde está el código

- Backend: `backend/app/models/review_category.py`, `review_template.py`; `backend/app/services/review_checklist.py` (merge catálogo base ± personalización, CRUD de categorías/plantillas); `backend/app/api/review_categories.py`, `review_templates.py`; catálogo base sin cambios en `backend/app/reports/review_items.py`.
- Frontend: `frontend/src/components/ReviewWizardModal.tsx` (edición de ítems), `ReviewPreDialog.tsx` (aplicar plantilla), `components/review/ChecklistSettingsTab.tsx` (gestión de categorías y plantillas, en Configuración).
- Pruebas: `backend/tests/test_review_checklist.py` (merge de ítems, generación de keys).

## Gestión de roles

- Jerarquía fija: `superadmin` > `admin` > `tecnico` (`backend/app/models/user.py::ROLES`).
- Un superadmin puede crear usuarios de cualquier rol, incluido otro superadmin. Un admin
  solo puede crear técnicos o administradores (`POST /auth/users`, `backend/app/api/auth.py`).
- Nadie puede eliminar, editar ni resetear la contraseña de un usuario con rol superior al
  suyo (`delete_user`, `update_user`, `reset_password` en `backend/app/api/auth.py`) — un
  técnico ni siquiera llega a esos endpoints (`get_admin_user` exige admin o superadmin). El
  cambio de rol (`PUT /auth/users/{id}/role`) es exclusivo de superadmin. La UI
  (`frontend/src/pages/Settings.tsx::UsersTab`) oculta además el botón "Eliminar" cuando el
  usuario objetivo tiene un rango superior, para no depender solo del 403 del backend.

## Sincronización con la matriz (MySQL)

Motor genérico de sincronización entre la base de datos embebida (SQLite) y una base de
datos central "matriz" (MySQL), documentado para el usuario en
[`docs/sincronizacion-matriz.md`](docs/sincronizacion-matriz.md).

### Identidad de filas: `uuid`, no `id`

Todas las tablas de la aplicación (excepto `matrix_sync_config`, que es configuración
local de cada instalación) llevan una columna `uuid` estable
(`SyncUuidMixin`, `backend/app/models/base.py`) usada para emparejar la misma fila entre
SQLite y MySQL. El `id` autoincremental nunca se compara ni se copia entre bases de datos:
es local a cada instalación y puede colisionar entre técnicos distintos.
Las instalaciones existentes reciben la columna mediante una migración ligera
(`_migrate_sync_uuids` en `backend/app/main.py`) que añade la columna, rellena un uuid por
fila existente y crea el índice único — mismo patrón que el resto de migraciones ad-hoc de
`_migrate_db` (no hay Alembic en este proyecto; el esquema se gestiona con
`Base.metadata.create_all` + funciones de migración manuales en el arranque).

### Motor de diff/aplicación (`backend/app/services/matrix_sync.py`)

- Un único algoritmo (`run_sync`) sirve tanto para el preview (`dry_run=True`) como para
  aplicar (`dry_run=False`) — evita que el preview mostrado al usuario pueda divergir de lo
  que realmente se aplica.
- Recorre `Base.metadata.sorted_tables` (orden topológico por FK) de padres a hijos para
  altas/cambios, y en orden inverso para bajas — así nunca intenta borrar un padre antes que
  sus hijos ni insertar un hijo antes que su padre.
- Los ids de columnas FK se remapean del lado origen al lado destino a través del `uuid` de
  la fila referenciada (nunca se copia el id crudo, que no significa lo mismo en ambas
  bases de datos). Además de las `ForeignKey()` declaradas en los modelos, hay un mapa manual
  `EXTRA_FK` para columnas que referencian otra tabla sin una constraint declarada (p. ej.
  `Device.client_id`, `Port.audit_id`, `Finding.client_id`) — ver el propio `EXTRA_FK` en
  `matrix_sync.py` para la lista completa y por qué existe cada una.
- Comparación de "¿cambió esta fila?" mediante una forma canónica que sustituye cada FK por
  el uuid de la fila referenciada antes de comparar — así una diferencia de ids
  autoincrementales entre ambas bases de datos (normal y esperada) nunca se confunde con un
  cambio real de contenido.
- Reglas de borrado, ya fijadas por decisión de producto (no configurables): **pull nunca
  borra** (una fila que solo existe en local se deja intacta, para no perder trabajo de
  campo aún no subido); **push sí espeja borrados** (superadmin, local manda de verdad).
- Limitación conocida: `User.created_by` no está en `EXTRA_FK` (autorreferencia dentro de la
  misma tabla que se está insertando) — se copia el id crudo, que no es significativo en la
  base de datos destino. Es un campo puramente informativo, no usado por ninguna lógica de
  negocio.

### Conexión con la matriz y confirmación

- Configuración (host, puerto, usuario, base de datos, contraseña) en el modelo
  `MatrixSyncConfig` (`backend/app/models/matrix_sync.py`), fila única, sin `SyncUuidMixin`
  a propósito (es local a la instalación, no debe sincronizarse ella misma). La contraseña
  se cifra con `utils/crypto.encrypt_secret` (misma clave de sesión del vault que las
  credenciales de dispositivos). CRUD y test de conexión en
  `backend/app/api/database.py` (`/database/matrix-sync/*`), con la escritura restringida a
  superadmin vía `require_role("superadmin")`.
- El disparo de una sincronización real (con acceso a la contraseña en claro y a los datos)
  se hace desde la **Consola de Red** existente, no desde un formulario: comando
  `syncmatriz <pull|push>` (`backend/app/services/console_commands.py`). Se eligió reutilizar
  la consola real (no solo su estética) para que la sincronización quede sujeta al mismo
  modelo de whitelist cerrada y quede registrada igual que cualquier otro comando.
- Para soportarlo, el protocolo WebSocket de la consola (`backend/app/api/console.py`) se
  amplió con un mensaje `type: "prompt"`: un handler puede hacer
  `respuesta = yield ConsolePrompt("texto", secret=True/False)` y el bucle de la consola lo
  reenvía al cliente, espera la respuesta por el mismo socket y la reinyecta en el generador
  vía `gen.asend(...)`. El resto de comandos (`ping`, `traceroute`, ...) no lo usan y siguen
  funcionando igual. En el frontend, `NetworkConsole.tsx` entra en "modo prompt" mientras
  dura la pregunta: enmascara el eco con `*` si `secret` es verdadero y envía la respuesta
  como `{"answer": ...}` en vez de `{"command": ...}`.
- La passphrase del vault se reintroduce explícitamente en cada sincronización como
  confirmación humana de la acción, sin depender de si el vault ya estaba desbloqueado
  para otros usos (`vault_service.get_fernet_for_passphrase`, que deriva el Fernet sin
  mutar la sesión global del vault).
- Si una sincronización modifica `vault_config`, la sesión del vault se bloquea
  automáticamente (`crypto.clear_session()`) porque la sal/verificador pueden haber cambiado.

### Dónde está el código

- Backend: `models/base.py` (`SyncUuidMixin`), `models/matrix_sync.py`, `services/matrix_sync.py`
  (motor), `services/console_commands.py` (`_cmd_syncmatriz`, `ConsolePrompt`),
  `api/console.py` (protocolo de prompt interactivo), `api/database.py` (config REST),
  `main.py::_migrate_sync_uuids`.
- Frontend: `components/database/DatabaseTab.tsx::MatrixSyncCard`, `components/NetworkConsole.tsx`
  (modo prompt), `lib/api.ts::matrixSyncApi`.
- Pruebas: `backend/tests/test_matrix_sync.py` (remapeo de FK, idempotencia, detección de
  cambios ignorando ids locales, pull nunca borra, push espeja borrados en el orden correcto).
