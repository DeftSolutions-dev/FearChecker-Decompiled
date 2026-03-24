const { contextBridge, shell, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  openExternal: (url) => shell.openExternal(url),

  minimize: () => ipcRenderer.send("window-minimize"),
  close: () => ipcRenderer.send("window-close"),

  launchCs2: (args) => ipcRenderer.send("launch-cs2", args),

  prepareOverlay: () => ipcRenderer.invoke("prepare-overlay"),
  checkOverlayVersion: () => ipcRenderer.invoke("check-overlay-version"),
  startOverlay: () => ipcRenderer.invoke("start-overlay"),

  openCs2Folder: () => ipcRenderer.invoke("open-cs2-folder"),
  openCheckerFolder: () => ipcRenderer.invoke("open-checker-folder"),
  openLogsFolder: () => ipcRenderer.invoke("open-logs-folder"),

  setAutoLaunchLauncher: (enabled) => ipcRenderer.send("set-auto-launch-launcher", enabled),
  setBetaTesting: (enabled) => ipcRenderer.send("set-beta-testing", enabled),
  setWindowResizable: (resizable) => ipcRenderer.send("set-window-resizable", resizable),
  setDevTools: (enabled) => ipcRenderer.send("set-dev-tools", enabled),

  launchHelperApp: (appName) => ipcRenderer.invoke("launch-helper-app", appName),
  helperAppExists: (appName) => ipcRenderer.invoke("helper-app-exists", appName),

  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),

  scanSteamAccounts: (options) => ipcRenderer.invoke("scan-steam-accounts", options || {}),
  getSteamSearchInfo: () => ipcRenderer.invoke("get-steam-search-info"),

  libraryDownload: (item) => ipcRenderer.invoke("library-download", item),
  libraryOpen: (item) => ipcRenderer.invoke("library-open", item),
  libraryShowInFolder: (item) => ipcRenderer.invoke("library-show-in-folder", item),
  libraryDelete: (item) => ipcRenderer.invoke("library-delete", item),
  libraryFileExists: (item) => ipcRenderer.invoke("library-file-exists", item),

  onLibraryDownloadProgress: (callback) =>
    ipcRenderer.on("library-download-progress", (_event, data) => callback(data)),
  onLibraryDownloadComplete: (callback) =>
    ipcRenderer.on("library-download-complete", (_event, data) => callback(data)),
  onLibraryDownloadError: (callback) =>
    ipcRenderer.on("library-download-error", (_event, data) => callback(data)),

  launcherDownloadAndInstall: () => ipcRenderer.invoke("launcher-download-and-install"),
  onLauncherDownloadProgress: (callback) =>
    ipcRenderer.on("launcher-download-progress", (_event, data) => callback(data)),

  getProcessesStartedToday: () => ipcRenderer.invoke("get-processes-started-today"),
  getDeletedFiles: (options) => ipcRenderer.invoke("get-deleted-files", options || {}),

  openSystemServices: () => ipcRenderer.invoke("open-system-services"),
  openDataUsage: () => ipcRenderer.invoke("open-data-usage"),
  openNvidiaControlPanel: () => ipcRenderer.invoke("open-nvidia-control-panel"),
  openRegedit: () => ipcRenderer.invoke("open-regedit"),
});
