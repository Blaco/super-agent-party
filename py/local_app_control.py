import os
import json
import asyncio
import websockets
import requests
from typing import Dict, Optional, List, Optional

_external_connections: Dict[int, dict] = {}


def _ws_alive(ws) -> bool:
    """websockets 16+ uses close_code rather than the removed .closed attribute."""
    try:
        return ws.close_code is None
    except Exception:
        return False


def get_connected_ports() -> List[int]:
    return list(_external_connections.keys())


def get_connection_info(port: int) -> Optional[dict]:
    conn = _external_connections.get(port)
    if conn:
        return {
            "port": port,
            "appName": conn.get("app_name", ""),
            "appId": conn.get("app_id", ""),
            "targets": conn.get("targets", []),
            "activeWsUrl": conn.get("active_ws_url"),
            "activeTargetId": conn.get("active_target_id", ""),
        }
    return None


def get_all_connection_info() -> List[dict]:
    ports = list(_external_connections.keys())
    print(f"[LocalAppControl] get_all_connection_info: ports={ports}, total={len(ports)}")
    return [get_connection_info(p) for p in ports]


async def get_external_cdp_targets(port: int) -> List[dict]:
    try:
        resp = requests.get(f"http://127.0.0.1:{port}/json/list", timeout=3)
        return resp.json()
    except Exception as e:
        print(f"[LocalAppControl] Failed to get CDP targets (port {port}): {e}")
        return []


def _pick_best_target(targets, preferred_id=None):
    if preferred_id:
        for t in targets:
            if t.get("id") == preferred_id:
                return t.get("webSocketDebuggerUrl")
    for t in targets:
        if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
            return t.get("webSocketDebuggerUrl")
    for t in targets:
        if t.get("type") == "webview" and t.get("webSocketDebuggerUrl"):
            return t.get("webSocketDebuggerUrl")
    for t in targets:
        if t.get("webSocketDebuggerUrl"):
            return t["webSocketDebuggerUrl"]
    return None


async def connect_to_external_app(port: int, app_id: str = "", app_name: str = "") -> dict:
    if port in _external_connections:
        conn = _external_connections[port]
        if conn.get("ws") and _ws_alive(conn["ws"]):
            print(f"[LocalAppControl] Reusing existing connection on port {port}")
            return {"success": True, "message": "Already connected", "targets": conn.get("targets", [])}

    print(f"[LocalAppControl] Connecting to port {port} (app: {app_name})...")
    try:
        resp = requests.get(f"http://127.0.0.1:{port}/json/list", timeout=3)
        targets = resp.json()
    except Exception as e:
        print(f"[LocalAppControl] Connection failed (port {port}): {e}")
        return {"success": False, "error": str(e), "targets": []}

    ws_url = _pick_best_target(targets)
    first_target = None
    for t in targets:
        if t.get("type") in ("page", "webview") and t.get("webSocketDebuggerUrl"):
            first_target = t
            break
    if not first_target:
        for t in targets:
            if t.get("webSocketDebuggerUrl"):
                first_target = t
                break

    _external_connections[port] = {
        "targets": targets,
        "ws": None,
        "active_ws_url": ws_url,
        "active_target_id": first_target.get("id", "") if first_target else "",
        "connected_at": asyncio.get_event_loop().time(),
        "app_name": app_name,
        "app_id": app_id,
    }

    if ws_url:
        try:
            ws = await websockets.connect(ws_url, max_size=10 * 1024 * 1024, ping_interval=20, close_timeout=1)
            _external_connections[port]["ws"] = ws
            print(f"[LocalAppControl] WebSocket connected on port {port}")
        except Exception as e:
            print(f"[LocalAppControl] WebSocket connection failed (port {port}): {e}")

    page_count = len([t for t in targets if t.get("type") == "page"])
    webview_count = len([t for t in targets if t.get("type") == "webview"])
    usable_count = len([t for t in targets if t.get("webSocketDebuggerUrl") and t.get("type") not in ("worker","service_worker","shared_worker")])
    print(f"[LocalAppControl] Port {port}: {len(targets)} targets (page={page_count}, webview={webview_count}, usable={usable_count})")
    return {"success": True, "message": "Connected successfully", "targets": targets, "activeWsUrl": ws_url, "usableCount": usable_count}


async def disconnect_from_external_app(port: int) -> dict:
    print(f"[LocalAppControl] Disconnecting port {port}")
    conn = _external_connections.pop(port, None)
    if conn:
        ws = conn.get("ws")
        if ws:
            try:
                if _ws_alive(ws):
                    await asyncio.wait_for(ws.close(), timeout=3)
            except (asyncio.TimeoutError, Exception) as e:
                print(f"[LocalAppControl] WebSocket close error on port {port}: {e}")
    print(f"[LocalAppControl] Port {port} removed; remaining: {list(_external_connections.keys())}")
    return {"success": True}


