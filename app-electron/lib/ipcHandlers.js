const path = require("path");
const fs = require("fs");
const { ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const {
  getIconPath,
  getHelperAppPaths,
  helperExternalLinks,
  getLibraryDir,
  LAUNCHER_DOWNLOAD_URL,
} = require("./config");
const { ensureLibraryDir, safeFilename, downloadFile } = require("./download");
const {
  findCs2Path,
  getLocalOverlayVersion,
  fetchServerOverlayVersion,
} = require("./overlay");
const { getSystemInfo } = require("./systemInfo");
const { scanSteamAccounts, getSteamSearchInfo } = require("../steamScanner");

function registerIpcHandlers(app, getMainWindow, settings) {
  const getWin = () => getMainWindow();

  // --- Overlay ---

  ipcMain.handle("check-overlay-version", async () => {
    try {
      const [serverVersion, localVersion] = await Promise.all([
        fetchServerOverlayVersion(),
        Promise.resolve(getLocalOverlayVersion()),
      ]);
      if (serverVersion && localVersion && localVersion === serverVersion) {
        return { upToDate: true, serverVersion, localVersion };
      }
      return {
        upToDate: false,
        serverVersion,
        localVersion,
        needsUpdate: true,
      };
    } catch (err) {
      return { upToDate: false, error: err.message };
    }
  });

  ipcMain.handle("prepare-overlay", async () => {
    return { success: true, alreadyLatest: true, downloaded: false };
  });

  ipcMain.handle("start-overlay", async () => {
    return { success: true };
  });

  // --- System info ---

  ipcMain.handle("get-system-info", async () => {
    try {
      return await getSystemInfo(app, findCs2Path, getSteamSearchInfo);
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // --- Steam ---

  ipcMain.handle("scan-steam-accounts", async (_event, options = {}) => {
    try {
      const accounts = await scanSteamAccounts("quick", options);
      return { success: true, accounts };
    } catch (err) {
      return {
        success: false,
        error: err.message || String(err),
        accounts: [],
      };
    }
  });

  ipcMain.handle("get-steam-search-info", async () => {
    try {
      return getSteamSearchInfo();
    } catch {
      return { drives: [], steamPaths: [] };
    }
  });

  // --- Processes ---

  ipcMain.handle("get-processes-started-today", async () => {
    try {
      const { execFile } = require("child_process");

      const psCommand = [
        "$lb = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime",
        'if ($lb) { $lastBoot = $lb.ToString("yyyy-MM-dd") } else { $lastBoot = $null }',
        "$procs = Get-Process | Where-Object { $_.StartTime } | Select-Object Name, Id, StartTime, CPU, Description, Path",
        "$json = $procs | ConvertTo-Json -Compress",
        "[pscustomobject]@{ lastBoot = $lastBoot; processesJson = $json } | ConvertTo-Json -Compress",
      ].join("; ");

      const rawOutput = await new Promise((resolve, reject) => {
        execFile(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
          { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
          (err, stdout) =>
            err ? reject(err) : resolve(String(stdout || "").trim())
        );
      });

      if (!rawOutput) {
        return { success: true, processes: [], lastBoot: null };
      }

      let parsed;
      try {
        parsed = JSON.parse(rawOutput);
      } catch {
        return { success: true, processes: [], lastBoot: null };
      }

      const processesRaw = parsed?.processesJson || parsed;

      let processList;
      try {
        processList =
          typeof processesRaw === "string"
            ? JSON.parse(processesRaw)
            : processesRaw;
      } catch {
        processList = null;
      }

      const processes = Array.isArray(processList)
        ? processList
        : processList && typeof processList === "object" && "Name" in processList
          ? [processList]
          : [];

      const lastBoot = parsed?.lastBoot || null;

      return { success: true, processes, lastBoot };
    } catch (err) {
      return {
        success: false,
        error: err?.message || String(err),
        processes: [],
        lastBoot: null,
      };
    }
  });

  // --- Deleted files (stub) ---

  ipcMain.handle("get-deleted-files", async (_event, _options = {}) => {
    try {
      return { success: true, items: [] };
    } catch (err) {
      return { success: false, error: err?.message || String(err), items: [] };
    }
  });

  // --- System tools ---

  ipcMain.handle("open-regedit", async () => {
    try {
      spawn("regedit.exe", [], { detached: true, stdio: "ignore" }).unref();
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("helper-app-exists", async (_event, appName) => {
    try {
      const helperPaths = getHelperAppPaths(app);
      const appPath = helperPaths[appName];
      return { exists: !!(appPath && fs.existsSync(appPath)) };
    } catch {
      return { exists: false };
    }
  });

  ipcMain.handle("open-system-services", async () => {
    try {
      spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "Start-Process services.msc",
        ],
        { detached: true, stdio: "ignore" }
      ).unref();
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("open-data-usage", async () => {
    try {
      shell.openExternal("ms-settings:datausage");
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("open-nvidia-control-panel", async () => {
    try {
      const windowsAppsDir = "C:\\Program Files\\WindowsApps";
      const searchPaths = [
        path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "nvcplui.exe"
        ),
        path.join(
          "C:\\Program Files\\NVIDIA Corporation\\Control Panel Client",
          "nvcplui.exe"
        ),
      ];

      if (fs.existsSync(windowsAppsDir)) {
        try {
          const entries = fs.readdirSync(windowsAppsDir);
          const nvidiaDir = entries.find((e) =>
            e.startsWith("NVIDIACorp.NVIDIAControlPanel_")
          );
          if (nvidiaDir) {
            const nvidiaExe = path.join(
              windowsAppsDir,
              nvidiaDir,
              "nvcplui.exe"
            );
            if (fs.existsSync(nvidiaExe)) {
              searchPaths.unshift(nvidiaExe);
            }
          }
        } catch {}
      }

      for (const exePath of searchPaths) {
        if (fs.existsSync(exePath)) {
          spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
          return { success: true };
        }
      }

      return { success: false, error: "nvcplui.exe not found" };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // --- Helper apps ---

  const helperAppPaths = getHelperAppPaths(app);

  ipcMain.handle("launch-helper-app", async (_event, appName) => {
    try {
      const localPath = helperAppPaths[appName];
      if (localPath && fs.existsSync(localPath)) {
        try {
          spawn(localPath, [], { detached: true, stdio: "ignore" }).unref();
          return { started: true, via: "local", path: localPath };
        } catch {}
      }

      const externalUrl = helperExternalLinks[appName];
      if (externalUrl) {
        await shell.openExternal(externalUrl);
        return { started: true, via: "external", url: externalUrl };
      }

      return { started: false, error: "unknown_app" };
    } catch (err) {
      return { started: false, error: err.message };
    }
  });

  // --- Library management ---

  const libraryDir = getLibraryDir(app);

  ipcMain.handle("library-file-exists", async (_event, filePath) => {
    try {
      return { exists: !!filePath && fs.existsSync(filePath) };
    } catch {
      return { exists: false };
    }
  });

  ipcMain.handle("library-download", async (_event, params = {}) => {
    try {
      const id = String(params.id || "");
      const url = String(params.url || "");
      const filename = safeFilename(
        params.filename || (id || "file") + ".bin"
      );

      if (!id || !url) {
        return { success: false, error: "bad_args" };
      }

      ensureLibraryDir(libraryDir);
      const destPath = path.join(libraryDir, filename);

      if (fs.existsSync(destPath)) {
        return { success: true, filePath: destPath, already: true };
      }

      await downloadFile(url, destPath, ({ receivedBytes, totalBytes }) => {
        try {
          const win = getWin();
          if (win && !win.isDestroyed()) {
            const percent =
              totalBytes > 0
                ? Math.round((receivedBytes / totalBytes) * 100)
                : null;
            win.webContents.send("library-download-progress", {
              id,
              receivedBytes,
              totalBytes,
              percent,
            });
          }
        } catch {}
      });

      try {
        const win = getWin();
        if (win && !win.isDestroyed()) {
          win.webContents.send("library-download-complete", {
            id,
            filePath: destPath,
          });
        }
      } catch {}

      return { success: true, filePath: destPath, already: false };
    } catch (err) {
      try {
        const win = getWin();
        if (win && !win.isDestroyed()) {
          win.webContents.send("library-download-error", {
            id: String(params?.id || ""),
            error: err?.message || String(err),
          });
        }
      } catch {}

      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("library-open", async (_event, filePath) => {
    try {
      if (!filePath) {
        return { success: false, error: "no_path" };
      }
      const errorMsg = await shell.openPath(filePath);
      return errorMsg ? { success: false, error: errorMsg } : { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("library-show-in-folder", async (_event, filePath) => {
    try {
      if (!filePath) {
        return { success: false, error: "no_path" };
      }
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("library-delete", async (_event, filePath) => {
    try {
      if (!filePath) {
        return { success: false, error: "no_path" };
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // --- CS2 ---

  ipcMain.on("launch-cs2", (_event, options = {}) => {
    try {
      const cs2Path = findCs2Path();
      if (!cs2Path) return;

      const args = [];
      if (options.condebug === true) args.push("-condebug");
      if (options.insecure === true) args.push("-insecure");

      spawn(cs2Path, args, { detached: true, stdio: "ignore" }).unref();
    } catch (err) {
      console.error("Ошибка запуска CS2:", err);
    }
  });

  ipcMain.handle("open-cs2-folder", async () => {
    try {
      const cs2Path = findCs2Path();
      if (!cs2Path) {
        return { success: false, error: "CS2 не найден" };
      }
      // Navigate up 4 levels from cs2.exe to the CS2 root folder
      const cs2RootDir = path.dirname(
        path.dirname(path.dirname(path.dirname(cs2Path)))
      );
      shell.openPath(cs2RootDir);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-checker-folder", async () => {
    try {
      const exePath = app.getPath("exe");
      shell.openPath(path.dirname(exePath));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-logs-folder", async () => {
    try {
      const { getLogsDir } = require("./logger");
      const logsDir = getLogsDir();

      if (!logsDir || !fs.existsSync(logsDir)) {
        const userDataDir = app.getPath("userData");
        const fallbackLogsDir = path.join(userDataDir, "logs");
        if (!fs.existsSync(fallbackLogsDir)) {
          fs.mkdirSync(fallbackLogsDir, { recursive: true });
        }
        shell.openPath(fallbackLogsDir);
      } else {
        shell.openPath(logsDir);
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // --- Launcher update ---

  ipcMain.handle("launcher-download-and-install", async () => {
    try {
      const tempDir = app.getPath("temp");
      const setupPath = path.join(tempDir, "FearChecker-Setup.exe");

      await downloadFile(
        LAUNCHER_DOWNLOAD_URL,
        setupPath,
        ({ receivedBytes, totalBytes }) => {
          const win = getWin();
          if (win && !win.isDestroyed()) {
            const percent =
              totalBytes > 0
                ? Math.round((receivedBytes / totalBytes) * 100)
                : 0;
            win.webContents.send("launcher-download-progress", {
              receivedBytes,
              totalBytes,
              percent,
            });
          }
        }
      );

      if (!fs.existsSync(setupPath)) {
        return { success: false, error: "download_failed" };
      }

      const win = getWin();
      if (win && !win.isDestroyed()) {
        win.webContents.send("launcher-download-progress", {
          receivedBytes: 1,
          totalBytes: 1,
          percent: 100,
        });
      }

      spawn(setupPath, [], { detached: true, stdio: "ignore" }).unref();
      setTimeout(() => app.quit(), 500);

      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // --- Settings toggles ---

  ipcMain.on("set-auto-launch-launcher", (_event, enabled) => {
    settings.autoLaunchLauncherEnabled = enabled;
  });

  ipcMain.on("set-beta-testing", (_event, enabled) => {
    settings.betaTestingEnabled = enabled;
    const win = getWin();
    if (win) {
      if (enabled) {
        win.setResizable(settings.windowResizableEnabled);
        win.setMaximizable(settings.windowResizableEnabled);
        if (settings.devToolsEnabled) {
          setTimeout(() => {
            try {
              win.webContents.openDevTools();
            } catch {}
          }, 300);
        }
      } else {
        win.setResizable(false);
        win.setMaximizable(false);
        try {
          win.webContents.closeDevTools();
        } catch {}
      }
    }
  });

  ipcMain.on("set-window-resizable", (_event, enabled) => {
    settings.windowResizableEnabled = enabled;
    const win = getWin();
    if (win && settings.betaTestingEnabled) {
      win.setResizable(enabled);
      win.setMaximizable(enabled);
    }
  });

  ipcMain.on("set-dev-tools", (_event, enabled) => {
    settings.devToolsEnabled = enabled;
    const win = getWin();
    if (win && settings.betaTestingEnabled) {
      if (enabled) {
        setTimeout(() => {
          try {
            win.webContents.openDevTools();
          } catch {}
        }, 300);
      } else {
        try {
          win.webContents.closeDevTools();
        } catch {}
      }
    }
  });

  // --- Window controls ---

  ipcMain.on("window-minimize", () => {
    const win = getWin();
    if (win) win.minimize();
  });

  ipcMain.on("window-close", () => {
    const win = getWin();
    if (win) win.close();
  });
}

module.exports = { registerIpcHandlers };
