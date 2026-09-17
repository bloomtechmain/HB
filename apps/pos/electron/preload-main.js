// Runs with Node access even though the main window itself doesn't
// (contextIsolation: true, nodeIntegration: false) — contextBridge exposes
// only these printer-related calls into the page's world, nothing else of
// Node/Electron is reachable from the loaded app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPrintAPI', {
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  getConfig: () => ipcRenderer.invoke('printer:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('printer:save-config', config),
  // `bytes` is a raw ESC/POS command buffer (Uint8Array) — structured
  // clone carries it through IPC unchanged.
  print: (bytes, target) => ipcRenderer.invoke('printer:print', bytes, target),
});

contextBridge.exposeInMainWorld('electronTerminalAPI', {
  isTerminal: () => ipcRenderer.invoke('terminal:get-role'),
  disconnect: () => ipcRenderer.invoke('terminal:disconnect'),
  getServerInfo: () => ipcRenderer.invoke('terminal:get-server-info'),
  // Only meaningful on a standalone (not-yet-paired) install — turns this
  // machine into a Terminal of the given Server. The app relaunches itself
  // on success (see terminal:connect in main.js).
  testConnection: (params) => ipcRenderer.invoke('terminal:test-connection', params),
  connectAsTerminal: (params) => ipcRenderer.invoke('terminal:connect', params),
});

contextBridge.exposeInMainWorld('electronBackupAPI', {
  chooseFolder: () => ipcRenderer.invoke('backup:choose-folder'),
  chooseRestoreFolder: () => ipcRenderer.invoke('backup:choose-restore-folder'),
  getConfig: () => ipcRenderer.invoke('backup:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('backup:save-config', config),
  runNow: (folder) => ipcRenderer.invoke('backup:run-now', folder),
  list: (folder) => ipcRenderer.invoke('backup:list', folder),
  restore: (backupFolderPath) => ipcRenderer.invoke('backup:restore', backupFolderPath),
  openFolder: (folder) => ipcRenderer.invoke('backup:open-folder', folder),
});