async def switch_external_target(port: int, target_id: str = "") -> dict:
    conn = _external_connections.get(port)
    if not conn:
        return {"error": f"Port {port} is not connected", "success": False}

    targets = conn.get("targets", [])
    if not targets:
        targets = await get_external_cdp_targets(port)
        _external_connections[port]["targets"] = targets

    target = None
    for t in targets:
        if target_id and t.get("id") == target_id:
            target = t
            break
    if not target:
        for t in targets:
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                target = t
                break
    if not target:
        for t in targets:
            if t.get("type") == "webview" and t.get("webSocketDebuggerUrl"):
                target = t
                break
    if not target:
        for t in targets:
            if t.get("webSocketDebuggerUrl"):
                target = t
                break

    if not target:
        return {"error": "No usable target found", "success": False}

    ws_url = target.get("webSocketDebuggerUrl")
    if not ws_url:
        return {"error": "Target has no webSocketDebuggerUrl", "success": False}

    old_ws = conn.get("ws")
    if old_ws and _ws_alive(old_ws):
        try:
            await old_ws.close()
        except Exception:
            pass

    try:
        ws = await websockets.connect(ws_url, max_size=10 * 1024 * 1024, ping_interval=20, close_timeout=1)
        _external_connections[port]["ws"] = ws
        _external_connections[port]["active_ws_url"] = ws_url
        _external_connections[port]["active_target_id"] = target.get("id", "")
        print(f"[LocalAppControl] Port {port} switched to target: {target.get('title','')} (type={target.get('type')}, id={target.get('id')})")
        return {"success": True, "target": {"title": target.get("title"), "type": target.get("type"), "url": target.get("url"), "id": target.get("id")}}
    except Exception as e:
        return {"error": str(e), "success": False}


async def refresh_external_targets(port: int) -> dict:
    try:
        targets = await get_external_cdp_targets(port)
        _external_connections[port]["targets"] = targets
        print(f"[LocalAppControl] Port {port} targets refreshed: {len(targets)}")
        return {"success": True, "targets": targets}
    except Exception as e:
        return {"error": str(e), "success": False}


async def execute_external_cdp(port: int, method: str, params: Optional[dict] = None) -> dict:
    conn = _external_connections.get(port)
    if not conn:
        return {"error": "Not connected", "success": False}

    ws = conn.get("ws")
    ws_url = conn.get("active_ws_url")

    if ws and _ws_alive(ws):
        return await _send_cdp(ws, method, params or {})

    if ws_url:
        try:
            ws = await websockets.connect(ws_url, max_size=10 * 1024 * 1024, ping_interval=20, close_timeout=1)
            _external_connections[port]["ws"] = ws
            return await _send_cdp(ws, method, params or {})
        except Exception as e:
            return {"error": str(e), "success": False}

    targets = await get_external_cdp_targets(port)
    _external_connections[port]["targets"] = targets
    ws_url = _pick_best_target(targets)
    if ws_url:
        try:
            ws = await websockets.connect(ws_url, max_size=10 * 1024 * 1024, ping_interval=20, close_timeout=1)
            _external_connections[port]["ws"] = ws
            _external_connections[port]["active_ws_url"] = ws_url
            return await _send_cdp(ws, method, params or {})
        except Exception as e:
            return {"error": str(e), "success": False}

    return {"error": "No connectable target found", "success": False}


async def select_external_target(port: int, target_url: str) -> dict:
    try:
        ws = await websockets.connect(target_url, max_size=10 * 1024 * 1024, ping_interval=20, close_timeout=1)
        if port in _external_connections:
            old_ws = _external_connections[port].get("ws")
            if old_ws and _ws_alive(old_ws):
                try:
                    await old_ws.close()
                except Exception:
                    pass
        _external_connections[port]["ws"] = ws
        _external_connections[port]["active_ws_url"] = target_url
        return {"success": True}
    except Exception as e:
        return {"error": str(e), "success": False}


async def _send_cdp(ws, method: str, params: dict) -> dict:
    import websockets.exceptions
    cmd_id = 1
    message = {"id": cmd_id, "method": method, "params": params}
    try:
        await ws.send(json.dumps(message))
    except websockets.exceptions.ConnectionClosed as e:
        return {"error": f"WebSocket connection closed: {e}", "success": False}
    while True:
        try:
            response = await asyncio.wait_for(ws.recv(), timeout=30)
        except asyncio.TimeoutError:
            return {"error": "CDP response timed out (30s)", "success": False}
        except websockets.exceptions.ConnectionClosed as e:
            return {"error": f"WebSocket connection closed: {e}", "success": False}
        data = json.loads(response)
        if data.get("id") == cmd_id:
            # Pass through the complete CDP protocol error
            if "error" in data:
                err = data["error"]
                code = err.get("code", "")
                msg = err.get("message", str(err))
                return {"error": f"CDP {method}: [{code}] {msg}", "success": False, "cdp_error": err}
            return data.get("result", {})


async def cleanup_all():
    for port in list(_external_connections.keys()):
        await disconnect_from_external_app(port)


