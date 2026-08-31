# Auditoría Manual

## Cuándo usarla

Cuando el único acceso a los sistemas de un cliente es a través de **AnyDesk** (u otro
acceso remoto de escritorio), no es posible ejecutar el escaneo de red automático de
AuditCheck (requiere conectividad IP directa desde la máquina donde corre AuditCheck).
La "Auditoría Manual" permite crear una auditoría sin escaneo, dar de alta los hosts a
mano mientras se navega por el cliente vía AnyDesk, y completar el mismo checklist por
categorías que ya usa el módulo de Revisiones — con informes, historial y dashboard
funcionando igual que en una auditoría automática.

## Cómo crear una Auditoría Manual

1. Ve a **Auditorías** → **Nueva auditoría** (o desde la pestaña **Auditorías** de la
   ficha del cliente).
2. Selecciona el modo **"Auditoría manual"** en vez de "Escaneo de red automático".
3. Indica el cliente (si no venías ya desde su ficha), un nombre y notas opcionales.
4. Pulsa **Crear auditoría manual**. Se crea al instante (sin escaneo) y te lleva a su
   detalle.

Si el cliente ya tenía hosts registrados en auditorías anteriores (automáticas o
manuales), aparecerán precargados automáticamente a partir de la base de conocimiento
del cliente — revísalos y actualízalos si algo ha cambiado.

## Dar de alta hosts

En el detalle de la auditoría manual, usa el botón **"Añadir host"** (solo visible en
auditorías manuales) para registrar cada equipo: dirección IP (obligatoria), nombre
visible, hostname, tipo de dispositivo, fabricante, sistema operativo, credencial de
acceso, ubicación y observaciones. No hace falta asignar una credencial para poder
seleccionar el host en el checklist (a diferencia de una auditoría por escaneo).

Los hosts añadidos se guardan también en la base de conocimiento del cliente, así que
la próxima auditoría manual (o un futuro escaneo) los reconocerá automáticamente.

## Completar el checklist

Con al menos un host dado de alta, pulsa **"Revisión Manual"** para abrir el mismo
asistente que usan las revisiones semanales: elige categorías por host, marca cada
ítem como OK / Warning / Critical (o "verificado" cuando la categoría no tiene ítems
desglosados), y añade observaciones libres por host y categoría. Puedes guardar como
plantilla o aplicar una plantilla existente igual que en cualquier revisión.

Al exportar Excel/PDF y marcar la revisión como completada, la auditoría pasa
automáticamente a estado **"Completada"** — igual que ocurre al finalizar un escaneo.

## Hallazgos manuales

Durante la sesión de AnyDesk puedes registrar hallazgos (findings) igual que en
cualquier auditoría, desde la pestaña "Hallazgos" del detalle de la auditoría.

## Diferencias frente a una auditoría automática

- Aparece marcada con la etiqueta **"Manual"** en Auditorías, en la ficha del cliente,
  en el detalle de la auditoría y en el Dashboard, para no confundirla con una
  auditoría por escaneo.
- **No aparece** en los desplegables de **Comparativas**: el comparador técnico se basa
  en datos de escaneo (dispositivos/puertos) que una auditoría manual no genera.
- El resto (informes Excel/PDF, historial por cliente, hallazgos, estadísticas del
  dashboard) funciona exactamente igual que en una auditoría automática.
