import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR_NOTAS = path.join(RAIZ, 'notas')
const ESTADOS = new Set(['hecho', 'en-curso', 'bloqueado'])

const USO = `Uso:
  pnpm run nota -- --agente <nombre> --tarea "<tarea>" [opciones]

Opciones:
  --agente <nombre>     Agente (obligatorio, solo [a-z0-9-])
  --tarea <texto>       Tarea/título (obligatorio)
  --estado <estado>     hecho | en-curso | bloqueado (por defecto: hecho)
  --proyecto <nombre>   Proyecto (opcional)
  --hecho <texto>       Viñeta en "## Hecho" (repetible)
  --pendiente <texto>   Checkbox en "## Pendiente" (repetible; prefijo "x " = hecho)
  --notas <texto>       Texto libre en "## Notas"
  --dry-run             Muestra el contenido sin escribir
  --help                Muestra esta ayuda
`

function pad(n) {
  return String(n).padStart(2, '0')
}

function ahoraLocal() {
  const d = new Date()
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    hhmm: `${pad(d.getHours())}${pad(d.getMinutes())}`,
  }
}

function resolverRuta(fecha, hhmm, agente) {
  const dir = path.join(DIR_NOTAS, fecha)
  const base = `${hhmm}-${agente}`
  let nombre = `${base}.md`
  let i = 2
  while (existsSync(path.join(dir, nombre))) {
    nombre = `${base}-${i}.md`
    i++
  }
  return { dir, nombre, ruta: path.join(dir, nombre), relativa: `notas/${fecha}/${nombre}` }
}

function formatear({ fecha, hora, agente, tarea, estado, proyecto, hechos, pendientes, notas }) {
  const lineas = ['---', `fecha: ${fecha}`, `hora: ${hora}`, `agente: ${agente}`, `tarea: ${tarea}`, `estado: ${estado}`]
  if (proyecto) lineas.push(`proyecto: ${proyecto}`)
  lineas.push('---')

  const secciones = []
  if (hechos.length) {
    secciones.push(['## Hecho', ...hechos.map((t) => `- ${t}`)].join('\n'))
  }
  if (pendientes.length) {
    const items = pendientes.map((t) => {
      if (t.startsWith('x ')) return `- [x] ${t.slice(2)}`
      if (t.startsWith('X ')) return `- [x] ${t.slice(2)}`
      return `- [ ] ${t}`
    })
    secciones.push(['## Pendiente', ...items].join('\n'))
  }
  if (notas) {
    secciones.push(`## Notas\n${notas}`)
  }

  if (secciones.length) {
    lineas.push('', secciones.join('\n\n'))
  }
  lineas.push('')
  return lineas.join('\n')
}

async function main() {
  let values
  try {
    const args = process.argv.slice(2)
    if (args[0] === '--') args.shift()
    ;({ values } = parseArgs({
      args,
      options: {
        agente: { type: 'string' },
        tarea: { type: 'string' },
        estado: { type: 'string', default: 'hecho' },
        proyecto: { type: 'string' },
        hecho: { type: 'string', multiple: true, default: [] },
        pendiente: { type: 'string', multiple: true, default: [] },
        notas: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    }))
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USO}`)
    process.exit(1)
  }

  if (values.help) {
    process.stdout.write(USO)
    return
  }

  const agente = String(values.agente || '').trim().toLowerCase()
  const tarea = String(values.tarea || '').trim()
  const estado = String(values.estado || 'hecho').trim().toLowerCase()
  const proyecto = String(values.proyecto || '').trim()
  const notas = String(values.notas || '').trim()
  const hechos = (values.hecho || []).map((s) => String(s).trim()).filter(Boolean)
  const pendientes = (values.pendiente || []).map((s) => String(s).trim()).filter(Boolean)

  if (!agente || !/^[a-z0-9-]+$/.test(agente)) {
    process.stderr.write(`Error: --agente es obligatorio y solo permite [a-z0-9-].\n\n${USO}`)
    process.exit(1)
  }
  if (!tarea) {
    process.stderr.write(`Error: --tarea es obligatoria.\n\n${USO}`)
    process.exit(1)
  }
  if (!ESTADOS.has(estado)) {
    process.stderr.write(`Error: --estado debe ser hecho, en-curso o bloqueado.\n\n${USO}`)
    process.exit(1)
  }

  const { fecha, hora, hhmm } = ahoraLocal()
  const contenido = formatear({ fecha, hora, agente, tarea, estado, proyecto, hechos, pendientes, notas })

  if (values['dry-run']) {
    process.stdout.write(contenido)
    return
  }

  const { dir, ruta, relativa } = resolverRuta(fecha, hhmm, agente)
  await mkdir(dir, { recursive: true })
  await writeFile(ruta, contenido, { encoding: 'utf8', flag: 'wx' })
  console.log(relativa)
}

main().catch((err) => {
  if (err?.code === 'EEXIST') {
    process.stderr.write('Error: el archivo ya existe (condición de carrera). Reintenta.\n')
  } else {
    process.stderr.write(`Error: ${err.message}\n`)
  }
  process.exit(1)
})
