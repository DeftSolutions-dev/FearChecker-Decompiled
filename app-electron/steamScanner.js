const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

const FEAR_API_BASE = "https://api.fearproject.ru/profile";
const STEAM_XML_BASE = "https://steamcommunity.com/profiles";
const STEAM64_BASE = BigInt("76561197960265728");
const USER_AGENT = "FearChecker/2.0.2 (Windows; Electron)";

function extractXmlTag(xml, tagName) {
  if (!xml || !tagName) return null;

  const cdataRegex = new RegExp(
    '<' + tagName + ">\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</" + tagName + '>', 'i'
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch && typeof cdataMatch[1] === "string") return cdataMatch[1].trim();

  const simpleRegex = new RegExp(
    '<' + tagName + ">\\s*([\\s\\S]*?)\\s*</" + tagName + '>', 'i'
  );
  const simpleMatch = xml.match(simpleRegex);
  if (simpleMatch && typeof simpleMatch[1] === "string") return simpleMatch[1].trim();

  return null;
}

async function fetchJson(url, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT }
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFearProfile(steamId) {
  try {
    const response = await fetchJson(FEAR_API_BASE + '/' + steamId, 5000);
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const data = await response.json();
    return data || null;
  } catch {
    return null;
  }
}

async function fetchSteamXmlProfile(steamId) {
  try {
    const response = await fetchJson(STEAM_XML_BASE + '/' + steamId + "/?xml=1", 5000);
    if (!response.ok) return null;

    const xml = await response.text();
    const personaName = extractXmlTag(xml, "steamID") || null;
    const avatarMedium = extractXmlTag(xml, "avatarMedium") || null;
    const vacBannedRaw = extractXmlTag(xml, "vacBanned");
    const vacBanned = vacBannedRaw === '1' || (vacBannedRaw || '').toLowerCase() === "true";
    const vacBanDate = extractXmlTag(xml, "vacBanDate") || null;
    const memberSince = extractXmlTag(xml, "memberSince") || null;

    return { personaName, avatarMedium, vacBanned, vacBanDate, memberSince };
  } catch {
    return null;
  }
}

async function fetchSteamProfileHtml(steamId) {
  try {
    const response = await fetchJson(STEAM_XML_BASE + '/' + steamId, 5000);
    if (!response.ok) return null;

    const html = await response.text();
    let daysSinceLastBan = null;

    const englishPattern = /(\d+)\s+day\(s\)\s+since\s+last\s+ban/i;
    const englishMatch = html.match(englishPattern);

    if (englishMatch) {
      daysSinceLastBan = parseInt(englishMatch[1]);
    } else {
      const russianPatterns = [
        /Дней\s+с\s+последней\s+блокировки[:\s]+(\d+)/i,
        /(\d+)\s+дней?\s+с\s+последней\s+блокировки/i,
        /последней\s+блокировки[:\s]+(\d+)/i
      ];
      for (const pattern of russianPatterns) {
        const match = html.match(pattern);
        if (match) {
          daysSinceLastBan = parseInt(match[1]);
          break;
        }
      }
      if (daysSinceLastBan === null) {
        const fallbackPattern = /(?:блокировк|ban).*?(\d+)\s*(?:дней?|day)/i;
        const fallbackMatch = html.match(fallbackPattern);
        if (fallbackMatch) daysSinceLastBan = parseInt(fallbackMatch[1]);
      }
    }

    let vacBanDate = null;
    if (daysSinceLastBan !== null && daysSinceLastBan >= 0) {
      const now = new Date();
      const banDate = new Date(now.getTime() - daysSinceLastBan * 24 * 60 * 60 * 1000);
      vacBanDate = Math.floor(banDate.getTime() / 1000);
    }

    return { daysSinceLastBan, vacBanDate };
  } catch (err) {
    console.log("Ошибка парсинга HTML профиля Steam:", err);
    return null;
  }
}

function isCs2Running() {
  return new Promise(resolve => {
    exec('tasklist /FI "IMAGENAME eq cs2.exe"', (err, stdout) => {
      if (err) return resolve(false);
      resolve((stdout || '').toLowerCase().includes("cs2.exe"));
    });
  });
}

