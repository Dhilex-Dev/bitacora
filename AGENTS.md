# Instrucciones para agentes

Proyecto: **bitácora** — una app local que lee notas en Markdown y las muestra
para revisión de fin de día. Es de un solo usuario: no hay auth, ni base de datos,
ni despliegue.

## Al terminar una sesión de trabajo, escribe una nota

Forma recomendada (crea el archivo con fecha/hora locales y nunca sobrescribe):

```sh
pnpm run nota -- --agente opencode --tarea "arreglar login" \
  --proyecto mi-proyecto --hecho "Migré X" --pendiente "Añadir tests"
```

También puedes crear el archivo a mano en `notas/AAAA-MM-DD/HHMM-<agente>.md`
(fecha y hora reales, 24 h sin `:`, agente en minúsculas), p. ej.
`notas/2026-11-01/1812-opencode.md`.

No edites notas de otras sesiones ni de otros agentes. Si necesitas corregir
algo tuyo del mismo día, crea otra nota; la app las ordena por hora.

### Formato

```md
---
fecha: 2026-11-01
hora: 18:12
agente: opencode
tarea: arreglar login con cookies
estado: hecho
proyecto: mi-proyecto
---

## Hecho
- Migré la sesión a cookies httpOnly.
- Eliminé el endpoint viejo.

## Pendiente
- [ ] Añadir tests del refresh token.
- [x] Borrar `/auth/legacy`.

## Notas
Cualquier contexto que no se deduzca del diff.
```

Reglas del formato:

- `estado`: `hecho`, `en-curso` o `bloqueado`.
- `proyecto`: opcional, nombre corto del proyecto relacionado.
- `tarea`: una línea, imperativo o sustantivo corto. Es el título de la tarjeta.
- `## Pendiente` usa checkboxes: `- [ ]` abierto, `- [x]` hecho. **La vista
  Pendientes agrega todos los `- [ ]` de todos los días**, así que aquí van las
  tareas que faltan, no las que ya hiciste.
- Sé breve: 3–8 viñetas repartidas entre las secciones. Sin relleno.
- Markdown inline admitido: `code`, **negrita**, *cursiva*, [texto](https://url).

## Qué NO hacer

- No toques `index.html`, `styles.css`, `app.js` ni `scripts/` para "arreglar"
  una nota mal formada: corrige la nota o crea otra.
- No metas notas en la raíz de `notas/`; siempre dentro de una carpeta de fecha.
- No borres ni renombres notas antiguas.
- No commitees `notas/index.json` (es generado).

## Comandos

```sh
pnpm run dev     # servidor en http://127.0.0.1:4321
pnpm run index   # genera notas/index.json para servidores estáticos
pnpm run nota    # crea una nota (recomendado; ver --help)
```

## Verificación rápida

```sh
node -e "import('./scripts/notes.mjs').then(async m => console.log((await m.listarNotas()).length, 'notas'))"
```
