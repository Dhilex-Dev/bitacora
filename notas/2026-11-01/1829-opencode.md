---
fecha: 2026-11-01
hora: 18:29
agente: opencode
tarea: crear bitácora v1
estado: hecho
---

## Hecho
- App de una página con vistas **Hoy**, **Pendientes** y **Todo**, búsqueda en vivo, filtro por agente y tema claro/oscuro.
- Parser de notas en `scripts/notes.mjs`: frontmatter, secciones y checkboxes.
- Servidor local sin dependencias (`scripts/serve.mjs`) que genera el índice en cada petición, más `scripts/index.mjs` para hosting estático.
- 15 comprobaciones funcionales pasadas con Chrome DevTools Protocol (búsqueda, filtro, pestañas, enlaces "ver nota", chips de día, atajo `/`).
- Repo git inicializado y registrado en Orca como proyecto `bitacora`.

## Pendiente
- [ ] Abrir la app desde Orca y usarla un día real.
- [ ] Decidir si merece la pena marcar pendientes desde la interfaz (requiere escritura).
- [ ] Añadir un botón para copiar el resumen del día.

## Notas
Arranque: `pnpm run dev` → http://127.0.0.1:4321.
Una nota nueva aparece al recargar, sin reiniciar el servidor.
