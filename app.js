const VISTAS = ['hoy', 'pendientes', 'todo', 'completados']

const estado = {
  notas: [],
  vista: vistaDeHash(),
  q: '',
  agente: 'todos',
  proyecto: 'todos',
  dia: null,
  foco: null,
  modoEstatico: false,
  apiPendienteOk: true,
  // Filas marcadas como hecho que aún se muestran (transición de ~1,5 s) antes de salir de la lista.
  marcasRecientes: [],
  // Toast de deshacer: { ruta, linea, deshacer } donde deshacer es el valor con el que se llama al API.
  toast: null,
  timerMarca: null,
  timerToast: null,
}

function vistaDeHash() {
  const hash = location.hash.replace(/^#/, '')
  return VISTAS.includes(hash) ? hash : 'hoy'
}

const el = {
  resumen: document.getElementById('resumen'),
  buscar: document.getElementById('buscar'),
  filtro: document.getElementById('filtro-agente'),
  filtroProyecto: document.getElementById('filtro-proyecto'),
  copiarResumen: document.getElementById('copiar-resumen'),
  mensaje: document.getElementById('mensaje-corto'),
  pestanas: [...document.querySelectorAll('.pestanas button')],
  vista: document.getElementById('vista'),
}

function mostrarMensajeCorto(texto) {
  if (!el.mensaje) return
  el.mensaje.textContent = texto
  el.mensaje.classList.add('visible')
  setTimeout(() => {
    el.mensaje.classList.remove('visible')
  }, 1800)
}

/** Pone en mayúscula solo la primera letra. Nunca modifica los .md: solo se usa al mostrar. */
function capitalizar(texto) {
  if (texto == null) return ''
  return String(texto).charAt(0).toUpperCase() + String(texto).slice(1)
}

/* ---------- utilidades ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Markdown inline mínimo: `code`, **negrita**, *cursiva*, [texto](url). */
function inline(texto) {
  let salida = esc(texto)
  const codigos = []
  // Extraer código primero para protegerlo
  salida = salida.replace(/`([^`]+)`/g, (m, p1) => {
    const idx = codigos.length
    codigos.push(`<code>${p1}</code>`)
    return `__CODE_${idx}__`
  })
  salida = salida.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  salida = salida.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  salida = salida.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
  salida = salida.replace(/__CODE_(\d+)__/g, (m, i) => codigos[Number(i)])
  return salida
}

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaLarga(iso) {
  if (!iso) return 'sin fecha'
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function etiquetaDia(iso) {
  const hoy = hoyISO()
  const ayer = new Date(Date.now() - 86400000)
  const ayerISO = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`
  if (iso === hoy) return 'hoy'
  if (iso === ayerISO) return 'ayer'
  return fechaLarga(iso)
}

function tonoAgente(nombre) {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360
  return h
}

function pendientesDe(nota) {
  const salida = []
  for (const seccion of nota.secciones) {
    for (const bloque of seccion.bloques) {
      if (bloque.tipo === 'tarea' && !bloque.hecho) {
        salida.push({ texto: bloque.texto, linea: bloque.linea, bloque })
      }
    }
  }
  return salida
}

function completadosDe(nota) {
  const salida = []
  for (const seccion of nota.secciones) {
    for (const bloque of seccion.bloques) {
      if (bloque.tipo === 'tarea' && bloque.hecho) {
        salida.push({ texto: bloque.texto, linea: bloque.linea, bloque })
      }
    }
  }
  return salida
}

function textoDeNota(nota) {
  return [
    nota.agente,
    nota.tarea,
    nota.estado,
    nota.proyecto || '',
    ...nota.secciones.flatMap((s) => [s.titulo || '', ...s.bloques.map((b) => b.texto)]),
  ]
    .join(' ')
    .toLowerCase()
}

/* ---------- carga ---------- */

async function cargar() {
  const fuentes = ['/api/notas', 'notas/index.json']
  let ultimoError = null

  for (let i = 0; i < fuentes.length; i++) {
    const url = fuentes[i]
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const datos = await res.json()
      estado.notas = Array.isArray(datos.notas) ? datos.notas : []
      estado.modoEstatico = i === 1
      return
    } catch (error) {
      ultimoError = error
    }
  }

  throw ultimoError || new Error('sin fuente de notas')
}

