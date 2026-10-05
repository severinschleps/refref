// Browser stand-in for preload.js, so the website (docs/app → symlinks to these files) runs the real app.
// In Electron, preload.js already defined window.api and this file does nothing.
// ponytail: window controls, always-on-top, drag-out and URL drops have no web equivalent; they're hidden or no-ops.
if (!window.api) (() => {
  // The app's CSP blocks inline <style>, so the menu/hide rules live in a same-origin file.
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'web-api.css' }))

  const mac = /Mac/.test(navigator.platform)
  let top = true, at = { x: 0, y: 0 }
  addEventListener('contextmenu', e => at = { x: e.clientX, y: e.clientY }, true)

  const pick = (accept, multiple) => new Promise(res => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept, multiple })
    i.onchange = () => res([...i.files]); i.oncancel = () => res([]); i.click()
  })
  const read = (blob, how) => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r[how](blob) })
  // CSP blocks fetch() on data: URLs, so decode by hand.
  const toBlob = url => { const [h, b] = url.split(','), s = atob(b); return new Blob([Uint8Array.from(s, c => c.charCodeAt(0))], { type: h.slice(5, -7) }) }
  const keyLabel = k => k && k.replace('CmdOrCtrl+', mac ? '⌘' : 'Ctrl+').replace('Backspace', '⌫')

  function menu(items) {
    return new Promise(res => {
      const done = id => { root.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); res(id) }
      const away = e => { if (!root.contains(e.target)) done(null) }
      const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null) } }
      const build = list => {
        const box = Object.assign(document.createElement('div'), { className: 'wm' })
        for (const i of list) {
          if (i === '-') { box.append(document.createElement('hr')); continue }
          if (i.id === 'close' || i.label === 'Window') continue // no web equivalent
          const row = document.createElement('div')
          row.textContent = ('checked' in i ? (i.checked ? '✓ ' : ' ') : '') + i.label
          if (i.key) row.append(Object.assign(document.createElement('kbd'), { textContent: keyLabel(i.key) }))
          if (i.sub) row.append(Object.assign(document.createElement('kbd'), { textContent: '›' }), build(i.sub))
          if (i.on === false) row.className = 'off'
          else if (!i.sub) row.onclick = () => done(i.id)
          box.append(row)
        }
        return box
      }
      const root = build(items)
      document.body.append(root)
      const r = root.getBoundingClientRect()
      root.style.left = Math.min(at.x, innerWidth - r.width - 4) + 'px'
      root.style.top = Math.max(4, Math.min(at.y, innerHeight - r.height - 4)) + 'px'
      addEventListener('pointerdown', away, true)
      addEventListener('keydown', esc, true)
    })
  }

  window.api = {
    platform: mac ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux',
    dragOut: () => {},
    menu,
    win: async (c, a) => {
      if (c === 'top') top = !top
      if (c === 'opacity') document.documentElement.style.opacity = a
      return { top }
    },
    save: async (json, file) => {
      const name = file || 'board.refref'
      Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json])), download: name }).click()
      return name
    },
    open: async () => { const [f] = await pick('.refref'); return f && { file: f.name, text: await f.text() } },
    addImages: async () => Promise.all((await pick('image/*', true)).map(f => read(f, 'readAsDataURL'))),
    fetchImage: async () => null, // CSP keeps the demo same-origin; drop files instead of web URLs
    paste: async () => {
      try {
        for (const it of await navigator.clipboard.read()) {
          const t = it.types.find(t => t.startsWith('image/'))
          if (t) return read(await it.getType(t), 'readAsDataURL')
        }
        return (await navigator.clipboard.readText()).trim()
      } catch { return '' }
    },
    copy: url => navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(url) })]).catch(() => {}),
  }
})()
