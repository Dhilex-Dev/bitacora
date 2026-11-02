import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DIR_NOTAS = path.join(RAIZ, 'notas')

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/

/** Separa el frontmatter (---) del cuerpo markdown. */
function separarFrontmatter(texto) {
  const normalizado = texto.replace(/\r\n/g, '\n')
  if (!normalizado.startsWith('---\n')) {
    return { datos: {}, cuerpo: normalizado }
  }

  const fin = normalizado.indexOf('\n---', 4)
  if (fin === -1) {
    return { datos: {}, cuerpo: normalizado }
  }

  const cabecera = normalizado.slice(4, fin)
  const cuerpo = normalizado.slice(fin + 4).replace(/^\n+/, '')
  const datos = {}

  for (const linea of cabecera.split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue

    const corte = limpia.indexOf(':')
    if (corte === -1) continue

    const clave = limpia.slice(0, corte).trim()
    let valor = limpia.slice(corte + 1).trim()
    valor = valor.replace(/\s+#.*$/, '')
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    if (clave) datos[clave] = valor
  }

  return { datos, cuerpo }
}

/** Convierte el cuerpo en secciones con bloques tipados. */
function parsearCuerpo(cuerpo) {
  const lineas = cuerpo.split('\n')
  const secciones = []
  let actual = { titulo: null, bloques: [] }
  let parrafo = []

  const cerrarParrafo = () => {
    if (parrafo.length) {
      actual.bloques.push({ tipo: 'texto', texto: parrafo.join(' ') })
      parrafo = []
    }
  }

  for (const linea of lineas) {
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

    parrafo.push(linea.trim())
  }

  cerrarParrafo()
  if (actual.titulo !== null || actual.bloques.length) secciones.push(actual)

  return secciones.filter((s) => s.titulo !== null || s.bloques.length)
}

function normalizarNota(datos, cuerpo, ruta) {
  const id = ruta.replace(/^notas\//, '').replace(/\.md$/, '')
  const fechaRuta = ruta.match(/notas\/(\d{4}-\d{2}-\d{2})\//)

  return {
    id,
    ruta,
    fecha: datos.fecha || fechaRuta?.[1] || '',
    hora: (datos.hora || '').slice(0, 5),
    agente: datos.agente || 'desconocido',
    tarea: datos.tarea || '',
    estado: (datos.estado || '').toLowerCase(),
    secciones: parsearCuerpo(cuerpo),
  }
}

export function parsearNota(texto, ruta) {
  const { datos, cuerpo } = separarFrontmatter(texto)
  return normalizarNota(datos, cuerpo, ruta)
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
        const texto = await readFile(path.join(RAIZ, ruta), 'utf8')
        notas.push(parsearNota(texto, ruta))
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