/* ---------- filtros ---------- */

function notasFiltradas() {
  const q = estado.q.trim().toLowerCase()
  return estado.notas.filter((nota) => {
    if (estado.agente !== 'todos' && nota.agente !== estado.agente) return false
    if (estado.proyecto !== 'todos') {
      const proyectoNota = nota.proyecto || ''
      if (proyectoNota !== estado.proyecto) return false
    }
    if (q) {
      const texto = textoDeNota(nota)
      const proyectoNota = (nota.proyecto || '').toLowerCase()
      if (!texto.includes(q) && !proyectoNota.includes(q)) return false
    }
    return true
  })
}

function diasDe(notas) {
  const mapa = new Map()
  for (const nota of notas) {
    if (!mapa.has(nota.fecha)) mapa.set(nota.fecha, [])
    mapa.get(nota.fecha).push(nota)
  }
  return mapa
}

/* ---------- render ---------- */

function puedeMarcarPendientes() {
  if (estado.modoEstatico) return false
  if (estado.apiPendienteOk === false) return false
  return true
}

function bloqueHTML(bloque, nota) {
  if (bloque.tipo === 'tarea') {
    const hecho = bloque.hecho ? true : false
    const linea = bloque.linea
    const deshabilitado = !puedeMarcarPendientes() || linea === undefined || linea === null
    const title = deshabilitado
      ? (estado.modoEstatico || estado.apiPendienteOk === false)
        ? 'Solo lectura (sin endpoint /api/pendiente disponible)'
        : 'No se puede marcar este pendiente'
      : ''
    return `<li class="tarea ${hecho ? 'hecha' : ''}">
      <label class="tarea-label">
        <input type="checkbox" class="tarea-check" data-ruta="${esc(nota?.ruta || '')}" data-linea="${linea}" data-hecho="${hecho ? '1' : '0'}" ${hecho ? 'checked' : ''} ${deshabilitado ? 'disabled' : ''} aria-label="${esc(bloque.texto)}" ${title ? `title="${esc(title)}"` : ''}>
        <span class="tarea-texto">${inline(bloque.texto)}</span>
      </label>
    </li>`
  }
  if (bloque.tipo === 'vineta') return `<li>${inline(bloque.texto)}</li>`
  return `<li class="texto">${inline(bloque.texto)}</li>`
}