function getAllDrives() {
  const drives = [];
  for (let charCode = 65; charCode <= 90; charCode++) {
    const drive = String.fromCharCode(charCode) + ':';
    try {
      if (fs.existsSync(drive)) drives.push(drive);
    } catch {}
  }
  return drives;
}

function convertToSteam64(input) {
  if (!input) return null;
  const str = String(input).trim();
  if (str.startsWith("7656119")) return str;
  if (/^\d+$/.test(str)) {
    try {
      const result = BigInt(str) + STEAM64_BASE;
      return result.toString();
    } catch {
      return null;
    }
  }
  return null;
}

function getActiveSteamId(steamPath) {
  try {
    const loginUsersPath = path.join(steamPath, "config", "loginusers.vdf");
    if (fs.existsSync(loginUsersPath)) {
      const content = fs.readFileSync(loginUsersPath, "utf8");
      const lines = content.split('\n');
      let currentId = null;
      let mostRecent = '0';

      for (const line of lines) {
        const trimmed = line.trim();
        const idMatch = trimmed.match(/"(\d{17})"/);
        if (idMatch) {
          if (currentId && mostRecent === '1') {
            return currentId.startsWith('7656119') ? currentId : convertToSteam64(currentId);
          }
          currentId = idMatch[1];
          mostRecent = '0';
          continue;
        }
        if (currentId && trimmed.includes("MostRecent")) {
          const recentMatch = trimmed.match(/"MostRecent"\s+"([^"]+)"/);
          if (recentMatch) mostRecent = recentMatch[1];
          if (mostRecent === '1') {
            return currentId.startsWith("7656119") ? currentId : convertToSteam64(currentId);
          }
        }
        if (trimmed.includes('}')) {
          if (currentId && mostRecent === '1') {
            return currentId.startsWith("7656119") ? currentId : convertToSteam64(currentId);
          }
          currentId = null;
          mostRecent = '0';
        }
      }
      if (currentId && mostRecent === '1') {
        return currentId.startsWith("7656119") ? currentId : convertToSteam64(currentId);
      }
    }

    const configVdfPath = path.join(steamPath, "config", "config.vdf");
    if (fs.existsSync(configVdfPath)) {
      const content = fs.readFileSync(configVdfPath, "utf8");
      const lines = content.split('\n');
      let currentId = null;

      for (const line of lines) {
        const trimmed = line.trim();
        const idMatch = trimmed.match(/"(\d{17})"/);
        if (idMatch) {
          currentId = idMatch[1];
          continue;
        }
        if (currentId && trimmed.includes("AutoLoginUser") && trimmed.includes('"1"')) {
          return currentId.startsWith("7656119") ? currentId : convertToSteam64(currentId);
        }
        if (trimmed.includes('}')) currentId = null;
      }
    }
  } catch (err) {
    console.log("Ошибка определения активного Steam аккаунта:", err);
  }
  return null;
}

function getLocalAccountName(steamPath, steamId) {
  try {
    const configPath = path.join(steamPath, "config", "config.vdf");
    if (!fs.existsSync(configPath)) return 'Unknown';

    const content = fs.readFileSync(configPath, "utf8");
    const lines = content.split('\n');
    let found = false;
    let accountName = "Unknown";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('"' + steamId + '"')) {
        found = true;
        continue;
      }
      if (found && trimmed.includes("AccountName")) {
        const nameMatch = trimmed.match(/"AccountName"\s+"([^"]+)"/);
        if (nameMatch) {
          accountName = nameMatch[1];
          break;
        }
      }
      if (found && trimmed.includes('}')) break;
    }
    return accountName || "Unknown";
  } catch (err) {
    console.log('Ошибка чтения loginusers.vdf для имени аккаунта:', err);
    return "Unknown";
  }
}

