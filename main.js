const { app, BrowserWindow, ipcMain, dialog, Menu, clipboard, nativeImage, shell } = require('electron')
const fs = require('fs'), path = require('path'), { fileURLToPath } = require('url')

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif' }
const BOARD = [{ name: 'RefRef board', extensions: ['refref'] }]
const dataURL = p => { const t = MIME[path.extname(p).slice(1).toLowerCase()]; return t && `data:${t};base64,${fs.readFileSync(p).toString('base64')}` }
let win, dirty = false

app.whenReady().then(() => {
  // Replace the default menu: its Cmd/Ctrl+R reload would silently wipe the board.
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }]) : null)
  win = new BrowserWindow({
    width: 900, height: 640, minWidth: 240, minHeight: 160,
    frame: false, transparent: true, hasShadow: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.setAlwaysOnTop(true, 'floating')
  // Links with target=_blank (the Ko-fi button) open in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https:')) shell.openExternal(url); return { action: 'deny' } })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.on('close', e => {
    if (dirty && dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Cancel', 'Discard'], message: 'Discard unsaved changes to this board?' }) === 0) e.preventDefault()
  })
})
app.on('window-all-closed', () => app.quit())

const on = (ch, fn) => ipcMain.handle(ch, (_, ...a) => fn(...a))

on('win', (c, a) => {
  if (c === 'close') return win.close()
  if (c === 'min') win.minimize()
  if (c === 'top') win.setAlwaysOnTop(!win.isAlwaysOnTop(), 'floating')
  if (c === 'opacity') win.setOpacity(a)
  if (c === 'size') win.setSize(Math.max(240, Math.round(a[0])), Math.max(160, Math.round(a[1])))
  if (c === 'dirty') dirty = a
  return { top: win.isAlwaysOnTop() }
})

// Renderer sends a plain JSON menu description; resolves with the clicked item's id (or null).
const build = (items, done) => items.map(i => i === '-' ? { type: 'separator' } : {
  label: i.label, enabled: i.on !== false, accelerator: i.key, registerAccelerator: false,
  ...('checked' in i && { type: 'checkbox', checked: i.checked }),
  ...(i.sub ? { submenu: build(i.sub, done) } : { click: () => done(i.id) }),
})
on('menu', items => new Promise(res => Menu.buildFromTemplate(build(items, res)).popup({ window: win, callback: () => setTimeout(res, 100, null) })))

on('save', async (json, file) => {
  if (!file) ({ filePath: file } = await dialog.showSaveDialog(win, { defaultPath: 'board.refref', filters: BOARD }))
  if (!file) return null
  try { fs.writeFileSync(file, json); return file } catch (e) { dialog.showErrorBox('Save failed', e.message); return null }
})
on('open', async () => {
  const { filePaths: [file] } = await dialog.showOpenDialog(win, { filters: BOARD })
  return file && { file, text: fs.readFileSync(file, 'utf8') }
})
on('addImages', async () => {
  const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: Object.keys(MIME) }] })
  return filePaths.map(p => ({ src: dataURL(p), name: path.basename(p) }))
})
// Main-process fetch: no CORS, so images dragged from any website work.
on('fetchImage', async url => {
  if (!/^https?:/.test(url)) return null
  const r = await fetch(url), type = (r.headers.get('content-type') || '').split(';')[0]
  return r.ok && type.startsWith('image/') ? `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : null
})
on('paste', () => {
  // ponytail: Finder file copies handled on macOS only; Windows/Linux file copies fall through to image/text.
  const f = process.platform === 'darwin' && clipboard.read('public.file-url')
  const fromFile = f && dataURL(fileURLToPath(f))
  if (fromFile) return fromFile
  const img = clipboard.readImage()
  return img.isEmpty() ? clipboard.readText().trim() : img.toDataURL()
})
// Drag images out of the board: write them to temp files and hand them to the OS drag session.
ipcMain.on('dragOut', (e, items) => {
  const dir = path.join(app.getPath('temp'), 'refref')
  fs.mkdirSync(dir, { recursive: true })
  const files = items.map(({ src, name }, k) => {
    const i = src.indexOf(','), head = src.slice(5, i)
    if (!head.endsWith(';base64')) return null
    const type = head.split(';')[0].split('/')[1], ext = { jpeg: 'jpg', 'svg+xml': 'svg' }[type] || type
    const base = name ? path.parse(name).name.replace(/[^\w.-]+/g, '_') : `refref-${Date.now()}`
    const file = path.join(dir, `${base}${items.length > 1 ? '-' + (k + 1) : ''}.${ext}`)
    fs.writeFileSync(file, Buffer.from(src.slice(i + 1), 'base64'))
    return file
  }).filter(Boolean)
  if (files.length) e.sender.startDrag({ file: files[0], files, icon: nativeImage.createFromDataURL(items[0].thumb) })
})
on('copy', url => clipboard.writeImage(nativeImage.createFromDataURL(url)))
