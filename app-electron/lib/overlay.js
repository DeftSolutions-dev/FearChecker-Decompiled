const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const { getOverlayDir, OVERLAY_ZIP_URL, CLOSE_LAUNCHER_WHILE_PLAYING } = require("./config");

let overlayProcess = null;
let cs2CheckInterval = null;

function findCs2Path() {
  const drives = [];

  if (process.platform === "win32") {
    for (let charCode = 65; charCode <= 90; charCode++) {
      const driveLetter = String.fromCharCode(charCode) + ":";
      try {
        if (fs.existsSync(driveLetter)) {
          drives.push(driveLetter);
        }
      } catch (err) {}
    }
  }

  const steamPaths = [
    "Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
    "SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
    "Games\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
    "Program Files\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
    "Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe",
  ];

  for (const drive of drives) {
    for (const steamPath of steamPaths) {
      const fullPath = path.join(drive, steamPath);
      if (fs.existsSync(fullPath)) {
        console.log("CS2 найден:", fullPath);
        return fullPath;
      }
    }
  }

  return null;
}

function getLocalOverlayVersion() {
  try {
    const overlayDir = getOverlayDir();
    const versionFile = path.join(overlayDir, "overlay-version.json");

    if (!fs.existsSync(versionFile)) {
      return null;
    }

    const content = fs.readFileSync(versionFile, "utf-8");
    const data = JSON.parse(content);
    return data.version || null;
  } catch (err) {
    console.warn("Не удалось прочитать локальную версию оверлея:", err.message);
    return null;
  }
}

function fetchServerOverlayVersion() {
  return new Promise((resolve) => {
    try {
      https
        .get("https://api.fearcs2.ru/api/overlay-version", (response) => {
          let body = "";

          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            try {
              const data = JSON.parse(body || "{}");
              resolve(data.version || null);
            } catch (err) {
              console.error("Ошибка парсинга overlay-version ответа:", err);
              resolve(null);
            }
          });
        })
        .on("error", (err) => {
          console.error("Ошибка запроса overlay-version с сервера:", err);
          resolve(null);
        });
    } catch (err) {
      console.error("Ошибка fetchServerOverlayVersion:", err);
      resolve(null);
    }
  });
}

function downloadOverlayIfNeeded() {
  return new Promise(async (resolve) => {
    try {
      const overlayDir = getOverlayDir();

      const [serverVersion, localVersion] = await Promise.all([
        fetchServerOverlayVersion(),
        Promise.resolve(getLocalOverlayVersion()),
      ]);

      if (
        fs.existsSync(overlayDir) &&
        fs.readdirSync(overlayDir).length > 0 &&
        serverVersion &&
        localVersion === serverVersion
      ) {
        resolve({ alreadyLatest: true, serverVersion, localVersion });
        return;
      }

      if (!fs.existsSync(overlayDir)) {
        fs.mkdirSync(overlayDir, { recursive: true });
      }

      const zipPath = path.join(overlayDir, "over.zip");
      const fileStream = fs.createWriteStream(zipPath);

      http
        .get(OVERLAY_ZIP_URL, (response) => {
          if (response.statusCode !== 200) {
            fs.unlink(zipPath, () =>
              resolve({
                alreadyLatest: false,
                error: "http_status_" + response.statusCode,
              })
            );
            return;
          }

          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close(() => {
              try {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(overlayDir, true);
                fs.unlink(zipPath, () => {});

                const version = serverVersion || localVersion || "unknown";
                fs.writeFileSync(
                  path.join(overlayDir, "overlay-version.json"),
                  JSON.stringify({ version }, null, 2),
                  "utf-8"
                );

                resolve({
                  alreadyLatest: false,
                  serverVersion,
                  localVersion: version,
                });
              } catch (err) {
                resolve({ alreadyLatest: false, error: err.message });
              }
            });
          });
        })
        .on("error", (err) => {
          try {
            fs.unlink(zipPath, () => {});
          } catch {}
          resolve({ alreadyLatest: false, error: err.message });
        });
    } catch (err) {
      resolve({ alreadyLatest: false, error: err.message });
    }
  });
}

function isCs2Running() {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec('tasklist /FI "IMAGENAME eq cs2.exe"', (err, stdout) => {
      resolve(!err && stdout.includes("cs2.exe"));
    });
  });
}

function startOverlay() {
  if (overlayProcess && !overlayProcess.killed) return;

  const exePath = path.join(getOverlayDir(), "FearChecker.exe");
  if (!fs.existsSync(exePath)) return;

  try {
    overlayProcess = spawn(exePath, ["--from-launcher"], {
      detached: true,
      stdio: "ignore",
    });
    overlayProcess.unref();
    console.log("Оверлей запущен");
  } catch (err) {
    console.error("Ошибка запуска оверлея:", err);
  }
}

function stopOverlay() {
  if (overlayProcess && !overlayProcess.killed) {
    try {
      overlayProcess.kill();
      console.log("Оверлей остановлен");
    } catch (err) {
      console.error("Ошибка остановки оверлея:", err);
    }
    overlayProcess = null;
  }
}

function safeWindowShowFocus(window) {
  if (!window || window.isDestroyed()) return;

  try {
    window.show();
    window.focus();
  } catch (err) {
    console.warn("Оверлей: show/focus окна пропущены", err?.message);
  }
}

function safeWindowHide(window) {
  if (!window || window.isDestroyed()) return;

  try {
    window.hide();
  } catch (err) {
    console.warn("Оверлей: hide окна пропущен", err?.message);
  }
}

function startCs2Monitoring(mainWindowOrGetter, shouldKeepVisibleFn) {
  if (cs2CheckInterval) return;

  let wasCs2Running = false;

  cs2CheckInterval = setInterval(async () => {
    const cs2Running = await isCs2Running();
    const mainWindow =
      typeof mainWindowOrGetter === "function"
        ? mainWindowOrGetter()
        : mainWindowOrGetter;
    const shouldKeepVisible = shouldKeepVisibleFn
      ? shouldKeepVisibleFn()
      : false;

    if (cs2Running && !wasCs2Running) {
      startOverlay();

      if (shouldKeepVisible && mainWindow && !mainWindow.isDestroyed()) {
        safeWindowShowFocus(mainWindow);
      } else if (CLOSE_LAUNCHER_WHILE_PLAYING && mainWindow) {
        safeWindowHide(mainWindow);
      }

      wasCs2Running = true;
    } else if (!cs2Running && wasCs2Running) {
      stopOverlay();

      if (mainWindow) {
        safeWindowShowFocus(mainWindow);
      }

      wasCs2Running = false;
    }
  }, 2000);

  console.log("Мониторинг CS2 запущен");
}

function stopCs2Monitoring() {
  if (cs2CheckInterval) {
    clearInterval(cs2CheckInterval);
    cs2CheckInterval = null;
    console.log("Мониторинг CS2 остановлен");
  }
  stopOverlay();
}

module.exports = {
  findCs2Path,
  getLocalOverlayVersion,
  fetchServerOverlayVersion,
  downloadOverlayIfNeeded,
  isCs2Running,
  startOverlay,
  stopOverlay,
  startCs2Monitoring,
  stopCs2Monitoring,
};