function getAllAccountsFromLoginUsers(steamPath) {
  const accounts = [];
  try {
    const loginUsersPath = path.join(steamPath, "config", 'loginusers.vdf');
    if (!fs.existsSync(loginUsersPath)) return accounts;

    const content = fs.readFileSync(loginUsersPath, 'utf8');
    const lines = content.split('\n');
    let currentId = null;
    let accountName = "Unknown";
    let mostRecent = '0';

    for (const line of lines) {
      const trimmed = line.trim();
      const idMatch = trimmed.match(/"(\d{17})"/);

      if (idMatch) {
        if (currentId) {
          const steam64 = currentId.startsWith("7656119") ? currentId : convertToSteam64(currentId);
          if (steam64) {
            accounts.push({
              steamId: steam64,
              accountId: steam64,
              name: accountName,
              lastActivity: '—',
              isActive: mostRecent === '1',
              steamPath
            });
          }
        }
        currentId = idMatch[1];
        accountName = 'Unknown';
        mostRecent = '0';
        continue;
      }

      if (currentId && trimmed.includes("AccountName")) {
        const nameMatch = trimmed.match(/"AccountName"\s+"([^"]+)"/);
        if (nameMatch) accountName = nameMatch[1];
      }

      if (currentId && trimmed.includes("MostRecent")) {
        const recentMatch = trimmed.match(/"MostRecent"\s+"([^"]+)"/);
        if (recentMatch) mostRecent = recentMatch[1];
      }

      if (trimmed.includes('}') && currentId) {
        const steam64 = currentId.startsWith("7656119") ? currentId : convertToSteam64(currentId);
        if (steam64) {
          accounts.push({
            steamId: steam64,
            accountId: steam64,
            name: accountName,
            lastActivity: '—',
            isActive: mostRecent === '1',
            steamPath
          });
        }
        currentId = null;
      }
    }

    accounts.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  } catch (err) {
    console.log("Ошибка чтения loginusers.vdf:", err);
  }
  return accounts;
}

function getAccountsFromConfigVdf(steamPath) {
  const accounts = [];
  try {
    const configPath = path.join(steamPath, "config", "config.vdf");
    if (!fs.existsSync(configPath)) return accounts;

    const content = fs.readFileSync(configPath, "utf8");
    const steamIds = new Set();

    const steam64Pattern = /\b(7656119\d{10})\b/g;
    let match;
    while ((match = steam64Pattern.exec(content)) !== null) {
      steamIds.add(match[1]);
    }

    const steamIdFieldPattern = /"SteamID"\s*"(\d+)"/gi;
    while ((match = steamIdFieldPattern.exec(content)) !== null) {
      const converted = convertToSteam64(match[1]);
      if (converted) steamIds.add(converted);
    }

    const activeId = getActiveSteamId(steamPath);
    for (const id of steamIds) {
      const name = getLocalAccountName(steamPath, id);
      accounts.push({
        steamId: id,
        accountId: id,
        name: name || 'Unknown',
        lastActivity: '—',
        isActive: activeId ? id === activeId : false,
        steamPath
      });
    }

    accounts.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  } catch (err) {
    console.log("Ошибка чтения config.vdf:", err);
  }
  return accounts;
}

function getAccountsFromRegistry() {
  return new Promise(resolve => {
    const convertAccountId = (raw) => {
      const str = String(raw).trim();
      if (!str) return null;
      if (/^7656119\d{10}$/.test(str)) return str;
      if (/^\d+$/.test(str)) return (STEAM64_BASE + BigInt(str)).toString();
      return null;
    };

    const parseAccountList = (entries) => {
      const seen = new Set();
      const results = [];
      for (const entry of entries) {
        const trimmed = entry.trim();
        if (/^\d+$/.test(trimmed) || /^7656119\d{10}$/.test(trimmed)) {
          const steam64 = convertAccountId(trimmed);
          if (steam64 && !seen.has(steam64)) {
            seen.add(steam64);
            results.push({
              steamId: steam64,
              accountId: steam64,
              name: "Unknown",
              lastActivity: '—',
              isActive: false,
              steamPath: null
            });
          }
        }
      }
      return results;
    };

    const psCommand = "Get-ChildItem -LiteralPath 'HKCU:\\Software\\Valve\\Steam\\Users' -ErrorAction SilentlyContinue | ForEach-Object { $_.PSChildName }";

    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand], {
      windowsHide: true,
      maxBuffer: 1024 * 10
    }, (psErr, psStdout) => {
      if (!psErr && psStdout) {
        const entries = String(psStdout).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const results = parseAccountList(entries);
        if (results.length > 0) {
          resolve(results);
          return;
        }
      }

      exec('reg query "HKCU\\Software\\Valve\\Steam\\Users" /s 2>nul', {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }, (regErr, regStdout) => {
        const accounts = [];
        if (regErr || !regStdout) {
          resolve(accounts);
          return;
        }

        const userKeyPattern = /\\Users\\(\d+)$/i;
        const seen = new Set();
        for (const line of String(regStdout).split(/\r?\n/)) {
          const trimmed = line.trim();
          const keyMatch = trimmed.match(userKeyPattern);
          if (keyMatch && keyMatch[1]) {
            const steam64 = convertAccountId(keyMatch[1]);
            if (steam64 && !seen.has(steam64)) {
              seen.add(steam64);
              accounts.push({
                steamId: steam64,
                accountId: steam64,
                name: "Unknown",
                lastActivity: '—',
                isActive: false,
                steamPath: null
              });
            }
          }
        }
        resolve(accounts);
      });
    });
  });
}