_GENERIC_DIR_NAMES = {
    "64bit", "app", "current", "plugins", "overlay", "locales", "resources",
    "swiftshader", "bin", "bin64", "cores", "node_modules", "dist",
    "locale", "pak", "blink", "content", "compatible_web",
}


def _is_skip_directory(dir_path: str) -> bool:
    """Check whether a directory or executable should be skipped."""
    name = os.path.basename(dir_path).lower()
    # Generic subdirectory names
    if name in _GENERIC_DIR_NAMES:
        return True
    # Shadowbot version directories
    import re
    if re.match(r"^shadowbot-\d+\.\d+\.\d+$", name):
        return True
    # Game data directories
    if name.endswith("_data"):
        return True
    # Installers and Visual C++ redistributables
    if "Visual C++" in name or "vc_redist" in name:
        return True
    # Edge WebView2 is a system component, not a standalone application
    if "webview2" in name:
        return True
    return False


def _is_quality_ancestor(exe_path: str, ancestor_path: str, markers_dir: str) -> bool:
    """Check whether an ancestor resembles an actual installation directory rather than a temporary or plugin directory."""
    if _is_skip_directory(ancestor_path):
        return False
    # Reject drive roots and system directories
    drive, tail = os.path.splitdrive(ancestor_path)
    if tail in ("\\", "/", ""):
        return False
    if os.path.normcase(ancestor_path) == os.path.normcase(os.environ.get("SystemRoot", "")):
        return False
    ancestor_name = os.path.basename(ancestor_path).lower()
    # Exclude random hash or UUID-like names
    hex_chars = set("0123456789abcdef-")
    if len(ancestor_name) > 30 and all(c in hex_chars for c in ancestor_name):
        return False
    try:
        file_count = len([f for f in os.scandir(ancestor_path) if f.is_file()])
        if file_count < 3:
            return False
    except Exception:
        return False
    return True


def _classify_chromium_app(exe_path: str, markers_dir: str) -> str:
    """Classify Chromium applications by runtime markers across platforms."""
    import re
    import platform
    files = set()
    try:
        files = set(os.listdir(markers_dir))
    except Exception:
        pass

    is_win = platform.system() == "Windows"

    if is_win:
        if "libcef.dll" in files:
            return "cef"
        if "electron.exe" in files:
            return "electron"
        if "msedge.dll" in files:
            return "browser"
        if "chrome.dll" in files:
            return "browser"
    else:
        exe_name = os.path.basename(exe_path).lower()
        if "electron" in exe_name:
            return "electron"
        markers_dir_lower = markers_dir.lower()
        if "chrome" in markers_dir_lower or "chromium" in markers_dir_lower or "edge" in markers_dir_lower:
            return "browser"
        if "cef" in markers_dir_lower:
            return "cef"
        parent = os.path.dirname(markers_dir)
        if "Electron Framework.framework" in parent:
            return "electron"

    # Match Electron version directories such as app-11.99.0
    dir_basename = os.path.basename(markers_dir)
    if re.match(r"^app-?\d+\.", dir_basename):
        return "electron"

    # Inspect the final 50 MB of the binary, where Electron strings are typically found
    try:
        size = os.path.getsize(exe_path)
        with open(exe_path, "rb") as f:
            if size > 50_000_000:
                f.seek(size - 50_000_000)
            data = f.read(50_000_000)
        if b"Electron/" in data:
            return "electron"
    except Exception:
        pass

    return "chromium"


def _is_chromium_dir(dir_files: set) -> bool:
    """Determine whether a directory contains a Chromium runtime on Windows, macOS or Linux.
    
    The icudtl.dat file is the Chromium ICU data file.
    Together with Chromium .pak resource files, it identifies Chromium, Electron and CEF applications.
    """
    if "icudtl.dat" not in dir_files:
        return False
    paks = [f for f in dir_files if f.endswith(".pak")]
    return len(paks) >= 2


def _find_main_exe(directory: str) -> Optional[str]:
    """Find the main executable, excluding installers, updaters, services and other helper programs across platforms."""
    from pathlib import Path
    import platform
    d = Path(directory)
    dir_name = d.name.lower()
    skip_words = (
        "uninst", "update", "setup", "crashpad", "minidump",
        "elevated", "elevation", "tracing", "notification", "helper",
        "pwa_launcher", "os_update", "service", "handler",
        "\u5378\u8f7d", "\u5b89\u88c5", "\u66f4\u65b0", "\u4fee\u590d", "\u914d\u7f6e",
    )
    is_windows = platform.system() == "Windows"

    def _is_binary(f):
        if not f.is_file():
            return False
        if is_windows:
            return f.suffix.lower() == ".exe"
        return os.access(str(f), os.X_OK)

    candidates = []
    for f in sorted(d.iterdir(), key=lambda x: x.stat().st_size, reverse=True):
        if not _is_binary(f):
            continue
        name_lower = f.name.lower()
        if any(s in name_lower for s in skip_words):
            continue
        if f.stat().st_size > 500000:
            candidates.append(f)

    if not candidates:
        return None
    for c in candidates:
        if c.stem.lower() == dir_name:
            return str(c.resolve())
    return str(candidates[0].resolve())


