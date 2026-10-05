// RefRef renderer: board state, the three views (free / pile / slides), input.
const $ = s => document.querySelector(s)
const body = document.body, stage = $('#stage'), world = $('#world'), handle = $('#handle'), box = $('#box')
const slide = $('#slide'), slideImg = $('#slide img'), timerBar = $('#timer i'), timeEl = $('#time')
const SECS = [15, 30, 45, 60, 90, 120, 300, 600]
const S = {
  items: [], mode: 'free', prev: 'free', cam: { x: 0, y: 0, z: 1 }, sel: new Set(),
  top: true, clear: false, opacity: 1, path: null, dirty: false,
  slide: { order: [], i: 0, auto: false, secs: 60, shuffle: false, paused: false, t0: 0, pausedAt: 0 },
}
let uid = 1, zc = 1, drag = null, slideDrag = null, space = false, pileOverride = null, ticking = false, draggingOut = false
const els = new Map(), undo = [], redo = []
body.classList.toggle('mac', api.platform === 'darwin')

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const label = s => s < 60 ? s + 's' : s / 60 + ' min'
const fmt = ms => { const s = Math.ceil(ms / 1000); return `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}` }
const picked = () => S.items.filter(i => S.sel.has(i.id))
const cur = () => S.items.find(i => i.id === S.slide.order[S.slide.i])
const selItems = () => S.mode === 'slides' ? [cur()].filter(Boolean) : picked()
const toWorld = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left - r.width / 2) / S.cam.z + S.cam.x, y: (e.clientY - r.top - r.height / 2) / S.cam.z + S.cam.y } }
const outside = e => e.clientX < 0 || e.clientY < 0 || e.clientX >= innerWidth || e.clientY >= innerHeight
const reduced = matchMedia('(prefers-reduced-motion: reduce)')

// Add a class for a moment (toasts, zoom chip, layout animation).
function blink(el, ms, cls = 'show') { el.classList.add(cls); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove(cls), ms) }
function toast(msg) { $('#toast').textContent = msg; blink($('#toast'), 1600) }
function animate() { if (!reduced.matches) blink(world, 360, 'anim') }

// ---- history ----
function setDirty(v) { if (S.dirty !== v) { S.dirty = v; api.win('dirty', v); ui() } }
function snap() { undo.push(S.items.map(i => ({ ...i }))); if (undo.length > 100) undo.shift(); redo.length = 0; setDirty(true) }
function restore(from, to) { if (!from.length) return; to.push(S.items.map(i => ({ ...i }))); S.items = from.pop(); S.sel.clear(); setDirty(true); animate(); changed() }
function edit(fn) { snap(); fn(); changed() }

// ---- rendering ----
function sync() {
  const ids = new Set(S.items.map(i => i.id))
  for (const [id, el] of els) if (!ids.has(id)) { el.remove(); els.delete(id) }
  for (const it of S.items) if (!els.has(it.id)) {
    const el = new Image()
    Object.assign(el, { src: it.src, className: 'item', draggable: false })
    el.dataset.id = it.id
    world.append(el); els.set(it.id, el)
  }
}

// Pile: biggest images first, packed around the centre; cached because render runs on every pointer move.
let packCache = { key: '', P: [] }
function pilePositions() {
  const R = S.items.map(i => ({ w: i.w * i.s, h: i.h * i.s }))
  const aspect = (stage.clientWidth || 4) / (stage.clientHeight || 3)
  const key = R.map(r => `${r.w.toFixed(1)}x${r.h.toFixed(1)}`).join() + '|' + aspect.toFixed(2)
  if (key !== packCache.key) {
    const order = R.map((_, k) => k).sort((a, b) => R[b].w * R[b].h - R[a].w * R[a].h)
    const gap = 0.05 * R.reduce((s, r) => s + Math.sqrt(r.w * r.h), 0) / (R.length || 1)
    const placed = pack(order.map(k => R[k]), gap, aspect), P = []
    order.forEach((k, j) => P[k] = placed[j])
    packCache = { key, P }
  }
  return packCache.P
}

