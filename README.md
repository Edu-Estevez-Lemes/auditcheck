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
