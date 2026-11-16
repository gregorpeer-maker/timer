// Unterrichtstimer – Windows-App: rahmenloses, durchsichtiges Fenster, in der Mini-Ansicht immer im Vordergrund.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZES = [[260, 195], [340, 250], [460, 340]];   // Mini-Ansicht: klein, mittel, groß
let win = null, mode = 'widget', pos = null;
const posFile = () => path.join(app.getPath('userData'), 'fenster.json');

function loadPos() {
  try { const p = JSON.parse(fs.readFileSync(posFile(), 'utf8')); if (Number.isFinite(p.x) && Number.isFinite(p.y)) pos = p; } catch (e) {}
}
function savePos() { try { fs.writeFileSync(posFile(), JSON.stringify(pos)); } catch (e) {} }

function widgetBounds(size) {
  const [width, height] = SIZES[size] || SIZES[1];
  const visible = pos && screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return pos.x >= a.x - width + 60 && pos.x <= a.x + a.width - 60 && pos.y >= a.y && pos.y <= a.y + a.height - 60;
  });
  if (visible) return { x: pos.x, y: pos.y, width, height };
  const a = screen.getPrimaryDisplay().workArea;      // Standard: unten rechts
  return { x: a.x + a.width - width - 24, y: a.y + a.height - height - 24, width, height };
}

function setMode(m, size) {
  if (!win) return;
  mode = m === 'plan' || m === 'full' ? m : 'widget';
  if (mode === 'full') {                               // Vollbild: ganzer Bildschirm inklusive Taskleiste
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setBounds(screen.getDisplayMatching(win.getBounds()).bounds);
  } else if (mode === 'widget') {
    win.setAlwaysOnTop(true, 'screen-saver');          // auch über Vollbild-Präsentationen
    win.setBounds(widgetBounds(size));
  } else {
    const a = screen.getDisplayMatching(win.getBounds()).workArea;
    const width = Math.min(1100, a.width - 60), height = Math.min(800, a.height - 60);
    win.setAlwaysOnTop(false);
    win.setBounds({ x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + (a.height - height) / 2), width, height });
  }
}

function create() {
  loadPos();
  win = new BrowserWindow({
    ...widgetBounds(1), frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, show: false,
    title: 'Unterrichtstimer',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  const remember = () => { if (mode === 'widget' && win) { const [x, y] = win.getPosition(); pos = { x, y }; savePos(); } };
  win.on('moved', remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; });
}

ipcMain.on('mode', (e, m, size) => setMode(m, size));
ipcMain.on('quit', () => app.quit());

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(create);
  app.on('window-all-closed', () => app.quit());
}
