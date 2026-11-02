import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { RAIZ, listarNotas } from './notes.mjs'

const PUERTO = Number(process.env.PORT || 4321)
const HOST = process.env.HOST || '127.0.0.1'

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
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

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'solo lectura' })
    }

    if (url.pathname === '/api/notas') {
      const notas = await listarNotas()
      return json(res, 200, {
        generado: new Date().toISOString(),
        notas,
      })
    }

    if (url.pathname === '/api/salud') {
      return json(res, 200, { ok: true, notas: (await listarNotas()).length })
    }

    let relativo = decodeURIComponent(url.pathname)
    if (relativo === '/' || relativo === '') relativo = '/index.html'

    const absoluto = path.resolve(RAIZ, `.${relativo}`)
    if (!absoluto.startsWith(RAIZ + path.sep)) {
      return json(res, 403, { error: 'fuera del proyecto' })
    }

    try {
      await servirArchivo(res, absoluto)
    } catch {
      json(res, 404, { error: 'no encontrado', ruta: relativo })
    }
  } catch (error) {
    json(res, 500, { error: error.message })
  }
})

servidor.listen(PUERTO, HOST, () => {
  console.log(`bitácora en http://${HOST}:${PUERTO}`)
  console.log('Ctrl+C para parar.')
})
