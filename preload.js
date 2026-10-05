const { contextBridge, ipcRenderer } = require('electron')
const api = { platform: process.platform, dragOut: items => ipcRenderer.send('dragOut', items) }
for (const ch of ['win', 'menu', 'save', 'open', 'addImages', 'fetchImage', 'paste', 'copy']) api[ch] = (...a) => ipcRenderer.invoke(ch, ...a)
contextBridge.exposeInMainWorld('api', api)
