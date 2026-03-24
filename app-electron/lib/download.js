const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

function ensureLibraryDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    console.error('Не удалось создать папку библиотеки:', err);
  }
}

function safeFilename(name) {
  const base = path.basename(String(name || 'download.bin'));
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      const maxRedirects = 5;
      let redirectCount = 0;

      const doRequest = (currentUrl) => {
        const client = currentUrl.startsWith('https:') ? https : http;

        const request = client.get(currentUrl, {
          headers: {
            'User-Agent': 'FearChecker/2.0.1 (Windows; Electron)'
          }
        }, (response) => {
          const statusCode = response.statusCode;

          if (statusCode && statusCode >= 300 && statusCode < 400 && response.headers.location) {
            if (redirectCount >= maxRedirects) {
              reject(new Error('too_many_redirects'));
              return;
            }
            redirectCount++;
            const redirectUrl = new URL(response.headers.location, currentUrl).toString();
            response.resume();
            doRequest(redirectUrl);
            return;
          }

          if (statusCode !== 200) {
            reject(new Error('http_' + statusCode));
            response.resume();
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10) || 0;
          let receivedBytes = 0;

          const fileStream = fs.createWriteStream(destPath);

          response.on('data', (chunk) => {
            receivedBytes += chunk.length;
            if (onProgress) {
              onProgress({ receivedBytes, totalBytes });
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => resolve());
          });

          fileStream.on('error', (err) => {
            try { fileStream.close(() => {}); } catch {}
            try { fs.unlinkSync(destPath); } catch {}
            reject(err);
          });
        });

        request.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      };

      doRequest(url);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { ensureLibraryDir, safeFilename, downloadFile };
