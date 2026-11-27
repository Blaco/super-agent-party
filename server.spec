# -*- mode: python ; coding: utf-8 -*-
import platform
from PyInstaller.utils.hooks import collect_submodules, collect_data_files  
from imageio_ffmpeg import get_ffmpeg_exe                                

_ = get_ffmpeg_exe()
# ---------- 1. Collect imageio-ffmpeg binaries and data ----------
ffmpeg_bin = [(get_ffmpeg_exe(), '.')]                                  
ffmpeg_data = collect_data_files('imageio_ffmpeg')     

# Disable signing configuration across platforms
universal_disable_sign = {
    'codesign_identity': None,
    'entitlements_file': None,
    'signing_requirements': '',
    'exclude_binaries': True
}

my_hidden_imports = [
    'pydantic.deprecated.decorator',
    'tiktoken_ext',
    'tiktoken_ext.openai_public',
    'imageio_ffmpeg', 
    *collect_submodules('mem0'),
]

my_extra_datas = []

if platform.system() != 'Windows':
    # Include zerobox and its submodules
    my_hidden_imports.extend(collect_submodules('zerobox'))
    # Collect zerobox data files, including configuration
    my_extra_datas.extend(collect_data_files('zerobox'))


a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=ffmpeg_bin, 
    datas=[
        ('config/settings_template.json', 'config'),
        ('config/locales.json', 'config'),
        ('config/extension_catalog.json', 'config'),
        ('static', 'static'),
        ('vrm', 'vrm'),
        ('tha_models', 'tha_models'),
        ('default_soulx_images', 'default_soulx_images'),
        ('tiktoken_cache', 'tiktoken_cache'),
        ('skills', 'skills'),
        *ffmpeg_data,
        *my_extra_datas,
    ],
    hiddenimports=my_hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

# Base executable configuration
base_exe_config = {
    'debug': False,
    'strip': False,
    'upx': True,
    'bootloader_ignore_signals': False,
    'disable_windowed_traceback': False,
    **universal_disable_sign
}

if platform.system() == 'Darwin':
    # macOS standalone executable configuration
    exe = EXE(
        pyz,
        a.scripts,
        [],
        name='server',
        icon='static/source/icon.png',
        **base_exe_config
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        name='server',
        upx_exclude=[],
        **universal_disable_sign
    )
elif platform.system() == 'Windows':
    # Windows-specific configuration
    exe = EXE(
        pyz,
        a.scripts,
        [],
        name='server',
        icon='static/source/icon.ico',  # Use an ICO icon
        **base_exe_config
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        name='server',
        upx_exclude=[],
        **universal_disable_sign
    )
else:
    # Linux configuration
    exe = EXE(
        pyz,
        a.scripts,
        [],
        name='server',
        **base_exe_config
    )
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        name='server',
        upx_exclude=[],
        **universal_disable_sign
    )