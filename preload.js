const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desk', {
  setMode: (mode, size) => ipcRenderer.send('mode', mode, size),
  quit: () => ipcRenderer.send('quit'),
  arbeitsplatz: () => ipcRenderer.send('arbeitsplatz'),
  timer: (ende, titel) => ipcRenderer.send('timer', ende, titel),
  ical: url => ipcRenderer.invoke('ical', url),
  onAuftrag: fn => ipcRenderer.on('auftrag', (e, ende, titel) => fn(ende, titel)),
});
