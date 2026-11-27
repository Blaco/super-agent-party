#!/usr/bin/env python3
"""Exercise the bundled Windows backend using a disposable synthetic profile.

This is a runtime smoke test, not a GUI, inference, speech, or network-isolation
test. It sends only local HTTP/WebSocket requests and never uses real user data.
"""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
from urllib.request import ProxyHandler, build_opener

from websockets.sync.client import connect


HANDSHAKE = re.compile(r"REAL_PORT_FOUND:(\d+)")
HTTP = build_opener(ProxyHandler({}))
CONVERSATION = {
    "id": "ci-packaged-smoke-conversation",
    "name": "Packaged smoke test",
    "messages": [
        {"role": "user", "content": "Synthetic local test message."},
        {"role": "assistant", "content": "Synthetic test response."},
    ],
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def available_port():
    # The inherited server port-0 path returns zero rather than the chosen port.
    # Use a positive ephemeral candidate; the server can select a fallback.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def get(port, path):
    with HTTP.open(f"http://127.0.0.1:{port}{path}", timeout=5) as response:
        require(response.status == 200, f"GET {path}: HTTP {response.status}")
        return response.read().decode("utf-8")


def get_json(port, path):
    return json.loads(get(port, path))


def child_environment(profile, home):
    env = os.environ.copy()
    # Set this before importing the backend: several modules resolve paths
    # before server.py parses its --data-dir argument.
    for key in list(env):
        if key.upper() in {
            "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
            "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_ORG_ID",
            "OPENAI_PROJECT_ID", "IS_DOCKER", "IS_STEAM_BUILD",
            "DYNAMIC_PORT", "ELECTRON_RUN_AS_NODE",
        }:
            env.pop(key)
    roaming = home / "AppData" / "Roaming"
    local = home / "AppData" / "Local"
    for path in (profile, home, roaming, local):
        path.mkdir(parents=True, exist_ok=True)
    env.update({
        "SUPER_AGENT_PARTY_DATA_DIR": str(profile),
        "HOME": str(home),
        "USERPROFILE": str(home),
        "APPDATA": str(roaming),
        "LOCALAPPDATA": str(local),
        "NO_PROXY": "127.0.0.1,localhost",
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
        "MEM0_TELEMETRY": "False",
        "HF_HUB_OFFLINE": "1",
    })
    return env


def wait_for_backend(process, log_path, timeout):
    deadline = time.monotonic() + timeout
    port = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Backend exited during startup: {process.returncode}")
        if port is None:
            match = HANDSHAKE.search(log_path.read_text(encoding="utf-8", errors="replace"))
            if match:
                port = int(match.group(1))
                require(0 < port < 65536, f"Invalid backend handshake port: {port}")
        if port:
            try:
                if get_json(port, "/health") == {"status": "ok"}:
                    return port
            except (OSError, ValueError):
                pass
        time.sleep(0.5)
    raise TimeoutError("Timed out waiting for backend handshake and health response")


def stop_backend(process):
    if process.poll() is not None:
        return
    # Only terminate the process tree created by this test. No global image-name
    # process killing; no shutdown request to an unrelated running SAP instance.
    subprocess.run(
        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        check=False, timeout=20,
    )
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=15)


@contextmanager
def running_backend(executable, profile, home, log_path, timeout):
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [str(executable), "--host", "127.0.0.1", "--port", str(available_port()),
             "--data-dir", str(profile)],
            cwd=executable.parent,
            env=child_environment(profile, home),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        try:
            port = wait_for_backend(process, log_path, timeout)
            yield port
            require(process.poll() is None, "Backend exited during the smoke checks")
        finally:
            stop_backend(process)