function positions() {
  if (S.mode !== 'pile') return S.items
  const P = pilePositions()
  return pileOverride ? P.map((p, k) => pileOverride.get(S.items[k].id) || p) : P
}

function bounds(ids, P = positions()) {
  let b = null
  S.items.forEach((it, k) => {
    if (ids && !ids.includes(it.id)) return
    const w = it.w * it.s / 2, h = it.h * it.s / 2, { x, y } = P[k]
    b = b ? { x0: Math.min(b.x0, x - w), y0: Math.min(b.y0, y - h), x1: Math.max(b.x1, x + w), y1: Math.max(b.y1, y + h) }
      : { x0: x - w, y0: y - h, x1: x + w, y1: y + h }
  })
  return b
}

function render() {
  const { x, y, z } = S.cam, ox = stage.clientWidth / 2 - x * z, oy = stage.clientHeight / 2 - y * z
  world.style.transform = `translate(${ox}px,${oy}px) scale(${z})`
  world.style.setProperty('--z', z)
  let g = 24 * z; while (g < 14) g *= 2; while (g > 56) g /= 2
  stage.style.backgroundSize = `${g}px ${g}px`
  stage.style.backgroundPosition = `${ox - g / 2}px ${oy - g / 2}px`
  const P = positions(), moving = drag?.type === 'move' && drag.moved
  S.items.forEach((it, k) => {
    const el = els.get(it.id), w = it.w * it.s, h = it.h * it.s
    el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.zIndex = it.z
    el.style.transform = `translate(${P[k].x - w / 2}px,${P[k].y - h / 2}px) scaleX(${it.flip ? -1 : 1})`
    el.style.filter = it.gray ? 'grayscale(1)' : ''
    el.classList.toggle('sel', S.sel.has(it.id))
    el.classList.toggle('lift', moving && S.sel.has(it.id))
  })
  const b = bounds([...S.sel], P)
  handle.hidden = !b || moving
  if (b) handle.style.transform = `translate(${b.x1}px,${b.y1}px) scale(${1 / z}) translate(-6px,-6px)`
  body.classList.toggle('empty', !S.items.length)
  $('#zoom').textContent = Math.round(z * 100) + '%'
}

function fit(b = bounds()) {
  if (b) S.cam = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: clamp(Math.min(stage.clientWidth / (b.x1 - b.x0), stage.clientHeight / (b.y1 - b.y0)) * 0.9, 0.02, 50) }
  render()
}

// Call after the item list or item properties change.
function changed() {
  sync()
  if (S.mode === 'slides') { syncOrder(); show() }
  S.mode === 'pile' ? fit() : render()
  ui()
}

function ui() {
  const sl = S.slide, on = { 'mode:free': S.mode === 'free', 'mode:pile': S.mode === 'pile', 'mode:slides': S.mode === 'slides', shuffle: sl.shuffle, top: S.top, clear: S.clear }
  for (const b of document.querySelectorAll('[data-cmd]')) if (b.dataset.cmd in on) b.setAttribute('aria-pressed', on[b.dataset.cmd])
  body.dataset.mode = S.mode
  body.classList.toggle('auto', sl.auto)
  body.classList.toggle('running', sl.auto && !sl.paused)
  body.classList.toggle('clear', S.clear)
  const act = $(`#modes [data-cmd="mode:${S.mode}"]`), thumb = $('#modes .thumb')
  if (act) { thumb.style.width = act.offsetWidth + 'px'; thumb.style.transform = `translateX(${act.offsetLeft}px)` }
  $('#secs').value = sl.secs
  const title = $('.title')
  title.textContent = S.path ? S.path.split(/[\\/]/).pop().replace(/\.refref$/, '') : 'refref'
  title.classList.toggle('dirty', S.dirty)
}