def _build_search_paths(default_paths: list) -> list:
    """Build the complete search path from defaults and Program Files on other drives."""
    import string
    all_paths = list(default_paths)
    for drive in string.ascii_uppercase:
        if drive == "C":
            continue
        root = f"{drive}:\\"
        if not os.path.exists(root):
            continue
        for sub in ("Program Files", "Program Files (x86)"):
            pf = f"{drive}:\\{sub}"
            if os.path.exists(pf):
                all_paths.append(pf)
    return list(dict.fromkeys(all_paths))


def _scan_start_menu(seen_paths: set) -> list:
    """Discover installed applications through Windows Start menu shortcuts."""
    import subprocess
    results = []
    start_dirs = [
        os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs"),
        "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
        os.path.join(os.environ.get("USERPROFILE", ""), "Desktop"),
        "C:\\Users\\Public\\Desktop",
    ]

    # Collect all .lnk paths for batch PowerShell resolution
    all_lnks = []
    for start_dir in start_dirs:
        if not os.path.exists(start_dir):
            continue
        for root, dirs, files in os.walk(start_dir):
            for f in files:
                if f.lower().endswith(".lnk"):
                    all_lnks.append(os.path.join(root, f).replace("\\", "\\\\"))

    if not all_lnks:
        return results

    # Resolve shortcuts in batches of up to 200 to avoid excessive command length
    batch_size = 200
    for batch_start in range(0, len(all_lnks), batch_size):
        batch = all_lnks[batch_start:batch_start + batch_size]
        lnk_list = "@(" + ",".join(f"'{lnk}'" for lnk in batch) + ")"
        ps_cmd = (
            f"$WScript = New-Object -ComObject WScript.Shell; "
            f"foreach ($lnk in {lnk_list}) {{ "
            f"try {{ Write-Output ($WScript.CreateShortcut($lnk).TargetPath) }} catch {{ Write-Output '' }} "
            f"}}"
        )
        try:
            si = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=60
            )
            for target in si.stdout.splitlines():
                target = target.strip()
                if not target or not os.path.exists(target):
                    continue
                target = os.path.normpath(target)
                base = os.path.basename(target).lower()
                # Skip uninstallers, installers and updaters
                skip_keywords = ("uninst", "update", "setup", "crashpad", "repair",
                                 "\u5378\u8f7d", "\u5b89\u88c5", "\u4fee\u590d", "\u66f4\u65b0", "\u914d\u7f6e")
                is_skip = any(k in base for k in skip_keywords)
                if is_skip:
                    continue
                # Look for a larger executable in the same or common subdirectories, since launchers are usually smaller
                parent = os.path.dirname(target)
                best_path = target
                try:
                    best_size = os.path.getsize(target)
                except Exception:
                    continue
                for sub in ("app", "versions", "bin", "dist"):
                    sp = os.path.join(parent, sub)
                    if not os.path.isdir(sp):
                        continue
                    for f in os.listdir(sp):
                        fp = os.path.join(sp, f)
                        if not f.lower().endswith(".exe"):
                            continue
                        if any(k in f.lower() for k in skip_keywords):
                            continue
                        try:
                            sz = os.path.getsize(fp)
                            if sz > best_size:
                                best_size = sz
                                best_path = os.path.normpath(fp)
                        except Exception:
                            continue
                target = best_path
                norm = target.lower().replace("\\", "/")
                if norm in seen_paths:
                    continue
                seen_paths.add(norm)
                results.append(target)
        except Exception:
            continue

    return results


def _scan_chromium_apps(search_paths: list) -> list:
    """Scan Chromium-based applications, including Electron, CEF, browsers and custom variants."""
    from pathlib import Path
    results = []

    for sp in search_paths:
        if not os.path.exists(sp):
            continue
        try:
            for root, dirs, files in os.walk(sp):
                depth = root[len(sp):].count(os.sep)
                if depth > 6:
                    dirs.clear()
                    continue
                if not files:
                    continue

                file_set = set(files)
                if not _is_chromium_dir(file_set):
                    continue

                # Found a Chromium runtime directory
                root_path = Path(root)

                # Collect main executable candidates from this directory and up to three ancestors; choose the largest
                is_generic = _is_skip_directory(root)
                candidates = []
                max_depth = min(4, len(list(root_path.parents)) + 1)  # Current directory plus up to three ancestors
                ancestors = [root_path] + list(root_path.parents)[:3]
                for ancestor_idx, ancestor in enumerate(ancestors):
                    if ancestor_idx == 0:
                        exe = _find_main_exe(str(ancestor))
                    else:
                        if not _is_quality_ancestor(str(ancestor), str(ancestor), root):
                            continue
                        exe = _find_main_exe(str(ancestor))
                    if exe:
                        candidates.append((os.path.getsize(exe), exe))
                        if ancestor_idx == 0 and not is_generic:
                            break  # Trust an executable in the same non-generic directory
                if not candidates:
                    dirs.clear()
                    continue
                candidates.sort(key=lambda x: x[0], reverse=True)
                found_exe = candidates[0][1]
                markers_dir = root

                exe_path = str(Path(found_exe).resolve())
                app_type = _classify_chromium_app(exe_path, markers_dir)
                results.append({"path": exe_path, "type": app_type, "markers_dir": markers_dir})
                dirs.clear()
        except PermissionError:
            continue

    return results


