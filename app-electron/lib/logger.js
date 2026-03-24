const path = require('path');
const fs = require('fs');

const LOG_FILE_NAME = "cheker.log";

let logStream = null;
let logsDir = null;
let logFilePath = null;

function initLogger(app) {
  try {
    const userDataPath = app.getPath("userData");
    logsDir = path.join(userDataPath, 'logs');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    logFilePath = path.join(logsDir, LOG_FILE_NAME);
    logStream = fs.createWriteStream(logFilePath, {
      flags: 'a',
      encoding: 'utf8'
    });

    logStream.write('[' + new Date().toISOString() + "] [INFO] Logger initialized, logs: " + logsDir + '\n');
  } catch (err) {
    console.error("logger_init_error", err);
  }
}

function writeSync(level, message, detail) {
  if (!logFilePath) return;

  try {
    const timestamp = new Date().toISOString();
    let entry = '[' + timestamp + "] [" + level + '] ' + message + '\n';

    if (detail) {
      if (typeof detail === "string") {
        entry += '  ' + detail + '\n';
      } else if (detail instanceof Error) {
        entry += '  ' + detail.message + '\n' +
          (detail.stack || '').split('\n').map(line => '  ' + line).join('\n') + '\n';
      } else {
        entry += '  ' + JSON.stringify(detail, null, 2).split('\n').join('\n  ') + '\n';
      }
    }

    fs.appendFileSync(logFilePath, entry, "utf8");
  } catch (err) {
    try {
      console.error("writeSync failed", err);
    } catch {
    }
  }
}

function logAppLifecycle(eventName, detail) {
  const timestamp = new Date().toISOString();
  const header = '\n[' + timestamp + '] ========== ' + eventName + " ==========\n";

  let detailText = '';
  if (detail) {
    if (typeof detail === 'string') {
      detailText = detail + '\n';
    } else if (detail instanceof Error) {
      detailText = "message: " + detail.message + "\nstack:\n" +
        (detail.stack || '').split('\n').map(line => '  ' + line).join('\n') + '\n';
    } else {
      try {
        detailText = JSON.stringify(detail, null, 2) + '\n';
      } catch {
        detailText = String(detail) + '\n';
      }
    }
  }

  const footer = '[' + timestamp + "] ========== конец записи " + eventName + ' ==========\n';

  try {
    if (logStream) {
      logStream.write(header + detailText);
      logStream.write(footer);
    }

    if (logFilePath) {
      fs.appendFileSync(logFilePath, header + detailText + footer, "utf8");
    }
  } catch (err) {
    try {
      writeSync("ERROR", 'logAppLifecycle failed', err);
    } catch {
    }
  }
}

function getLogsDir() {
  return logsDir;
}

function writeLogToFile(level, args) {
  if (!logStream) return;

  try {
    const line = '[' + new Date().toISOString() + "] [" + level + '] ' +
      args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ') + '\n';

    logStream.write(line);
  } catch {
  }
}

function patchConsoleForLogging() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    writeLogToFile("INFO", args);
    originalLog(...args);
  };

  console.error = (...args) => {
    writeLogToFile("ERROR", args);
    originalError(...args);
  };

  console.warn = (...args) => {
    writeLogToFile("WARN", args);
    originalWarn(...args);
  };
}

module.exports = {
  initLogger,
  patchConsoleForLogging,
  getLogsDir,
  getLogFilePath: () => logFilePath,
  writeSync,
  logAppLifecycle
};