function setMode(m, at) {
  if (S.mode && S.mode !== 'slides') S.prev = S.mode
  if (m !== 'slides' && S.mode !== 'slides') animate()
  S.mode = m; drag = null; pileOverride = null
  body.dataset.mode = m
  if (m === 'slides') {
    syncOrder(true)
    const start = S.slide.order.indexOf(at ?? [...S.sel][0])
    if (start >= 0) S.slide.i = start
    S.slide.paused = false; restart(); show(); startTick(); wake()
  } else fit()
}

// ---- slideshow ----
function syncOrder(reshuffle) {
  const sl = S.slide, was = sl.order[sl.i], ids = S.items.map(i => i.id)
  let o = reshuffle ? ids : sl.order.filter(id => ids.includes(id)).concat(ids.filter(id => !sl.order.includes(id)))
  if (reshuffle && sl.shuffle) for (let k = o.length - 1; k > 0; k--) { const j = Math.random() * (k + 1) | 0;[o[k], o[j]] = [o[j], o[k]] }
  sl.order = o
  const k = o.indexOf(was)
  sl.i = reshuffle ? 0 : k >= 0 ? k : clamp(sl.i, 0, o.length - 1)
}

function show() {
  const it = cur()
  slideImg.hidden = !it
  if (it) {
    if (slideImg.dataset.id != it.id) { slideImg.src = it.src; slideImg.dataset.id = it.id }
    slideImg.style.transform = it.flip ? 'scaleX(-1)' : ''
    slideImg.style.filter = it.gray ? 'grayscale(1)' : ''
  }
  $('#count').textContent = it ? `${S.slide.i + 1} / ${S.slide.order.length}` : '0 / 0'
}

// Resets the countdown; a paused timer stays paused.
function restart() { S.slide.t0 = S.slide.pausedAt = performance.now() }
function step(d) { const n = S.slide.order.length; if (!n) return; S.slide.i = (S.slide.i + d + n) % n; restart(); show() }
function startTick() { if (!ticking) { ticking = true; requestAnimationFrame(tick) } }
function tick() {
  const sl = S.slide
  if (S.mode !== 'slides' || !sl.auto) { ticking = false; return }
  const left = sl.secs * 1000 - ((sl.paused ? sl.pausedAt : performance.now()) - sl.t0)
  if (left <= 0) step(1)
  timerBar.style.transform = `scaleX(${clamp(left / (sl.secs * 1000), 0, 1)})`
  timeEl.textContent = fmt(Math.max(0, left))
  timeEl.classList.toggle('soon', left < 5000)
  requestAnimationFrame(tick)
}

// Slideshow chrome hides after the mouse rests, so it never covers the reference.
let idleT
function wake() { body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => body.classList.add('idle'), 1800) }
addEventListener('pointermove', e => { if (!e.buttons) draggingOut = false; wake() })

slide.addEventListener('pointerdown', e => {
  if (e.button || e.target.closest('#hud')) return
  slide.setPointerCapture(e.pointerId); slideDrag = { out: false }
})
slide.addEventListener('pointermove', e => {
  if (slideDrag && !slideDrag.out && outside(e) && cur()) { slideDrag.out = true; dragOut([cur()]) }
})
slide.addEventListener('pointerup', e => {
  const d = slideDrag; slideDrag = null
  if (d && !d.out) step(e.clientX < innerWidth / 2 ? -1 : 1)
})

// ---- images in and out ----
const loadImg = ({ src, name }) => new Promise(res => { const im = new Image(); im.onload = () => res({ im, name }); im.onerror = () => res(null); im.src = src })
const readFile = f => new Promise(res => { const fr = new FileReader(); fr.onload = () => res({ src: fr.result, name: f.name }); fr.readAsDataURL(f) })
const fetchSrc = u => !u ? null : u.startsWith('data:image/') ? u : /^https?:/.test(u) ? api.fetchImage(u).catch(() => null) : null