function getAccountsFromAppcacheStats(steamPath) {
  const accounts = [];
  try {
    const statsDir = path.join(steamPath, 'appcache', "stats");
    if (!fs.existsSync(statsDir)) return accounts;

    const files = fs.readdirSync(statsDir);
    const accountIds = new Set();
    const statsFilePattern = /^UserGameStats_(\d+)_\d+\.bin$/i;

    for (const file of files) {
      const match = file.match(statsFilePattern);
      if (match) accountIds.add(match[1]);
    }

    const activeId = getActiveSteamId(steamPath);
    for (const accountId of accountIds) {
      const steam64 = convertToSteam64(accountId);
      if (!steam64) continue;
      const name = getLocalAccountName(steamPath, steam64) || getLocalAccountName(steamPath, accountId);
      accounts.push({
        steamId: steam64,
        accountId,
        name: name || "Unknown",
        lastActivity: '—',
        isActive: activeId ? steam64 === activeId : false,
        steamPath
      });
    }

    accounts.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  } catch (err) {
    console.log("Ошибка чтения appcache/stats:", err);
  }
  return accounts;
}

function getLastActivity(userdataPath) {
  try {
    const statsPath = path.join(userdataPath, "config", "stats");
    if (!fs.existsSync(statsPath)) return '—';

    const stat = fs.statSync(statsPath);
    const now = new Date();
    const modified = new Date(stat.mtime);
    const daysAgo = Math.floor((now - modified) / (1000 * 60 * 60 * 24));

    if (daysAgo === 0) return "Сегодня";
    if (daysAgo === 1) return "Вчера";
    if (daysAgo < 7) return daysAgo + ' дня назад';
    return daysAgo + " дней назад";
  } catch {
    return '—';
  }
}

function scanSteamUserdata(userdataDir) {
  const accounts = [];
  try {
    if (!fs.existsSync(userdataDir)) return accounts;

    const entries = fs.readdirSync(userdataDir);
    const steamPath = path.dirname(userdataDir);
    const activeId = getActiveSteamId(steamPath);

    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;

      const entryPath = path.join(userdataDir, entry);
      const steam64 = convertToSteam64(entry);
      if (!steam64) continue;

      const name = getLocalAccountName(steamPath, steam64) || getLocalAccountName(steamPath, entry);
      const lastActivity = getLastActivity(entryPath);
      const account = {
        steamId: steam64,
        accountId: entry,
        name: name || "Unknown",
        lastActivity,
        isActive: activeId ? steam64 === activeId : false,
        steamPath
      };

      if (!accounts.find(a => a.steamId === account.steamId)) {
        accounts.push(account);
      }
    }

    accounts.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  } catch (err) {
    console.log('Ошибка при сканировании userdata:', err);
  }
  return accounts;
}

function getSteamPaths() {
  const paths = [];
  const drives = getAllDrives();
  const subPaths = [
    ["Program Files", "Steam"],
    ['Program Files (x86)', "Steam"],
    ["Steam"],
    ['Games', "Steam"],
    ["SteamLibrary"]
  ];

  for (const drive of drives) {
    const root = drive.endsWith(path.sep) ? drive : drive + path.sep;
    for (const subPath of subPaths) {
      const fullPath = path.join(root, ...subPath);
      if (fs.existsSync(fullPath) && !paths.includes(fullPath)) {
        paths.push(fullPath);
      }
    }
  }
  return paths;
}