function notaHTML(nota) {
  const tono = tonoAgente(nota.agente)
  const estadoClase = nota.estado ? `estado-${nota.estado}` : ''
  const proyecto = nota.proyecto && String(nota.proyecto).trim() ? nota.proyecto : ''
  const avisos = Array.isArray(nota.avisos) ? nota.avisos.filter(Boolean) : []

  const secciones = nota.secciones
    .map(
      (s) => `
        <section class="seccion">
          ${s.titulo ? `<h4>${esc(capitalizar(s.titulo))}</h4>` : ''}
          <ul class="bloques">${s.bloques.map((b) => bloqueHTML(b, nota)).join('')}</ul>
        </section>`,
    )
    .join('')

  return `
    <article class="nota" id="nota-${esc(nota.id)}">
      <div class="nota-cabecera">
        <div>
          ${nota.tarea ? `<h3 class="nota-titulo">${esc(capitalizar(nota.tarea))}</h3>` : ''}
          <div class="nota-meta">
            <span class="chip"><i class="punto" style="background:hsl(${tono} 62% 52%)"></i>${esc(nota.agente)}</span>
            ${proyecto ? `<span class="chip chip-proyecto" title="Proyecto">${esc(proyecto)}</span>` : ''}
            ${nota.hora ? `<span>${esc(nota.hora)}</span>` : ''}
            ${nota.estado ? `<span class="estado ${estadoClase}">${esc(capitalizar(nota.estado.replace(/-/g, ' ')))}</span>` : ''}
            ${avisos.length ? `<details class="avisos" title="Avisos de formato"><summary>⚠ ${avisos.length}</summary><ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
          </div>
        </div>
      </div>
      ${secciones || '<p class="texto">Nota vacía.</p>'}
    </article>`
}

function grupoDiaHTML(fecha, notas) {
  return `
    <section class="dia">
      <div class="dia-cabecera">
        <h2 class="dia-titulo">${esc(etiquetaDia(fecha))}</h2>
        <span class="contador">${notas.length} nota${notas.length === 1 ? '' : 's'}</span>
      </div>
      <div class="dia-notas">${notas.map(notaHTML).join('')}</div>
    </section>`
}

function vacioHTML(titulo, detalle) {
  return `<div class="vacio"><strong>${esc(titulo)}</strong>${detalle}</div>`
}

function generarResumenHoy() {
  const hoy = hoyISO()
  const filtradas = notasFiltradas()
  const deHoy = filtradas.filter((n) => n.fecha === hoy)
  if (!deHoy.length) return ''
  const lineas = []
  lineas.push(`# Resumen ${hoy}`)
  lineas.push('')
  for (const nota of deHoy) {
    const cabecera = `### ${nota.hora || ''} · ${nota.agente || ''}${nota.tarea ? ` · ${nota.tarea}` : ''}${nota.estado ? ` (${nota.estado})` : ''}`
    lineas.push(cabecera.replace(/\s+·\s+$/g, ''))
    // Hecho
    const hechos = []
    const pendientes = []
    for (const seccion of nota.secciones || []) {
      for (const bloque of seccion.bloques || []) {
        if (bloque.tipo === 'tarea') {
          if (bloque.hecho) hechos.push(bloque.texto)
          else pendientes.push(bloque.texto)
        } else if (seccion.titulo && seccion.titulo.toLowerCase() === 'hecho' && bloque.tipo !== 'tarea') {
          hechos.push(bloque.texto)
        } else if (seccion.titulo && seccion.titulo.toLowerCase() === 'pendiente' && bloque.tipo !== 'tarea') {
          pendientes.push(bloque.texto)
        }
      }
    }
    if (hechos.length) {
      lineas.push('**Hecho**')
      for (const h of hechos) lineas.push(`- ${h}`)
      lineas.push('')
    }
    if (pendientes.length) {
      lineas.push('**Pendiente**')
      for (const p of pendientes) lineas.push(`- [ ] ${p}`)
      lineas.push('')
    } else if (!hechos.length) {
      // still include empty sections? but requirement says "Hecho + Pendiente abiertos" - include if exist
    }
    lineas.push('')
  }
  return lineas.join('\n')
}

function renderHoy(notas) {
  const hoy = hoyISO()
  const deHoy = notas.filter((n) => n.fecha === hoy)

  if (!deHoy.length) {
    const ultima = notas[0]
    const pista = ultima
      ? `La última nota es de ${esc(etiquetaDia(ultima.fecha))}.`
      : 'Todavía no hay ninguna nota. Crea la primera en <code>notas/' + hoy + '/</code>.'
    return vacioHTML('Sin notas de hoy', `
      <p>${pista}</p>
      <p>Para que aparezca una: crea <code>notas/${hoy}/HHMM-agente.md</code> con frontmatter y recarga.</p>`)
  }

  return deHoy.map((n) => notaHTML(n)).join('')
}

function renderTodo(notas) {
  if (!notas.length) {
    return vacioHTML(
      'Nada que mostrar',
      estado.q
        ? '<p>Ninguna nota coincide con la búsqueda.</p>'
        : '<p>Cuando un agente escriba una nota en <code>notas/</code>, aparecerá aquí.</p>',
    )
  }

  const dias = diasDe(notas)
  const fechas = [...dias.keys()].sort((a, b) => b.localeCompare(a))
  const filtro = estado.dia && dias.has(estado.dia) ? estado.dia : null

  const chips = `
    <div class="filtro-dias" role="group" aria-label="Filtrar por día">
      <button type="button" data-dia="" aria-pressed="${filtro ? 'false' : 'true'}">Todos los días</button>
      ${fechas
        .map(
          (f) =>
            `<button type="button" data-dia="${esc(f)}" aria-pressed="${filtro === f}">${esc(capitalizar(etiquetaDia(f)))} · ${dias.get(f).length}</button>`,
        )
        .join('')}
    </div>`

  const cuerpo = filtro
    ? grupoDiaHTML(filtro, dias.get(filtro))
    : fechas.map((f) => grupoDiaHTML(f, dias.get(f))).join('')

  return chips + cuerpo
}

function ordenarNotas(a, b) {
  return `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`)
}

