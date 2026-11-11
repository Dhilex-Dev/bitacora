import { createServer } from 'node:http'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DIR_NOTAS, RAIZ, leerNota, listarNotas } from './notes.mjs'

const PUERTO = Number(process.env.PORT || 4321)
const HOST = process.env.HOST || '127.0.0.1'
const RE_RUTA_NOTA = /^\/notas\/\d{4}-\d{2}-\d{2}\/[^/]+\.md$/

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function json(res, estado, datos) {
  res.writeHead(estado, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(datos))
}

async function servirArchivo(res, absoluto) {
  const info = await stat(absoluto)
  if (!info.isFile()) throw new Error('no es archivo')

  const cuerpo = await readFile(absoluto)
  const ext = path.extname(absoluto).toLowerCase()
  res.writeHead(200, {
    'content-type': TIPOS[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'no-cache',
  })
  res.end(cuerpo)
}

function rutaEstaticaPermitida(pathname) {
  if (pathname === '/' || pathname === '/index.html') return true
  if (pathname === '/styles.css' || pathname === '/app.js') return true
  if (pathname === '/notas/index.json') return true
  return RE_RUTA_NOTA.test(pathname)
}

async function leerCuerpo(req, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) {
      const err = new Error('cuerpo demasiado grande')
      err.status = 413
      throw err
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function origenPermitido(req) {
  const origin = req.headers.origin
  if (!origin) return true
  const esperado = `http://${req.headers.host || `${HOST}:${PUERTO}`}`
  return origin === esperado
}

async function manejarPendiente(req, res) {
  const ct = String(req.headers['content-type'] || '').toLowerCase()
  if (!ct.includes('application/json')) {
    return json(res, 415, { error: 'content-type debe ser application/json' })
  }
  if (!origenPermitido(req)) {
    return json(res, 403, { error: 'origen no permitido' })
  }

  let cuerpo
  try {
    cuerpo = await leerCuerpo(req, 10 * 1024)
  } catch (err) {
    return json(res, err.status || 400, { error: err.message })
  }

  let datos
  try {
    datos = JSON.parse(cuerpo || '{}')
  } catch {
    return json(res, 400, { error: 'JSON inválido' })
  }

  const { ruta, linea, hecho } = datos || {}
  if (typeof ruta !== 'string' || !/^notas\/\d{4}-\d{2}-\d{2}\/[^/]+\.md$/.test(ruta)) {
    return json(res, 400, { error: 'ruta inválida' })
  }
  if (!Number.isInteger(linea) || linea < 0) {
    return json(res, 400, { error: 'línea inválida' })
  }
  if (typeof hecho !== 'boolean') {
    return json(res, 400, { error: 'hecho debe ser booleano' })
  }

  const absoluto = path.resolve(RAIZ, ruta)
  if (!absoluto.startsWith(DIR_NOTAS + path.sep)) {
    return json(res, 400, { error: 'ruta fuera de notas/' })
  }

  let texto
  try {
    texto = await readFile(absoluto, 'utf8')
  } catch {
    return json(res, 404, { error: 'nota no encontrada' })
  }

  const eol = texto.includes('\r\n') ? '\r\n' : '\n'
  const lineas = texto.split(/\r?\n/)
  const actual = lineas[linea]
  if (typeof actual !== 'string') {
    return json(res, 409, { error: 'la línea no existe' })
  }

  const m = actual.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/)
  if (!m) {
    return json(res, 409, { error: 'la línea no es un checkbox' })
  }

  lineas[linea] = `${m[1]}${hecho ? 'x' : ' '}${m[3]}`
  await writeFile(absoluto, lineas.join(eol), 'utf8')

  const nota = await leerNota(ruta)
  return json(res, 200, { ok: true, nota })
}

const servidor = createServer(async (req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname)
  } catch {
    return json(res, 400, { error: 'URL malformada' })
  }

  try {
    if (req.method === 'POST') {
      if (pathname === '/api/pendiente') return await manejarPendiente(req, res)
      return json(res, 405, { error: 'método no permitido' })
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'método no permitido' })
    }

    if (pathname === '/api/notas') {
      const notas = await listarNotas()
      return json(res, 200, { generado: new Date().toISOString(), notas })
    }

    if (pathname === '/api/salud') {
      return json(res, 200, { ok: true, notas: (await listarNotas()).length })
    }

    let relativo = pathname
    if (relativo === '/' || relativo === '') relativo = '/index.html'

    if (!rutaEstaticaPermitida(pathname === '' ? '/' : pathname)) {
      return json(res, 404, { error: 'no encontrado', ruta: pathname })
    }

    const absoluto = path.resolve(RAIZ, `.${relativo}`)
    if (!absoluto.startsWith(RAIZ + path.sep) && absoluto !== path.join(RAIZ, 'index.html')) {
      return json(res, 403, { error: 'fuera del proyecto' })
    }

    try {
      await servirArchivo(res, absoluto)
    } catch {
      json(res, 404, { error: 'no encontrado', ruta: pathname })
    }
  } catch (error) {
    json(res, 500, { error: error.message })
  }
})

servidor.listen(PUERTO, HOST, () => {
  console.log(`bitácora en http://${HOST}:${PUERTO}`)
  console.log('Ctrl+C para parar.')
})