def receive_type(ws, kind, correlation_id=None, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        message = json.loads(ws.recv(timeout=max(0.1, deadline - time.monotonic())))
        if message.get("type") == "error":
            raise RuntimeError("Backend returned a WebSocket error during the test")
        if message.get("type") == kind:
            if correlation_id is None or message.get("correlationId") == correlation_id:
                return message
    raise TimeoutError(f"No WebSocket message of type {kind}")


def save(ws, kind, payload, acknowledgement, correlation_id):
    ws.send(json.dumps({"type": kind, "data": payload, "correlationId": correlation_id}))
    response = receive_type(ws, acknowledgement, correlation_id)
    require(response.get("success") is True, f"{kind} was not acknowledged")


def check_http(port, profile):
    data = get_json(port, "/api/system/data-path")
    require(Path(data["path"]).resolve() == profile.resolve(), "Backend used the wrong profile")
    require(data["is_docker"] is False, "Backend unexpectedly started in Docker mode")
    require(get_json(port, "/cur_language") == {"language": "en-US"}, "Wrong runtime locale")
    html = get(port, "/")
    require("js/locales/en-US.js" in html, "English locale script missing from UI")
    require("js/locales/zh-CN.js" not in html, "Retired locale script in UI")
    require(len(get(port, "/js/locales/en-US.js")) > 1000, "English locale asset missing")
    models = get_json(port, "/v1/models")
    require(models.get("object") == "list", "Unexpected model list contract")
    require(any(model.get("id") == "super-model" for model in models["data"]),
            "Default local agent endpoint is missing")


def check_safe_defaults(settings):
    require(settings["systemSettings"]["language"] == "en-US", "Wrong stored locale")
    require(settings["systemSettings"]["network"] == "local", "Network default is not local")
    require(not settings.get("modelProviders"), "Fresh profile has configured providers")
    require(not settings.get("selectedProvider"), "Fresh profile selected a provider")
    require(not settings.get("api_key"), "Fresh profile contains an API key")
    require(not settings.get("mcpServers"), "Fresh profile has configured MCP servers")
    for key in ("asrSettings", "ttsSettings", "diarySettings"):
        require(settings[key]["enabled"] is False, f"{key} is enabled by default")


def run(executable, log_dir, timeout):
    checks = []
    with tempfile.TemporaryDirectory(prefix="agent-creation-ci-") as folder:
        root = Path(folder)
        profile, home = root / "profile", root / "home"
        with running_backend(executable, profile, home, log_dir / "first-start.log", timeout) as port:
            check_http(port, profile)
            checks.append("clean-profile-http-and-packaged-english-assets")
            with connect(f"ws://127.0.0.1:{port}/ws", proxy=None, open_timeout=10) as ws:
                settings = receive_type(ws, "settings")["data"]
                check_safe_defaults(settings)
                require(not settings.get("conversations"), "Fresh profile has conversation history")
                ws.send('{"type":"ping"}')
                receive_type(ws, "pong")
                checks.append("clean-profile-websocket-and-defaults")
                # Exercise the same public settings/conversation persistence
                # protocol used by the renderer, not direct database writes.
                save(ws, "save_settings", {"systemSettings": {"theme": "dark"}},
                     "settings_saved", "ci-theme")
                save(ws, "save_conversations", {
                    "conversations": [CONVERSATION], "conversationGroups": [],
                }, "conversations_saved", "ci-conversation")
                checks.append("settings-and-conversation-save-acknowledgements")
        require((profile / "super_agent_party.db").is_file(), "Settings DB was not created")
        require((profile / "conversations.db").is_file(), "Conversation DB was not created")
        with running_backend(executable, profile, home, log_dir / "restart.log", timeout) as port:
            check_http(port, profile)
            with connect(f"ws://127.0.0.1:{port}/ws", proxy=None, open_timeout=10) as ws:
                settings = receive_type(ws, "settings")["data"]
                check_safe_defaults(settings)
                require(settings["systemSettings"]["theme"] == "dark",
                        "Saved theme did not survive restart")
                require(settings.get("conversations") == [CONVERSATION],
                        "Synthetic conversation did not survive restart")
                checks.append("existing-test-profile-restart-and-persistence")
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, type=Path)
    parser.add_argument("--log-dir", required=True, type=Path)
    parser.add_argument("--startup-timeout", type=int, default=180)
    args = parser.parse_args()
    require(os.name == "nt", "Run this test on Windows")
    executable = args.server.resolve(strict=True)
    log_dir = args.log_dir.resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    try:
        checks = run(executable, log_dir, args.startup_timeout)
    except Exception:
        for name in ("first-start.log", "restart.log"):
            path = log_dir / name
            if path.is_file():
                print(f"--- {name}: final 80 lines ---", flush=True)
                print("\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[-80:]))
        raise
    result = {
        "status": "passed",
        "checks": checks,
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "limitations": ["Backend only; no Electron GUI launch", "Synthetic profile only",
                        "Process termination, not graceful shutdown validation",
                        "No model inference, audio, avatar, agent, or network-isolation validation"],
    }
    (log_dir / "BACKEND-SMOKE.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