function filasDeTareas(notas, hecho) {
  const filas = []
  for (const nota of notas) {
    const lista = hecho ? completadosDe(nota) : pendientesDe(nota)
    for (const pend of lista) {
      filas.push({
        nota,
        texto: typeof pend === 'string' ? pend : pend.texto,
        linea: typeof pend === 'string' ? undefined : pend.linea,
        hecho,
      })
    }
  }
  return filas
}

function filaPendienteHTML({ nota, texto, linea, hecho, saliendo }) {
  const deshabilitado = !puedeMarcarPendientes() || linea === undefined || linea === null
  const title = deshabilitado
    ? (estado.modoEstatico || estado.apiPendienteOk === false)
      ? 'Solo lectura (sin endpoint /api/pendiente disponible)'
      : 'No se puede marcar este pendiente'
    : ''
  const tono = tonoAgente(nota.agente)
  const origen = `${esc(nota.agente)}${nota.tarea ? ` · ${esc(capitalizar(nota.tarea))}` : ''}${nota.hora ? ` · ${esc(nota.hora)}` : ''}`
  return `
    <li class="pendiente${hecho ? ' hecho' : ''}${saliendo ? ' saliendo' : ''}" role="button" tabindex="0" data-abrir="${esc(nota.id)}" data-fecha="${esc(nota.fecha)}" aria-label="${esc(texto)}">
      <span class="toque">
        <input type="checkbox" class="pendiente-check" data-ruta="${esc(nota.ruta || '')}" data-linea="${linea}" aria-label="${esc(texto)}" ${hecho ? 'checked' : ''} ${deshabilitado ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>
      </span>
      <span class="texto-pendiente">${inline(capitalizar(texto))}</span>
      <span class="origen"><span class="punto" style="background:hsl(${tono} 62% 52%);display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px"></span>${origen}</span>
      <span class="abrir" aria-hidden="true">›</span>
    </li>`
}

function listaDiasHTML(filas, { tituloVacio, detalleVacio, unidad }) {
  if (!filas.length) {
    return vacioHTML(tituloVacio, detalleVacio)
  }

  const porDia = new Map()
  for (const fila of filas) {
    if (!porDia.has(fila.nota.fecha)) porDia.set(fila.nota.fecha, [])
    porDia.get(fila.nota.fecha).push(fila)
  }

  return [...porDia.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((fecha) => {
      const items = porDia.get(fecha).map((fila) => filaPendienteHTML(fila)).join('')
      const n = porDia.get(fecha).length
      return `
        <section class="dia">
          <div class="dia-cabecera">
            <h2 class="dia-titulo">${esc(capitalizar(etiquetaDia(fecha)))}</h2>
            <span class="contador">${n} ${unidad}${n === 1 ? '' : 's'}</span>
          </div>
          <ul class="lista-pendientes">${items}</ul>
        </section>`
    })
    .join('')
}

function renderPendientes(notas) {
  estado.marcasRecientes = estado.marcasRecientes.filter((m) => Date.now() - m.t < 1500)

  const filas = filasDeTareas(notas, false)
  for (const m of estado.marcasRecientes) {
    const nota = estado.notas.find((n) => n.ruta === m.ruta) || m
    filas.push({ nota, texto: m.texto, linea: m.linea, hecho: true, saliendo: true })
  }

  return listaDiasHTML(filas, {
    tituloVacio: 'Todo al día',
    detalleVacio: estado.q
      ? '<p>Ningún pendiente coincide con la búsqueda.</p>'
      : '<p>No hay <code>- [ ]</code> abiertos en ninguna nota.</p>',
    unidad: 'pendiente',
  })
}

function renderCompletados(notas) {
  const filas = filasDeTareas(notas, true)

  return listaDiasHTML(filas, {
    tituloVacio: 'Sin completados',
    detalleVacio: estado.q
      ? '<p>Ninguna completada coincide con la búsqueda.</p>'
      : '<p>No hay tareas marcadas como hechas.</p>',
    unidad: 'completado',
  })
}

function render() {
  const filtradas = notasFiltradas()
  const todosLosPendientes = estado.notas.reduce((n, nota) => n + pendientesDe(nota).length, 0)
  const todosLosCompletados = estado.notas.reduce(
    (n, nota) => n + completadosDe(nota).length,
    0,
  )

  if (el.copiarResumen) {
    if (estado.vista === 'hoy') {
      el.copiarResumen.style.display = ''
    } else {
      el.copiarResumen.style.display = 'none'
      if (copiarResumenTimeout) {
        clearTimeout(copiarResumenTimeout)
        copiarResumenTimeout = null
      }
      el.copiarResumen.textContent = 'Copiar resumen'
    }
  }

  // contadores de pestañas
  const conteos = {
    hoy: estado.notas.filter((n) => n.fecha === hoyISO()).length,
    pendientes: todosLosPendientes,
    todo: estado.notas.length,
    completados: todosLosCompletados,
  }

  const etiquetasVista = {
    hoy: 'Hoy',
    pendientes: 'Pendientes',
    todo: 'Todo',
    completados: 'Completados',
  }

  for (const boton of el.pestanas) {
    const vista = boton.dataset.vista
    boton.setAttribute('aria-selected', String(vista === estado.vista))
    boton.innerHTML = `${etiquetasVista[vista]}${
      conteos[vista] ? `<span class="contador">${conteos[vista]}</span>` : ''
    }`
  }

  let html = ''
  if (estado.vista === 'hoy') html = renderHoy(filtradas)
  else if (estado.vista === 'pendientes') html = renderPendientes(filtradas)
  else if (estado.vista === 'completados') html = renderCompletados(filtradas)
  else html = renderTodo(filtradas)

  el.vista.innerHTML = html

  // resumen global
  const ultima = estado.notas[0]
  el.resumen.textContent = estado.notas.length
    ? `${estado.notas.length} nota${estado.notas.length === 1 ? '' : 's'} · ${todosLosPendientes} pendiente${
        todosLosPendientes === 1 ? '' : 's'
      } · Última: ${ultima ? esc(capitalizar(etiquetaDia(ultima.fecha))) : ''}`
    : 'sin notas todavía'

  // foco sobre una nota concreta
  if (estado.foco) {
    const objetivo = document.getElementById(`nota-${estado.foco}`)
    if (objetivo) {
      objetivo.classList.add('resaltada')
      objetivo.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => objetivo.classList.remove('resaltada'), 2200)
    }
    estado.foco = null
  }
}