async function addAll(srcs, at = S.cam) {
  const list = srcs.filter(Boolean).map(s => typeof s === 'string' ? { src: s } : s)
  const ims = (await Promise.all(list.map(loadImg))).filter(Boolean)
  if (!ims.length) return srcs.length && toast("Couldn't read that as an image")
  snap()
  const view = 0.5 * Math.min(stage.clientWidth || 600, stage.clientHeight || 400) / S.cam.z
  ims.forEach(({ im, name }, k) => {
    const w = im.naturalWidth, h = im.naturalHeight
    S.items.push({ id: uid++, src: im.src, name, w, h, s: Math.min(1, view / Math.max(w, h)), x: at.x + k * 30 / S.cam.z, y: at.y + k * 30 / S.cam.z, z: zc++, flip: false, gray: false })
  })
  if (S.mode === 'pile') animate()
  changed()
}

// PNG of an item, optionally downscaled (clipboard copy and drag icon).
function png(it, max = Infinity) {
  const k = Math.min(1, max / Math.max(it.w, it.h))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(it.w * k), height: Math.round(it.h * k) })
  c.getContext('2d').drawImage(els.get(it.id), 0, 0, c.width, c.height)
  return c.toDataURL()
}

// Hand images to the OS drag; they stay on the board.
function dragOut(items) {
  draggingOut = true
  api.dragOut(items.map(it => ({ src: it.src, name: it.name, thumb: png(it, 160) })))
}

let dragDepth = 0
const dropping = on => { body.classList.toggle('dropping', on); if (!on) dragDepth = 0 }
addEventListener('dragenter', e => {
  if (draggingOut || ++dragDepth > 1) return
  const n = [...e.dataTransfer.items].filter(i => i.kind === 'file').length
  $('#dropn').textContent = n > 1 ? `${n} images` : n ? 'image' : 'image from browser'
  dropping(true)
})
addEventListener('dragleave', () => { if (--dragDepth <= 0) dropping(false) })
addEventListener('dragover', e => e.preventDefault())
addEventListener('drop', async e => {
  e.preventDefault(); dropping(false)
  if (draggingOut) return draggingOut = false // dropped back onto itself
  const dt = e.dataTransfer, files = [...dt.files], at = S.mode === 'free' ? toWorld(e) : S.cam
  const board = files.find(f => f.name.endsWith('.refref'))
  if (board) return load(await board.text())
  let srcs = await Promise.all(files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(f.name)).map(readFile))
  if (!srcs.length) { // dragged from a browser: take the <img> src, else the link
    const img = new DOMParser().parseFromString(dt.getData('text/html'), 'text/html').querySelector('img')
    srcs = [await fetchSrc(img?.getAttribute('src') || dt.getData('text/uri-list').split('\n').find(l => l && !l.startsWith('#')))]
  }
  addAll(srcs, at)
})

// ---- board files ----
function load(text, file = null) {
  let d
  try { d = JSON.parse(text) } catch { return toast("That board file couldn't be read") }
  S.items = (d.items || []).map(i => ({ ...i, id: uid++, z: zc++ }))
  Object.assign(S.slide, d.slide)
  S.sel.clear(); undo.length = redo.length = 0; S.path = file
  sync(); S.mode = null; setMode(d.mode || 'free')
  if (d.mode === 'free' && d.cam) { S.cam = d.cam; render() }
  setDirty(false); ui()
}
async function save(as) {
  const { secs, shuffle, auto } = S.slide
  const json = JSON.stringify({ v: 1, mode: S.mode === 'slides' ? S.prev : S.mode, cam: S.cam, slide: { secs, shuffle, auto }, items: S.items.map(({ id, z, ...i }) => i) })
  const file = await api.save(json, as ? null : S.path)
  if (file) { S.path = file; setDirty(false); toast('Board saved') }
}

