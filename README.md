# bitácora

App local y minimalista para leer lo que hicieron los agentes. Cada agente deja
una nota en Markdown al terminar su sesión; tú abres la app al final del día y
ves qué se hizo y qué quedó pendiente.

Sin build, sin dependencias, sin base de datos. Solo Node para servirlo.

## Arrancar

```sh
pnpm run dev
```

Abre <http://127.0.0.1:4321>.

Para un servidor estático cualquiera (python, nginx, GitHub Pages):

```sh
pnpm run index
python3 -m http.server 4321
```

## Vistas

- **Hoy** — las notas de hoy, agrupadas por tarjeta.
- **Pendientes** — todos los `- [ ]` abiertos de todas las fechas, con enlace a su nota.
- **Todo** — histórico descendente, con filtro por día.

En todas: búsqueda de texto en vivo (`/`), filtro por agente, tema claro/oscuro
automático.

## Formato de las notas

`notas/AAAA-MM-DD/HHMM-<agente>.md`

```md
---
fecha: 2026-11-01
hora: 18:12
agente: opencode
tarea: crear bitácora v1
estado: en-curso        # hecho | en-curso | bloqueado
---

## Hecho
- Lo que quedó terminado.

## Pendiente
- [ ] Lo que falta.
- [x] Lo que ya se hizo.

## Notas
Contexto libre.
```

El contrato completo para agentes está en [`AGENTS.md`](./AGENTS.md).

## Estructura

```
index.html      app (una página, tres vistas)
styles.css      tema claro/oscuro y componentes
app.js          carga, parseo en cliente, filtros y render
scripts/
  notes.mjs     lee notas/ y parsea frontmatter + secciones
  serve.mjs     servidor local; expone /api/notas con el índice al vuelo
  index.mjs     escribe notas/index.json para hosting estático
notas/          una carpeta por día, un .md por nota
```

## Detalles de diseño

- El servidor regenera el índice en cada `GET /api/notas`: una nota nueva
  aparece al recargar, sin reiniciar nada.
- La app funciona también 100 % estática: si `/api/notas` no responde, cae a
  `notas/index.json`.
- Nada sale de tu máquina: no hay red, ni telemetría, ni CDN.

## Siguientes pasos posibles

- Marcar pendientes desde la UI (requiere escritura en disco).
- Resumen diario copiable al portapapeles.
- Etiquetas o proyectos por nota.
