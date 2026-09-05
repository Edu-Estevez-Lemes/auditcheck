# Sincronización con la matriz

## Qué es

Permite mantener sincronizada la base de datos embebida de cada instalación de
AuditCheck (SQLite, local a cada equipo) con una base de datos central "matriz"
(MySQL) compartida por toda la organización — por ejemplo, para que varios
técnicos trabajen sobre el mismo catálogo de clientes, plantillas de checklist
y credenciales, o para centralizar en la matriz el trabajo de campo de todos.

- **Traer de la matriz (pull):** copia a este equipo las altas y los cambios
  que haya en la matriz. Disponible para **todos los roles**. Nunca borra nada
  en local: si tienes una auditoría o un cliente creado aquí que aún no se ha
  subido a la matriz, un "traer de la matriz" no lo va a eliminar aunque no
  exista todavía allí.
- **Enviar a la matriz (push):** sube los datos de este equipo a la matriz,
  incluyendo borrados (si borraste algo aquí, también se borra en la matriz).
  **Solo el superadmin** puede hacerlo.

En un conflicto (la misma fila con contenido distinto a ambos lados) gana
siempre el lado de origen de la dirección elegida: la matriz manda en un pull,
lo local manda en un push. No hay fusión campo a campo.

## Configurar la conexión (solo superadmin)

1. Ve a **Configuración → Base de Datos → Sincronización con la matriz**.
2. Rellena **Host/IP**, **Puerto**, **Base de datos**, **Usuario** y
   **Contraseña** del servidor MySQL de la matriz.
3. Pulsa **Probar conexión** para comprobar que los datos son correctos antes
   de guardar.
4. Pulsa **Guardar conexión**. La contraseña se cifra con la passphrase
   maestra del vault — necesitas tenerlo desbloqueado para guardarla.

Una vez guardada, cualquier usuario ve el estado de la conexión (configurada o
no, y la fecha/dirección de la última sincronización) en esa misma pantalla,
aunque solo el superadmin puede modificarla.

## Sincronizar

Desde **Configuración → Base de Datos**, pulsa **"Traer de la matriz"** o (si
eres superadmin) **"Enviar a la matriz"**. Esto abre la **Consola de Red** con
el comando ya preparado (`syncmatriz pull` o `syncmatriz push`) — pulsa Enter
para lanzarlo y sigue el proceso ahí:

1. La consola te pide la **passphrase del vault**, como confirmación explícita
   de que autorizas la sincronización (independiente de que el vault ya esté
   desbloqueado para otros usos). No se muestra en pantalla.
2. Calcula y muestra las diferencias por tabla: cuántas filas se añadirían,
   modificarían o (solo en push) eliminarían.
3. Pide confirmación explícita (escribir `SI`) antes de tocar nada.
4. Crea automáticamente un backup de seguridad de la base de datos local antes
   de aplicar cualquier cambio.
5. Aplica los cambios y muestra el resultado final.

También puedes escribir el comando a mano en la Consola de Red (icono flotante
en cualquier pantalla): `syncmatriz pull` o `syncmatriz push`.

## Notas importantes

- La sincronización incluye **todas** las tablas de la aplicación: clientes,
  auditorías, dispositivos, hallazgos, credenciales, plantillas de checklist,
  usuarios, configuración del vault, identidad visual y registro de
  actividad. Si una sincronización trae o envía cambios en la configuración
  del vault, tu sesión del vault se bloqueará automáticamente — tendrás que
  volver a desbloquearlo (con la passphrase vigente después de sincronizar).
- Si algo falla a mitad de la sincronización, no se aplica ningún cambio
  parcial: o se aplica todo o no se aplica nada. Además siempre queda el
  backup automático del paso 4 por si hiciera falta restaurar.
- Un técnico o administrador solo puede traer de la matriz; si necesita subir
  su trabajo, debe pedir a un superadmin que haga el "Enviar a la matriz",
  o solicitar que se le conceda ese rol.
