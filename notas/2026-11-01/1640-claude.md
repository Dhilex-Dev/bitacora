---
fecha: 2026-11-01
hora: 16:40
agente: claude
tarea: sesión de cookies en playlist-port
estado: hecho
---

## Hecho
- Migré la sesión a cookies `httpOnly` y `SameSite=Lax`.
- Eliminé el endpoint viejo de login con token en localStorage.

## Pendiente
- [x] Borrar el endpoint `/auth/legacy`.
- [ ] Añadir tests del refresh token.

## Notas
Queda pendiente decidir si el refresh token rota en cada uso; lo dejo
anotado para revisarlo mañana.
