// Bridge for the browser chrome (sidebar, toolbar, popovers).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aura', {
  act: (type, arg) => ipcRenderer.invoke('shell', type, arg),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onFrame: (fn) => ipcRenderer.on('frame', (_e, f) => fn(f)),
  onCmd: (fn) => ipcRenderer.on('cmd', (_e, c, a) => fn(c, a))
});
