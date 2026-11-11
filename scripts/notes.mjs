import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DIR_NOTAS = path.join(RAIZ, 'notas')

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}$/
const RE_NOMBRE = /^\d{4}-[a-z0-9-]+(?:-\d+)?\.md$/
const ESTADOS = new Set(['hecho', 'en-curso', 'bloqueado'])

function esFechaValida(fecha) {
  if (!RE_FECHA.test(fecha)) return false
  const [y, m, d] = fecha.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Separa el frontmatter (---) del cuerpo markdown. */
function separarFrontmatter(texto) {
  const normalizado = texto.replace(/\r\n/g, '\n')
  if (!normalizado.startsWith('---\n')) {
    return { datos: {}, cuerpo: normalizado, tieneFrontmatter: false, lineasFrontmatter: 0 }
  }

  const fin = normalizado.indexOf('\n---', 4)
  if (fin === -1) {
    return { datos: {}, cuerpo: normalizado, tieneFrontmatter: false, lineasFrontmatter: 0 }
  }

  const cabecera = normalizado.slice(4, fin)
  const resto = normalizado.slice(fin + 4)
  // El cierre `\n---` ocupa una línea; consumimos un salto tras él si existe.
  const cuerpo = resto.replace(/^\n/, '')
  const datos = {}

  for (const linea of cabecera.split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue

    const corte = limpia.indexOf(':')
    if (corte === -1) continue

    const clave = limpia.slice(0, corte).trim()
    let valor = limpia.slice(corte + 1).trim()
    valor = valor.replace(/\s+#(\s.*)?$/, '')
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    if (clave) datos[clave] = valor
  }

  // Línea (0-based, archivo completo) donde comienza `cuerpo`.
  const antes = normalizado.slice(0, fin + 4)
  const consumido = resto.startsWith('\n') ? 1 : 0
  const lineasFrontmatter = antes.split('\n').length - 1 + consumido

  return { datos, cuerpo, tieneFrontmatter: true, lineasFrontmatter }
}

/** Convierte el cuerpo en secciones con bloques tipados. */
function parsearCuerpo(cuerpo, offsetLinea = 0) {
  const lineas = cuerpo.split('\n')
  const secciones = []
  let actual = { titulo: null, bloques: [] }
  let parrafo = []

  const cerrarParrafo = () => {
    if (parrafo.length) {
      actual.bloques.push({ tipo: 'texto', texto: parrafo.map((p) => p.texto).join(' ') })
      parrafo = []
    }
  }

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    const titulo = linea.match(/^##\s+(.+?)\s*$/)

    if (titulo) {
      cerrarParrafo()
      if (actual.titulo !== null || actual.bloques.length) secciones.push(actual)
      actual = { titulo: titulo[1], bloques: [] }
      continue
    }

    const tarea = linea.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (tarea) {
      cerrarParrafo()
      actual.bloques.push({
        tipo: 'tarea',
        hecho: tarea[1].toLowerCase() === 'x',
        texto: tarea[2].trim(),
        linea: offsetLinea + i,
      })
      continue
    }

    const vineta = linea.match(/^\s*[-*]\s+(.*)$/)
    if (vineta) {
      cerrarParrafo()
      actual.bloques.push({ tipo: 'vineta', texto: vineta[1].trim() })
      continue
    }

    if (!linea.trim()) {
      cerrarParrafo()
      continue
    }

    parrafo.push({ texto: linea.trim() })
  }

  cerrarParrafo()
  if (actual.titulo !== null || actual.bloques.length) secciones.push(actual)

  return secciones.filter((s) => s.titulo !== null || s.bloques.length)
}

function detectarAvisos({ datos, ruta, archivo, tieneFrontmatter }) {
  const avisos = []
  const fechaRuta = ruta.match(/notas\/(\d{4}-\d{2}-\d{2})\//)?.[1] || ''

  if (!tieneFrontmatter) avisos.push('sin frontmatter')
  if (!datos.fecha) avisos.push('falta fecha')
  if (!datos.hora) avisos.push('falta hora')
  if (!datos.agente) avisos.push('falta agente')
  if (!datos.tarea) avisos.push('falta tarea')
  if (!datos.estado) avisos.push('falta estado')

  if (datos.fecha && !esFechaValida(datos.fecha)) {
    avisos.push('fecha no es AAAA-MM-DD válida')
  } else if (datos.fecha && fechaRuta && datos.fecha !== fechaRuta) {
    avisos.push('fecha distinta de la carpeta')
  }

  if (datos.hora && !RE_HORA.test(datos.hora)) {
    avisos.push('hora no es HH:MM')
  }

  if (datos.estado && !ESTADOS.has(String(datos.estado).toLowerCase())) {
    avisos.push('estado fuera de hecho|en-curso|bloqueado')
  }

  if (archivo && !RE_NOMBRE.test(archivo)) {
    avisos.push('nombre de archivo que no sigue HHMM-<agente>.md')
  }

  return avisos
}

function normalizarNota(datos, cuerpo, ruta, tieneFrontmatter, lineasFrontmatter) {
  const id = ruta.replace(/^notas\//, '').replace(/\.md$/, '')
  const fechaRuta = ruta.match(/notas\/(\d{4}-\d{2}-\d{2})\//)
  const archivo = ruta.split('/').pop() || ''

  return {
    id,
    ruta,
    fecha: datos.fecha || fechaRuta?.[1] || '',
    hora: (datos.hora || '').slice(0, 5),
    agente: datos.agente || 'desconocido',
    tarea: datos.tarea || '',
    estado: (datos.estado || '').toLowerCase(),
    proyecto: datos.proyecto || '',
    secciones: parsearCuerpo(cuerpo, lineasFrontmatter),
    avisos: detectarAvisos({ datos, ruta, archivo, tieneFrontmatter }),
  }
}

export function parsearNota(texto, ruta) {
  const { datos, cuerpo, tieneFrontmatter, lineasFrontmatter } = separarFrontmatter(texto)
  return normalizarNota(datos, cuerpo, ruta, tieneFrontmatter, lineasFrontmatter)
}

/** Re-parsea una sola nota por ruta relativa (p. ej. notas/2026-11-01/1640-claude.md). */
export async function leerNota(ruta) {
  const texto = await readFile(path.join(RAIZ, ruta), 'utf8')
  return parsearNota(texto, ruta)
}

/** Lee todas las notas de notas/AAAA-MM-DD/*.md, de más nueva a más vieja. */
export async function listarNotas() {
  let dias = []
  try {
    dias = (await readdir(DIR_NOTAS, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && RE_DIA.test(d.name))
      .map((d) => d.name)
  } catch {
    return []
  }

  const notas = []
  for (const dia of dias) {
    let archivos = []
    try {
      archivos = (await readdir(path.join(DIR_NOTAS, dia), { withFileTypes: true }))
        .filter((f) => f.isFile() && f.name.endsWith('.md'))
        .map((f) => f.name)
    } catch {
      continue
    }

    for (const archivo of archivos) {
      const ruta = `notas/${dia}/${archivo}`
      try {
        notas.push(await leerNota(ruta))
      } catch {
        // Archivo ilegible: se ignora en lugar de romper la vista.
      }
    }
  }

  return notas.sort(ordenarNotas)
}

export function ordenarNotas(a, b) {
  return `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`)
}