// ---- commands (toolbar, keys and context menu all go through run) ----
const C = {
  mode: m => setMode(m),
  next: () => S.mode === 'slides' && step(1),
  prev: () => S.mode === 'slides' && step(-1),
  back: () => S.mode === 'slides' ? setMode(S.prev) : (S.sel.clear(), render()),
  play: () => S.slide.auto ? C.pause() : C.auto(),
  pause: () => { const sl = S.slide, now = performance.now(); if (sl.paused) sl.t0 += now - sl.pausedAt; else sl.pausedAt = now; sl.paused = !sl.paused },
  auto: () => { S.slide.auto = !S.slide.auto; S.slide.paused = false; restart(); startTick() },
  shuffle: () => { S.slide.shuffle = !S.slide.shuffle; syncOrder(true); restart(); show() },
  secs: s => { S.slide.secs = +s; restart() },
  fit: () => { animate(); fit(); blink($('#zoom'), 900) },
  all: () => { S.sel = new Set(S.items.map(i => i.id)); render() },
  flip: () => edit(() => selItems().forEach(i => i.flip = !i.flip)),
  gray: () => edit(() => selItems().forEach(i => i.gray = !i.gray)),
  reset: () => { animate(); edit(() => selItems().forEach(i => i.s = 1)) },
  delete: () => { const gone = new Set(selItems().map(i => i.id)); if (gone.size) edit(() => { S.items = S.items.filter(i => !gone.has(i.id)); S.sel.clear() }) },
  arrange: () => { const g = grid(S.items.map(i => ({ w: i.w * i.s, h: i.h * i.s }))); edit(() => S.items.forEach((it, k) => Object.assign(it, g[k]))); setMode('free') },
  undo: () => restore(undo, redo),
  redo: () => restore(redo, undo),
  copy: () => { const it = selItems()[0]; if (it) { api.copy(png(it)); toast('Image copied') } },
  add: async () => addAll(await api.addImages()),
  paste: async () => addAll([await fetchSrc(await api.paste())]),
  open: async () => { const r = await api.open(); if (r) load(r.text, r.file) },
  save: () => save(false),
  saveas: () => save(true),
  top: async () => { S.top = (await api.win('top')).top; toast(S.top ? 'Keeping on top' : 'No longer on top') },
  clear: () => { S.clear = !S.clear },
  opacity: o => api.win('opacity', S.opacity = +o),
  min: () => api.win('min'),
  close: () => api.win('close'),
}
async function run(id) { const [c, a] = id.split(':'); await C[c]?.(a); ui() }

document.addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b) { b.blur(); run(b.dataset.cmd) } })
$('#secs').append(...SECS.map(s => new Option(label(s), s)))
$('#secs').addEventListener('change', e => { run('secs:' + e.target.value); e.target.blur() })

addEventListener('keydown', e => {
  if (e.target.closest('select')) return
  const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey
  if (k === ' ') { e.preventDefault(); if (!e.repeat) S.mode === 'slides' ? run('play') : space = true; return }
  const c = mod
    ? { s: e.shiftKey ? 'saveas' : 'save', o: 'open', a: 'all', z: e.shiftKey ? 'redo' : 'undo', y: 'redo', v: 'paste', c: 'copy' }[k]
    : { 1: 'mode:free', 2: 'mode:pile', 3: 'mode:slides', f: 'fit', h: 'flip', g: 'gray', a: 'auto', t: 'clear', p: 'top', delete: 'delete', backspace: 'delete', arrowright: 'next', arrowleft: 'prev', escape: 'back' }[k]
  if (c) { e.preventDefault(); run(c); wake() }
})
addEventListener('keyup', e => { if (e.key === ' ') space = false })

