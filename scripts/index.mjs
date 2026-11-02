import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DIR_NOTAS, listarNotas } from './notes.mjs'

// Escribe notas/index.json para usar la app con cualquier servidor estático.
const notas = await listarNotas()
const destino = path.join(DIR_NOTAS, 'index.json')

await writeFile(
  destino,
  JSON.stringify({ generado: new Date().toISOString(), notas }, null, 2) + '\n',
  'utf8',
)

console.log(`index.json escrito con ${notas.length} nota(s) → ${path.relative(process.cwd(), destino)}`)
