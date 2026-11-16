const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desk', {
  setMode: (mode, size) => ipcRenderer.send('mode', mode, size),
  quit: () => ipcRenderer.send('quit'),
});