async function scanSteamAccounts(mode = 'quick', options = {}) {
  const useUserdata = options.useUserdata === true;
  const useLoginusers = options.useLoginusers === true;
  const useStats = options.useStats === true;
  const useConfigVdf = options.useConfigVdf === true;
  const useRegistry = options.useRegistry === true;

  const accounts = [];
  const detectedPaths = getSteamPaths();

  const steamPaths = (
    options.preferredSteamPath &&
    typeof options.preferredSteamPath === "string" &&
    fs.existsSync(options.preferredSteamPath.trim())
  ) ? [options.preferredSteamPath.trim()] : detectedPaths;

  try {
    if (useUserdata) {
      for (const steamPath of steamPaths) {
        const userdataDir = path.join(steamPath, "userdata");
        if (!fs.existsSync(userdataDir)) continue;
        const found = scanSteamUserdata(userdataDir);
        for (const account of found) {
          if (!accounts.find(a => a.steamId === account.steamId)) accounts.push(account);
        }
      }
    }

    if (useLoginusers) {
      for (const steamPath of steamPaths) {
        const found = getAllAccountsFromLoginUsers(steamPath);
        for (const account of found) {
          if (!accounts.find(a => a.steamId === account.steamId)) accounts.push(account);
        }
      }
    }

    if (useStats) {
      for (const steamPath of steamPaths) {
        const found = getAccountsFromAppcacheStats(steamPath);
        for (const account of found) {
          if (!accounts.find(a => a.steamId === account.steamId)) accounts.push(account);
        }
      }
    }

    if (useConfigVdf) {
      for (const steamPath of steamPaths) {
        const found = getAccountsFromConfigVdf(steamPath);
        for (const account of found) {
          if (!accounts.find(a => a.steamId === account.steamId)) accounts.push(account);
        }
      }
    }

    if (useRegistry) {
      const found = await getAccountsFromRegistry();
      for (const account of found) {
        if (!accounts.find(a => a.steamId === account.steamId)) accounts.push(account);
      }
    }
  } catch (err) {
    console.log('Ошибка при сканировании Steam:', err);
  }

  accounts.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return 0;
  });

  try {
    const cs2Running = await isCs2Running();

    await Promise.all(accounts.map(async (account) => {
      const [fearProfile, xmlProfile, htmlProfile] = await Promise.all([
        fetchFearProfile(account.steamId),
        fetchSteamXmlProfile(account.steamId),
        fetchSteamProfileHtml(account.steamId)
      ]);

      const fearBanned = !!fearProfile?.banInfo?.isBanned;
      const fearBanReason = fearProfile?.banInfo?.fearBanReason || '';
      const fearUnbanTimestamp = fearProfile?.banInfo?.fearUnbanTimestamp ?? null;

      const displayName =
        fearProfile?.fearStats?.displayName ||
        xmlProfile?.personaName ||
        account.name ||
        'Unknown';

      const avatar =
        fearProfile?.avatar ||
        fearProfile?.fearStats?.avatar ||
        xmlProfile?.avatarMedium ||
        "https://avatars.steamstatic.com/" + account.steamId + '_medium.jpg';

      account.displayName = displayName;
      account.avatar = avatar;
      account.vacBanned = !!xmlProfile?.vacBanned;
      account.vacBanDate = htmlProfile?.vacBanDate || xmlProfile?.vacBanDate || fearProfile?.banInfo?.vacBanDate || null;
      account.daysSinceLastBan = htmlProfile?.daysSinceLastBan || null;
      account.accountCreated = xmlProfile?.memberSince || null;
      account.fearBanned = fearBanned;
      account.fearBanReason = fearBanReason;
      account.fearUnbanTimestamp = fearUnbanTimestamp;
      account.fearLastActivity = fearProfile?.last_activity || null;
      account.fearStats = fearProfile?.stats || null;
      account.cs2Running = cs2Running;
    }));
  } catch (err) {
    console.log('Ошибка обогащения Steam аккаунтов:', err);
  }

  return accounts;
}

function getSteamSearchInfo() {
  return {
    drives: getAllDrives(),
    steamPaths: getSteamPaths()
  };
}

module.exports = {
  scanSteamAccounts,
  getSteamSearchInfo
};
