const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");

async function getSystemInfo(app, getCs2Path, getSteamInfo) {
  const { exec, execFile } = require("child_process");
  const { screen } = require("electron");

  const execCommand = (cmd) =>
    new Promise((resolve) => {
      exec(cmd, { windowsHide: true }, (_err, stdout) =>
        resolve(String(stdout || ""))
      );
    });

  const execPowerShell = async (psCommand) =>
    new Promise((resolve) => {
      try {
        execFile(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
          { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
          (_err, stdout) => {
            const output = String(stdout || "").trim();
            if (!output) {
              resolve(null);
              return;
            }
            try {
              resolve(JSON.parse(output));
            } catch {
              resolve(null);
            }
          }
        );
      } catch {
        resolve(null);
      }
    });

  // Get display count
  let displaysCount = null;
  try {
    displaysCount = screen?.getAllDisplays?.()?.length ?? null;
  } catch {
    displaysCount = null;
  }

  // Gather main system info via PowerShell
  const mainInfo = await execPowerShell(
    [
      '$cv = Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"',
      "$cs = Get-CimInstance Win32_ComputerSystem",
      "$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1",
      "$gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1",
      "$bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1",
      "$installEpoch = $cv.InstallDate",
      "$installDate = $null",
      'if ($installEpoch) { try { $installDate = (Get-Date "1970-01-01Z").AddSeconds([double]$installEpoch).ToString("yyyy-MM-dd") } catch {} }',
      "$displayVersion = $cv.DisplayVersion",
      "if (-not $displayVersion) { $displayVersion = $cv.ReleaseId }",
      "$obj = [pscustomobject]@{",
      "  Hostname = $env:COMPUTERNAME",
      "  Username = $env:USERNAME",
      "  OsName = $cv.ProductName",
      "  OsVersion = $cv.CurrentVersion",
      "  DisplayVersion = $displayVersion",
      '  Build = $cv.CurrentBuild + "." + $cv.UBR',
      "  InstallDate = $installDate",
      "  Cpu = $cpu.Name",
      "  Gpu = $gpu.Name",
      "  RamBytes = [int64]$cs.TotalPhysicalMemory",
      '  Motherboard = ($bb.Manufacturer + " " + $bb.Product).Trim()',
      "  BaseBoardManufacturer = $bb.Manufacturer",
      "  BaseBoardProduct = $bb.Product",
      "  BaseBoardVersion = $bb.Version",
      "  BaseBoardSerialNumber = $bb.SerialNumber",
      "  Manufacturer = $cs.Manufacturer",
      "  Model = $cs.Model",
      "}",
      "$obj | ConvertTo-Json -Compress",
    ].join("; ")
  );

  const sysInfo = mainInfo || {};

  let motherboard = sysInfo.Motherboard || null;
  let boardManufacturer = sysInfo.BaseBoardManufacturer || null;
  let boardProduct = sysInfo.BaseBoardProduct || null;
  let boardVersion = sysInfo.BaseBoardVersion || null;
  let boardSerialNumber = sysInfo.BaseBoardSerialNumber || null;

  // Fallback: query baseboard directly if missing
  if (!motherboard && !boardManufacturer) {
    const bbResult = await execPowerShell(
      "Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1 | Select-Object Manufacturer, Product, Version, SerialNumber | ConvertTo-Json -Compress"
    );
    const bb = Array.isArray(bbResult) ? bbResult[0] : bbResult;
    if (bb && (bb.Manufacturer || bb.Product)) {
      motherboard =
        [bb.Manufacturer, bb.Product].filter(Boolean).join(" ").trim() || null;
      boardManufacturer = bb.Manufacturer || null;
      boardProduct = bb.Product || null;
      boardVersion = bb.Version || null;
      boardSerialNumber = bb.SerialNumber || null;
    }
  }

  const sanitizeDefaultString = (val) =>
    val && String(val).trim().toLowerCase() === "default string" ? null : val;

  boardVersion = sanitizeDefaultString(boardVersion) || null;
  boardSerialNumber = sanitizeDefaultString(boardSerialNumber) || null;

  const hostname = sysInfo.Hostname || os.hostname?.() || null;
  const username = sysInfo.Username || os.userInfo?.()?.username || null;

  let osName = sysInfo.OsName || os.type?.() || null;
  let osVersion = sysInfo.OsVersion || os.release?.() || null;
  let displayVersion = sysInfo.DisplayVersion || null;
  let windowsBuild = sysInfo.Build || null;
  let osInstallDate = sysInfo.InstallDate || null;

  // Detect virtual machine
  const inVm =
    /virtualbox|vmware|virtual|qemu|kvm|hyper-v/i.test(
      String(sysInfo?.Manufacturer || "")
    ) ||
    /virtualbox|vmware|virtual|qemu|kvm|hyper-v/i.test(
      String(sysInfo?.Model || "")
    );

  // Enumerate drive letters A-Z
  const getDriveLetters = () => {
    const drives = [];
    for (let code = 65; code <= 90; code++) {
      const drive = String.fromCharCode(code) + ":";
      try {
        if (fs.existsSync(drive)) drives.push(drive);
      } catch {}
    }
    return drives;
  };

  // Search for OBS installations on a drive
  const findObsPaths = (drive, results) => {
    const candidates = [
      path.join(drive, "Program Files", "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "Program Files (x86)", "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "Program Files", "obs-studio", "bin", "32bit", "obs32.exe"),
      path.join(drive, "Program Files (x86)", "obs-studio", "bin", "32bit", "obs32.exe"),
      path.join(drive, "OBS Studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "OBS Studio", "bin", "32bit", "obs32.exe"),
      path.join(drive, "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "obs-studio", "bin", "32bit", "obs32.exe"),
      path.join(drive, "Program Files (x86)", "Steam", "steamapps", "common", "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "Program Files", "Steam", "steamapps", "common", "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "Steam", "steamapps", "common", "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "Games", "Steam", "steamapps", "common", "obs-studio", "bin", "64bit", "obs64.exe"),
      path.join(drive, "SteamLibrary", "steamapps", "common", "obs-studio", "bin", "64bit", "obs64.exe"),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) results.push(candidate);
      } catch {}
    }
  };

  // Detect OBS installations and running status
  const obsFoundPaths = [];
  const driveLetters = getDriveLetters();
  const whereOutput = await execCommand("where obs64.exe obs32.exe 2>nul");
  obsFoundPaths.push(
    ...whereOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  for (const drive of driveLetters) {
    findObsPaths(drive, obsFoundPaths);
  }

  const uniqueObsPaths = [...new Set(obsFoundPaths)];
  const obsInstalled = uniqueObsPaths.length > 0;
  const obsSteamInstalled = uniqueObsPaths.some((p) =>
    /steamapps\\common\\obs/i.test(p)
  );
  const obsClassicInstalled = obsInstalled && !obsSteamInstalled;

  const obs64TaskList = await execCommand(
    'tasklist /FI "IMAGENAME eq obs64.exe"'
  );
  const obs32TaskList = await execCommand(
    'tasklist /FI "IMAGENAME eq obs32.exe"'
  );
  const obsRunning =
    /obs64\.exe/i.test(obs64TaskList) || /obs32\.exe/i.test(obs32TaskList);

  const obsSteamRunning = obsSteamInstalled && obsRunning;
  const obsClassicRunning = obsClassicInstalled && obsRunning;

  // Get additional OS info via WMI
  const wmiOsInfo = await execPowerShell(
    "Get-WmiObject Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, @{Name='InstallDate';Expression={$_.ConvertToDateTime($_.InstallDate)}} | ConvertTo-Json -Compress"
  );
  const osInfo = Array.isArray(wmiOsInfo) ? wmiOsInfo[0] : wmiOsInfo;

  if (osInfo) {
    if (osInfo.Caption) osName = String(osInfo.Caption).trim();
    if (osInfo.Version) {
      osVersion = String(osInfo.Version).trim();
      if (!displayVersion) displayVersion = String(osInfo.Version).trim();
    }
    if (osInfo.BuildNumber != null)
      windowsBuild = String(osInfo.BuildNumber).trim();

    const installDateRaw = osInfo.InstallDate;
    if (installDateRaw != null) {
      let parsedDate = null;
      if (typeof installDateRaw === "object" && installDateRaw !== null) {
        if (installDateRaw.value != null) {
          const valueStr = String(installDateRaw.value);
          const dateMatch =
            valueStr.match(/\/Date\((\d+)\)\//) ||
            valueStr.match(/Date\((\d+)\)/);
          if (dateMatch)
            parsedDate = new Date(parseInt(dateMatch[1], 10));
        }
        if (
          (!parsedDate || isNaN(parsedDate.getTime())) &&
          installDateRaw.DateTime
        )
          parsedDate = new Date(String(installDateRaw.DateTime));
      } else {
        parsedDate = new Date(String(installDateRaw));
      }
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        osInstallDate =
          parsedDate.getFullYear() +
          "-" +
          String(parsedDate.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(parsedDate.getDate()).padStart(2, "0");
      }
    }
  }

  // Fallback: Get-ComputerInfo
  const computerInfo = await execPowerShell(
    "$ci = Get-ComputerInfo | Select-Object -Property WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer; $ci | ConvertTo-Json -Compress"
  );
  if (computerInfo?.WindowsProductName && !osName)
    osName = computerInfo.WindowsProductName;
  if (computerInfo?.WindowsVersion && !displayVersion)
    displayVersion = computerInfo.WindowsVersion;
  if (computerInfo?.OsHardwareAbstractionLayer && !windowsBuild)
    windowsBuild = computerInfo.OsHardwareAbstractionLayer;

  // Fallback: install date via JSON conversion
  if (osInstallDate == null) {
    try {
      const installDateJson = await execCommand(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object -First 1).InstallDate | ConvertTo-Json"'
      );
      const installDateStr = String(installDateJson || "").trim();
      const jsonDateMatch =
        installDateStr.match(/\/Date\((\d+)\)\//) ||
        installDateStr.match(/Date\((\d+)\)/);
      if (jsonDateMatch) {
        const d = new Date(parseInt(jsonDateMatch[1], 10));
        if (!isNaN(d.getTime())) {
          osInstallDate =
            d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0");
        }
      }
      if (osInstallDate == null) {
        const rawMatch = installDateStr.match(/(\d{4})(\d{2})(\d{2})/);
        if (rawMatch)
          osInstallDate = rawMatch[1] + "-" + rawMatch[2] + "-" + rawMatch[3];
      }
    } catch {}
  }

  // Fallback: install date via CimInstance direct
  if (osInstallDate == null) {
    try {
      const cimOutput = await execCommand(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object -First 1).InstallDate"'
      );
      const cimMatch = String(cimOutput || "")
        .trim()
        .replace(/\s+/g, " ")
        .match(/(\d{4})(\d{2})(\d{2})/);
      if (cimMatch)
        osInstallDate = cimMatch[1] + "-" + cimMatch[2] + "-" + cimMatch[3];
    } catch {}
  }

  // Fallback: install date via registry
  if (osInstallDate == null) {
    try {
      const regOutput = await execCommand(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "$v = (Get-ItemProperty -Path \\"HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\" -ErrorAction SilentlyContinue).InstallDate; if ($v) { [DateTimeOffset]::FromUnixTimeSeconds([long]$v).ToString(\'yyyy-MM-dd\') }"'
      );
      const regMatch = String(regOutput || "")
        .trim()
        .match(/(\d{4})-(\d{2})-(\d{2})/);
      if (regMatch)
        osInstallDate = regMatch[1] + "-" + regMatch[2] + "-" + regMatch[3];
    } catch {}
  }

  // Get GPU name
  let gpuName = null;
  try {
    const gpuInfo = await app.getGPUInfo("complete");
    const gpuDevice = gpuInfo?.gpuDevice?.[0];
    gpuName = gpuDevice?.deviceString || gpuDevice?.vendorString || null;
  } catch {
    gpuName = null;
  }

  if (!gpuName) {
    try {
      const wmicOutput = await execCommand(
        "wmic path win32_videocontroller get name /value"
      );
      const nameLine = String(wmicOutput || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.toLowerCase().startsWith("name="));
      if (nameLine) {
        const value = nameLine.split("=")[1]?.trim();
        if (value) gpuName = value;
      }
    } catch {}
  }

  if (!gpuName) {
    try {
      const psGpuOutput = await execCommand(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_VideoController | Select-Object -First 1 Name | Format-List"'
      );
      const gpuMatch = /Name\s*:\s*(.+)/i.exec(String(psGpuOutput || ""));
      if (gpuMatch?.[1]) gpuName = gpuMatch[1].trim();
    } catch {}
  }

  // CPU and RAM
  const cpuModel = sysInfo.Cpu || os.cpus?.()?.[0]?.model || null;
  const totalMemBytes = Number(sysInfo.RamBytes || 0) || os.totalmem?.() || 0;

  // Local IP address
  let localIp = null;
  try {
    const interfaces = os.networkInterfaces?.() || {};
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal && iface.address) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp) break;
    }
  } catch {}

  // Format birthtime as date string
  const formatBirthDate = (stat) => {
    if (!stat?.birthtime) return null;
    const d = new Date(stat.birthtime);
    if (isNaN(d.getTime())) return null;
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };

  // CS2 install date (from game path's ancestor directory)
  let cs2InstallDate = null;
  try {
    const cs2Path = getCs2Path();
    if (cs2Path) {
      const cs2Root = path.dirname(
        path.dirname(path.dirname(path.dirname(cs2Path)))
      );
      if (fs.existsSync(cs2Root)) {
        const stat = fs.statSync(cs2Root, { throwIfNoEntry: false });
        if (stat) cs2InstallDate = formatBirthDate(stat);
      }
    }
  } catch {}

  // Steam install date
  let steamInstallDate = null;
  try {
    const { steamPaths } = getSteamInfo();
    const steamPath = steamPaths?.[0];
    if (steamPath && fs.existsSync(steamPath)) {
      const stat = fs.statSync(steamPath, { throwIfNoEntry: false });
      if (stat) steamInstallDate = formatBirthDate(stat);
    }
  } catch {}

  // Generate hardware ID
  const hwidSource = [hostname, motherboard, osName, boardSerialNumber]
    .filter(Boolean)
    .join("|");
  const hwid = hwidSource
    ? crypto.createHash("sha256").update(hwidSource).digest("hex").slice(0, 32)
    : null;

  return {
    success: true,
    hostname,
    hwid,
    username,
    displaysCount,
    uptimeSeconds: os.uptime?.() ?? null,
    osName,
    osVersion,
    windowsDisplayVersion: displayVersion || null,
    windowsBuild: windowsBuild || null,
    osInstallDate,
    cs2InstallDate: cs2InstallDate || null,
    steamInstallDate: steamInstallDate || null,
    localIp: localIp || null,
    platform: os.platform?.() ?? null,
    arch: os.arch?.() ?? null,
    cpuModel,
    totalMemBytes,
    gpuName: sysInfo?.Gpu || gpuName,
    motherboard,
    motherboardManufacturer: boardManufacturer,
    motherboardProduct: boardProduct,
    motherboardVersion: boardVersion,
    motherboardSerialNumber: boardSerialNumber,
    inVm,
    obsInstalled,
    obsRunning,
    obsClassic: {
      installed: obsClassicInstalled,
      running: obsClassicRunning,
    },
    obsSteam: {
      installed: obsSteamInstalled,
      running: obsSteamRunning,
    },
  };
}

module.exports = { getSystemInfo };