addEventListener('contextmenu', async e => {
  e.preventDefault()
  const el = e.target.closest('.item')
  if (el && !S.sel.has(+el.dataset.id)) { S.sel = new Set([+el.dataset.id]); render() }
  const has = selItems().length > 0, sl = S.slide, m = S.mode
  const id = await api.menu([
    { label: 'Add images…', id: 'add' }, { label: 'Paste', id: 'paste', key: 'CmdOrCtrl+V' }, '-',
    { label: 'Copy image', id: 'copy', on: has, key: 'CmdOrCtrl+C' },
    { label: 'Flip horizontal', id: 'flip', on: has, key: 'H' },
    { label: 'Grayscale', id: 'gray', on: has, key: 'G' },
    { label: 'Original size', id: 'reset', on: has },
    { label: 'Delete', id: 'delete', on: has, key: 'Backspace' }, '-',
    { label: 'View', sub: [
      { label: 'Freeform', id: 'mode:free', checked: m === 'free', key: '1' },
      { label: 'Pile', id: 'mode:pile', checked: m === 'pile', key: '2' },
      { label: 'Slideshow', id: 'mode:slides', checked: m === 'slides', key: '3' }, '-',
      { label: 'Fit all', id: 'fit', key: 'F' },
      { label: 'Select all', id: 'all', key: 'CmdOrCtrl+A' },
      { label: 'Arrange in grid', id: 'arrange', on: S.items.length > 0 },
    ] },
    { label: 'Slideshow', sub: [
      { label: 'Timer', id: 'auto', checked: sl.auto, key: 'A' },
      { label: 'Shuffle', id: 'shuffle', checked: sl.shuffle },
      { label: 'Time per image', sub: SECS.map(s => ({ label: label(s), id: 'secs:' + s, checked: sl.secs === s })) },
    ] },
    { label: 'Window', sub: [
      { label: 'Keep on top', id: 'top', checked: S.top, key: 'P' },
      { label: 'Transparent backdrop', id: 'clear', checked: S.clear, key: 'T' },
      { label: 'Opacity', sub: [1, 0.8, 0.6, 0.4].map(o => ({ label: o * 100 + '%', id: 'opacity:' + o, checked: S.opacity === o })) },
    ] }, '-',
    { label: 'Undo', id: 'undo', on: undo.length > 0, key: 'CmdOrCtrl+Z' },
    { label: 'Redo', id: 'redo', on: redo.length > 0, key: 'CmdOrCtrl+Shift+Z' }, '-',
    { label: 'Open board…', id: 'open', key: 'CmdOrCtrl+O' },
    { label: 'Save board', id: 'save', key: 'CmdOrCtrl+S' },
    { label: 'Save board as…', id: 'saveas', key: 'CmdOrCtrl+Shift+S' }, '-',
    { label: 'Quit', id: 'close' },
  ])
  if (id) run(id)
})

// ---- canvas pointer: pan, zoom, select, move, scale, drag out ----
stage.addEventListener('pointerdown', e => {
  if (e.button === 2 || e.target.closest('button')) return
  stage.setPointerCapture(e.pointerId)
  const w = toWorld(e), el = e.target.closest('.item')
  if (e.target === handle) {
    const b = bounds([...S.sel]), c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
    drag = { type: 'scale', c, d0: Math.hypot(w.x - c.x, w.y - c.y) || 1, start: picked().map(i => ({ i, s: i.s, x: i.x, y: i.y })) }
  } else if (e.button === 1 || space || (!el && !e.shiftKey)) {
    if (!el && e.button === 0 && !space) S.sel.clear()
    drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: { ...S.cam } }
    stage.classList.add('panning')
  } else if (!el) {
    drag = { type: 'box', a: w, sx: e.clientX, sy: e.clientY }
  } else {
    const id = +el.dataset.id
    if (e.shiftKey) S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id)
    else if (!S.sel.has(id)) S.sel = new Set([id])
    const P = positions()
    picked().forEach(i => i.z = ++zc)
    drag = { type: 'move', a: w, start: S.items.flatMap((it, k) => S.sel.has(it.id) ? [{ it, p: { ...P[k] } }] : []) }
  }
  render()
})