/** Muestra el toast de deshacer abajo, visible ~6 s. */
function mostrarToast(texto, { ruta, linea, deshacer }) {
  const toast = document.getElementById('toast')
  const textoEl = document.getElementById('toast-texto')
  const btn = document.getElementById('toast-deshacer')
  if (!toast || !textoEl || !btn) return

  if (estado.timerToast) {
    clearTimeout(estado.timerToast)
    estado.timerToast = null
  }
  textoEl.textContent = texto
  estado.toast = { ruta, linea, deshacer }
  toast.classList.add('visible')

  btn.onclick = async () => {
    if (!estado.toast) return
    const { ruta: r, linea: l, deshacer: h } = estado.toast
    estado.toast = null
    toast.classList.remove('visible')
    if (estado.timerToast) {
      clearTimeout(estado.timerToast)
      estado.timerToast = null
    }
    await aplicarCambioPendiente(r, l, h, true)
  }

  estado.timerToast = setTimeout(() => {
    toast.classList.remove('visible')
    estado.toast = null
    estado.timerToast = null
  }, 6000)
}

/**
 * Marca o desmarca un pendiente con feedback optimista.
 * desdeVista: true si la fila pertenece a Pendientes/Completados (gestiona marcasRecientes y toast).
 */
async function aplicarCambioPendiente(ruta, linea, marcarHecho, desdeVista) {
  if (estado.modoEstatico || estado.apiPendienteOk === false) return

  const previo = JSON.parse(JSON.stringify(estado.notas))
  for (const nota of estado.notas) {
    if (nota.ruta !== ruta) continue
    for (const seccion of nota.secciones || []) {
      for (const bloque of seccion.bloques || []) {
        if (bloque.tipo === 'tarea' && bloque.linea === linea) bloque.hecho = marcarHecho
      }
    }
  }
  render()

  if (desdeVista && marcarHecho) {
    const notaOrigen = estado.notas.find((n) => n.ruta === ruta)
    estado.marcasRecientes.push({
      ruta,
      linea,
      texto: checkTextoDe(ruta, linea) || '',
      t: Date.now(),
      id: notaOrigen?.id || '',
      fecha: notaOrigen?.fecha || '',
      agente: notaOrigen?.agente || '',
      tarea: notaOrigen?.tarea || '',
      hora: notaOrigen?.hora || '',
    })
    mostrarToast('Pendiente marcado como hecho', { ruta, linea, deshacer: false })
    if (estado.timerMarca) clearTimeout(estado.timerMarca)
    estado.timerMarca = setTimeout(() => {
      estado.marcasRecientes = estado.marcasRecientes.filter((m) => Date.now() - m.t < 1500)
      render()
    }, 1500)
  } else if (desdeVista) {
    mostrarToast('Pendiente devuelto a pendientes', { ruta, linea, deshacer: true })
  }

  try {
    const res = await fetch('/api/pendiente', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ruta, linea, hecho: marcarHecho }),
    })
    if (res.status === 404 || res.status === 405) {
      estado.apiPendienteOk = false
      estado.notas = previo
      render()
      mostrarMensajeCorto('Solo lectura: sin endpoint para marcar pendientes')
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const datos = await res.json().catch(() => ({}))
    if (datos && datos.nota) {
      const idx = estado.notas.findIndex((n) => n.ruta === ruta || n.id === datos.nota.id)
      if (idx >= 0) {
        estado.notas[idx] = datos.nota
      } else {
        estado.notas.push(datos.nota)
        estado.notas.sort(ordenarNotas)
      }
      poblarAgentes()
      poblarProyectos()
      render()
      return
    }
  } catch (error) {
    estado.notas = previo
    estado.marcasRecientes = estado.marcasRecientes.filter((m) => !(m.ruta === ruta && m.linea === linea))
    render()
    mostrarMensajeCorto('No se pudo actualizar el pendiente')
  }
}

