// Strafe desktop: the browser game in its own window. Best times, settings
// and ghosts are kept in the app's local storage; the online leaderboard
// only exists in the claude.ai version, so it stays hidden here.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#0f1318', title: 'Strafe', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'app', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // F11 toggles fullscreen (Esc stays the game's menu key)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // links open in the real browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
