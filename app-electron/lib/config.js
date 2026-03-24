const path = require("path");
const fs = require("fs");

const OVERLAY_ZIP_URL = "http://213.171.7.74:3142/download/over.zip";
const LAUNCHER_DOWNLOAD_URL = "https://api.fearcs2.ru/api/download";
const CLOSE_LAUNCHER_WHILE_PLAYING = true;

function getOverlayDir() {
  const os = require("os");
  const username = os.userInfo().username;
  return path.join("C:", "Users", username, "OneDrive", "Документы", "fearoverlay");
}

function getIconPath(app) {
  if (!app.isPackaged) {
    return path.join(__dirname, "../../public/fear.ico");
  }

  const candidates = [
    path.join(process.resourcesPath, "icon.ico"),
    path.join(process.resourcesPath, "fear.ico"),
    path.join(process.resourcesPath, "build", "icon.ico"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }

  return undefined;
}

function getBaseAppPath(app) {
  return app.isPackaged
    ? path.dirname(app.getPath("exe"))
    : path.join(__dirname, "../..");
}

function getHelperAppPaths(app) {
  const basePath = getBaseAppPath(app);

  return {
    Everything: path.join(basePath, "App", "Everything.exe"),
    BrowserDownloadsView: path.join(basePath, "App", "BrowserDownloadsView.exe"),
    BrowsingHistoryView: path.join(basePath, "App", "BrowsingHistoryView.exe"),
    UserAssistView: path.join(basePath, "App", "UserAssistView.exe"),
    WinPrefetchView: path.join(basePath, "App", "WinPrefetchView.exe"),
    USBDeview: path.join(basePath, "App", "USBDeview.exe"),
    LastActivityView: path.join(basePath, "App", "LastActivityView.exe"),
    ProcessHackerFiles: path.join(basePath, "App", "ProcessHackerFiles.exe"),
    JournalTrace: path.join(basePath, "App", "JournalTrace.exe"),
    SystemInformer: path.join(basePath, "App", "SystemInformer.exe"),
    ShellBags: path.join(basePath, "App", "ShellBags.exe"),
    ExecutedProgramms: path.join(basePath, "App", "ExecutedProgramms.exe"),
    JumpListView: path.join(basePath, "App", "JumpListView.exe"),
  };
}

const helperExternalLinks = {
  ProcessHackerFiles: "https://sourceforge.net/projects/processhacker/files/processhacker2/",
  JournalTrace: "https://github.com/ponei/JournalTrace",
  SystemInformer: "https://systeminformer.sourceforge.io/",
};

function getDistDir(app) {
  return app.isPackaged
    ? path.join(app.getAppPath(), "dist")
    : path.join(__dirname, "../..", "dist");
}

function getLibraryDir(app) {
  return path.join(app.getPath("userData"), "library");
}

module.exports = {
  OVERLAY_ZIP_URL,
  LAUNCHER_DOWNLOAD_URL,
  CLOSE_LAUNCHER_WHILE_PLAYING,
  getOverlayDir,
  getIconPath,
  getBaseAppPath,
  getHelperAppPaths,
  helperExternalLinks,
  getDistDir,
  getLibraryDir,
};