/** Texto del bloque de tarea (ruta, línea), para reconstruir marcas recientes. */
function checkTextoDe(ruta, linea) {
  const nota = estado.notas.find((n) => n.ruta === ruta)
  if (!nota) return undefined
  for (const seccion of nota.secciones || []) {
    for (const bloque of seccion.bloques || []) {
      if (bloque.tipo === 'tarea' && bloque.linea === linea) return bloque.texto
    }
  }
  return undefined
}

/* ---------- eventos ---------- */

function poblarAgentes() {
  const agentes = [...new Set(estado.notas.map((n) => n.agente).filter(Boolean))].sort()
  if (estado.agente !== 'todos' && !agentes.includes(estado.agente)) estado.agente = 'todos'

  el.filtro.innerHTML =
    '<option value="todos">Todos los agentes</option>' +
    agentes.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')
  el.filtro.value = estado.agente
}

function poblarProyectos() {
  const proyectos = [...new Set(estado.notas.map((n) => n.proyecto).filter((p) => p && String(p).trim()))].sort()
  if (el.filtroProyecto) {
    if (proyectos.length === 0) {
      el.filtroProyecto.style.display = 'none'
      estado.proyecto = 'todos'
      el.filtroProyecto.value = 'todos'
      return
    }
    el.filtroProyecto.style.display = ''
    if (estado.proyecto !== 'todos' && !proyectos.includes(estado.proyecto)) estado.proyecto = 'todos'
    el.filtroProyecto.innerHTML =
      '<option value="todos">Todos los proyectos</option>' +
      proyectos.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')
    el.filtroProyecto.value = estado.proyecto
  }
}

let copiarResumenTimeout = null

function guardarPreferencias() {
  try {
    localStorage.setItem(
      'bitacora-pref',
      JSON.stringify({ agente: estado.agente, proyecto: estado.proyecto }),
    )
  } catch {}
}

function cargarPreferencias() {
  try {
    const raw = localStorage.getItem('bitacora-pref')
    if (!raw) return
    const datos = JSON.parse(raw)
    if (datos.agente) estado.agente = datos.agente
    if (datos.proyecto) estado.proyecto = datos.proyecto
    estado.q = ''
    if (el.buscar) el.buscar.value = ''
  } catch {
    estado.q = ''
    if (el.buscar) el.buscar.value = ''
  }
}