def _scan_linux_desktop_entries(known_paths: set, search_paths: list) -> list:
    """Linux: discover installed Chromium and Electron applications using .desktop files.

    Parse .desktop files in /usr/share/applications/ and ~/.local/share/applications/.
    Extract executable paths from Exec= entries and check for Chromium or Electron.
    """
    import re
    import subprocess
    from pathlib import Path

    desktop_dirs = [
        "/usr/share/applications",
        os.path.expanduser("~/.local/share/applications"),
    ]
    if os.path.exists("/var/lib/snapd/desktop/applications"):
        desktop_dirs.append("/var/lib/snapd/desktop/applications")
    if os.path.exists("/var/lib/flatpak/exports/share/applications"):
        desktop_dirs.append("/var/lib/flatpak/exports/share/applications")

    results = []

    for dd in desktop_dirs:
        if not os.path.exists(dd):
            continue
        try:
            for fname in os.listdir(dd):
                if not fname.endswith(".desktop"):
                    continue
                fpath = os.path.join(dd, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                except Exception:
                    continue

                exec_match = re.search(r"^Exec\s*=\s*(.+)$", content, re.MULTILINE | re.IGNORECASE)
                if not exec_match:
                    continue
                exec_line = exec_match.group(1).strip()
                # Remove desktop-entry placeholders
                exec_line = re.sub(r"\s*%[fFuUdDnNickvm]\s*", " ", exec_line).strip()
                # Extract executable paths, including quoted paths
                exec_path = None
                if exec_line.startswith('"'):
                    end = exec_line.find('"', 1)
                    if end > 0:
                        exec_path = exec_line[1:end]
                elif exec_line.startswith("'"):
                    end = exec_line.find("'", 1)
                    if end > 0:
                        exec_path = exec_line[1:end]
                else:
                    parts = exec_line.split()
                    if parts:
                        exec_path = parts[0]

                if not exec_path or not exec_path.startswith("/"):
                    continue

                # Expand environment variables
                exec_path = os.path.expandvars(exec_path)
                exec_path = os.path.expanduser(exec_path)

                # Resolve symbolic links to their real paths
                if os.path.islink(exec_path):
                    exec_path = os.path.realpath(exec_path)

                if not os.path.isfile(exec_path):
                    continue

                norm = Path(exec_path).resolve().as_posix().lower()
                if norm in known_paths:
                    continue
                known_paths.add(norm)

                # Search up to three ancestor levels for Chromium runtime markers
                parent = os.path.dirname(exec_path)
                for _ in range(3):
                    if os.path.isdir(parent):
                        try:
                            dir_files = set(os.listdir(parent))
                            if _is_chromium_dir(dir_files):
                                app_type = _classify_chromium_app(exec_path, parent)
                                results.append({
                                    "path": exec_path,
                                    "type": app_type,
                                    "markers_dir": parent,
                                })
                                break
                        except PermissionError:
                            pass
                    parent = os.path.dirname(parent)

        except PermissionError:
            continue

    return results


def _scan_macos_portable_apps(search_paths: list) -> list:
    """macOS: scan .app bundles for Chromium and Electron applications.
    
    Traverse application bundles rather than deep generic directories to avoid the os.walk depth limit (>6).
    This ensures markers under Versions/A/Resources/ are not missed.
    Also handle nested application bundles, such as Docker.app/Docker Desktop.app.
    """
    from pathlib import Path
    import glob
    results = []
    seen_bundles = set()

    for sp in search_paths:
        if not os.path.exists(sp):
            continue
        try:
            for entry in os.scandir(sp):
                if not entry.is_dir():
                    continue

                # Handle top-level application bundles
                if entry.name.endswith(".app"):
                    _scan_single_app_bundle(Path(entry.path), results, seen_bundles)
                else:
                    # Handle subdirectories that are not application bundles (e.g. /Applications/Hearthstone/)
                    try:
                        for sub_entry in os.scandir(entry.path):
                            if sub_entry.is_dir() and sub_entry.name.endswith(".app"):
                                _scan_single_app_bundle(Path(sub_entry.path), results, seen_bundles)
                    except PermissionError:
                        continue
        except PermissionError:
            continue

    return results


def _scan_single_app_bundle(app_path, results: list, seen_bundles: set):
    """Scan a single .app bundle and nested bundles for Chromium or Electron frameworks."""
    from pathlib import Path
    import glob

    bundle_norm = str(app_path.resolve()).lower()
    if bundle_norm in seen_bundles:
        return
    seen_bundles.add(bundle_norm)

    icudtl_glob = str(app_path / "Contents" / "**" / "icudtl.dat")
    icudtl_files = glob.glob(icudtl_glob, recursive=True)
    if not icudtl_files:
        return

    markers_dir = str(Path(icudtl_files[0]).parent)
    framework_exec = None

    # Find the actual Chromium or Electron binary in the framework Versions directory for classification
    for icu_path in icudtl_files:
        p = Path(icu_path).parent.parent  # Versions/X/ directory
        for f in sorted(p.iterdir(), key=lambda x: x.stat().st_size if x.is_file() and os.access(str(x), os.X_OK) else 0, reverse=True):
            if f.is_file() and os.access(str(f), os.X_OK) and f.stat().st_size > 500000:
                framework_exec = str(f.resolve())
                markers_dir = str(Path(icu_path).parent)
                break
        if framework_exec:
            break

    if not framework_exec:
        return

    # Check nested application bundles (e.g. Docker.app containing Docker Desktop.app)
    try:
        macos_dir = app_path / "Contents" / "MacOS"
        if macos_dir.exists():
            for sub_dir in macos_dir.iterdir():
                if sub_dir.is_dir() and sub_dir.name.endswith(".app"):
                    _scan_single_app_bundle(sub_dir, results, seen_bundles)
    except PermissionError:
        pass

    app_type = _classify_chromium_app(framework_exec, markers_dir)
    if app_type == "chromium":
        if _has_electron_markers(app_path, markers_dir):
            app_type = "electron"
    results.append({
        "path": str(app_path.resolve()),
        "type": app_type,
        "markers_dir": markers_dir,
    })


def _has_electron_markers(app_path, markers_dir: str) -> bool:
    """Detect Electron applications using markers at the application-bundle level."""
    from pathlib import Path
    resources = app_path / "Contents" / "Resources"
    if resources.exists():
        try:
            res_files = set(f.name.lower() for f in resources.iterdir())
            if any(f == "app.asar" for f in res_files):
                return True
            if any(f.endswith(".asar") for f in res_files):
                return True
            if any(f.startswith("electron") for f in res_files):
                return True
            if any(f.startswith("owl-electron") for f in res_files):
                return True
        except PermissionError:
            pass
    marker_lower = os.path.basename(markers_dir).lower() if markers_dir else ""
    if marker_lower == "resources":
        grandparent = Path(markers_dir).parent.parent if markers_dir else None
        if grandparent and grandparent.name.lower().endswith(".framework"):
            fw_path = str(grandparent)
            fw_name = grandparent.name.lower()
            if "electron" in fw_name:
                return True
    return False


def _parse_version(v: str) -> tuple:
    """Parse a version into a comparable tuple."""
    if not v:
        return (0,)
    import re
    parts = re.split(r"[.\-_]", v)
    result = []
    for p in parts:
        try:
            result.append(int(p.strip()))
        except ValueError:
            # Treat non-numeric components as zero for version comparison
            pass
    return tuple(result) if result else (0,)


def _dedup_by_name(apps: List[dict]) -> List[dict]:
    """Deduplicate case-insensitive application names, keeping only the highest version."""
    groups: Dict[str, list] = {}
    for a in apps:
        key = a["name"].strip().lower()
        groups.setdefault(key, []).append(a)

    result = []
    for key, group in groups.items():
        if len(group) == 1:
            result.append(group[0])
        else:
            # Sort versions in descending order and keep the highest
            group.sort(key=lambda a: _parse_version(a.get("version", "")), reverse=True)
            best = group[0]
            result.append(best)
            others = len(group) - 1
            if others > 0:
                names = [a["version"] or "?" for a in group[1:]]
                print(f"[LocalAppControl] Deduplication: '{best['name']}' keeping v{best['version']}, discarding {others} older versions ({', '.join(names)})")

    return result


def scan_local_apps(search_paths: Optional[List[str]] = None) -> List[dict]:
    import platform
    import subprocess
    from pathlib import Path

    platform_name = platform.system().lower()
    mapped = {"windows": "win32", "darwin": "darwin", "linux": "linux"}.get(platform_name, platform_name)

    if search_paths is None:
        if mapped == "win32":
            default_paths = [
                "C:\\Program Files",
                "C:\\Program Files (x86)",
                os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs"),
            ]
            search_paths = _build_search_paths(default_paths)
        elif mapped == "darwin":
            search_paths = ["/Applications", os.path.expanduser("~/Applications")]
        elif mapped == "linux":
            search_paths = [
                "/opt",
                "/snap",
                os.path.expanduser("~/Apps"),
            ]
            # Desktop-entry scanning covers /usr/lib and ~/.local/share without walking thousands of shared-library directories
        else:
            raise NotImplementedError(f"Platform {mapped} not supported")

    search_paths = [p for p in search_paths if p and os.path.exists(p)]

    # Scan all Chromium applications together
    if mapped == "darwin":
        all_found = _scan_macos_portable_apps(search_paths)
    else:
        all_found = _scan_chromium_apps(search_paths)

    # Supplement the scan with applications discovered through Start menu shortcuts
    if mapped == "win32":
        before_count = len(all_found)
        known_exes = {i["path"].lower().replace("\\", "/") for i in all_found}
        start_menu_paths = _scan_start_menu(known_exes)
        for sm_path in start_menu_paths:
            # Exclude system components
            if "edgewebview" in sm_path.lower() or "msedgewebview2" in sm_path.lower():
                continue
            try:
                p = Path(sm_path)
                d = str(p.parent)
                check_dirs = [d]
                for sub in os.listdir(d):
                    sub_path = os.path.join(d, sub)
                    if os.path.isdir(sub_path):
                        check_dirs.append(sub_path)
                for cd in check_dirs[:5]:
                    if _is_chromium_dir(set(os.listdir(cd)) if os.path.exists(cd) else set()):
                        app_type = _classify_chromium_app(sm_path, cd)
                        all_found.append({"path": sm_path, "type": app_type, "markers_dir": cd})
                        break
            except Exception:
                continue
        start_count = len(all_found) - before_count
        if start_count > 0:
            print(f"[LocalAppControl] Start menu discovery found {start_count} additional applications")

    # Supplement Linux discovery using .desktop files
    if mapped == "linux":
        before_count = len(all_found)
        known_paths = {Path(i["path"]).resolve().as_posix().lower() for i in all_found}
        desktop_results = _scan_linux_desktop_entries(known_paths, search_paths)
        all_found.extend(desktop_results)
        desktop_count = len(all_found) - before_count
        if desktop_count > 0:
            print(f"[LocalAppControl] Desktop entry discovery found {desktop_count} additional applications")

    type_names = {
        "electron": "electron",
        "cef": "cef",
        "browser": "browser",
        "chromium": "chromium",
    }
    apps = []
    seen = set()

    for info in all_found:
        try:
            exe_path = info["path"]
            app_type = info.get("type", "chromium")

            norm = Path(exe_path).resolve().as_posix().lower()
            if norm in seen:
                continue
            seen.add(norm)

            # Filter system components
            if "edgewebview" in norm or "msedgewebview2" in norm:
                continue
            # Exclude NVIDIA CEF background components that do not support debugging
            if "nvidia" in norm and ("cef" in norm or "overlay" in norm):
                continue

            p = Path(exe_path)
            name = p.parent.name
            version = ""

            if mapped == "win32":
                try:
                    ps_cmd = (
                        f"$item = Get-Item '{exe_path}'; "
                        "$v = $item.VersionInfo; "
                        "Write-Output ('PN:' + $v.ProductName); "
                        "Write-Output ('PV:' + $v.ProductVersion); "
                        "Write-Output ('FV:' + $v.FileVersion)"
                    )
                    si = subprocess.run(
                        ["powershell", "-NoProfile", "-Command", ps_cmd],
                        capture_output=True, text=True, timeout=10
                    )
                    if si.stdout:
                        for line in si.stdout.splitlines():
                            line = line.strip()
                            if line.startswith("PN:") and len(line) > 3:
                                prod_name = line[3:].strip()
                                if prod_name and "electron" not in prod_name.lower():
                                    name = prod_name
                            if line.startswith("PV:") and len(line) > 3:
                                ver = line[3:].strip()
                                if ver:
                                    version = ver
                            if line.startswith("FV:") and not version and len(line) > 3:
                                ver = line[3:].strip()
                                if ver:
                                    version = ver
                except Exception:
                    pass
            elif mapped == "darwin":
                plist_path = p / "Contents" / "Info.plist" if p.name.endswith(".app") else p.parent.parent / "Contents" / "Info.plist"
                found_app = None
                if not plist_path.exists():
                    candidates = [p] if p.name.endswith(".app") else []
                    candidates.extend(p.parents)
                    for ancestor in candidates:
                        if ancestor.name.endswith(".app"):
                            found_app = ancestor
                            break
                    if found_app:
                        plist_path = found_app / "Contents" / "Info.plist"
                if plist_path.exists():
                    try:
                        import plistlib
                        plist = plistlib.loads(plist_path.read_bytes())
                        name = plist.get("CFBundleDisplayName") or plist.get("CFBundleName") or name
                        version = plist.get("CFBundleShortVersionString") or plist.get("CFBundleVersion") or ""
                    except Exception:
                        pass
                if found_app:
                    exe_path = str(found_app.resolve())
                    if not version:
                        name = found_app.stem
                elif p.name.endswith(".app"):
                    if not version:
                        name = p.stem
            elif mapped == "linux":
                try:
                    # Try reading the application name and version from Electron package.json
                    app_dir = p.parent
                    pkg_candidates = [
                        app_dir / "resources" / "app" / "package.json",
                        app_dir / "package.json",
                        app_dir / "resources" / "package.json",
                    ]
                    for pkg_path in pkg_candidates:
                        if pkg_path.exists():
                            try:
                                import json
                                pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
                                pkg_name = pkg.get("productName") or pkg.get("name") or ""
                                if pkg_name and "electron" not in pkg_name.lower():
                                    name = pkg_name
                                pkg_ver = pkg.get("version") or ""
                                if pkg_ver:
                                    version = pkg_ver
                                if name != app_dir.name and version:
                                    break
                            except Exception:
                                pass
                except Exception:
                    pass

            # Normalize ProductName by removing a launcher suffix when the parent directory confirms the application name
            nl = name.lower()
            dir_lower = p.parent.name.lower()
            if nl.endswith(" launcher") and nl[:-9].strip() == dir_lower:
                name = p.parent.name
            elif name.endswith("\u542f\u52a8\u5668") and len(name) > 3 and name[:-3].strip() == p.parent.name:
                name = p.parent.name

            is_running = False
            pid = 0
            try:
                if mapped == "win32":
                    ps_cmd = f"Get-Process -Name '{p.stem}' -ErrorAction SilentlyContinue | ForEach-Object {{ $_.Id }}"
                    si = subprocess.run(
                        ["powershell", "-NoProfile", "-Command", ps_cmd],
                        capture_output=True, text=True, timeout=10
                    )
                    if si.stdout.strip():
                        pids = [int(x) for x in si.stdout.strip().split() if x.strip().isdigit()]
                        if pids:
                            is_running = True
                            pid = pids[0]
                elif mapped in ("darwin", "linux"):
                    si = subprocess.run(
                        ["pgrep", "-f", exe_path], capture_output=True, text=True, timeout=5
                    )
                    if si.stdout.strip():
                        pids = [int(x) for x in si.stdout.strip().split() if x.strip().isdigit()]
                        if pids:
                            is_running = True
                            pid = pids[0]
            except Exception:
                pass

            name_lower = name.lower()
            if any(k in name_lower for k in ("microsoft visual c++", "vc_redist", "_data_path")):
                continue
            if any(k in name_lower for k in ("genshin", "yuanshen", "honkai", "star rail")):
                continue
            # Background components and services are not interactive applications
            if any(k in name_lower for k in ("nvidia app", "nvidia overlay", "webview2")):
                continue
            # Filter uninstallers, installers and launchers discovered through Start menu entries
            if any(k in name_lower for k in ("\u5378\u8f7d", "uninstall", "installer", "setup wizard")):
                continue
            # Filter WebView2
            if "webview2" in name_lower:
                continue

            apps.append({
                "id": norm,
                "name": name,
                "path": exe_path,
                "version": version,
                "appType": app_type,
                "isElectron": app_type == "electron",
                "isRunning": is_running,
                "pid": pid,
            })
        except Exception as e:
            print(f"[LocalAppControl] Skipping {info.get('path', '?')}: {e}")
            continue

    # Deduplicate identical application names, keeping the highest version
    apps = _dedup_by_name(apps)

    # Remove an XXX Launcher entry if XXX already exists
    app_names = {a["name"].lower().strip() for a in apps}
    def _is_launcher_of(name):
        n = name.lower().strip()
        # Match launcher suffixes in installed application names
        if n.endswith(" launcher"):
            return n[:-9].strip() in app_names
        if n.endswith("\u542f\u52a8\u5668") and len(n) > 3:
            return n[:-3].strip() in app_names
        # A bare launcher name is not useful
        if n in ("launcher", "\u542f\u52a8\u5668"):
            return True
        return False
    apps = [a for a in apps if not _is_launcher_of(a["name"])]

    # Deduplicate paths so only one entry per directory remains
    dir_map = {}
    for a in apps:
        path = a["path"]
        if path.lower().endswith(".app"):
            parent = path.lower().replace("\\", "/")
        else:
            parent = os.path.dirname(path).lower().replace("\\", "/")
        if parent not in dir_map:
            dir_map[parent] = a
        else:
            existing = dir_map[parent]
            def _name_score(n):
                s = n.lower()
                if any(k in s for k in ("uninst", "update", "setup", "repair", "\u5378\u8f7d", "\u5b89\u88c5", "\u4fee\u590d", "crashpad")):
                    return -1
                if any(k in s for k in ("launcher", "\u542f\u52a8\u5668")):
                    return 0
                return 1
            if _name_score(a["name"]) > _name_score(existing["name"]):
                dir_map[parent] = a
    apps = list(dir_map.values())

    # Sort by CDP compatibility: electron > browser > cef > chromium
    _type_order = {"electron": 0, "browser": 1, "cef": 2, "chromium": 3}
    apps.sort(key=lambda a: (_type_order.get(a["appType"], 99), a["name"].lower()))

    type_counts = {}
    for a in apps:
        type_counts[a["appType"]] = type_counts.get(a["appType"], 0) + 1

    summary = ", ".join(f"{v} {type_names.get(k, k)}" for k, v in type_counts.items())
    print(f"[LocalAppControl] Scan complete: {len(apps)} applications ({summary})")
    return apps
