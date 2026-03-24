const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { initLogger, patchConsoleForLogging, logAppLifecycle } = require('./lib/logger');
const { getIconPath } = require('./lib/config');
const { verifyIntegrity, verifyAsarIntegrity, showTamperedWindow } = require('./lib/integrity');
const { registerIpcHandlers } = require('./lib/ipcHandlers');

process.on('uncaughtException', (err) => console.error('[uncaughtException in main]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection in main]', reason));

let mainWindow = null;

const state = {
  autoLaunchLauncherEnabled: false,
  betaTestingEnabled: false,
  windowResizableEnabled: false,
  devToolsEnabled: false,
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#0f0e19',
    frame: false,
    fullscreen: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    icon: getIconPath(app),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true,
    },
  });

  mainWindow = win;

  const indexPath = path.join(__dirname, '../dist/index.html');
  win.loadFile(indexPath);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('context-menu', (event) => event.preventDefault());

  win.webContents.on('render-process-gone', (_event, details) => {
    logAppLifecycle('КРАШ: renderer process (окно/вкладка)', {
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
  });

  win.webContents.on('unresponsive', () => {
    logAppLifecycle('ПРЕДУПРЕЖДЕНИЕ: окно не отвечает', {});
  });

  win.webContents.on('responsive', () => {
    logAppLifecycle('INFO: окно снова отвечает', {});
  });
}

const appStartTime = Date.now();

app.whenReady().then(() => {
  initLogger(app);
  patchConsoleForLogging();

  process.on('uncaughtException', (err) => {
    logAppLifecycle('КРАШ: uncaughtException', {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
      code: err?.code,
      errno: err?.errno,
    });
  });

  process.on('unhandledRejection', (reason, _promise) => {
    const details = reason instanceof Error
      ? { message: reason.message, stack: reason.stack }
      : { reason: String(reason), type: typeof reason };
    logAppLifecycle('КРАШ: unhandledRejection', details);
  });

  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId('ru.fearchecker.app');
    } catch (_ignored) {}
  }

  // Integrity check disabled for decompiled version
  // if (app.isPackaged) {
  //   if (!verifyAsarIntegrity() || !verifyIntegrity(app)) {
  //     showTamperedWindow(app);
  //     return;
  //   }
  // }

  registerIpcHandlers(app, () => mainWindow, state);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logAppLifecycle('ЗАКРЫТИЕ: все окна закрыты', {
    platform: process.platform,
    uptimeSec: Math.round((Date.now() - appStartTime) / 1000),
  });
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logAppLifecycle('ЗАКРЫТИЕ: нормальное завершение (before-quit)', {
    platform: process.platform,
    uptimeSec: Math.round((Date.now() - appStartTime) / 1000),
    quitRequested: true,
  });
});