el.pestanas.forEach((boton) => {
  boton.addEventListener('click', () => {
    estado.vista = boton.dataset.vista
    estado.dia = null
    if (location.hash !== `#${estado.vista}`) location.hash = estado.vista
    guardarPreferencias()
    render()
  })
})

el.buscar.addEventListener('input', () => {
  estado.q = el.buscar.value
  guardarPreferencias()
  render()
})

el.filtro.addEventListener('change', () => {
  estado.agente = el.filtro.value
  guardarPreferencias()
  render()
})

if (el.filtroProyecto) {
  el.filtroProyecto.addEventListener('change', () => {
    estado.proyecto = el.filtroProyecto.value
    guardarPreferencias()
    render()
  })
}

if (el.copiarResumen) {
  el.copiarResumen.addEventListener('click', async () => {
    try {
      const texto = generarResumenHoy()
      if (!texto) {
        mostrarMensajeCorto('No hay notas de hoy para resumir')
        return
      }
      try {
        await navigator.clipboard.writeText(texto)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = texto
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      if (copiarResumenTimeout) {
        clearTimeout(copiarResumenTimeout)
      }
      el.copiarResumen.textContent = 'Copiado'
      copiarResumenTimeout = setTimeout(() => {
        el.copiarResumen.textContent = 'Copiar resumen'
        copiarResumenTimeout = null
      }, 1200)
    } catch {
      mostrarMensajeCorto('No se pudo copiar')
    }
  })
}

el.vista.addEventListener('change', async (evento) => {
  const check = evento.target.closest('.tarea-check, .pendiente-check')
  if (!check) return
  if (check.disabled) return
  if (estado.modoEstatico || estado.apiPendienteOk === false) {
    check.checked = !check.checked
    return
  }

  const ruta = check.dataset.ruta
  const linea = check.dataset.linea !== undefined ? Number(check.dataset.linea) : undefined
  const marcarHecho = check.checked

  if (!ruta || linea === undefined || Number.isNaN(linea)) {
    check.checked = !check.checked
    return
  }

  const desdeVista = check.closest('.pendiente') !== null

  await aplicarCambioPendiente(ruta, linea, marcarHecho, desdeVista)
})

el.vista.addEventListener('click', (evento) => {
  if (evento.target.closest('input[type="checkbox"]')) return
  const chipDia = evento.target.closest('[data-dia]')
  if (chipDia) {
    estado.dia = chipDia.dataset.dia || null
    render()
    return
  }

  const abrir = evento.target.closest('[data-abrir]')
  if (abrir) {
    estado.vista = 'todo'
    estado.dia = abrir.dataset.fecha || null
    estado.foco = abrir.dataset.abrir
    if (location.hash !== '#todo') location.hash = 'todo'
    render()
  }
})

el.vista.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter') return
  if (evento.target.closest('input, button, select, textarea')) return
  const abrir = evento.target.closest('[data-abrir]')
  if (abrir) abrir.click()
})

window.addEventListener('hashchange', () => {
  const vista = vistaDeHash()
  if (vista === estado.vista) return
  estado.vista = vista
  estado.dia = null
  render()
})

document.addEventListener('keydown', (evento) => {
  const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')

  if (evento.key === '/' && !escribiendo) {
    evento.preventDefault()
    el.buscar.focus()
  }

  if (evento.key === 'Escape' && document.activeElement === el.buscar) {
    el.buscar.value = ''
    estado.q = ''
    render()
    el.buscar.blur()
  }
})

/* ---------- arranque ---------- */

;(async () => {
  try {
    cargarPreferencias()
    if (el.buscar) {
      el.buscar.value = estado.q || ''
    }
    await cargar()
    poblarAgentes()
    poblarProyectos()
    if (el.filtro) el.filtro.value = estado.agente
    if (el.filtroProyecto) el.filtroProyecto.value = estado.proyecto
    if (el.copiarResumen) {
      el.copiarResumen.textContent = 'Copiar resumen'
    }
    render()
  } catch (error) {
    el.resumen.textContent = 'error al cargar'
    el.vista.innerHTML = `<div class="error">No se pudieron cargar las notas: ${esc(
      error.message,
    )}.<br />Arranca el servidor con <code>pnpm run dev</code> desde la carpeta del proyecto.</div>`
  }
})()
