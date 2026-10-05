const { contextBridge, ipcRenderer } = require('electron')
const api = {}
for (const ch of ['win', 'menu', 'save', 'open', 'addImages', 'fetchImage', 'paste', 'copy']) api[ch] = (...a) => ipcRenderer.invoke(ch, ...a)
contextBridge.exposeInMainWorld('api', api)
