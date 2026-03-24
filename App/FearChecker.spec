# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['FearChecker.py'],
    pathex=[],
    binaries=[],
    datas=[('Everything.exe', '.'), ('Everything.ini', '.'), ('Everything.lng', '.'), ('ExecutedProgramms.exe', '.'), ('ExecutedProgramsList.chm', '.'), ('JumpListView.exe', '.'), ('JumpListsView.chm', '.'), ('JumpListsView_AppID.txt', '.'), ('LastActivityView.exe', '.'), ('LastActivityView.chm', '.'), ('ShellBags.exe', '.'), ('UserAssistView.exe', '.'), ('UserAssistView.chm', '.'), ('UserAssistView.cfg', '.'), ('WinPrefetchView.exe', '.'), ('WinPrefetchView.chm', '.'), ('WinPrefetchView.cfg', '.'), ('readme.txt', '.'), ('telegram.ico', '.'), ('vk.ico', '.'), ('youtube.ico', '.'), ('index.html', '.'), ('info.ico', '.'), ('discord.ico', '.'), ('icon.ico', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='FearChecker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
