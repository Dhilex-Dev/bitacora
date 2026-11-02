const VISTAS = ['hoy', 'pendientes', 'todo']

const estado = {
  notas: [],
  vista: vistaDeHash(),
  q: '',
  agente: 'todos',
  dia: null,
  foco: null,
}

function vistaDeHash() {
  const hash = location.hash.replace(/^#/, '')
  return VISTAS.includes(hash) ? hash : 'hoy'
}

const el = {
  resumen: document.getElementById('resumen'),
  buscar: document.getElementById('buscar'),
  filtro: document.getElementById('filtro-agente'),
  pestanas: [...document.querySelectorAll('.pestanas button')],
  vista: document.getElementById('vista'),
}

/* ---------- utilidades ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Markdown inline mínimo: `code`, **negrita**, *cursiva*, [texto](url). */
function inline(texto) {
  let salida = esc(texto)
  salida = salida.replace(/`([^`]+)`/g, '<code>$1</code>')
  salida = salida.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  salida = salida.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  salida = salida.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
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
      if (bloque.tipo === 'tarea' && !bloque.hecho) salida.push(bloque.texto)
    }
  }
  return salida
}

function textoDeNota(nota) {
  return [
    nota.agente,
    nota.tarea,
    nota.estado,
    ...nota.secciones.flatMap((s) => [s.titulo || '', ...s.bloques.map((b) => b.texto)]),
  ]
    .join(' ')
    .toLowerCase()
}

/* ---------- carga ---------- */

async function cargar() {
  const fuentes = ['/api/notas', 'notas/index.json']
  let ultimoError = null

  for (const url of fuentes) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const datos = await res.json()
      estado.notas = Array.isArray(datos.notas) ? datos.notas : []
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
    if (q && !textoDeNota(nota).includes(q)) return false
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

function bloqueHTML(bloque) {
  if (bloque.tipo === 'tarea') {
    return `<li class="tarea ${bloque.hecho ? 'hecha' : ''}"><span>${inline(bloque.texto)}</span></li>`
  }
  if (bloque.tipo === 'vineta') return `<li>${inline(bloque.texto)}</li>`
  return `<li class="texto">${inline(bloque.texto)}</li>`
}

function notaHTML(nota) {
  const tono = tonoAgente(nota.agente)
  const estadoClase = nota.estado ? `estado-${nota.estado}` : ''

  const secciones = nota.secciones
    .map(
      (s) => `
        <section class="seccion">
          ${s.titulo ? `<h4>${esc(s.titulo)}</h4>` : ''}
          <ul class="bloques">${s.bloques.map(bloqueHTML).join('')}</ul>
        </section>`,
    )
    .join('')

  return `
    <article class="nota" id="nota-${esc(nota.id)}">
      <div class="nota-cabecera">
        <div>
          ${nota.tarea ? `<h3 class="nota-titulo">${esc(nota.tarea)}</h3>` : ''}
          <div class="nota-meta">
            <span class="chip"><i class="punto" style="background:hsl(${tono} 62% 52%)"></i>${esc(nota.agente)}</span>
            ${nota.hora ? `<span>${esc(nota.hora)}</span>` : ''}
            ${nota.estado ? `<span class="estado ${estadoClase}">${esc(nota.estado)}</span>` : ''}
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
      <button type="button" data-dia="" aria-pressed="${filtro ? 'false' : 'true'}">todos los días</button>
      ${fechas
        .map(
          (f) =>
            `<button type="button" data-dia="${esc(f)}" aria-pressed="${filtro === f}">${esc(etiquetaDia(f))} · ${dias.get(f).length}</button>`,
        )
        .join('')}
    </div>`

  const cuerpo = filtro
    ? grupoDiaHTML(filtro, dias.get(filtro))
    : fechas.map((f) => grupoDiaHTML(f, dias.get(f))).join('')

  return chips + cuerpo
}

function renderPendientes(notas) {
  const filas = []
  for (const nota of notas) {
    for (const texto of pendientesDe(nota)) {
      filas.push({ nota, texto })
    }
  }

  if (!filas.length) {
    return vacioHTML(
      'Todo al día',
      estado.q
        ? '<p>Ningún pendiente coincide con la búsqueda.</p>'
        : '<p>No hay <code>- [ ]</code> abiertos en ninguna nota.</p>',
    )
  }

  const porDia = new Map()
  for (const fila of filas) {
    if (!porDia.has(fila.nota.fecha)) porDia.set(fila.nota.fecha, [])
    porDia.get(fila.nota.fecha).push(fila)
  }

  return [...porDia.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((fecha) => {
      const items = porDia
        .get(fecha)
        .map(({ nota, texto }) => {
          const tono = tonoAgente(nota.agente)
          return `
            <li class="pendiente">
              <span class="caja" aria-hidden="true"></span>
              <span class="texto-pendiente">
                ${inline(texto)}
                <span class="origen">
                  <i class="punto" style="background:hsl(${tono} 62% 52%);display:inline-block;margin-right:5px"></i>
                  ${esc(nota.agente)}${nota.tarea ? ` · ${esc(nota.tarea)}` : ''}${nota.hora ? ` · ${esc(nota.hora)}` : ''}
                </span>
              </span>
              <button type="button" class="ver" data-abrir="${esc(nota.id)}" data-fecha="${esc(fecha)}">ver nota</button>
            </li>`
        })
        .join('')

      return `
        <section class="dia">
          <div class="dia-cabecera">
            <h2 class="dia-titulo">${esc(etiquetaDia(fecha))}</h2>
            <span class="contador">${porDia.get(fecha).length} pendiente${porDia.get(fecha).length === 1 ? '' : 's'}</span>
          </div>
          <ul class="lista-pendientes">${items}</ul>
        </section>`
    })
    .join('')
}

function render() {
  const filtradas = notasFiltradas()
  const todosLosPendientes = estado.notas.reduce((n, nota) => n + pendientesDe(nota).length, 0)

  // contadores de pestañas
  const conteos = {
    hoy: estado.notas.filter((n) => n.fecha === hoyISO()).length,
    pendientes: todosLosPendientes,
    todo: estado.notas.length,
  }

  for (const boton of el.pestanas) {
    const vista = boton.dataset.vista
    boton.setAttribute('aria-selected', String(vista === estado.vista))
    boton.innerHTML = `${vista === 'todo' ? 'Todo' : vista === 'hoy' ? 'Hoy' : 'Pendientes'}${
      conteos[vista] ? `<span class="contador">${conteos[vista]}</span>` : ''
    }`
  }

  let html = ''
  if (estado.vista === 'hoy') html = renderHoy(filtradas)
  else if (estado.vista === 'pendientes') html = renderPendientes(filtradas)
  else html = renderTodo(filtradas)

  el.vista.innerHTML = html

  // resumen global
  const ultima = estado.notas[0]
  el.resumen.textContent = estado.notas.length
    ? `${estado.notas.length} nota${estado.notas.length === 1 ? '' : 's'} · ${todosLosPendientes} pendiente${
        todosLosPendientes === 1 ? '' : 's'
      } · última ${ultima ? etiquetaDia(ultima.fecha) : ''}`
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

/* ---------- eventos ---------- */

function poblarAgentes() {
  const agentes = [...new Set(estado.notas.map((n) => n.agente))].sort()
  if (estado.agente !== 'todos' && !agentes.includes(estado.agente)) estado.agente = 'todos'

  el.filtro.innerHTML =
    '<option value="todos">todos los agentes</option>' +
    agentes.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')
  el.filtro.value = estado.agente
}

el.pestanas.forEach((boton) => {
  boton.addEventListener('click', () => {
    estado.vista = boton.dataset.vista
    estado.dia = null
    if (location.hash !== `#${estado.vista}`) location.hash = estado.vista
    render()
  })
})

el.buscar.addEventListener('input', () => {
  estado.q = el.buscar.value
  render()
})

el.filtro.addEventListener('change', () => {
  estado.agente = el.filtro.value
  render()
})

el.vista.addEventListener('click', (evento) => {
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
    await cargar()
    poblarAgentes()
    render()
  } catch (error) {
    el.resumen.textContent = 'error al cargar'
    el.vista.innerHTML = `<div class="error">No se pudieron cargar las notas: ${esc(
      error.message,
    )}.<br />Arranca el servidor con <code>pnpm run dev</code> desde la carpeta del proyecto.</div>`
  }
})()
