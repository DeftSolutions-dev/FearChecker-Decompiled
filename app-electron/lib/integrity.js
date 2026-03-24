const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { getIconPath, getDistDir } = require('./config');

function verifyIntegrity(appName) {
  try {
    const distDir = getDistDir(appName);
    const integrityFilePath = path.join(distDir, 'integrity.json');

    if (!fs.existsSync(integrityFilePath)) {
      return true;
    }

    const integrityJson = fs.readFileSync(integrityFilePath, 'utf8');
    const hashMap = JSON.parse(integrityJson);

    const sha256 = (content) =>
      crypto.createHash('sha256').update(content, 'utf8').digest('hex');

    for (const [relativePath, expectedHash] of Object.entries(hashMap)) {
      const filePath = path.join(distDir, relativePath);

      if (!fs.existsSync(filePath)) {
        return false;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');

      if (sha256(fileContent) !== expectedHash) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Ошибка проверки целостности:', error.message);
    return false;
  }
}

function verifyAsarIntegrity() {
  try {
    const resourcesPath = process.resourcesPath;
    const asarPath = path.join(resourcesPath, 'app.asar');
    const asarHashPath = path.join(resourcesPath, 'app.asar.sha256');

    if (!fs.existsSync(asarPath) || !fs.existsSync(asarHashPath)) {
      return true;
    }

    const expectedHash = fs.readFileSync(asarHashPath, 'utf8').trim();

    if (!expectedHash) {
      return true;
    }

    const asarBuffer = fs.readFileSync(asarPath);
    const actualHash = crypto.createHash('sha256').update(asarBuffer).digest('hex');

    return actualHash === expectedHash;
  } catch (error) {
    console.error('Ошибка проверки app.asar:', error.message);
    return false;
  }
}

function showTamperedWindow(appName) {
  const backgroundColor = '#0f0e19';

  const window = new BrowserWindow({
    width: 480,
    height: 220,
    backgroundColor,
    frame: false,
    icon: getIconPath(appName),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      background: #0f0e19;
      color: #fff;
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 24px;
      text-align: center;
    }
    p { margin: 0 0 16px; }
    button {
      background: #c41e3a;
      color: #fff;
      border: none;
      padding: 10px 24px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #a01830; }
  </style>
</head>
<body>
  <div>
    <p><strong>Обнаружено изменение файлов приложения.</strong></p>
    <p>Переустановите FearChecker.</p>
    <button onclick="window.close()">Закрыть</button>
  </div>
</body>
</html>`;

  window.setResizable(false);
  window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => app.quit());
}

module.exports = {
  verifyIntegrity,
  verifyAsarIntegrity,
  showTamperedWindow,
};
