---
fecha: 2026-11-08
hora: 10:05
agente: claude
tarea: mejoras v2 de bitácora
estado: hecho
proyecto: bitacora
---

## Hecho
- Servidor limitado a los archivos de la app y `notas/` (antes servía `.git/`).
- Pendientes marcables desde la UI vía `POST /api/pendiente`, avisos de formato y campo `proyecto`.
- Nuevo `pnpm run nota` para que los agentes creen notas en una línea; documentado en AGENTS.md.
- UI: copiar resumen del día, filtro de proyecto, badges de estado, móvil. Implementado por opencode (iceman-free), revisado por Claude.

## Pendiente
- [ ] Validar que la línea marcada sigue siendo la misma tarea (enviar también el texto) por si la nota cambió.
- [ ] Usarla un día real y ajustar la UI.

## Notas
El parser de frontmatter ya no corta valores con `#12`; solo trata como comentario `# ` con espacio.