stage.addEventListener('pointermove', e => {
  if (!drag) return
  const w = toWorld(e), d = drag
  if (d.type === 'move' && outside(e)) {
    // Left the window: put the images back and start an OS drag with copies of them.
    if (S.mode === 'free') { d.start.forEach(({ it, p }) => { it.x = p.x; it.y = p.y }); if (d.moved) undo.pop() }
    drag = pileOverride = null
    stage.releasePointerCapture(e.pointerId)
    dragOut(picked()); animate(); render()
    return
  }
  if (d.type === 'pan') {
    S.cam.x = d.cam.x - (e.clientX - d.sx) / S.cam.z
    S.cam.y = d.cam.y - (e.clientY - d.sy) / S.cam.z
  } else if (d.type === 'box') {
    const r = stage.getBoundingClientRect()
    Object.assign(box.style, { display: 'block', left: Math.min(d.sx, e.clientX) - r.left + 'px', top: Math.min(d.sy, e.clientY) - r.top + 'px', width: Math.abs(e.clientX - d.sx) + 'px', height: Math.abs(e.clientY - d.sy) + 'px' })
    d.b = w
  } else {
    if (!d.moved) { d.moved = true; if (S.mode === 'free' || d.type === 'scale') snap() }
    if (d.type === 'scale') {
      const f = Math.max(0.02, Math.hypot(w.x - d.c.x, w.y - d.c.y) / d.d0)
      d.start.forEach(({ i, s, x, y }) => { i.s = s * f; if (S.mode === 'free') { i.x = d.c.x + (x - d.c.x) * f; i.y = d.c.y + (y - d.c.y) * f } })
    } else {
      const dx = w.x - d.a.x, dy = w.y - d.a.y
      if (S.mode === 'pile') pileOverride = new Map(d.start.map(({ it, p }) => [it.id, { x: p.x + dx, y: p.y + dy }]))
      else d.start.forEach(({ it, p }) => { it.x = p.x + dx; it.y = p.y + dy })
    }
  }
  render()
})

stage.addEventListener('pointerup', () => {
  const d = drag
  if (!d) return
  drag = null; stage.classList.remove('panning')
  if (d.type === 'box') {
    box.style.display = 'none'
    if (d.b) {
      const x0 = Math.min(d.a.x, d.b.x), x1 = Math.max(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y), y1 = Math.max(d.a.y, d.b.y), P = positions()
      S.items.forEach((it, k) => { const hw = it.w * it.s / 2, hh = it.h * it.s / 2; if (P[k].x - hw < x1 && P[k].x + hw > x0 && P[k].y - hh < y1 && P[k].y + hh > y0) S.sel.add(it.id) })
    }
  }
  // ponytail: in the pile, dragged images glide back to their packed slot; Free view is for manual placement.
  if (pileOverride) { pileOverride = null; animate() }
  if (d.type === 'scale' && d.moved) { animate(); changed() } else render()
  ui()
})

stage.addEventListener('dblclick', e => {
  const el = e.target.closest('.item')
  el ? (setMode('slides', +el.dataset.id), ui()) : C.fit()
})

stage.addEventListener('wheel', e => {
  e.preventDefault()
  const before = toWorld(e)
  S.cam.z = clamp(S.cam.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), 0.02, 50)
  const after = toWorld(e)
  S.cam.x += before.x - after.x; S.cam.y += before.y - after.y
  blink($('#zoom'), 900)
  render()
}, { passive: false })

// Window resize grip (transparent windows can't be resized natively on Windows).
const grip = $('#grip')
grip.addEventListener('pointerdown', e => {
  grip.setPointerCapture(e.pointerId)
  const sx = e.screenX, sy = e.screenY, w = outerWidth, h = outerHeight
  grip.onpointermove = m => api.win('size', [w + m.screenX - sx, h + m.screenY - sy])
  grip.onpointerup = () => grip.onpointermove = null
})

new ResizeObserver(() => S.mode === 'pile' ? fit() : render()).observe(stage)
ui()
