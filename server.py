# -- coding: utf-8 --

import inspect
import signal
import struct
import sys
import os
import argparse
import socket
import errno
import subprocess
import platform

from PIL import Image

_is_steam_build = os.environ.get("IS_STEAM_BUILD", "0") == "1"
from py.cli_tool import read_file_tool_local
from py.task_tools import query_task_progress
from py.companion_defaults import resolve_generic_system_prompt
from py.ws_manager import ws_manager
from py.session_permissions import DESKTOP_SESSION_TOKEN, PendingToolApprovals, SessionPermissions

# === Pre-load heavy tool modules at startup to avoid blocking first request ===
from py.web_search import (
    DDGsearch, searxng, Tavily_search, Google_search,
    Brave_search, Exa_search, Serper_search, youcom_search,
    jina_crawler, Crawl4Ai_search, firecrawl_search, simple_fetch, markdown_new,
    duckduckgo_tool, searxng_tool, tavily_tool, google_tool,
    brave_tool, exa_tool, serper_tool, youcom_tool,
    jina_crawler_tool, simple_fetch_tool, Crawl4Ai_tool, firecrawl_tool, markdown_new_tool,
)
from py.know_base import kb_tool, query_knowledge_base, rerank_knowledge_base
from py.agent_tool import get_agent_tool, agent_tool_call
from py.a2a_tool import get_a2a_tool, a2a_tool_call
from py.llm_tool import get_llm_tool, custom_llm_tool
from py.pollinations import (
    pollinations_image_tool, openai_image_tool, openai_chat_image_tool,
    pollinations_image, openai_image, openai_chat_image,
)
from py.code_interpreter import e2b_code_tool, local_run_code_tool, e2b_code, local_run_code
from py.custom_http import fetch_custom_http
from py.comfyui_tool import comfyui_tool_call
from py.utility_tools import (
    time_tool, weather_tool, location_tool, timer_weather_tool,
    wikipedia_summary_tool, wikipedia_section_tool, arxiv_tool,
    get_weather, get_location_coordinates, get_weather_by_city,
    get_wikipedia_summary_and_sections, get_wikipedia_section_content, search_arxiv_papers,
)
from py.autoBehavior import auto_behavior_tool, auto_behavior
from py.guard import load_safety_words, check_content_safety
from py.cdp_tool import (
    all_cdp_tools, list_pages, navigate_page, new_page, close_page, select_page,
    take_snapshot, wait_for, click, fill, hover, press_key, evaluate_script,
    take_screenshot, fill_form, drag, handle_dialog, click_by_text,
)
from py.ext_cdp import (
    ext_app_tools, ext_click, ext_fill, ext_screenshot, ext_snapshot,
    ext_evaluate_script, ext_hover, ext_press_key, ext_wait_for,
    ext_list_apps, ext_select_app, ext_refresh_targets, ext_click_by_text,
)
from py.local_app_control import scan_local_apps
from py.computer_use_tool import (
    computer_use_tools, mouse_use_tools, keyboard_use_tools, desktopVision_use_tools,
    mouse_move, mouse_click, mouse_double_click, mouse_drag, mouse_scroll, mouse_hold,
    copy_to_input_box, keyboard_press, keyboard_sequence, keyboard_hotkey, keyboard_hold,
    logical_type, wait, screenshot, logical_click,
)
from py.mode_change import mode_change_tool, update_workspace_settings
from py.acpx_tools import acp_agent_tool, acpx_agent
from py.dynamic_island import (
    island_enable as dynamic_island_enable,
    island_disable as dynamic_island_disable,
    get_island_tools,
    is_island_enabled,
    island_music_play,
    island_music_pause,
    island_music_next,
    island_music_prev,
    island_music_get_info,
    island_music_set_volume,
    island_track_set,
)

# Extended CLI tool imports for dispatch_tool
from py.cli_tool import (
    docker_sandbox, list_files_tool, read_file_tool, read_file_range_tool,
    tail_file_tool, search_files_tool, edit_file_tool,
    edit_file_string_tool, glob_files_tool, todo_write_tool, list_processes_tool,
    get_process_logs_tool, kill_process_tool, docker_manage_ports_tool,
    read_skill_tool, shell_tool_local, list_files_tool_local,
    read_file_tool_local, read_file_range_tool_local, tail_file_tool_local,
    search_files_tool_local, edit_file_tool_local,
    edit_file_string_tool_local, glob_files_tool_local, todo_write_tool_local,
    local_net_tool, send_process_input_tool, read_skill_tool_local,
    get_tools_for_mode, get_local_tools_for_mode,
    shell_tool_wsl, get_wsl_tools_for_mode,
)
from py.task_tools import (
    create_subtask_tool, query_tasks_tool, cancel_subtask_tool, finish_task_tool, finish_main_task_tool,
    create_subtask, cancel_subtask, finish_task, finish_main_task,
)
from py.load_files import get_files_content, file_tool, image_tool
from py.diary_query_tool import diary_query_tool, diary_books_tool, handle_query_diary, handle_list_diary_books
from py.diary_chat_integration import append_to_chat_buffer, update_buffer_identity, get_chat_buffer
from py.diary_system import get_recent_diary_entries, DEFAULT_BOOK_ID as DIARY_DEFAULT_BOOK

import shortuuid
os.environ["MEM0_TELEMETRY"] = "False"
parser = argparse.ArgumentParser(description="Run the ASGI application server.")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=3456)
parser.add_argument("--data-dir", default=None, help="Custom data directory for multi-account support")
args, _ = parser.parse_known_args()

HOST = args.host
PREFERED_PORT = args.port
CUSTOM_DATA_DIR = args.data_dir

# Set environment variables used by modules such as py/get_setting.py
if CUSTOM_DATA_DIR:
    os.environ['SUPER_AGENT_PARTY_DATA_DIR'] = CUSTOM_DATA_DIR

def is_addr_in_use_error(e):
    """Check for an address-in-use error across platforms."""
    if hasattr(e, 'errno'):
        if e.errno == errno.EADDRINUSE:
            return True
        # Windows sometimes uses WSAEADDRINUSE (10048)
        if sys.platform == 'win32' and e.errno == 10048:
            return True
    # Windows winerror attribute
    if hasattr(e, 'winerror') and e.winerror == 10048:
        return True
    # macOS/Linux error messages
    if 'address already in use' in str(e).lower():
        return True
    return False

def is_permission_error(e):
    """Check for permission or access-denied errors across platforms."""
    if isinstance(e, PermissionError):
        return True
    if hasattr(e, 'errno'):
        if e.errno in (errno.EACCES, errno.EPERM):
            return True
        # Windows ERROR_ACCESS_DENIED (5)
        if sys.platform == 'win32' and e.errno == 13:
            return True
    if hasattr(e, 'winerror') and e.winerror in (5, 10013):
        return True
    err_str = str(e).lower()
    if any(x in err_str for x in ['permission', 'denied', 'access', 'not permitted']):
        return True
    return False

def force_bind_or_fallback(host, preferred_port):
    """
    Cross-platform port binding:
    1. Try binding the requested port, allowing for TIME_WAIT.
    2. Fall back to a random port if occupied, inaccessible or reserved.
    3. Avoid exiting on a binding exception.
    """
    # Try binding the preferred port
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # Allow rapid reuse of ports in TIME_WAIT
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, preferred_port))
        sock.close()
        return preferred_port
        
    except (socket.error, OSError, PermissionError) as e:
        # Identify the error type
        if is_addr_in_use_error(e):
            reason = "in use"
        elif is_permission_error(e):
            reason = "permission denied/system reserved"
        else:
            reason = f"error ({e})"
        
        print(f"Port {preferred_port} unavailable ({reason}), auto-assigning...", 
              file=sys.stderr, flush=True)
        
        # Close the failed socket
        try:
            if sock:
                sock.close()
        except:
            pass
        
        # Fallback: let the OS assign a port
        return auto_assign_port(host)
        
    except Exception as e:
        # Catch other exceptions
        print(f"Unexpected error binding port {preferred_port}: {e}, auto-assigning...", 
              file=sys.stderr, flush=True)
        try:
            if sock:
                sock.close()
        except:
            pass
        return auto_assign_port(host)

def auto_assign_port(host):
    """Allocate an available port with multiple fallback strategies."""
    # Try 127.0.0.1
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, 0))
        port = sock.getsockname()[1]
        sock.close()
        print(f"Auto-assigned port: {port}", file=sys.stderr, flush=True)
        return port
    except Exception as e:
        print(f"Failed to bind {host}: {e}", file=sys.stderr, flush=True)
        try:
            sock.close()
        except:
            pass
    
    # Fallback 1: try 0.0.0.0 (all interfaces)
    if host != "0.0.0.0":
        try:
            print("Trying 0.0.0.0...", file=sys.stderr, flush=True)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", 0))
            port = sock.getsockname()[1]
            sock.close()
            print(f"Auto-assigned port on 0.0.0.0: {port}", file=sys.stderr, flush=True)
            return port
        except Exception as e:
            print(f"Failed to bind 0.0.0.0: {e}", file=sys.stderr, flush=True)
            try:
                sock.close()
            except:
                pass
    
    # Fallback 2: try localhost
    if host != "localhost":
        try:
            print("Trying localhost...", file=sys.stderr, flush=True)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("localhost", 0))
            port = sock.getsockname()[1]
            sock.close()
            print(f"Auto-assigned port on localhost: {port}", file=sys.stderr, flush=True)
            return port
        except Exception as e:
            print(f"Failed to bind localhost: {e}", file=sys.stderr, flush=True)
            try:
                sock.close()
            except:
                pass
    
    # Last resort: fixed high-numbered port
    fallback_ports = [45678, 45679, 45680, 0]
    for fp in fallback_ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host if host != "0.0.0.0" else "127.0.0.1", fp))
            port = sock.getsockname()[1]
            sock.close()
            print(f"Fallback to hardcoded port: {port}", file=sys.stderr, flush=True)
            return port
        except:
            try:
                sock.close()
            except:
                pass
            continue
    
    # This should not be reached; return the final fallback if it is
    return 0

# Find an available port
FINAL_PORT = force_bind_or_fallback(HOST, PREFERED_PORT)
PORT = FINAL_PORT
os.environ['DYNAMIC_PORT'] = str(FINAL_PORT)

# Call change_port as well to stay synchronized
from py.get_setting import change_port, reset_user_data_dir, set_custom_user_data_dir
change_port(FINAL_PORT)

# ==========================================
# Step 2: suppress noisy warnings from subsequent libraries
# ==========================================
import warnings
warnings.filterwarnings("ignore") # Suppress ordinary warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' # Reduce TensorFlow and related logging

import hashlib
import importlib
import mimetypes
import pathlib
import sys
import traceback
import platform
import requests

from py.agent import add_tool_to_project_config, is_tool_allowed_by_project_config
sys.stdout.reconfigure(encoding='utf-8')
import base64
from datetime import datetime
import glob
from io import BytesIO
import io
import os
from pathlib import Path
import pickle
import threading
import socket
import sys
import tempfile
import httpx
import aiohttp
import ipaddress
from urllib.parse import urlparse, urlunparse, urljoin
from urllib.robotparser import RobotFileParser
import websockets
from py.load_files import check_robots_txt, get_file_content, is_private_ip, sanitize_url

# Fix the sherpa-onnx onnxruntime dylib path on macOS arm64
import site
try:
    _sp = site.getsitepackages()[0]
    _sherpa_lib = os.path.join(_sp, "sherpa_onnx", "lib")
    _onnx_capi = os.path.join(_sp, "onnxruntime", "capi")
    import glob as _glob
    _dylibs = _glob.glob(os.path.join(_onnx_capi, "libonnxruntime*.dylib"))
    if _dylibs:
        _dylib = _dylibs[0]
        _target = os.path.join(_sherpa_lib, os.path.basename(_dylib))
        if not os.path.exists(_target):
            os.makedirs(_sherpa_lib, exist_ok=True)
            os.symlink(os.path.abspath(_dylib), _target)
except Exception:
    pass

def fix_macos_environment():
    """
    Resolve missing Node.js (nvm) and uv (Python framework) on macOS.
    """
    if sys.platform != 'darwin':
        return

    user_home = Path.home()
    paths_to_add = []

    # ---------------------------------------------------------
    # 1. Discover Node.js installed by NVM
    # Typical path: ~/.nvm/versions/node/vX.X.X/bin
    # ---------------------------------------------------------
    nvm_path = user_home / ".nvm" / "versions" / "node"
    if nvm_path.exists():
        # Find all version directories (such as v20.19.5 and v18.0.0)
        # Use glob to match directories starting with v
        node_versions = sorted(nvm_path.glob("v*"), key=lambda p: p.name, reverse=True)
        
        # Add bin directories for all versions, or only the latest
        for version_dir in node_versions:
            bin_path = version_dir / "bin"
            if bin_path.exists():
                paths_to_add.append(str(bin_path))
                # Break here if only the latest Node.js is desired
                # break 

    # ---------------------------------------------------------
    # 2. Discover uv in the Python framework
    # Typical path: /Library/Frameworks/Python.framework/Versions/X.X/bin
    # ---------------------------------------------------------
    py_framework_path = Path("/Library/Frameworks/Python.framework/Versions")
    if py_framework_path.exists():
        # Find all versions, such as 3.13 and 3.12
        py_versions = py_framework_path.glob("*")
        for ver in py_versions:
            bin_path = ver / "bin"
            if bin_path.exists():
                paths_to_add.append(str(bin_path))

    # ---------------------------------------------------------
    # 3. Add other common macOS paths (Homebrew, Cargo, Local)
    # uv is often installed in .local/bin or .cargo/bin
    # ---------------------------------------------------------
    common_extras = [
        "/opt/homebrew/bin",           # Apple Silicon Mac Homebrew
        "/usr/local/bin",              # Intel Mac Homebrew
        str(user_home / ".local" / "bin"), # Typical user-level installation path
        str(user_home / ".cargo" / "bin"), # Rust toolchain (uv may be installed here)
    ]
    paths_to_add.extend(common_extras)

    # ---------------------------------------------------------
    # 4. Inject discovered paths into the current process environment
    # ---------------------------------------------------------
    current_path = os.environ.get("PATH", "")
    new_path_str = current_path
    
    # Prepend new paths for highest priority
    for p in paths_to_add:
        if p and os.path.isdir(p):
            # Avoid duplicate entries
            if p not in new_path_str:
                new_path_str = p + os.pathsep + new_path_str
    
    # Update the environment
    os.environ['PATH'] = new_path_str
    
    # Optional debug output
    # print(f"Fixed macOS PATH. Added: {paths_to_add}")

# --- Call this function at program startup ---
fix_macos_environment()

def _fix_onnx_dll():
    if sys.platform == 'darwin':
        return
    # 1. Locate onnxruntime in the uv virtual environment
    spec = importlib.util.find_spec("onnxruntime")
    if spec is None or spec.origin is None:
        return          # Skip if onnxruntime is not installed
    # DLLs are in site-packages/onnxruntime/capi
    dll_dir = pathlib.Path(spec.origin).with_name("capi")
    if not dll_dir.is_dir():
        return

    # 2. Prioritize the search path
    os.environ["PATH"] = str(dll_dir) + os.pathsep + os.environ["PATH"]
    if hasattr(os, "add_dll_directory"):      # Python 3.8+
        os.add_dll_directory(str(dll_dir))

    # 3. Clear the cache if onnxruntime has already been imported
    for mod in list(sys.modules):
        if mod.startswith("onnxruntime"):
            del sys.modules[mod]

_fix_onnx_dll()

# Configure at program startup
if hasattr(sys, '_MEIPASS'):
    # Packaged application
    os.environ['PYTHONPATH'] = sys._MEIPASS
    os.environ['PATH'] = sys._MEIPASS + os.pathsep + os.environ.get('PATH', '')
import asyncio
import copy
from functools import partial
import json
import re
import shutil
from fastapi import BackgroundTasks, Body, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, Request, WebSocketDisconnect
from fastapi_mcp import FastApiMCP
import logging
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel
from fastapi import status
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse,Response
import uuid
import time
from typing import Any, AsyncIterator, List, Dict,Optional, Tuple, Union
import shortuuid
from py.mcp_clients import McpClient
from contextlib import asynccontextmanager, suppress
from concurrent.futures import ThreadPoolExecutor
import aiofiles
import argparse
from py.dify_openai import DifyOpenAIAsync
from py.ClaudeAsOpenAI import AsyncClaudeAsOpenAI
from py.GeminiAsOpenAI import AsyncGeminiAsOpenAI
from py.ResponsesAsOpenAI import AsyncResponsesAsOpenAI
from py.get_setting import EXT_DIR, IS_DOCKER, SKILLS_DIR, _copy_default_skills, convert_to_opus_simple, load_covs, load_settings, save_covs, save_single_cov, save_settings,clean_temp_files_task,base_path,configure_host_port,UPLOAD_FILES_DIR,AGENT_DIR,MEMORY_CACHE_DIR,KB_DIR,DEFAULT_VRM_DIR,DEFAULT_THA_DIR,THA_USER_MODELS_DIR,DEFAULT_SOULX_IMAGES_DIR,SOULX_IMAGES_DIR,USER_DATA_DIR,LOG_DIR,TOOL_TEMP_DIR,COVS_PATH,DATABASE_PATH
from py.llm_tool import get_image_base64,get_image_media_type
from py.local_context import (capture_text_history, direct_local_endpoint,
                              expand_local_text_history, local_context_window)
from py.message_history import (ContextHistoryError, bounded_dialogue,
                                normalize_tool_history, select_compressed_dialogue)
timetamp = time.time()
log_path = os.path.join(LOG_DIR, f"backend_{timetamp}.log")

logger = None      
os.environ["no_proxy"] = "localhost,127.0.0.1"
local_timezone = None
settings = None
client = None
fast_client = None 
reasoner_client = None
HA_client = None
ChromeMCP_client = None
sql_client = None
mcp_client_list = {}
node_ext_mcp_clients: Dict[str, McpClient] = {}
node_ext_mcp_tools: Dict[str, List[Dict]] = {}  # Tool list for each extension
locales = {}
sleep_guard = None
scheduler_task = None
global_http_client = None  # Shared underlying TCP connection pool
openai_tts_clients_cache = {}  # Cache OpenAI TTS clients
tetos_speakers_cache = {}      # Cache Tetos Speaker objects
openai_asr_clients_cache = {}
_TOOL_HOOKS = {}
ALLOWED_EXTENSIONS = [
  # Office documents
    'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'pages', 
    'numbers', 'key', 'rtf', 'odt', 'epub',
  
  # Software development
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
  'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss', 'less',
  'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml', 'yaml', 
  'sql', 'sh',
  
  # Data and configuration
  'csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml'
]
ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'avi']

# 1. Clear potentially incorrect system entries
for ext in ("js", "mjs", "css", "html", "htm", "json", "xml", "map", "svg"):
    mimetypes.add_type("", f".{ext}")          # Remove the old entry first
# 2. Register the intended types
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("text/html", ".html")
mimetypes.add_type("text/html", ".htm")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("application/xml", ".xml")
mimetypes.add_type("application/json", ".map")
mimetypes.add_type("image/svg+xml", ".svg")

import platform
import ctypes
import io
if platform.system() == "Windows":
    try:
        # Set DPI awareness so screenshot dimensions match size()
        ctypes.windll.shcore.SetProcessDpiAwareness(1) 
    except Exception:
        ctypes.windll.user32.SetProcessDPIAware()

def draw_grid_on_image(image, grid_spacing: int = 10):
    """Draw a grid and per-mille coordinate labels on an image."""
    from PIL import ImageDraw
    draw = ImageDraw.Draw(image)
    width, height = image.size
    
    # Color configuration (translucent red or bright green)
    line_color = (255, 0, 0, 128)  # Red grid lines
    text_color = (255, 0, 0, 255)
    
    # Draw vertical lines (0-100 percent; labels are 0-1000 per mille)
    for x_pc in range(0, 101, grid_spacing):
        x = int(width * (x_pc / 100.0))
        # Keep coordinates within bounds
        x = min(x, width - 1)
        draw.line([(x, 0), (x, height)], fill=line_color, width=1)
        x_permille = x_pc
        draw.text((x + 2, 5), f"{x_permille}%", fill=text_color)

    # Draw horizontal lines
    for y_pc in range(0, 101, grid_spacing):
        y = int(height * (y_pc / 100.0))
        y = min(y, height - 1)
        draw.line([(0, y), (width, y)], fill=line_color, width=1)
        y_permille = y_pc
        draw.text((5, y + 2), f"{y_permille}%", fill=text_color)
        
    return image

def draw_action_feedback(image, action_str: str):
    """
    Parse the returned action string and draw visual feedback on the image.
    Use high-contrast cyan, blue, green and yellow instead of red to stand out against the red grid.
    """
    from PIL import ImageDraw, Image
    image = image.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = image.size
    
    def to_px(tx, ty):
        return int(float(tx) * w / 1000), int(float(ty) * h / 1000)

    # 1. Match MOVE(x,y): draw a small white circle with a black outline
    move_match = re.search(r"\[LAST_ACTION: MOVE\((\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if move_match:
        x, y = move_match.groups()
        px, py = to_px(x, y)
        r = 6
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(255, 255, 255, 200), outline=(0, 0, 0, 255), width=1)

    # 2. Match CLICK(x,y): draw a translucent cyan crosshair contrasting with the red grid
    click_match = re.search(r"\[LAST_ACTION: CLICK\((\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if click_match:
        x, y = click_match.groups()
        px, py = to_px(x, y)
        r = 12
        # Cyan background circle
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(0, 255, 255, 150), outline=(255, 255, 255, 255), width=2)
        # White crosshair
        draw.line([px-r-5, py, px+r+5, py], fill=(255, 255, 255, 255), width=2)
        draw.line([px, py-r-5, px, py+r+5], fill=(255, 255, 255, 255), width=2)

    # 3. Match DOUBLE_CLICK(x,y): draw a blue double-ring crosshair
    dclick_match = re.search(r"\[LAST_ACTION: DOUBLE_CLICK\((\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if dclick_match:
        x, y = dclick_match.groups()
        px, py = to_px(x, y)
        r = 14
        # Blue background circle
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(0, 100, 255, 150), outline=(255, 255, 255, 255), width=2)
        # White inner ring
        draw.ellipse([px-(r-4), py-(r-4), px+(r-4), py+(r-4)], outline=(255, 255, 255, 255), width=1)

    # 4. Match DRAG(x1,y1,x2,y2): green path and start, yellow end
    drag_match = re.search(r"\[LAST_ACTION: DRAG\((\d+\.?\d*),(\d+\.?\d*),(\d+\.?\d*),(\d+\.?\d*)\)\]", action_str)
    if drag_match:
        x1, y1, x2, y2 = drag_match.groups()
        p1 = to_px(x1, y1)
        p2 = to_px(x2, y2)
        
        # Translucent green connecting line
        draw.line([p1, p2], fill=(0, 255, 0, 200), width=4)
        
        # Green start circle
        draw.ellipse([p1[0]-6, p1[1]-6, p1[0]+6, p1[1]+6], fill=(0, 255, 0, 255), outline=(255,255,255,255), width=1)
        
        # Yellow end crosshair, visible against the grid
        r_end = 8
        draw.ellipse([p2[0]-r_end, p2[1]-r_end, p2[0]+r_end, p2[1]+r_end], fill=(255, 215, 0, 180), outline=(255,255,255,255), width=2)

    # Merge layers and convert to RGB because JPEG does not support alpha
    combined = Image.alpha_composite(image, overlay)
    return combined.convert("RGB")

def scale_to_fit(width: int, height: int, max_w: int = 1920, max_h: int = 1080) -> tuple[int, int]:
    """Calculate dimensions while preserving the aspect ratio."""
    # Calculate width and height scale factors
    scale_w = max_w / width
    scale_h = max_h / height
    
    # Use the smaller scale so both dimensions stay within the limit
    scale = min(scale_w, scale_h, 1.0) # Do not upscale images smaller than 1920x1080
    
    new_width = int(width * scale)
    new_height = int(height * scale)
    return new_width, new_height

def _get_target_message(message, role):
    """
    Get the target message for a role.
    
    Parameters:
            message (list): reference to the message list
            role (str): target role, one of 'user', 'assistant', 'system'
    
    Returns:
            dict: target message dictionary
    """
    # Validate inputs
    if not isinstance(message, list):
        raise TypeError("message must be a list")
    
    if role not in ['user', 'assistant', 'system']:
        raise ValueError("role must be 'user', 'assistant' or 'system'")
    
    target_message = None
    
    # Determine the target based on role
    if role == 'user':
        # Find the last message with role 'user'
        for msg in reversed(message):
            if isinstance(msg, dict) and msg['role'] == 'user':
                target_message = msg
                break
    elif role == 'assistant':
        # Check the last message
        if message and message[-1]['role'] == 'assistant':
            target_message = message[-1]
        else:
            # Create a new assistant message if the last message is not from the assistant
            new_assistant_msg = {'role': 'assistant', 'content': '','reasoning_content': ''}
            message.append(new_assistant_msg)
            target_message = new_assistant_msg
    elif role == 'system':
        # Find the first message with role 'system'
        if message and message[0]['role'] == 'system':
            target_message = message[0]
        else:
            # Create a system message if none exists
            target_message = {'role': 'system', 'content': ''}
            message.insert(0, target_message)
    
    return target_message

def content_append(message, role, content):
    """
    Append content to the message with the specified role.
    """
    target_message = _get_target_message(message, role)
    if target_message:
        current_content = target_message.get('content', '')
        target_message['content'] = current_content + content

def content_prepend(message, role, content):
    """
    Prepend content to the message with the specified role.
    """
    target_message = _get_target_message(message, role)
    if target_message:
        current_content = target_message.get('content', '')
        target_message['content'] = content + current_content

def content_replace(message, role, content):
    """
    Replace the content of the message with the specified role.
    """
    target_message = _get_target_message(message, role)
    if target_message:
        target_message['content'] = content

def content_new(message, role, content):
    """
    Replace the content of the message with the specified role.
    """
    message.append({'role': role, 'content': content})

configure_host_port(args.host, args.port)

def get_client_class(config, provider_id):
    if not config or 'modelProviders' not in config:
        return AsyncOpenAI
    vendor = 'OpenAI'
    for provider in config['modelProviders']:
        if provider['id'] == provider_id:
            vendor = provider['vendor']
            break
    # Assumes DifyOpenAIAsync and AsyncOpenAI are imported
    if vendor == 'Dify':
        return DifyOpenAIAsync 
    elif vendor == 'customAnthropic':
        return AsyncClaudeAsOpenAI
    elif vendor == 'Gemini':
        return AsyncGeminiAsOpenAI
    elif vendor == 'OpenAIResponses':
        return AsyncResponsesAsOpenAI
    else: 
        return AsyncOpenAI

from py.node_runner import node_mgr

def _wrap_client_chat_with_retry(client, max_retries=3, base_delay=1.0):
    RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
    RETRYABLE_EXCEPTIONS = (
        httpx.ConnectError, httpx.ReadError, httpx.ReadTimeout,
        httpx.ConnectTimeout, httpx.RemoteProtocolError, httpx.WriteError,
        httpx.PoolTimeout, httpx.NetworkError,
        asyncio.TimeoutError, ConnectionError,
    )

    _original_create = client.chat.completions.create

    async def _create_with_retry(*args, **kwargs):
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                if attempt > 0:
                    delay = base_delay * (2 ** (attempt - 1))
                    print(f"[Retry] chat.completions.create attempt {attempt}/{max_retries}; waiting {delay:.1f}s...")
                    await asyncio.sleep(delay)
                return await _original_create(*args, **kwargs)
            except Exception as e:
                last_error = e
                if isinstance(e, httpx.HTTPStatusError):
                    if e.response.status_code in RETRYABLE_STATUSES:
                        print(f"[Retry] HTTP {e.response.status_code}; retrying")
                        continue
                    raise
                if isinstance(e, RETRYABLE_EXCEPTIONS):
                    print(f"[Retry] Network error {type(e).__name__}: {e}; retrying")
                    continue
                raise
        raise last_error

    client.chat.completions.create = _create_with_retry

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Remove SOCKS proxy environment variables to avoid httpx failures ---
    for env_key in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']:
        val = os.environ.get(env_key, "")
        if val.lower().startswith('socks'):
            # Remove SOCKS environment variables that can cause failures
            os.environ.pop(env_key, None)

    # 1. Prepare independent initialization tasks
    from py.get_setting import init_db, init_covs_db, load_settings, save_settings
    from tzlocal import get_localzone
    
    asyncio.create_task(clean_temp_files_task())
    
    # Run expensive operations in parallel
    init_db_task = init_db()
    init_covs_task = init_covs_db()
    load_locales_task = asyncio.to_thread(lambda: json.load(open(base_path + "/config/locales.json", "r", encoding="utf-8")))
    settings_task = load_settings() 
    timezone_task = asyncio.to_thread(get_localzone)
    copy_skills_task = _copy_default_skills()
    
    results = await asyncio.gather(
        init_db_task, 
        init_covs_task, 
        load_locales_task, 
        settings_task, 
        timezone_task,
        copy_skills_task
    )
    
    # 2. Unpack results
    global settings, client, reasoner_client, fast_client, mcp_client_list, local_timezone, logger, locales, global_http_client,scheduler_task,sleep_guard
    _, _, locales, settings, local_timezone, _ = results
    
    from py.sleep_guard import SleepGuard
    sleep_guard = SleepGuard(verbose=True)

    load_safety_words()

    if _is_steam_build:
        settings.setdefault("systemSettings", {})
        settings["systemSettings"]["contentSafety"] = True

    try:
        await asyncio.to_thread(sleep_guard.start)
        if sleep_guard.is_running():
            print("🛡️ Sleep prevention started; automatic system sleep is disabled")
        else:
            print("⚠️ Failed to start sleep prevention; the system may sleep while idle")
    except Exception as e:
        print(f"Failed to start sleep prevention: {e}")


    from py.scheduler import AgentScheduler
    # Pass a reference to the global settings object
    # Python dictionaries are shared by reference, so subsequent UI changes are visible here
    scheduler = AgentScheduler(settings)
    scheduler_task = asyncio.create_task(scheduler.start_loop())

    # --- Diary engine initialization ---
    # The engine loop stays resident and idles while disabled; update_config refreshes it on save.
    try:
        from py.diary_engine import global_diary_engine
        global_diary_engine.update_config((settings or {}).get("diarySettings"))
        diary_engine_task = asyncio.create_task(global_diary_engine.start())
    except Exception as e:
        print(f"Failed to start diary engine: {e}")
        diary_engine_task = None

    # --- Logging initialization ---

    timestamp = time.time()
    log_path = os.path.join(LOG_DIR, f"backend_{timestamp}.log")
    logger = logging.getLogger("app")

    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # 1. Formatter shared by console and file output
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        
        # 2. Retain console output for live diagnostics
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        # 3. File output for persistent logging
        # Ensure the directory exists
        os.makedirs(LOG_DIR, exist_ok=True)
        file_handler = logging.FileHandler(log_path, encoding='utf-8')
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    logger.info("===== Logging initialized =====")
    logger.info(f"User data directory: {USER_DATA_DIR}")
    logger.info(f"Settings database path: {DATABASE_PATH}")
    logger.info(f"Log file: {log_path}")  # Log the path for verification

    # --- Proxy and HTTP client initialization ---
    proxy_url = None
    trust_env = False
    
    if settings:
        sys_set = settings.get("systemSettings", {})
        mode = sys_set.get("proxyMode")
        manual_url = sys_set.get("proxy", "").strip()

        if mode == "manual" and manual_url:
            # Manual mode: skip SOCKS with a warning if the required library is absent
            if manual_url.lower().startswith("socks"):
                logger.error("A manually configured SOCKS proxy is unsupported in this environment; the proxy is unavailable.")
                proxy_url = None
            else:
                proxy_url = manual_url
        elif mode == "system":
            # System mode: use the environment after SOCKS entries have been removed
            trust_env = True

    # Initialize the global pooled HTTP client
    timeout_config = httpx.Timeout(60.0, connect=10.0)
    global_http_client = httpx.AsyncClient(
        timeout=timeout_config,
        proxy=proxy_url,
        trust_env=trust_env
    )

    # --- Model client initialization ---
    # Helper: inject global_http_client consistently
    def create_model_client(provider_key, config_node=None):
        if not settings:
            fallback = AsyncOpenAI(http_client=global_http_client)
            _wrap_client_chat_with_retry(fallback)
            return fallback

        target_cfg = config_node if config_node else settings
        p_name = target_cfg.get('selectedProvider', settings.get('selectedProvider'))
        c_cls = get_client_class(settings, p_name)

        raw_client = c_cls(
            api_key=target_cfg.get('api_key') or settings.get('api_key', ''),
            base_url=target_cfg.get('base_url') or settings.get('base_url') or "https://api.openai.com/v1",
            http_client=global_http_client  # Use the shared client with explicit proxy handling
        )
        _wrap_client_chat_with_retry(raw_client)
        return raw_client

    if settings:
        client = create_model_client('main')
        reasoner_client = create_model_client('reasoner', settings.get('reasoner', {}))
        
        fast_cfg = settings.get('fast', {})
        if fast_cfg.get('enabled'):
            fast_client = create_model_client('fast', fast_cfg)
        else:
            fast_client = None
    else:
        client = AsyncOpenAI(http_client=global_http_client)
        reasoner_client = AsyncOpenAI(http_client=global_http_client)
        fast_client = AsyncOpenAI(http_client=global_http_client)
        _wrap_client_chat_with_retry(client)
        _wrap_client_chat_with_retry(reasoner_client)
        _wrap_client_chat_with_retry(fast_client)

    # --- Other initialization: ASR / MCP ---
    try:
        from py.sherpa_asr import _get_recognizer
        asyncio.get_running_loop().run_in_executor(None, _get_recognizer)
    except Exception as e:
        logger.error(f"Failed to start sherpa: {e}")

    try:
        from py.moss_tts import _get_moss_runtime
        # Load heavy local TTS in a worker thread; return None silently if the model is absent
        asyncio.get_running_loop().run_in_executor(None, _get_moss_runtime)
    except Exception as e:
        logger.error(f"MOSS TTS warm-up failed: {e}")

    # MCP initialization reuses global_http_client
    mcp_init_tasks = []

    async def init_mcp_with_timeout(server_name: str, server_config: dict, timeout=6.0, max_wait_failure=5.0):
        if server_config.get("disabled"):
            return server_name, None, "disabled"
        
        mcp_client = mcp_client_list.get(server_name) or McpClient()
        mcp_client_list[server_name] = mcp_client
        failure_event = asyncio.Event()
        first_error = None

        async def on_failure(msg: str):
            nonlocal first_error
            if first_error: return
            first_error = msg
            logger.error(f"MCP {server_name} failure: {msg}")
            settings.setdefault("mcpServers", {}).setdefault(server_name, {})["disabled"] = True
            mcp_client.disabled = True
            await mcp_client.close()
            failure_event.set()

        init_task = asyncio.create_task(mcp_client.initialize(server_name, server_config, on_failure_callback=on_failure))
        try:
            await asyncio.wait_for(init_task, timeout=timeout)
            try:
                await asyncio.wait_for(failure_event.wait(), timeout=max_wait_failure)
            except asyncio.TimeoutError:
                pass
            return server_name, (None if first_error else mcp_client), first_error
        except Exception as exc:
            return server_name, None, str(exc)
        finally:
            if not init_task.done(): init_task.cancel()

    async def check_results():
        for task in asyncio.as_completed(mcp_init_tasks):
            name, m_client, err = await task
            if err:
                settings['mcpServers'][name]['processingStatus'] = 'server_error'
            elif m_client:
                mcp_client_list[name] = m_client
        await save_settings(settings)
        await ws_manager.broadcast_settings_update(settings)

    if settings and settings.get('mcpServers'):
        mcp_init_tasks = [asyncio.create_task(init_mcp_with_timeout(k, v)) for k, v in settings['mcpServers'].items()]
        if mcp_init_tasks: asyncio.create_task(check_results())
    else:
        asyncio.create_task(ws_manager.broadcast_settings_update(settings or {}))

    # --- Startup complete ---
    print(f"REAL_PORT_FOUND:{PORT}", flush=True)
    yield

    # --- Shutdown ---
    print("System shutting down, cleaning up...")

    try:
        from py.local_app_control import cleanup_all
        await cleanup_all()
        print("[LocalAppControl] All CDP connections cleared")
    except Exception as e:
        print(f"[LocalAppControl] Failed to clear CDP connections: {e}")

    try:
        # Import process_manager according to the actual file layout
        # Assumes ProcessManager is defined in py/agent_tool.py
        from py.cli_tool import process_manager 
        
        print("Cleaning up tool-managed background processes...")
        await process_manager.kill_all()
    except Exception as e:
        print(f"Failed to clean up background processes: {e}")

    try:
        await asyncio.to_thread(sleep_guard.stop)
        print("🛡️ Sleep prevention stopped; normal system sleep policy restored")
    except Exception as e:
        print(f"Failed to stop sleep prevention: {e}")

    if scheduler_task:
        scheduler_task.cancel()
    try:
        if diary_engine_task:
            from py.diary_engine import global_diary_engine
            global_diary_engine.stop()
            diary_engine_task.cancel()
    except Exception as e:
        print(f"Failed to stop diary engine: {e}")
    from py.node_runner import node_mgr
    ext_ids = list(node_mgr.exts.keys())
    for ext_id in ext_ids:
        try: await node_mgr.stop(ext_id)
        except: pass

    if global_http_client:
        await global_http_client.aclose()
    print("All processes terminated.")


app = FastAPI(lifespan=lifespan)
pending_tool_approvals = PendingToolApprovals()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def cors_options_workaround(request: Request, call_next):
    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",   # Cache preflight for 24 hours
            }
        )
    return await call_next(request)

@app.middleware("http")
async def inject_steam_build_flag(request: Request, call_next):
    response = await call_next(request)
    if _is_steam_build and "text/html" in response.headers.get("content-type", ""):
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        body_str = body.decode("utf-8")
        body_str = body_str.replace("</head>", '<script>window.__IS_STEAM_BUILD__=true;</script></head>')
        headers = dict(response.headers)
        headers.pop("content-length", None)
        return HTMLResponse(content=body_str, status_code=response.status_code, headers=headers)
    return response

# --- Frontend static asset content versioning ---
# HTML is always revalidated; rewrite referenced JS, CSS and image URLs as
# "path.ext?v=<first 8 characters of content MD5>". Unchanged files keep their cached URLs;
# changed files receive new hashes and URLs, invalidating the old cache without a hard refresh.
# static/sw.js uses cache-first for versioned resources.
_ASSET_VERSION_CACHE = {}   # Absolute file path -> (mtime_ns, hash)
_ASSET_VERSION_RE = re.compile(r'(src|href)="([^"]+?\.(?:css|js|png|jpe?g|svg|gif|webp|ico|woff2?|ttf|eot|mp4|webm))([^"]*)"')

def _asset_version_hash(base_dir, url):
    if url.startswith(('http:', 'https:', '//', 'data:')):
        return ''
    clean = url.split('?', 1)[0].lstrip('/')
    if not clean:
        return ''
    fp = os.path.normpath(os.path.join(base_dir, clean.replace('/', os.sep)))
    if not fp.startswith(os.path.normpath(base_dir) + os.sep):
        return ''
    try:
        if not os.path.isfile(fp):
            return ''
        st = os.stat(fp)
    except OSError:
        return ''
    cached = _ASSET_VERSION_CACHE.get(fp)
    if cached and cached[0] == st.st_mtime_ns:
        return cached[1]
    try:
        with open(fp, 'rb') as f:
            h = hashlib.md5(f.read()).hexdigest()[:8]
    except OSError:
        return ''
    _ASSET_VERSION_CACHE[fp] = (st.st_mtime_ns, h)
    return h

@app.middleware("http")
async def inject_asset_versions(request: Request, call_next):
    response = await call_next(request)
    ctype = response.headers.get("content-type", "")
    if "text/html" not in ctype:
        return response
    # Do not version HTML under extension or upload mounts
    if request.url.path.startswith(("/ext", "/uploaded_files", "/tool_temp")):
        return response
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
    body_str = body.decode("utf-8")
    base_dir = os.path.join(base_path, "static")
    def _repl(m):
        url = m.group(2)
        h = _asset_version_hash(base_dir, url)
        if not h:
            return m.group(0)
        sep = '&' if '?' in m.group(3) else '?'
        return f'{m.group(1)}="{url}{sep}v={h}"'
    new_str = _ASSET_VERSION_RE.sub(_repl, body_str)
    headers = dict(response.headers)
    headers.pop("content-length", None)
    headers["Cache-Control"] = "no-cache"
    return HTMLResponse(content=new_str, status_code=response.status_code, headers=headers)

async def t(text: str) -> str:
    global locales
    settings = await load_settings()
    return locales.get("en-US", {}).get(text, text)


# Global asynchronous tool state
async_tools = {}
async_tools_lock = asyncio.Lock()

async def execute_tool(tool_id: str, tool_name: str, args: dict, settings: dict,user_prompt: str):
    try:
        results = await dispatch_tool(tool_name, args, settings)
        if isinstance(results, AsyncIterator):
            buffer = []
            async for chunk in results:
                buffer.append(chunk)
            results = "".join(buffer)
                
        if tool_name in ["query_knowledge_base"] and type(results) == list:
            from py.know_base import rerank_knowledge_base
            if settings["KBSettings"]["is_rerank"]:
                results = await rerank_knowledge_base(user_prompt,results)
            results = json.dumps(results, ensure_ascii=False, indent=4)
        async with async_tools_lock:
            async_tools[tool_id] = {
                "status": "completed",
                "result": results,
                "name": tool_name,
                "parameters": args,
            }
    except Exception as e:
        async with async_tools_lock:
            async_tools[tool_id] = {
                "status": "error",
                "result": str(e),
                "name": tool_name,
                "parameters": args,
            }

async def get_image_content(image_url: str) -> str:
    import hashlib
    settings = await load_settings()
    base64_image = await get_image_base64(image_url)
    media_type = await get_image_media_type(image_url)
    url= f"data:{media_type};base64,{base64_image}"
    image_hash = hashlib.md5(image_url.encode()).hexdigest()
    content = ""
    if settings['vision']['enabled']:
        # Read uploaded_files/{item['image_url']['hash']}.txt if present; otherwise call the vision API
        if os.path.exists(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt")):
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "r", encoding='utf-8') as f:
                content += f"\n\nImage information (URL: {image_url}, hash: {image_hash}):\n\n"+str(f.read())+"\n\n"
        else:
            images_content = [{"type": "text", "text": "Describe the image accurately, including any visible text, numbers, colors, shapes, sizes, positions, people, objects and setting."},{"type": "image_url", "image_url": {"url": url}}]
            client = AsyncOpenAI(api_key=settings['vision']['api_key'],base_url=settings['vision']['base_url'])
            
            extra = {}

            if settings['vision']['temperature'] !=1:
                extra['temperature'] = settings['vision']['temperature']
            
            response = await client.chat.completions.create(
                model=settings['vision']['model'],
                messages = [{"role": "user", "content": images_content}],
                **extra
            )
            content = f"\n\nImage information (URL: {image_url}, hash: {image_hash}):\n\n"+str(response.choices[0].message.content)+"\n\n"
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "w", encoding='utf-8') as f:
                f.write(str(response.choices[0].message.content))
    else:           
        # Read uploaded_files/{item['image_url']['hash']}.txt if present; otherwise call the vision API
        if os.path.exists(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt")):
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "r", encoding='utf-8') as f:
                content += f"\n\nImage information (URL: {image_url}, hash: {image_hash}):\n\n"+str(f.read())+"\n\n"
        else:
            images_content = [{"type": "text", "text": "Describe the image accurately, including any visible text, numbers, colors, shapes, sizes, positions, people, objects and setting."},{"type": "image_url", "image_url": {"url": url}}]
            client = AsyncOpenAI(api_key=settings['api_key'],base_url=settings['base_url'])
            
            extra = {}

            if settings['temperature'] !=1:
                extra['temperature'] = settings['temperature']
            
            response = await client.chat.completions.create(
                model=settings['model'],
                messages = [{"role": "user", "content": images_content}],
                **extra
            )
            content = f"\n\nImage information (URL: {image_url}, hash: {image_hash}):\n\n"+str(response.choices[0].message.content)+"\n\n"
            with open(os.path.join(UPLOAD_FILES_DIR, f"{image_hash}.txt"), "w", encoding='utf-8') as f:
                f.write(str(response.choices[0].message.content))
    return content

# Store pending MCP call results
mcp_call_results: Dict[str, asyncio.Future] = {}

async def call_node_extension_tool(ext_id: str, tool_name: str, tool_params: dict) -> str:
    """Call a Node extension tool over WebSocket."""
    import uuid
    
    call_id = str(uuid.uuid4())
    future = asyncio.Future()
    mcp_call_results[call_id] = future
    
    # Broadcast to connections to find the appropriate extension
    await ws_manager.broadcast({
        "type": "call_mcp_tool",
        "data": {
            "ext_id": ext_id,
            "tool_name": tool_name,
            "tool_params": tool_params,
            "call_id": call_id
        }
    })
    
    try:
        # Wait for the result with a 30-second timeout
        result = await asyncio.wait_for(future, timeout=30.0)
        return str(result)
    except asyncio.TimeoutError:
        return f"Extension {ext_id} tool {tool_name} timed out"
    finally:
        if call_id in mcp_call_results:
            del mcp_call_results[call_id]

async def dispatch_tool(tool_name: str, tool_params: dict, settings: dict,is_sub_agent:bool=False,force_allow: bool = False, approval_call_id: str | None = None) -> str | List | AsyncIterator[str] | None :
    global mcp_client_list,_TOOL_HOOKS,HA_client,ChromeMCP_client,sql_client, node_ext_mcp_clients, node_ext_mcp_tools
    print("dispatch_tool",tool_name,tool_params)
    
    from py.utility_tools import time
    # ==================== 1. Tool mapping ====================
    _TOOL_HOOKS = {
        "searxng": searxng,
        "Tavily_search": Tavily_search,
        "query_knowledge_base": query_knowledge_base,
        "jina_crawler": jina_crawler,
        "Crawl4Ai_search": Crawl4Ai_search,
        "firecrawl_search": firecrawl_search,
        "simple_fetch":simple_fetch,
        "markdown_new":markdown_new,
        "agent_tool_call": agent_tool_call,
        "a2a_tool_call": a2a_tool_call,
        "custom_llm_tool": custom_llm_tool,
        "get_file_content":get_file_content,
        "get_image_content": get_image_content,
        "e2b_code": e2b_code,
        "local_run_code": local_run_code,
        "openai_image": openai_image,
        "openai_chat_image":openai_chat_image,
        "Google_search": Google_search,
        "Brave_search": Brave_search,
        "Exa_search": Exa_search,
        "Serper_search": Serper_search,
            "youcom_search": youcom_search,
        "comfyui_tool_call": comfyui_tool_call,
        "time": time,
        "get_weather": get_weather,
        "get_location_coordinates": get_location_coordinates,
        "get_weather_by_city":get_weather_by_city,
        "get_wikipedia_summary_and_sections": get_wikipedia_summary_and_sections,
        "get_wikipedia_section_content": get_wikipedia_section_content,
        "search_arxiv_papers": search_arxiv_papers,
        "auto_behavior": auto_behavior,
        "query_diary": handle_query_diary,
        "list_diary_books": handle_list_diary_books,
        "list_pages": list_pages,
        "new_page": new_page,
        "close_page": close_page,
        "select_page": select_page,
        "navigate_page": navigate_page,
        "take_snapshot": take_snapshot,
        "click": click,
        "fill": fill,
        "evaluate_script": evaluate_script,
        "take_screenshot": take_screenshot,
        "hover": hover,
        "press_key": press_key,
        "wait_for": wait_for,
        "fill_form":fill_form,
        "drag": drag,
        "handle_dialog": handle_dialog,
        "click_by_text": click_by_text,
        "ext_list_apps": ext_list_apps,
        "ext_select_app": ext_select_app,
        "ext_refresh_targets": ext_refresh_targets,
        "ext_click": ext_click,
        "ext_fill": ext_fill,
        "ext_screenshot": ext_screenshot,
        "ext_snapshot": ext_snapshot,
        "ext_evaluate_script": ext_evaluate_script,
        "ext_hover": ext_hover,
        "ext_press_key": ext_press_key,
        "ext_wait_for": ext_wait_for,
        "ext_click_by_text": ext_click_by_text,
        
        # Docker sandbox tools
        "docker_sandbox": docker_sandbox,
        "list_files_tool": list_files_tool,
        "read_file_tool": read_file_tool,
        "read_file_range_tool": read_file_range_tool, # Map the range reader
        "tail_file_tool": tail_file_tool,             # Map the tail reader
        "search_files_tool": search_files_tool,
        "edit_file_tool": edit_file_tool,
        "edit_file_string_tool": edit_file_string_tool,
        "glob_files_tool": glob_files_tool,
        "todo_write_tool": todo_write_tool,
        "list_processes_tool": list_processes_tool,
        "get_process_logs_tool": get_process_logs_tool,
        "kill_process_tool": kill_process_tool,
        "docker_manage_ports_tool": docker_manage_ports_tool,
        "read_skill_tool": read_skill_tool,
        
        # Local environment tools: Docker-equivalent functions on the local filesystem
        "shell_tool_local": shell_tool_local,                     # Local bash execution
        "list_files_tool_local": list_files_tool_local,         # Local file listing
        "read_file_tool_local": read_file_tool_local,           # Local file reading
        "read_file_range_tool_local": read_file_range_tool_local, # Map the local range reader
        "tail_file_tool_local": tail_file_tool_local,             # Map the local tail reader
        "search_files_tool_local": search_files_tool_local,     # Local file search
        "edit_file_tool_local": edit_file_tool_local,           # Local file writing
        "edit_file_string_tool_local": edit_file_string_tool_local,  # Local string replacement
        "glob_files_tool_local": glob_files_tool_local,         # Local glob search
        "todo_write_tool_local": todo_write_tool_local,         # Local task management
        "local_net_tool": local_net_tool,                       # Local network tool
        "send_process_input_tool":send_process_input_tool,       # Local process input
        "read_skill_tool_local": read_skill_tool_local,         # Local skill reading
        
        # WSL sandbox tools (Windows only; reuse local file tools and run bash via wsl.exe)
        "shell_tool_wsl": shell_tool_wsl,                       # WSL bash execution

        # Task center tools
        "create_subtask": create_subtask,
        "query_task_progress": query_task_progress,
        "cancel_subtask": cancel_subtask,
        "finish_task":finish_task,
        "finish_main_task":finish_main_task,

        # Mouse and keyboard control
        "mouse_move":mouse_move,
        "mouse_click":mouse_click,
        "mouse_double_click":mouse_double_click,
        "mouse_drag":mouse_drag,
        "mouse_scroll":mouse_scroll,
        "mouse_hold":mouse_hold,
        "copy_to_input_box":copy_to_input_box,
        "keyboard_press":keyboard_press,
        "keyboard_sequence":keyboard_sequence,
        "keyboard_hotkey":keyboard_hotkey,
        "keyboard_hold":keyboard_hold,
        "logical_type":logical_type,
        "wait":wait,
        "screenshot":screenshot,
        "logical_click":logical_click,

        "update_workspace_settings":update_workspace_settings,
        "acpx_agent":acpx_agent,
    }

    if not _is_steam_build:
        _TOOL_HOOKS["DDGsearch"] = DDGsearch
        _TOOL_HOOKS["pollinations_image"] = pollinations_image
    
    if tool_name.startswith("multi_tool_use."):
        tool_name = tool_name.removeprefix("multi_tool_use.")

    # ==================== 3. Permission interception (human-in-the-loop) ====================
    # Define controlled sensitive tools
    # Check permissions (.agents/config.json or global settings) before execution
    SENSITIVE_TOOLS = [
        "docker_sandbox",
        "edit_file_tool",
        "edit_file_string_tool",
        "shell_tool_local",
        "edit_file_tool_local",
        "edit_file_string_tool_local",
        "list_processes_tool",
        "get_process_logs_tool",
        "kill_process_tool",
        "docker_manage_ports_tool",
        "local_net_tool",
        "send_process_input_tool",
    ]
    
    # Intercept only calls to sensitive tools
    if tool_name in SENSITIVE_TOOLS and not force_allow: # Check permissions unless explicitly force-allowed
        
        # Read relevant settings
        cli_settings = settings.get("CLISettings", {})
        cwd = cli_settings.get("cc_path")
        # The local environment must read its permission mode from localEnvSettings
        engine = cli_settings.get("engine", "")
        
        if engine == "local":
            env_settings = settings.get("localEnvSettings", {})
        elif engine == "ds":
            env_settings = settings.get("dsSettings", {})
        elif engine == "wsl":
            env_settings = settings.get("wslSettings", {})
        else:
            env_settings = settings.get("acpSettings", {})
        
        permission_mode = env_settings.get("permissionMode", "default")
        
        is_allowed = False

        # --- Rule A: global YOLO mode (bypass permissions) ---
        if permission_mode == "yolo" or permission_mode == "cowork" or permission_mode == "goal":
            is_allowed = True
            
        # --- Rule B: automatic approval mode (accept edits) ---
        # Allow file-editing tools, including full writes, exact replacements and task management
        # Still intercept terminal commands (Docker/bash)
        elif permission_mode == "auto-approve":
            if tool_name in ["edit_file_tool", "edit_file_string_tool", "todo_write_tool", "edit_file_tool_local", "edit_file_string_tool_local", "todo_write_tool_local"]:
                is_allowed = True
            # Dangerous Docker/bash commands remain intercepted unless on the project allowlist
        
        # --- Rule C: default mode ---
        # Intercept everything by default
        
        # --- Rule D: project allowlist override ---
        # If previous rules do not allow the call, check .agents/config.json
        # Returns True if the user previously selected "Allow Always"
        if not is_allowed and cwd:
            if is_tool_allowed_by_project_config(cwd, tool_name):
                is_allowed = True
                print(f"[Permission] Tool '{tool_name}' allowed by project config.")


        # --- Rule E: deny an unauthorized subagent directly ---
        if not is_allowed and is_sub_agent:
            return "permission_denied"
        
        # --- Final decision ---
        if not is_allowed:
            # Return the frontend JSON structure that opens the approval UI
            print(f"[Permission] Blocked '{tool_name}', requesting approval.")
            if not approval_call_id:
                return "Permission denied. Run this tool through an interactive approval session."
            approval_token = pending_tool_approvals.issue(approval_call_id, tool_name, tool_params, cwd)
            if approval_token is None:
                return "Tool approval is unavailable because too many approvals are pending."
            return json.dumps({
                "type": "approval_required",
                "approval_token": approval_token,
                "tool_name": tool_name,
                "tool_params": tool_params,
                "permission_mode": permission_mode,
                "cwd": cwd
            }, ensure_ascii=False)

    # ==================== 4. Standard tool handling ====================

    if "custom_http_" in tool_name:
        tool_name = tool_name.replace("custom_http_", "")
        print(tool_name)
        settings_custom_http = settings['custom_http']
        for custom in settings_custom_http:
            if custom['name'] == tool_name:
                tool_custom_http = custom
                break
        method = tool_custom_http['method']
        url = tool_custom_http['url']
        headers = tool_custom_http['headers']
        result = await fetch_custom_http(method, url, headers, tool_params)
        return str(result)
        
    if "comfyui_" in tool_name:
        tool_name = tool_name.replace("comfyui_", "")
        text_input = tool_params.get('text_input', None)
        text_input_2 = tool_params.get('text_input_2', None)
        image_input = tool_params.get('image_input', None)
        image_input_2 = tool_params.get('image_input_2', None)
        print(tool_name)
        result = await comfyui_tool_call(tool_name, text_input, image_input,text_input_2,image_input_2)
        return str(result)
        
    if settings["HASettings"]["enabled"]:
        ha_tool_list = HA_client._tools
        if tool_name in ha_tool_list:
            result = await HA_client.call_tool(tool_name, tool_params)
            if isinstance(result,str):
                return result
            elif hasattr(result, 'model_dump'):
                return str(result.model_dump())
            else:
                return str(result)
                
    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='external':
        Chrome_tool_list = ChromeMCP_client._tools
        if tool_name in Chrome_tool_list:
            result = await ChromeMCP_client.call_tool(tool_name, tool_params)
            if isinstance(result,str):
                return result
            elif hasattr(result, 'model_dump'):
                return str(result.model_dump())
            else:
                return str(result)
                
    if settings["sqlSettings"]["enabled"]:
        sql_tool_list = sql_client._tools
        if tool_name in sql_tool_list:
            result = await sql_client.call_tool(tool_name, tool_params)
            if isinstance(result,str):
                return result
            elif hasattr(result, 'model_dump'):
                return str(result.model_dump())
            else:
                return str(result)
                
    # ==================== 5. Special task center tool handling ====================
    if tool_name in ["create_subtask", "query_task_progress", "cancel_subtask", "finish_task", "finish_main_task"]:
        cli_settings = settings.get("CLISettings", {})
        cwd = cli_settings.get("cc_path")
        
        if tool_name == "create_subtask":
            # Read the consensus file if it exists
            from pathlib import Path
            import aiofiles
            
            consensus_content = None
            consensus_file = Path(cwd) / ".agents" / "consensus.md"
            if consensus_file.exists():
                async with aiofiles.open(consensus_file, 'r', encoding='utf-8') as f:
                    consensus_content = await f.read()
            
            result = await create_subtask(
                workspace_dir=cwd,
                settings=settings, 
                consensus_content=consensus_content,
                **tool_params  # Unpack AI-provided title, platforms and other arguments
            )
            return result

        
        elif tool_name == "query_task_progress":
            result = await query_task_progress(
                workspace_dir=cwd,
                **tool_params
            )
            return result
        
        elif tool_name == "cancel_subtask":
            result = await cancel_subtask(
                workspace_dir=cwd,
                task_id=tool_params.get("task_id")
            )
            return result
        elif tool_name == "finish_task":
            result = await finish_task(
                workspace_dir=cwd,
                task_id=tool_params.get("task_id"),
                result=tool_params.get("result"),
            )
            return result
        elif tool_name == "finish_main_task":
            result = await finish_main_task(
                result=tool_params.get("result", ""),
            )
            return result

    if tool_name not in _TOOL_HOOKS:
        # 1. Query standard MCP clients first
        for server_name, mcp_client in mcp_client_list.items():
            if hasattr(mcp_client, '_conn') and mcp_client._conn and tool_name in mcp_client._conn.tools:
                result = await mcp_client.call_tool(tool_name, tool_params)
                if isinstance(result, str):
                    return result
                elif hasattr(result, 'model_dump'):
                    return str(result.model_dump())
                else:
                    return str(result)
        
        # 2. Query Node extension MCP tools
        for ext_id, tools in node_ext_mcp_tools.items():
            for tool in tools:
                if tool['name'] == tool_name:
                    # Locate the corresponding extension and invoke it over WebSocket
                    return await call_node_extension_tool(ext_id, tool_name, tool_params)
        
        return None
        
    tool_call = _TOOL_HOOKS[tool_name]
    try:
        if tool_name in ("acpx_agent", "shell_tool_local", "docker_sandbox", "shell_tool_wsl"):
            return tool_call(**tool_params)

        ret_out = await tool_call(**tool_params)
        if tool_name == "auto_behavior":
            settings = ret_out
            await ws_manager.broadcast_settings_update(settings)
            ret_out = "Task configured successfully!"
        return ret_out
    except Exception as e:
        logger.error(f"Error calling tool {tool_name}: {e}")
        return f"Error calling tool {tool_name}: {e}"

def process_extra_params(extra_params_list):
    extra_body = {}
    for item in extra_params_list:
        name = item.get('name', '').strip()
        if not name:
            continue
            
        value = item.get('value')
        p_type = item.get('type')

        try:
            if p_type == 'json':  # Unified JSON type check
                if isinstance(value, str):
                    extra_body[name] = json.loads(value) if value.strip() else {}
                else:
                    extra_body[name] = value
            elif p_type == 'integer':
                extra_body[name] = int(value)
            elif p_type == 'float':
                extra_body[name] = float(value)
            elif p_type == 'boolean':
                extra_body[name] = bool(value)
            else:
                extra_body[name] = str(value)
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing param {name}: {e}")
            extra_body[name] = value 

    return extra_body

class ChatRequest(BaseModel):
    messages: List[Dict]
    model: str = None
    tools: dict = None
    stream: bool = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    top_p: float = 1
    fileLinks: List[str] = None
    enable_thinking: bool = False
    enable_deep_research: bool = False
    enable_web_search: bool = False
    asyncToolsID: List[str] = None
    reasoning_effort: str = None
    is_app_bot: bool = False
    platform: str = None
    is_sub_agent: bool = False
    enable_tools : List[str] = None
    disable_tools: List[str] = None
    conversation_id: Optional[Union[str, int, float]] = None
    group_id: Optional[Union[str, int, float]] = None
    user_message_id: Optional[Union[str, int, float]] = None

GROUP_MEMORY_TYPES = {"fact", "decision", "preference", "todo", "constraint", "glossary"}
GROUP_MEMORY_DONE_HINTS = ("\u5b8c\u6210", "\u5df2\u5b8c\u6210", "done", "resolved", "fixed", "closed")

def _extract_text_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
        return "\n".join(filter(None, texts))
    return ""

def _memory_tokens(text: str) -> set[str]:
    if not text:
        return set()
    tokens = re.findall(r'[\u4e00-\u9fff]{1,6}|[a-zA-Z0-9_]{2,}', text.lower())
    return set(tokens)

def _normalize_memory_text(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '').strip().lower())

def _normalize_entity_id(value: Optional[Union[str, int, float]]) -> str:
    if value is None:
        return ""
    return str(value).strip()

def _merge_group_memories(*memory_lists: list[dict]) -> list[dict]:
    merged: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for memory_list in memory_lists:
        for item in memory_list or []:
            if not isinstance(item, dict):
                continue
            memory_type = str(item.get("memory_type", "")).strip().lower()
            summary = str(item.get("summary", "")).strip()
            content = str(item.get("content", "")).strip()
            if memory_type not in GROUP_MEMORY_TYPES or not summary or not content:
                continue
            dedupe_key = (
                memory_type,
                _normalize_memory_text(summary),
                _normalize_memory_text(content),
            )
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            merged.append({
                "memory_type": memory_type,
                "summary": summary,
                "content": content,
                "importance": max(0.0, min(1.0, float(item.get("importance", 0.5) or 0.5))),
            })
    return merged

async def _load_group_map() -> dict:
    covs = await load_covs()
    groups = covs.get("conversationGroups", []) or []
    group_map = {"default": {"id": "default", "name": "Ungrouped", "memoryConfig": {}}}
    for group in groups:
        if group and group.get("id"):
            group_map[group["id"]] = group
    return group_map

async def _fetch_group_memories(group_id: str, query_text: str, top_k: int = 6) -> list[dict]:
    if not group_id:
        return []
    query_tokens = _memory_tokens(query_text)
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT * FROM group_memory
            WHERE group_id = ? AND status = 'active'
            ORDER BY updated_at DESC
            """,
            (group_id,),
        ) as cursor:
            rows = [dict(row) for row in await cursor.fetchall()]

    def score_memory(item: dict) -> float:
        text = f"{item.get('summary', '')}\n{item.get('content', '')}"
        overlap = len(query_tokens & _memory_tokens(text))
        importance = float(item.get("importance") or 0)
        recency = float(item.get("updated_at") or 0) / 1_000_000_000_000
        return overlap * 5 + importance * 2 + recency

    ranked = sorted(rows, key=score_memory, reverse=True)
    selected = ranked[:top_k]
    if selected:
        now_ts = int(time.time() * 1000)
        import aiosqlite
        async with aiosqlite.connect(COVS_PATH) as db:
            await db.executemany(
                "UPDATE group_memory SET last_used_at = ? WHERE id = ?",
                [(now_ts, item["id"]) for item in selected],
            )
            await db.commit()
    return selected

def _build_group_memory_prompt(group: dict, memories: list[dict]) -> str:
    if not memories:
        return ""
    header = [
        f"Current conversation group: {group.get('name') or group.get('id')}",
        "The following long-term memories are available only to this conversation group. Use them only when relevant; do not speculate or expand unconfirmed information.",
        "If a memory contains specific values, state those values directly instead of referring to the memory entry or using placeholders:",
    ]
    lines = []
    for idx, memory in enumerate(memories, 1):
        summary = str(memory.get('summary') or '').strip()
        content = str(memory.get('content') or '').strip()
        memory_type = memory.get('memory_type', 'fact')
        if summary and content and summary != content:
            lines.append(f"{idx}. [{memory_type}] Summary: {summary}")
            lines.append(f"   Details: {content}")
        else:
            lines.append(f"{idx}. [{memory_type}] {content or summary}")
    return "\n".join(header + lines)

def _trim_request_messages(messages: List[Dict], recent_count: int = 12) -> List[Dict]:
    system_messages = [copy.deepcopy(m) for m in messages if m.get("role") == "system"]
    dialog_messages = [copy.deepcopy(m) for m in messages if m.get("role") != "system"]
    retained = bounded_dialogue(dialog_messages, recent_count)
    if not system_messages and not retained:
        raise ContextHistoryError("No usable messages remain in the request.")
    if len(retained) < len(dialog_messages):
        # Counts and role flags only: never log the discarded conversation or tool output.
        logging.getLogger("app").info(
            "[MsgTrim] dialog=%d retained=%d dropped=%d user_retained=%s starts_with_tool=%s",
            len(dialog_messages), len(retained), len(dialog_messages) - len(retained),
            any(m.get("role") == "user" for m in retained),
            bool(retained and retained[0].get("role") == "tool"),
        )
    return system_messages + retained

async def _apply_group_memory_context(request: ChatRequest) -> dict:
    request.conversation_id = _normalize_entity_id(request.conversation_id) or None
    request.user_message_id = _normalize_entity_id(request.user_message_id) or None
    request.group_id = _normalize_entity_id(request.group_id) or "default"
    group_id = request.group_id or "default"
    if not group_id or group_id == "default":
        request.messages = _trim_request_messages(request.messages)
        return {"enabled": False, "group_id": group_id}

    group_map = await _load_group_map()
    group = group_map.get(group_id)
    memory_enabled = bool(group and (group.get("memoryConfig") or {}).get("enabled"))

    request.messages = _trim_request_messages(request.messages)
    if not memory_enabled:
        return {"enabled": False, "group_id": group_id, "group": group}

    last_user_text = ""
    for msg in reversed(request.messages):
        if msg.get("role") == "user":
            last_user_text = _extract_text_content(msg.get("content"))
            break

    memories = await _fetch_group_memories(group_id, last_user_text, top_k=6)
    memory_prompt = _build_group_memory_prompt(group or {"id": group_id, "name": group_id}, memories)
    if memory_prompt:
        content_append(request.messages,'system',memory_prompt)
    return {"enabled": memory_enabled, "group_id": group_id, "group": group, "memories": memories}

async def _extract_group_memories(client, settings: dict, payload: dict) -> list[dict]:
    user_message = (payload.get("user_message") or "").strip()
    assistant_message = (payload.get("assistant_message") or "").strip()
    if not user_message or not assistant_message:
        return []

    extraction_prompt = (
        "You extract structured memories. Extract only long-term information reusable in future conversations within the same group. "
        "Do not summarize the entire chat or retain small talk, speculation, emotional venting, uncertain information or duplicates. "
        "The only allowed memory_type values are fact, decision, preference, todo, constraint and glossary. "
        "Return a JSON array; every item must contain memory_type, content, summary and importance. "
        "importance ranges from 0 to 1. If there are no memories to extract, return []."
    )

    example_input = f"User message:\n{user_message}\n\nAssistant reply:\n{assistant_message}"

    def fallback_memories() -> list[dict]:
        combined = f"{user_message}\n{assistant_message}"
        results = []
        if any(keyword in combined.lower() for keyword in ["\u51b3\u5b9a", "\u91c7\u7528", "\u4f7f\u7528", "choose", "decide", "use "]):
            results.append({
                "memory_type": "decision",
                "summary": assistant_message[:120] or user_message[:120],
                "content": assistant_message or user_message,
                "importance": 0.82,
            })
        if any(keyword in combined.lower() for keyword in ["\u504f\u597d", "\u559c\u6b22", "prefer", "preferred"]):
            results.append({
                "memory_type": "preference",
                "summary": user_message[:120],
                "content": user_message,
                "importance": 0.72,
            })
        if any(keyword in combined.lower() for keyword in ["\u9650\u5236", "\u5fc5\u987b", "\u4e0d\u80fd", "constraint", "must", "cannot", "can't"]):
            results.append({
                "memory_type": "constraint",
                "summary": (user_message or assistant_message)[:120],
                "content": user_message or assistant_message,
                "importance": 0.78,
            })
        if any(keyword in combined.lower() for keyword in ["todo", "\u5f85\u529e", "\u540e\u7eed", "\u9700\u8981", "next"]):
            results.append({
                "memory_type": "todo",
                "summary": user_message[:120],
                "content": user_message,
                "importance": 0.68,
            })
        return _merge_group_memories(results)

    try:
        extra_params = settings.get('extra_params') or []
        extra_body = process_extra_params(extra_params)
        response = await client.chat.completions.create(
            model=settings['model'],
            messages=[
                {"role": "system", "content": extraction_prompt},
                {"role": "user", "content": example_input},
            ],
            temperature=0.1,
            stream=False,
            extra_body=extra_body,
        )
        content = response.choices[0].message.content or "[]"
        if "```json" in content:
            match = re.search(r'```json(.*?)```', content, re.DOTALL)
            content = match.group(1) if match else content.replace("```json", "").replace("```", "")
        data = json.loads(content)
    except Exception as e:
        logger.warning(f"Group memory extraction failed: {e}")
        return fallback_memories()

    if not isinstance(data, list):
        return []

    cleaned = []
    for item in data:
        if not isinstance(item, dict):
            continue
        memory_type = str(item.get("memory_type", "")).strip().lower()
        summary = str(item.get("summary", "")).strip()
        content = str(item.get("content", "")).strip()
        importance = float(item.get("importance", 0.5) or 0.5)
        if memory_type not in GROUP_MEMORY_TYPES or not summary or not content:
            continue
        cleaned.append({
            "memory_type": memory_type,
            "summary": summary,
            "content": content,
            "importance": max(0.0, min(1.0, importance)),
        })
    return _merge_group_memories(cleaned) or fallback_memories()

async def _upsert_group_memories(group_id: str, source_chat_id: str, source_message_id: str, memories: list[dict]) -> None:
    if not group_id or not source_chat_id or not memories:
        return
    now_ts = int(time.time() * 1000)
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        db.row_factory = aiosqlite.Row
        for memory in memories:
            normalized_summary = _normalize_memory_text(memory["summary"])
            normalized_content = _normalize_memory_text(memory["content"])
            async with db.execute(
                """
                SELECT * FROM group_memory
                WHERE group_id = ? AND memory_type = ? AND status = 'active'
                """,
                (group_id, memory["memory_type"]),
            ) as cursor:
                existing_rows = [dict(row) for row in await cursor.fetchall()]

            duplicate = None
            superseded_ids = []
            for row in existing_rows:
                row_summary = _normalize_memory_text(row.get("summary"))
                row_content = _normalize_memory_text(row.get("content"))
                if row_summary == normalized_summary or row_content == normalized_content:
                    duplicate = row
                    break
                if (
                    memory["memory_type"] in {"decision", "preference", "constraint", "todo"}
                    and (normalized_summary in row_summary or row_summary in normalized_summary)
                ):
                    superseded_ids.append(row["id"])

            if memory["memory_type"] == "todo" and any(hint in normalized_content for hint in GROUP_MEMORY_DONE_HINTS):
                superseded_ids.extend([row["id"] for row in existing_rows if row["memory_type"] == "todo"])
                continue

            if duplicate:
                await db.execute(
                    """
                    UPDATE group_memory
                    SET importance = MAX(importance, ?), updated_at = ?, last_used_at = ?
                    WHERE id = ?
                    """,
                    (memory["importance"], now_ts, now_ts, duplicate["id"]),
                )
                continue

            if superseded_ids:
                await db.executemany(
                    "UPDATE group_memory SET status = 'superseded', updated_at = ? WHERE id = ?",
                    [(now_ts, item_id) for item_id in superseded_ids],
                )

            await db.execute(
                """
                INSERT INTO group_memory (
                    id, group_id, source_chat_id, source_message_id, memory_type, content, summary,
                    importance, status, version, created_at, updated_at, last_used_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    group_id,
                    source_chat_id,
                    source_message_id,
                    memory["memory_type"],
                    memory["content"],
                    memory["summary"],
                    memory["importance"],
                    now_ts,
                    now_ts,
                    now_ts,
                    json.dumps({"normalized_summary": normalized_summary}, ensure_ascii=False),
                ),
            )
        await db.commit()

async def _invalidate_group_memories_by_chat(source_chat_id: str) -> None:
    if not source_chat_id:
        return
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute(
            "DELETE FROM group_memory WHERE source_chat_id = ?",
            (source_chat_id,),
        )
        await db.commit()

async def _invalidate_group_memories_by_group(group_id: str) -> None:
    if not group_id:
        return
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute(
            "DELETE FROM group_memory WHERE group_id = ?",
            (group_id,),
        )
        await db.commit()

async def _invalidate_all_group_memories() -> None:
    import aiosqlite
    async with aiosqlite.connect(COVS_PATH) as db:
        await db.execute(
            "DELETE FROM group_memory",
        )
        await db.commit()

async def message_without_images(messages: List[Dict]) -> List[Dict]:
    if messages:
        for message in messages:
            if 'content' in message:
                if isinstance(message['content'], list):
                    for item in message['content']:
                        # Strip image and video content, retaining text for quick generation or media-free requests
                        if isinstance(item, dict) and item.get('type') == 'text':
                            message['content'] = item['text']
                            break
    return messages

async def images_in_messages(messages: List[Dict], fastapi_base_url: str) -> List[Dict]:
    media_items = []
    index = 0
    for message in messages:
        extracted_media =[]
        if 'content' in message:
            if isinstance(message['content'], list):
                for item in message['content']:
                    # Dynamically capture images or videos
                    if isinstance(item, dict) and item.get('type') in ['image_url', 'video_url']:
                        media_key = item['type']  # 'image_url' or 'video_url'
                        
                        if item[media_key]["url"].startswith("http"):
                            media_url = item[media_key]["url"]
                            if fastapi_base_url in media_url:
                                media_url = media_url.replace(fastapi_base_url, f"http://127.0.0.1:{PORT}/")
                            
                            # Assumes get_image_base64 can also encode video
                            base64_data = await get_image_base64(media_url)
                            # Assumes get_image_media_type also returns video/mp4, video/webm, etc.
                            mime_type = await get_image_media_type(media_url)
                            
                            item[media_key]["url"] = f"data:{mime_type};base64,{base64_data}"
                            item[media_key]["hash"] = hashlib.md5(item[media_key]["url"].encode()).hexdigest()
                        else:
                            item[media_key]["hash"] = hashlib.md5(item[media_key]["url"].encode()).hexdigest()

                        extracted_media.append(item)
        if extracted_media:
            # Preserve the existing dictionary structure; images actually contains media
            media_items.append({'index': index, 'images': extracted_media})
        index += 1
    return media_items

async def images_add_in_messages(request_messages: List[Dict], images: List[Dict], settings: dict) -> List[Dict]:
    messages = copy.deepcopy(request_messages)
    
    if settings['vision']['enabled']:
        for image in images:
            index = image['index']
            if index < len(messages):
                if 'content' in messages[index]:
                    for item in image['images']:
                        media_key = item['type']  # 'image_url' or 'video_url'
                        file_hash = item[media_key]['hash']
                        media_name = "video" if media_key == "video_url" else "image"
                        
                        # Use the same cache handling; video entries contain video interpretation text
                        cache_file = os.path.join(UPLOAD_FILES_DIR, f"{file_hash}.txt")
                        if os.path.exists(cache_file):
                            with open(cache_file, "r", encoding='utf-8') as f:
                                messages[index]['content'] += f"\n\nsystem: The user provided a {media_name} (file hash: {file_hash}); its content is described below:\n\n{f.read()}\n\n"
                        else:
                            # Adjust instructions based on input type
                            prompt_text = "Describe the video accurately, including events, changes in scenes, people's actions and key details." if media_key == "video_url" else "Describe the image accurately, including any visible text, numbers, colors, shapes, sizes, positions, people, objects and setting."
                            
                            media_content =[
                                {"type": "text", "text": prompt_text},
                                {"type": media_key, media_key: {"url": item[media_key]['url']}}
                            ]
                            
                            # Pass directly to the vision model, which must support video natively
                            client = AsyncOpenAI(api_key=settings['vision']['api_key'], base_url=settings['vision']['base_url'])
                            
                            extra = {}

                            if settings['vision']['temperature'] !=1:
                                extra['temperature'] = settings['vision']['temperature']

                            response = await client.chat.completions.create(
                                model=settings['vision']['model'],
                                messages=[{"role": "user", "content": media_content}],
                                **extra
                            )
                            result_text = str(response.choices[0].message.content)
                            messages[index]['content'] += f"\n\nsystem: The user provided a {media_name} (file hash: {file_hash}); its content is described below:\n\n{result_text}\n\n"
                            
                            with open(cache_file, "w", encoding='utf-8') as f:
                                f.write(result_text)
    else:           
        for image in images:
            index = image['index']
            if index < len(messages):
                if 'content' in messages[index]:
                    for item in image['images']:
                        media_key = item['type']  # 'image_url' or 'video_url'
                        file_hash = item[media_key]['hash']
                        media_name = "video" if media_key == "video_url" else "image"
                        
                        cache_file = os.path.join(UPLOAD_FILES_DIR, f"{file_hash}.txt")
                        if os.path.exists(cache_file):
                            with open(cache_file, "r", encoding='utf-8') as f:
                                messages[index]['content'] += f"\n\nsystem: The user provided a {media_name} (file hash: {file_hash}); its content is described below:\n\n{f.read()}\n\n"
                        else:
                            if isinstance(messages[index]['content'], str):
                                messages[index]['content'] =[{"type": "text", "text": messages[index]['content']}]
                            
                            # Without a separate vision model, pass native video_url or image_url to the main model
                            messages[index]['content'].append({"type": media_key, media_key: {"url": item[media_key]['url']}})
                            
    return messages

async def read_todos_local(cwd: str) -> list:
    """Read local to-do items across platforms."""
    todo_file = Path(cwd) / ".agents" / "ai_todos.json"
    if not todo_file.exists():
        return []
    
    try:
        async with aiofiles.open(todo_file, 'r', encoding='utf-8') as f:
            content = await f.read()
            return json.loads(content) if content else []
    except (json.JSONDecodeError, FileNotFoundError):
        return []
    except Exception as e:
        print(f"Error reading todos: {e}")
        return []

async def read_agents_md(cwd: str) -> str:  # Returns str rather than list
    """Read the local AGENTS.md file."""
    agents_md_path = Path(cwd) / ".agents" / "AGENTS.md"
    
    if not agents_md_path.exists():
        return ""
    
    try:
        async with aiofiles.open(agents_md_path, 'r', encoding='utf-8') as f:
            content = await f.read()
            return content
    except FileNotFoundError:
        # The file may have been removed after the existence check
        return ""
    except Exception as e:
        print(f"Error reading AGENTS.md: {e}")
        return ""

def get_system_context() -> str:
    """
    Describe the current system environment to help the model use appropriate commands and paths.
    """
    system = platform.system()
    release = platform.release()
    
    # Detect the shell
    if system == "Windows":
        shell = "PowerShell"
        path_hint = "Use Windows paths (C:\\Users\\name\\file) and commands such as dir, copy and del"
        command_hint = f"The current shell is {shell}. Prefer PowerShell cmdlets (Get-ChildItem, Get-Content, Remove-Item); some CMD commands are also supported. Avoid Unix commands (ls/cat/rm)."
    elif system == "Darwin":
        shell = os.path.basename(os.environ.get('SHELL', '/bin/zsh'))
        path_hint = "Use case-sensitive Unix paths (such as /Users/name/file)"
        command_hint = f"Running macOS ({release}) with {shell}. Standard Unix commands (ls/cat/rm) are supported, but some are BSD rather than GNU versions."
    else:  # Linux
        shell = os.path.basename(os.environ.get('SHELL', '/bin/bash'))
        path_hint = "Use case-sensitive Unix paths (such as /home/name/file)"
        command_hint = f"Running Linux ({release}) with {shell}. Standard GNU commands and tools are supported."
    
    return f"""[Host environment] OS: {system} {release} | Shell: {shell}

Important:
1. {path_hint}
2. {command_hint}
3. Commands passed to shell_tool_local must follow the host operating system syntax.
4. Windows paths use backslashes (\\); Unix paths use forward slashes (/).
5. Prefer nonstandard temporary ports above 10000 to reduce conflicts.
6. Prefer relative paths for portability.
7. Do not operate on files outside the workspace without explicit authorization.
"""


async def get_project_skills_summary(cwd: str, visibility_scope: str = "workspace") -> str:
    """
    Return a summary of project skills according to visibility scope.
    
    Args:
        cwd: current working directory
        visibility_scope: "global", "workspace", or "none"
    
    Returns:
        Skill summary string
    """
    # Return an empty string when visibility is set to "none"
    if visibility_scope == "none":
        return ""
    
    # Choose the skill directory based on visibility
    if visibility_scope == "workspace":
        # Workspace skills: find them in .agents/skills in the project
        skills_root = Path(cwd) / ".agents" / "skills"
        scope_name = "Workspace"
    elif visibility_scope == "global":
        # Global skills: find them in SKILLS_DIR
        skills_root = Path(SKILLS_DIR)
        scope_name = "Global"
    else:
        # Return empty for unknown scope
        return ""
    
    # Check that the skills directory exists
    if not skills_root.exists() or not skills_root.is_dir():
        return ""

    found_skills_blocks = []
    for skill_dir in sorted(skills_root.iterdir()):
        if skill_dir.is_dir():
            skill_id = skill_dir.name
            doc_file_path = None
            for name in ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]:
                if (skill_dir / name).exists():
                    doc_file_path = skill_dir / name
                    break
            
            yaml_meta = ""
            if doc_file_path:
                try:
                    content = doc_file_path.read_text(encoding='utf-8')
                    if content.startswith("---"):
                        parts = content.split("---", 2)
                        if len(parts) >= 3: 
                            yaml_meta = parts[1].strip()
                except Exception:
                    pass

            skill_info = f"- **{skill_id}**"
            if yaml_meta:
                skill_info += f":\n```yaml\n{yaml_meta}\n```"
            else:
                skill_info += " (available)"
            found_skills_blocks.append(skill_info)

    if not found_skills_blocks:
        return ""

    # Return a summary appropriate to the visibility scope
    summary = f"\n\n🛠️ **{scope_name} skills**：\n"
    
    if visibility_scope == "workspace":
        summary += "The following project-specific agent skills are available in this workspace:\n\n"
    elif visibility_scope == "global":
        summary += "These global agent skills are available across projects:\n\n"
    
    summary += "\n".join(found_skills_blocks)
    summary += "\n\n*Tip: use the skill-reading tool to inspect a skill directory and read its full instructions.*"
    
    return summary

async def tools_change_messages(request: ChatRequest, settings: dict):
    global HA_client, ChromeMCP_client, sql_client
    
    if request.messages and request.messages[0]['role'] == 'system' and request.messages[0]['content'] != '':
        basic_message = " "
        request.messages[0]['content'] += basic_message

    cli_settings = settings.get("CLISettings", {})
    cwd = cli_settings.get("cc_path")
    visibilityScope = cli_settings.get("visibilityScope", "workspace")
    engine = cli_settings.get("engine", "")
    
    if engine == "local":
        env_settings = settings.get("localEnvSettings", {})
    elif engine == "ds":
        env_settings = settings.get("dsSettings", {})
    elif engine == "wsl":
        env_settings = settings.get("wslSettings", {})
    else:
        env_settings = settings.get("acpSettings", {})
    
    permissionMode = env_settings.get("permissionMode", "default")
    
    # ==================== Fixed capabilities and rules (system message, stable across turns) ====================
    # Append fixed rules rather than prepend TTS rules, preserving the cached prefix.

    # Platform information (fixed)
    if request.is_app_bot and request.platform:
        platform_message = f"\n\nThe user is communicating through {request.platform}.\n\n"
        content_append(request.messages, 'system', platform_message)

    # Permission mode instructions (fixed)
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False):
        permission_message = ""
        if permissionMode != "plan" and permissionMode != "cowork" and permissionMode != "goal":
            permission_message = "You are in execution mode. Use only the tools you need and respect their permission boundaries. Prefer dedicated safer tools over shell commands."
            content_append(request.messages, 'system', permission_message)
        elif permissionMode == "goal":
            if not request.is_sub_agent:
                permission_message += "You are in goal completion mode. Delegate bounded independent work using create_subtask when useful, subject to tool permissions. When the main task is complete, call finish_main_task with a detailed final summary. Do not stop without marking it complete.\n\n"
                content_append(request.messages, 'system', permission_message)
                if request.is_app_bot and request.platform:
                    task_platform_message = f"\n\nWhen using create_subtask, set the platforms parameter to [{request.platform}] so the user receives the result.\n\n"
                    content_append(request.messages, 'system', task_platform_message)
                else:
                    task_platform_message = f"\n\nWhen using create_subtask, set the platforms parameter to ['chat'] so the local client receives the result.\n\n"
                    content_append(request.messages, 'system', task_platform_message)
            else:
                permission_message = "You are in execution mode. Use only the tools you need and respect their permission boundaries. Prefer dedicated safer tools over shell commands."
                content_append(request.messages, 'system', permission_message)
        elif permissionMode == "cowork":
            if not request.is_sub_agent:
                permission_message += "You are in collaborative mode. You may delegate bounded work such as research, coding or reports to create_subtask. Break down difficult tasks as appropriate; use query_task_progress to check assigned work and retrieve detailed results.\n\n"
                content_append(request.messages, 'system', permission_message)
                if request.is_app_bot and request.platform:
                    task_platform_message = f"\n\nWhen using create_subtask, set the platforms parameter to [{request.platform}] so the user receives the result.\n\n"
                    content_append(request.messages, 'system', task_platform_message)
                else:
                    task_platform_message = f"\n\nWhen using create_subtask, set the platforms parameter to ['chat'] so the local client receives the result.\n\n"
                    content_append(request.messages, 'system', task_platform_message)
            else:
                permission_message = "You are in execution mode. Use only the tools you need and respect their permission boundaries. Prefer dedicated safer tools over shell commands."
                content_append(request.messages, 'system', permission_message)
        else:
            permission_message = "You are in planning mode. Inspect the project using read-only tools, describe a plan in plain English, and wait for the user's approval before modifying anything."
            content_append(request.messages, 'system', permission_message)

    # Docker environment information (static)
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine == "ds":
        system_context = """[Runtime environment] Operating system: Linux | Shell: bash

This is a Docker environment. Use standard Linux commands and paths.
- docker_sandbox commands must use Linux shell syntax.
- Unix paths use forward slashes (/). Prefer relative paths.
- Available languages and runtimes: Python, pip, uv, Node.js, npm, npx, Go, Perl.
- Version control: git and GitHub CLI (gh).
- Package management: pip/pip3, uv, npm/npx, apt-get/dpkg.
- Text tools: jq, awk, sed, grep, cat, less, more, head, tail.
- File tools: tar, unzip, rsync, ls, cp, mv, rm, mkdir, chmod.
- Shell and system tools: bash, make, which, whereis.
- Networking and security: curl, openssl, gpg.
- Monitoring: top, ps, free, df, du.
"""
        content_append(request.messages, 'system', system_context)

    # Autonomous behavior instructions (fixed)
    if request.messages[-1]['role'] == 'system' and settings['tools']['autoBehavior']['enabled'] and not request.is_app_bot and not request.is_sub_agent:
        language_message = f"\n\nA system message inserted between turns may be a scheduled-behavior trigger. Treat it as a task that is now due, such as reminding the user about a meeting when the scheduled reminder arrives.\n\n"
        content_append(request.messages, 'system', language_message)

    # Desktop screenshot instructions (fixed)
    if settings['vision']['desktopVision'] and not request.is_app_bot and not request.is_sub_agent:
        desktop_message = "\n\nAn image sent by the user may be a screenshot of their desktop.\n\n"
        content_append(request.messages, 'system', desktop_message)

    # Reasoning instruction (fixed); retain user-message prefix behavior
    if settings['tools']['inference']['enabled']:
        inference_message = "Think through the question before answering the user. Put your reasoning between <think> and </think>.\n\n"
        content_prepend(request.messages, 'user', f"{inference_message}\n\nUser:")

    # Formula formatting (fixed)
    if settings['tools']['formula']['enabled']:
        latex_message = "\n\nWhen writing LaTeX, use ['$', '$']  as inline delimiters and ['$$', '$$']  as display delimiters.\n\n"
        content_append(request.messages, 'system', latex_message)

    # Language requirement (fixed)
    if settings['tools']['language']['enabled']:
        language_message = f"Respond in {settings['tools']['language']['language']} only, using a {settings['tools']['language']['tone']} tone.\n\n"
        content_append(request.messages, 'system', language_message)

    # Sticker pack (fixed)
    if settings["stickerPacks"]:
        have_stickerPack = False
        for stickerPack in settings["stickerPacks"]:
            if stickerPack["enabled"]:
                sticker_message = f"\n\nSticker collection: {stickerPack['name']}; available images: {json.dumps(stickerPack['stickers'])}\n\n"
                content_append(request.messages, 'system', sticker_message)
                have_stickerPack = True
        if have_stickerPack:
            content_append(request.messages, 'system', "\n\nWhen using an image, put its URL in a Markdown image tag, for example:\n\n<silence>![image name](image_url)</silence>\n\nPut the image Markdown on its own line. The <silence> and </silence> tags exclude the image from text-to-speech synthesis.\n\nWrap image Markdown in <silence> tags in your reply.\n\nDo not insert spaces or line breaks between the silence tags and the Markdown; doing so prevents parsing.\n\n")

    # Text-to-image rules (fixed)
    if settings['text2imgSettings']['enabled']:
        text2img_messages = "\n\nAfter using an image generation tool, put the image URL in a Markdown image tag, for example:\n\n<silence>![image name](image_url)</silence>\n\nPut the image Markdown on its own line and include it in your reply; the user cannot see the tool result directly. The <silence> and </silence> tags exclude images from text-to-speech synthesis.\n\nWrap image Markdown in <silence> tags.\n\nDo not insert spaces or line breaks between the tags and the Markdown; doing so prevents parsing.\n\n"
        content_append(request.messages, 'system', text2img_messages)

    # VRM expressions (fixed)
    if settings['VRMConfig']['enabledExpressions'] and not request.is_app_bot and not request.is_sub_agent:
        Expression_messages = ("\n\nUse the following facial expression tags: <happy> <angry> <sad> <neutral> <surprised> <relaxed>. "
            "Place a tag at the beginning of the sentence it affects, immediately after any voice tag. "
            "For example: <angry>I am upset. <surprised>Oh! <happy>That makes me happy. "
            "The tag and the sentence must be on the same line. Newlines between a tag and its sentence prevent it from taking effect.")
        content_append(request.messages, 'system', Expression_messages)

    # VRM motions (fixed)
    if settings['VRMConfig']['enabledMotions'] and not request.is_app_bot and not request.is_sub_agent:
        motions = settings['VRMConfig']['defaultMotions'] + settings['VRMConfig']['userMotions']
        motion_tags = [f"<{m.get('name','')}>" for m in motions]
        print(motion_tags)
        Motion_messages = (
            "\n\nAvailable motion tags: " + ", ".join(motion_tags) +
            "\n\nPlace a motion tag at the start of the sentence it affects, immediately after any voice tag. "
            "For example: <scratchHead>I am confused. <playFingers>Oh! <akimbo>I am ready. "
            "Keep the motion tag and sentence on the same line; do not separate them with a newline."
        )
        content_append(request.messages, 'system', Motion_messages)

    # THA expressions and motions (fixed)
    if settings.get('THAConfig', {}).get('enabledEmotions') and not request.is_app_bot and not request.is_sub_agent:
        from py.tha_engine import THA_MOTIONS
        motion_names = list(THA_MOTIONS.keys())
        motion_tags = [f"<{m}>" for m in motion_names]
        # VRM expressions are matched by bare tag name; weighted tags such as happy:0.6 are not recognized.
        # Therefore do not inject weighted or fine-grained syntax when VRM expressions are enabled.
        vrm_expressions_active = bool(settings.get('VRMConfig', {}).get('enabledExpressions'))
        fine_control_enabled = bool(settings.get('THAConfig', {}).get('enabledFineControl'))

        tha_prompt_base = (
            "\\n\\nControl avatar facial expressions and movements with these tags:\\n"
            "[Emotion tags] <happy> <angry> <sad> <neutral> <surprised> <relaxed>\\n"
            f"[Motion tags] {', '.join(motion_tags)}\\n\\n"
            "Place a tag at the start of the spoken sentence, after any voice tag. Example:\\n"
            "<angry>I am upset. <surprised>Oh! <happy>That is great! <nod>Understood.\\n\\n"
        )
        tha_prompt_weights = (
            "[Emotion intensity and blending] Use <emotion:intensity> with an intensity from 0 to 1.\\n"
            "- <happy:0.3> subtle smile.\\n"
            "- <happy:0.5><surprised:0.4> cheerful surprise.\\n"
            "- <sad:0.3><angry:0.2> sadness with mild frustration.\\n"
            "Use 0.2–0.4 for subtle feelings, 0.5–0.7 for clear feelings, and 0.8–1.0 for strong feelings.\\n"
            "An unweighted tag such as <happy> has intensity 1.0.\\n\\n"
        )
        tha_prompt_fine_control = (
            "[Fine-grained expression controls] Combine weighted facial features if a preset emotion is insufficient.\\n"
            "Brows: <eyebrow_troubled> <eyebrow_angry> <eyebrow_raised> <eyebrow_happy> <eyebrow_lowered> <eyebrow_serious>\\n"
            "Eyes: <eye_happy> (smiling eyes) <eye_surprised> <eye_relaxed> <eye_unimpressed> <eye_wink> <wink_left> <wink_right> <eye_lower_eyelid> <iris_small>\\n"
            "Mouth: <mouth_smile> <mouth_frown> <mouth_open> <mouth_grin> <mouth_eee> <mouth_ooo> <mouth_smirk>\\n"
            "For a smile with an open mouth, combine mouth_open with mouth_smile.\\n"
            "Subtle expression examples:\\n"
            "- Awkward smile: <eyebrow_troubled:0.6><eye_relaxed:0.2><mouth_smile:0.4>\\n"
            "- Playful smile: <eye_happy:0.5><mouth_open:0.45><mouth_smile:0.7><eyebrow_raised:0.4>\\n"
            "- Smug look: <eyebrow_raised:0.7><mouth_smirk:0.6><eye_lower_eyelid:0.3>\\n"
            "- Unimpressed look: <eye_unimpressed:0.8><eyebrow_lowered:0.4><mouth_frown:0.2>\\n"
            "Intensity 0.3–0.6 is usually enough; use values near 1.0 for extreme expressions.\\n"
            "Conflicting features are blended by the avatar controller.\\n\\n"
        )
        tha_prompt_rules = (
            "Rules:\\n"
            "1. Emotion tags persist until a different emotion tag appears.\\n"
            "2. Motion tags apply to the current sentence only.\\n"
            "3. Motion and emotion can be combined, such as <happy:0.6><nod>Excellent!\\n"
            "4. Keep tags on the same line as their target sentence.\\n\\n"
        )
        # Assemble prompt segments as (enabled condition, segment); append new syntax segments here
        tha_prompt_sections = [
            (True, tha_prompt_base),
            (not vrm_expressions_active, tha_prompt_weights),
            (fine_control_enabled and not vrm_expressions_active, tha_prompt_fine_control),
            (True, tha_prompt_rules),
        ]
        THA_Expression_messages = "".join(part for enabled, part in tha_prompt_sections if enabled)
        content_append(request.messages, 'system', THA_Expression_messages)

    # TTS rules (fixed); append rather than prepend
    newttsList = []
    Narrator_label = "Narrator"
    if settings['ttsSettings']['enabled'] and not request.is_sub_agent:
        # Get the character name
        cur_memory_tts = None
        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"]:
            memoryId = settings["memorySettings"]["selectedMemory"]
            for memory in settings["memories"]:
                if memory["id"] == memoryId:
                    cur_memory_tts = memory
                    break
        selectedMemoryName_tts = cur_memory_tts["name"] if cur_memory_tts else settings["memorySettings"]["selectedMemory"]

        if settings['ttsSettings']['newtts'] and settings['memorySettings']['is_memory'] and not request.is_app_bot:
            for key in settings['ttsSettings']['newtts']:
                if settings['ttsSettings']['newtts'][key]['enabled']:
                    newttsList.append(key)
            if newttsList:
                finalttsList = ["<silence>"]
                if selectedMemoryName_tts in newttsList:
                    finalttsList.append("<"+selectedMemoryName_tts+">")
                if "Narrator" in newttsList:
                    finalttsList.append("<Narrator>")
                    Narrator_label = "Narrator"
                if "\u65c1\u767d" in newttsList:
                    finalttsList.append("<\u65c1\u767d>")
                    Narrator_label = "\u65c1\u767d"

                finalttsList = json.dumps(finalttsList, ensure_ascii=False, indent=4)
                print("Available voices:",finalttsList)
                
                newtts_messages = f"""
The response will be converted to speech using TTS.

Available voice tags:
{finalttsList}

Wrap any text to be spoken using a listed voice in matching XML-like tags: <VoiceName>spoken text</VoiceName>.
Voice tags must be paired, must not nest, and must exactly match the configured voice name. Non-English voice names also work.
If the character has an assigned voice, wrap their dialogue in that voice tag. Use the narrator voice for narration.

Example:
<{Narrator_label}>At three o\u0027clock, she said:</{Narrator_label}><{selectedMemoryName_tts}>What a lovely day!</{selectedMemoryName_tts}><silence>(She smiles.)</silence>

Text inside <silence>...</silence> is not synthesized. Use silence tags for image Markdown and other non-spoken material, not ordinary dialogue.
Image Markdown must be on a line by itself, directly within the tags without internal newlines or extra spaces:
<silence>![Example](https://example.com/example.png)</silence>
An image with extra newlines inside these tags will not be displayed correctly by the current UI.
Use only the active character voice and narrator voice unless another listed voice is explicitly appropriate.
"""
                content_append(request.messages, 'system', newtts_messages)  # Append rather than prepend
        else:
            tts_messages = f"""
The response will be synthesized as speech by TTS.
The text inside <silence>...</silence> is excluded from speech synthesis.
Use silence tags sparingly for image Markdown, URLs or other non-spoken content. Unnecessary tags can slow synthesis.
To display an image, put this complete sequence on its own line with no extra spaces or newlines inside the tags:
<silence>![Example](https://example.com/example.png)</silence>
"""
            content_append(request.messages, 'system', tts_messages)  # Append rather than prepend

    # A2UI capability (fixed, long content at the end of the fixed section)
    if settings['tools']['a2ui']['enabled'] and not request.is_app_bot and not request.is_sub_agent:
        A2UI_messages = """
You can optionally render interactive A2UI widgets in addition to natural-language replies.
Prefer plain text, Markdown tables, or ordinary code blocks for simple responses; use widgets only for useful interaction.

# Output rules
Wrap exactly one valid JSON widget inside a ```a2ui ... ``` code fence.
Never nest Markdown fenced code inside A2UI JSON strings. To display code inside a widget, use Code.
Use case-sensitive "type", "props", and optional "children" fields.

# Supported components and properties
- Text: { "type": "Text", "props": { "content": "Markdown text" } }
- Code: { "type": "Code", "props": { "content": "print(42)", "language": "python" } }
- Table: { "type": "Table", "props": { "headers": ["Name", "Value"], "rows": [["Example", "42"]] } }
- Alert: { "type": "Alert", "props": { "title": "Notice", "content": "Message", "variant": "info" } }
- Divider: { "type": "Divider" }
- Group: { "type": "Group", "title": "Optional title", "children": [] }
- Card: { "type": "Card", "props": { "title": "Settings", "content": "Optional Markdown" }, "children": [] }
- Input: { "type": "Input", "props": { "label": "Name", "key": "name", "placeholder": "Enter name" } }
- Slider: { "type": "Slider", "props": { "label": "Temperature", "key": "temperature", "min": 0, "max": 2, "step": 0.1 } }
- Switch: { "type": "Switch", "props": { "label": "Stream", "key": "stream" } }
- Rate: { "type": "Rate", "props": { "label": "Rating", "key": "rating" } }
- DatePicker: { "type": "DatePicker", "props": { "label": "Date", "key": "date", "subtype": "date" } }
- Select: { "type": "Select", "props": { "label": "Choice", "key": "choice", "options": ["A", "B"] } }
- Radio: { "type": "Radio", "props": { "label": "Option", "key": "option", "options": [{"label":"One","value":"1"}] } }
- Checkbox: { "type": "Checkbox", "props": { "label": "Interests", "key": "interests", "options": ["Science", "Art"] } }
- Button: { "type": "Button", "props": { "label": "Submit", "action": "submit", "variant": "primary" } }
- TTSBlock: { "type": "TTSBlock", "props": { "content": "Say this", "label": "Listen", "voice": "en-US-AriaNeural" } }
- Audio: { "type": "Audio", "props": { "src": "https://example.com/sound.mp3", "title": "Audio" } }

All form inputs and selection widgets require unique "key" values.
Button actions: "submit" sends form data to the assistant; "search" performs a query; "clear" resets the form locally without sending a message.
Supported button variants are "primary", "danger", and "default".

Example:
```a2ui
{
  "type": "Card",
  "props": { "title": "Model settings" },
  "children": [
    { "type": "Slider", "props": { "label": "Temperature", "key": "temperature", "min": 0, "max": 2, "step": 0.1 } },
    { "type": "Switch", "props": { "label": "Stream output", "key": "stream" } },
    { "type": "Button", "props": { "label": "Save", "action": "submit", "variant": "primary" } }
  ]
}
```
"""
        content_append(request.messages, 'system', A2UI_messages)

    # ==================== Semi-static file injection (system message, infrequent changes) ====================
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False):
        # MEMORY.md
        memory_file = Path(cwd) / ".agents" / "MEMORY.md"
        if memory_file.exists() and memory_file.is_file():
            try:
                import aiofiles
                async with aiofiles.open(memory_file, 'r', encoding='utf-8') as mf:
                    mem_content = await mf.read()
                if mem_content.strip():
                    content_append(request.messages, 'system', f"\n\n**MEMORY.md**:\n{mem_content}\n\n")
            except Exception as e:
                print(f"Failed to read MEMORY.md: {e}")

        # AGENTS.md
        try:
            agents_md = await read_agents_md(cwd)
            if agents_md:
                content_append(request.messages, 'system', " **Important instructions** (.agents/AGENTS.md):\n\n"+agents_md+"\n\n")
        except Exception as e:
            print(f"[Agent Loader] Skipping AGENTS.md: {e}")
            pass

        # Project skill summary
        try:
            skills_message = await get_project_skills_summary(cwd, visibilityScope)
            if skills_message:
                content_append(request.messages, 'system', skills_message)
        except Exception as e:
            print(f"[Skill Loader] Failed to scan skills: {e}")

    # Group chat mode (changes only when membership changes)
    cur_memory = None
    if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"]:
        memoryId = settings["memorySettings"]["selectedMemory"]
        for memory in settings["memories"]:
            if memory["id"] == memoryId:
                cur_memory = memory
                break
    if cur_memory: _sanitize_card_strings(cur_memory)
    selectedMemoryName = cur_memory["name"] if cur_memory else settings["memorySettings"]["selectedMemory"]

    def resolve_agent_name(raw_model):
        if raw_model.startswith("memory/"):
            parts = raw_model.split('/', 2)
            if len(parts) >= 2:
                memory_id = parts[1]
                for memory in settings["memories"]:
                    if memory["id"] == memory_id:
                        return memory["name"]
                return raw_model
        return raw_model

    if settings["isGroupMode"] and not request.is_app_bot and not request.is_sub_agent:
        selectedGroupAgents = settings['selectedGroupAgents']
        if selectedGroupAgents:
            userName = "user"
            if settings["memorySettings"]["userName"]:
                userName = settings["memorySettings"]["userName"]
            selectedGroupAgents.append(userName)
            agent_names = [resolve_agent_name(agent) for agent in selectedGroupAgents]
            group_message = f"\n\nYou are currently in group chat mode. The participating characters are: {agent_names}\n\nYou are playing {selectedMemoryName}"
            content_append(request.messages, 'system', group_message)

    # ==================== Dynamic content collection (inject last, least to most frequently changing) ====================
    # 1. Local environment information (may contain dynamic content)
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine == "local":
        system_context_local = get_system_context()
        if system_context_local:
            content_append(request.messages, 'system', system_context_local)
    
    # 1b. WSL environment information (Linux sandbox on Windows)
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine == "wsl":
        system_context_wsl = (
            "[Environment] OS: Linux (WSL2) | Shell: bash\n\n"
            "Important notes:\n"
            "1. This is a WSL2 sandbox. Use Linux commands and toolchains.\n"
            "2. Use standard Linux filesystem paths (such as /mnt/d/project).\n"
            "3. Commands run through bash; use Linux syntax.\n"
            "4. The working directory is mapped automatically to a WSL path.\n"
            "5. Package managers such as apt, pip and npm are available.\n"
            "6. Ports listen inside WSL and can be accessed from Windows via localhost."
        )
        content_append(request.messages, 'system', system_context_wsl)

    # 2. To-do items
    if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine in ["ds", "local", "wsl"]:
        try:
            todos = await read_todos_local(cwd)
            if isinstance(todos, list) and len(todos) > 0:
                priority_icons = {"high": "🔴", "medium": "🟡", "low": "🟢"}
                status_icons = {"pending": "⏳", "in_progress": "🔄", "done": "✅", "cancelled": "❌"}
                priority_order = {"high": 0, "medium": 1, "low": 2}
                todos_sorted = sorted(todos, key=lambda x: (priority_order.get(x.get('priority', 'medium'), 1), x.get('created_at', '')))
                todo_lines = ["\n\nWhen you finish a task, update the project task list using the todo_write tool. After all tasks are finished, the task file may be removed.\n\n**Current project tasks** (.agents/ai_todos.json):\n"]
                pending_count = 0
                for todo in todos_sorted:
                    status = todo.get('status', 'pending')
                    if status != 'done':
                        pending_count += 1
                        icon = status_icons.get(status, "⏳")
                        priority = priority_icons.get(todo.get('priority', 'medium'), "🟡")
                        content_text = todo.get('content', 'No content')[:50]
                        if len(todo.get('content', '')) > 50:
                            content_text += "..."
                        todo_lines.append(f"{icon} {priority} [{todo.get('id', 'unknown')}] {content_text}")
                if pending_count == 0:
                    todo_lines.append("No pending to-do items; all tasks are complete!")
                else:
                    todo_lines.append(f"\n*{pending_count} unfinished tasks*")
                todo_message = "\n".join(todo_lines)
                content_append(request.messages, 'system', todo_message)
        except Exception as e:
            print(f"[Todo Loader] Skipping task list: {e}")

    # 3. Subtask progress (cowork mode)
    if permissionMode == "cowork" and not request.is_sub_agent:
        if cwd and Path(cwd).exists() and cli_settings.get("enabled", False) and engine in ["ds", "local", "wsl"]:
            sub_task_context = await query_task_progress(cwd)
            if sub_task_context:
                content_append(request.messages, 'system', sub_task_context)

    # 4. VTS state (expressions may change each turn)
    from py.vts_manager import vts_instance
    if vts_instance.is_running and not request.is_app_bot and not request.is_sub_agent:
        all_exp_names = [f"<{e['name']}>" for e in vts_instance.model_expressions]
        all_mot_names = [f"<{h['name']}>" for h in vts_instance.available_hotkeys]
        active_list = vts_instance.current_active_expressions
        status_text = ", ".join(active_list) if active_list else "neutral"
        if all_exp_names or all_mot_names:
            vts_prompt = f"""
\n\n# Character expression control
You are controlling a Live2D model. Current expression: {status_text}.

[Available expression tags] (sending a tag switches to it and resets other expressions)
{" ".join(all_exp_names)}

[Available motion tags] (trigger a one-time animation)
{" ".join(all_mot_names)}

[Usage rules]
1. You may insert a tag at the beginning of each sentence.
2. Expressions are mutually exclusive. A new expression automatically closes the old one.
3. Place tags at the start of the sentence without a line break.
"""
            content_append(request.messages, 'system', vts_prompt)

    # 5. Relationship value (may change every turn)
    love_settings = settings.get('loveSettings', {})
    if love_settings.get('enabled', False) and not request.is_app_bot and not request.is_sub_agent:
        default_user = settings.get("memorySettings", {}).get("userName", "").strip() or "User"
        from py.affection_system import load_affection_data 
        affection_data = await load_affection_data()
        dimensions = love_settings.get("dimensions", ["love", "Familiarity"])
        custom_prompt = love_settings.get("prompt", "Evaluate these attributes based on the conversation, tone and character persona; normally adjust each by no more than five points.")
        user_prompt_text = ""
        if request.messages and request.messages[-1]['role'] == 'user':
            user_prompt_text = str(request.messages[-1].get('content', ''))
        relevant_users = set()
        for known_name in affection_data.keys():
            if known_name and known_name in user_prompt_text:
                relevant_users.add(known_name)
        if default_user in affection_data:
            relevant_users.add(default_user)
        status_block = ""
        if relevant_users:
            status_block = "Known relationship values:\n"
            for ru in relevant_users:
                user_stats = affection_data.get(ru, {})
                stats_str = ", ".join([f"{dim}: {user_stats.get(dim, 0)}" for dim in dimensions])
                status_block += f"- {ru}: {stats_str}\n"
        tag_example = "<user=actual_speaker_name"
        for dim in dimensions:
            tag_example += f" {dim}=1"
        tag_example += ">"
        affection_message = f"""

# Character relationship attributes
{status_block}
[Update rules]
{custom_prompt}

[Determine the current speaker]
Identify the actual speaker of the latest user message. If a message begins with a named speaker prefix (for example "Alex says:" or "Alex posted in chat:"), use that name. Otherwise assume the speaker is "{default_user}".

At the absolute end of every reply, after any prose, code, facial expressions and other tags, output one hidden data tag reflecting the updated values for that speaker.
For a new speaker, select reasonable initial attribute values. Output every configured dimension using exactly this format:
{tag_example}

The application automatically hides data tags enclosed in angle brackets. Output the tag directly, without explanations or a Markdown code fence.
"""
        content_append(request.messages, 'system', affection_message)

    # ==================== Very short dynamic additions to the user message ====================
    # Shortcut response (only when triggered this turn)
    # The global enableShortcuts switch controls shortcuts; memory and skill injection still require CLI tools and a workspace.
    from py.shortcut_commands import is_shortcuts_enabled
    if is_shortcuts_enabled(settings) and cwd and Path(cwd).exists() and cli_settings.get("enabled", False):
        user_text = ""
        if request.messages and request.messages[-1]['role'] == 'user':
            user_msg_content = request.messages[-1].get('content', '')
            if isinstance(user_msg_content, str):
                user_text = user_msg_content
            elif isinstance(user_msg_content, list):
                user_text = "".join([item.get('text', '') for item in user_msg_content if item.get('type') == 'text'])
        user_text_trimmed = user_text.strip()
        if user_text_trimmed:
            import datetime
            if user_text_trimmed.startswith('#'):
                mem_content_to_save = user_text_trimmed[1:].strip()
                if mem_content_to_save:
                    try:
                        agent_dir = Path(cwd) / ".agents"
                        agent_dir.mkdir(parents=True, exist_ok=True)
                        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        append_text = f"\n- [{timestamp}] {mem_content_to_save}"
                        import aiofiles
                        async with aiofiles.open(Path(cwd) / ".agents" / "MEMORY.md", 'a', encoding='utf-8') as mf:
                            await mf.write(append_text)
                        # Append to the user message
                        if request.messages[-1]['role'] == 'user':
                            request.messages[-1]['content'] += f"\n\n[System note: the user saved this memory with the '#' command: {mem_content_to_save}. Briefly confirm it was recorded.]"
                    except Exception as e:
                        print(f"Failed to save MEMORY.md: {e}")
            elif user_text_trimmed.startswith('/'):
                parts = user_text_trimmed[1:].split()
                if parts:
                    skill_name = parts[0]
                    skill_dir = Path(cwd) / ".agents" / "skills" / skill_name
                    if skill_dir.exists() and skill_dir.is_dir():
                        doc_file_path = None
                        for name in ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]:
                            if (skill_dir / name).exists():
                                doc_file_path = skill_dir / name
                                break
                        if doc_file_path:
                            try:
                                import aiofiles
                                async with aiofiles.open(doc_file_path, 'r', encoding='utf-8') as f:
                                    skill_content = await f.read()
                                # Append to the user message
                                if request.messages[-1]['role'] == 'user':
                                    request.messages[-1]['content'] += f"\n\n[System note: the user activated skill '{skill_name}'. Skill instructions:\n{skill_content}\nFollow these instructions when handling the request.]"
                            except Exception as e:
                                print(f"Failed to read skill documentation: {e}")

    # Timestamp (changes each turn)
    if settings['tools']['time']['enabled'] and settings['tools']['time']['triggerMode'] == 'beforeThinking':
        time_message = f"\n\nLast message sent at: {local_timezone}  {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}"
        # Append to the user message
        if request.messages and request.messages[-1]['role'] == 'user':
            request.messages[-1]['content'] += time_message

    if settings.get('localAppControlSettings', {}).get('enabled'):
        from py.local_app_control import get_all_connection_info
        apps = get_all_connection_info()
        if apps:
            lines = ["\n\n[Local application control] Connected applications below must first be selected with ext_select_app:"]
            for a in apps:
                pp = a.get("port", "?")
                an = a.get("appName", "?")
                ts = a.get("targets", [])
                lines.append(f"- {an} (port={pp}, targets={len(ts)})")
                for t in ts:
                    ttype = t.get("type", "?")
                    tid = t.get("id", "?")
                    ttl = t.get("title", "")
                    if ttype in ("page", "webview"):
                        lines.append(f"    • [{ttype}] {ttl}  (target_id={tid})")
            lines.append("\nWorkflow: 1) ext_select_app(port=PORT, target_id='xxx') to select the application and target")
            lines.append("          2) ext_snapshot to list interactive elements")
            lines.append("          3) ext_click(uid='ai-xx') or ext_click_by_text(text='keyword') to click")
            lines.append("          4) ext_select_app(port=0) to return to the built-in browser")
            content_append(request.messages, 'system', "\n".join(lines))
        else:
            content_append(request.messages, 'system',
                "\n\n[Local application control enabled] No applications are connected. Scan and connect an application in the GUI first.")

    print(f"System instructions:{request.messages[0]['content']}")
    return request

def get_drs_stage(DRS_STAGE):
    if DRS_STAGE == 1:
        drs_msg = "The current stage is requirement clarification. Analyze the user's needs and describe them clearly. If the request is unclear, identify what the user needs to clarify instead of attempting the task yet."
    elif DRS_STAGE == 2:
        drs_msg = "The current stage is tool use. Use available knowledge bases, web search, databases, MCP and other tools (not all may be available) to execute unfinished plan steps, one at a time. Do not produce the final answer at this stage; use relevant tools to prepare for it."
    elif DRS_STAGE == 3:
        drs_msg = "The current stage is result generation. Complete the task using the information collected and provide the result. If the user requests an answer exceeding 2000 words, you may divide it into sections and complete one at a time."
    else:
        drs_msg = "The current stage is result generation. Complete the task using the information collected and provide the result. If the user requests an answer exceeding 2000 words, you may divide it into sections and complete one at a time."
    return drs_msg  

def get_drs_stage_name(DRS_STAGE):
    if DRS_STAGE == 1:
        drs_stage_name = "Requirement clarification"
    elif DRS_STAGE == 2:
        drs_stage_name = "Tool use"
    elif DRS_STAGE == 3:
        drs_stage_name = "Result generation"
    else:
        drs_stage_name = "Result generation"
    return drs_stage_name

def get_drs_stage_system_message(DRS_STAGE,user_prompt,full_content):
    drs_stage_name = get_drs_stage_name(DRS_STAGE)
    if DRS_STAGE == 1:
        search_prompt = f"""
# Current state:

## Original task:
{user_prompt}

## Current result:
{full_content}

## Current stage:
{drs_stage_name}

# Deep research has three stages: 1. Requirement clarification; 2. Tool use; 3. Result generation.

## For the current stage, output a JSON string:

### If clarification is required, output JSON (do not repeat "need_more_info" if you already asked the user for clarification in the previous turn):
{{
    "status": "need_more_info",
    "unfinished_task": ""
}}

### If no further clarification is needed, enter the tool-use stage and output JSON:
{{
    "status": "need_work",
    "unfinished_task": ""
}}
"""
    elif DRS_STAGE == 2:
        search_prompt = f"""
# Current state:

## Original task:
{user_prompt}

## Current result:
{full_content}

## Current stage:
{drs_stage_name}

# Deep research has three stages: 1. Requirement clarification; 2. Tool use; 3. Result generation.

## Note: Tool use prepares for the final answer. Do not generate the final answer yet. If no unfinished steps require tools, proceed to result generation.

## For the current stage, output a JSON string:

### If unfinished plan steps still require tools, output JSON:
{{
    "status": "need_more_work",
    "unfinished_task": "Describe the unfinished step here"
}}

### If all steps requiring tools are complete, enter result generation and output JSON:
{{
    "status": "answer",
    "unfinished_task": ""
}}
"""    
    else:
        search_prompt = f"""
# Current state:

## Original task:
{user_prompt}

## Current result:
{full_content}

## Current stage:
{drs_stage_name}

# Deep research has three stages: 1. Requirement clarification; 2. Tool use; 3. Result generation.

## For the current stage, output a JSON string:

If the original task is complete, output JSON:
{{
    "status": "done",
    "unfinished_task": ""
}}

If the original task is not complete, output JSON:
{{
    "status": "not_done",
    "unfinished_task": "Describe the unfinished task here"
}}
"""    
    return search_prompt

# =========================================================================
# Stage two: mandatory sanitization, whether or not compression is enabled
# Prevent errors about tool messages lacking a matching response
# =========================================================================
def get_role(m): return m.get("role") if isinstance(m, dict) else m.role
def get_tcs(m): 
    if get_role(m) != "assistant": return None
    return m.get("tool_calls") if isinstance(m, dict) else getattr(m, "tool_calls", None)

# =========================================================================
# Stage three: thinking-mode field normalization
# Prevent "reasoning_content must be passed back" errors
# Add reasoning_content: "" to assistant messages when absent
# =========================================================================

def ensure_thinking_fields(messages):
    """Ensure assistant messages have reasoning_content, filling missing values without overwriting existing ones."""
    if not messages:
        return messages
    for msg in messages:
        role = get_role(msg)
        if role == "assistant":
            if isinstance(msg, dict):
                if "reasoning_content" not in msg:
                    msg["reasoning_content"] = ""
            else:
                if not hasattr(msg, "reasoning_content"):
                    setattr(msg, "reasoning_content", "")
    return messages

def sanitize_tool_calls(messages: list) -> list:
    """Final request-only fallback for incomplete or orphaned tool batches."""
    return normalize_tool_history(messages)


async def heartbeat_wrapper(gen, interval=90):
    """Wraps an async generator to yield SSE heartbeat comments periodically,
    preventing frontend read timeouts during long-thinking intervals."""
    queue = asyncio.Queue()

    async def reader():
        try:
            async for chunk in gen:
                await queue.put(('data', chunk))
        except Exception as e:
            await queue.put(('error', e))
        finally:
            await queue.put(('done', None))

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(interval)
                await queue.put(('heartbeat', None))
        except asyncio.CancelledError:
            pass

    gen_task = asyncio.create_task(reader())
    hb_task = asyncio.create_task(heartbeat())

    try:
        while True:
            kind, payload = await queue.get()
            if kind == 'data':
                yield payload
            elif kind == 'heartbeat':
                yield ": heartbeat\n\n"
            elif kind == 'error':
                raise payload
            elif kind == 'done':
                break
    finally:
        hb_task.cancel()
        gen_task.cancel()
        with suppress(asyncio.CancelledError):
            await hb_task
        with suppress(asyncio.CancelledError):
            await gen_task

async def _local_text_completion(client, request, settings, snapshot, assembled_tools, images,
                                 enable_thinking, enable_deep_research, enable_web_search,
                                 **kwargs):
    """Expand only the initial main-model request, with a direct local transport."""
    messages = kwargs["messages"]
    endpoint = direct_local_endpoint(settings.get("base_url"))
    if (not snapshot or type(client) is not AsyncOpenAI or not endpoint
            or endpoint != direct_local_endpoint(client.base_url)
            or assembled_tools or kwargs.get("tools") or images or request.fileLinks or request.asyncToolsID
            or request.is_app_bot or request.is_sub_agent
            or settings.get("max_rounds") or settings.get("enableOmniTTS")
            or settings.get("reasoner", {}).get("enabled") or enable_thinking
            or settings.get("tools", {}).get("deepsearch", {}).get("enabled") or enable_deep_research
            or settings.get("webSearch", {}).get("enabled") or enable_web_search
            or settings.get("CLISettings", {}).get("enabled")
            or set(kwargs.get("extra_body") or {}) - {
                "top_k", "min_p", "repetition_penalty", "typical_p",
                "enable_thinking", "chat_template_kwargs"
            }):
        return await client.chat.completions.create(**kwargs)

    output_tokens = request.max_tokens or settings.get("max_tokens")
    expanded = expand_local_text_history(messages, snapshot, output_tokens)
    if expanded is messages:
        return await client.chat.completions.create(**kwargs)

    logging.getLogger("app").info("[LocalContext] restored=%d window=%d",
                                  len(expanded) - len(messages), snapshot[0])
    kwargs["messages"] = expanded
    if "max_completion_tokens" not in kwargs and "max_tokens" not in kwargs:
        kwargs["max_tokens"] = output_tokens

    # The enlarged history must never use an environment/manual proxy or follow redirects.
    # A separate client is scoped to this completion; the ordinary client is unchanged.
    async def local_stream():
        async with httpx.AsyncClient(trust_env=False, follow_redirects=False,
                                     timeout=httpx.Timeout(60.0, connect=10.0)) as transport:
            async with AsyncOpenAI(api_key=client.api_key, base_url=endpoint,
                                   http_client=transport) as direct:
                _wrap_client_chat_with_retry(direct)
                response = await direct.chat.completions.create(**kwargs)
                async for chunk in response:
                    yield chunk

    if kwargs.get("stream"):
        return local_stream()
    async with httpx.AsyncClient(trust_env=False, follow_redirects=False,
                                 timeout=httpx.Timeout(60.0, connect=10.0)) as transport:
        async with AsyncOpenAI(api_key=client.api_key, base_url=endpoint,
                               http_client=transport) as direct:
            _wrap_client_chat_with_retry(direct)
            return await direct.chat.completions.create(**kwargs)


async def generate_stream_response(client, reasoner_client, request: ChatRequest, settings: dict, 
                                   fastapi_base_url, enable_thinking, enable_deep_research, 
                                   enable_web_search, async_tools_id, local_history=None):
    try:
        from mem0 import Memory
        global mcp_client_list, HA_client, ChromeMCP_client, sql_client
        
        DRS_STAGE = 1
        if len(request.messages) > 2:
            DRS_STAGE = 2
            
        vision_cfg = settings.get('vision', {})
        vision_control_enabled = settings.get('visionControlSettings', {}).get('enabled', False)
        user_prompt = request.messages[-1].get('content') or ""
        
        # 1. Take an initial screenshot if desktop control is enabled or a vision wake word matches
        should_capture = False
        if vision_control_enabled and settings.get('visionControlSettings', {}).get('desktopVision', False):
            should_capture = True
        elif vision_cfg.get('desktopVision'):
            # Check wake words
            if vision_cfg.get('enableWakeWord'):
                wake_words = [w.strip() for w in vision_cfg.get('wakeWord', "").split('\n') if w.strip()]
                if any(word in user_prompt for word in wake_words):
                    should_capture = True
            else:
                # Capture each turn by default if wake words are disabled
                should_capture = True
        
        if should_capture:
            try:
                import pyautogui
                from py.computer_use_tool import set_screen_region
                # Import the cross-platform UI tree capture helper
                from py.ui_tree_helper import get_desktop_ui_tree
                
                v_settings = settings.get('visionControlSettings', {})
                is_full_screen = v_settings.get('isFullScreen', True)
                screen_size = v_settings.get('ScreenSize', [0, 0, 1280, 720])
                is_grid_enabled = vision_control_enabled and v_settings.get('isEnableGrid', False)

                print(f"Capturing desktop screenshot (full screen: {is_full_screen}, grid: {is_grid_enabled})...")
                
                # Initialize screenshot offsets
                offset_x, offset_y = 0, 0
                
                # 1. Determine capture region from the full-screen setting and synchronize mouse tools
                if not is_full_screen and len(screen_size) == 4:
                    x, y, w, h = map(int, screen_size)
                    offset_x, offset_y = x, y  # Offset for aligning UI tree coordinates
                    
                    # Capture the specified region
                    screenshot = await asyncio.to_thread(pyautogui.screenshot, region=(x, y, w, h))
                    logical_width, logical_height = w, h
                    set_screen_region((x, y, w, h))
                else:
                    # Capture the full screen
                    logical_width, logical_height = pyautogui.size()
                    screenshot = await asyncio.to_thread(pyautogui.screenshot)
                    set_screen_region(None)
                
                # 2. Scale to logical coordinates to correct Windows DPI offsets
                if screenshot.width != logical_width or screenshot.height != logical_height:
                    screenshot = await asyncio.to_thread(
                        screenshot.resize, (logical_width, logical_height), Image.Resampling.LANCZOS
                    )
                
                # 3. Scale to transmission dimensions (around 1280x720)
                target_w, target_h = scale_to_fit(logical_width, logical_height, 1280, 720)
                if screenshot.width > target_w or screenshot.height > target_h:
                    print(f"High-resolution screen detected; resizing from {screenshot.size} to {(target_w, target_h)}")
                    screenshot = await asyncio.to_thread(
                        screenshot.resize, (target_w, target_h), Image.Resampling.LANCZOS
                    )

                # 4. Draw a grid if enabled and generate the grid instructions
                if is_grid_enabled:
                    display_image = await asyncio.to_thread(draw_grid_on_image, screenshot.copy(), grid_spacing=10)
                    grid_hint = "\n\n【system info】Current screenshot with coordinate grid (0-1000) is injected. Use coordinates for precise clicking."
                else:
                    display_image = screenshot
                    grid_hint = "\n\n【system info】Current desktop screenshot is injected."

                ui_tree_hint = ""
                if vision_control_enabled:
                    print("Extracting cross-platform accessibility UI tree asynchronously and aligning coordinates to 0-1000...")
                    # Pass logical viewport dimensions and coordinate offsets
                    ui_tree_json = await get_desktop_ui_tree(
                        logical_width=logical_width,
                        logical_height=logical_height,
                        offset_x=offset_x,
                        offset_y=offset_y
                    )
                    ui_tree_hint = f"\n\n【system info】Current Interactive UI Elements (Index of clickable items on screen with 0-1000 grid):\n```json\n{ui_tree_json}\n```\nYou can click any element using the provided [center_x, center_y] coordinates (which correspond perfectly to your 0-1000 grid input)."

                # 5. Save the image
                file_prefix = "desktop_grid" if is_grid_enabled else "desktop_plain"
                desktop_img_name = f"{file_prefix}_{uuid.uuid4().hex}.png"
                desktop_img_path = os.path.join(UPLOAD_FILES_DIR, desktop_img_name)
                
                await asyncio.to_thread(display_image.save, desktop_img_path, optimize=True)
                desktop_url = f"{fastapi_base_url}uploaded_files/{desktop_img_name}"
                
                # ==========================================
                # 6. Append to the current message, supporting text and multimodal lists
                # ==========================================
                current_user_msg = request.messages[-1]
                full_hint = grid_hint + ui_tree_hint  # Combine image instructions and the UI tree

                if isinstance(current_user_msg['content'], str):
                    original_text = current_user_msg['content']
                    current_user_msg['content'] = [
                        {"type": "text", "text": original_text + full_hint},
                        {"type": "image_url", "image_url": {"url": desktop_url}}
                    ]
                elif isinstance(current_user_msg['content'], list):
                    # For multimodal lists, append the UI tree to the text node
                    text_updated = False
                    for item in current_user_msg['content']:
                        if item.get('type') == 'text':
                            item['text'] = item['text'] + full_hint
                            text_updated = True
                            break
                    if not text_updated:
                        # Append a text node if none exists
                        current_user_msg['content'].append({"type": "text", "text": full_hint})
                        
                    # Append the screenshot last
                    current_user_msg['content'].append(
                        {"type": "image_url", "image_url": {"url": desktop_url}}
                    )
                
                # 7. Remove previous screenshots when onlyNewScreen is enabled
                if settings.get('visionControlSettings', {}).get('onlyNewScreen', False):
                    for msg in request.messages[:-1]:
                        if isinstance(msg.get('content'), list):
                            new_content = [item for item in msg['content'] if item.get('type') != 'image_url']
                            if len(new_content) == 1 and new_content[0].get('type') == 'text':
                                msg['content'] = new_content[0]['text']
                            else:
                                msg['content'] = new_content
                    print("Removed older screenshots from conversation context.")

                print(f"Desktop screenshot and compact UI tree injected: {desktop_url}")

            except Exception as e:
                print(f"Failed to capture desktop or extract UI tree: {e}")

        # =========================================================================
        # Stage one: compress context only above the threshold, deciding which messages to retain
        # =========================================================================
        max_rounds = settings.get("max_rounds", 0)
        chat_messages = request.messages # chat_messages includes system messages
        
        if max_rounds > 0:
            
            # Separate system and conversation messages
            sys_msgs = [m for m in chat_messages if get_role(m) == "system"]
            dialog_msgs = [m for m in chat_messages if get_role(m) != "system"]
            
            # Compress when non-system messages exceed max_rounds * 2 + 1
            if len(dialog_msgs) > (max_rounds * 2 + 1):
                keep_indices = set()
                
                # 1. Always retain the first message (anchor user prompt)
                if len(dialog_msgs) > 0: keep_indices.add(0)
                
                # 2. Keep all user messages
                for i, m in enumerate(dialog_msgs):
                    if get_role(m) == "user": keep_indices.add(i)
                
                # 3. Retain each turn's final assistant message
                for i in range(len(dialog_msgs)):
                    if get_role(dialog_msgs[i]) == "assistant":
                        is_last = True
                        for j in range(i + 1, len(dialog_msgs)):
                            if get_role(dialog_msgs[j]) == "assistant":
                                is_last = False; break
                            if get_role(dialog_msgs[j]) == "user": break
                        if is_last: keep_indices.add(i)
                
                # 4. Keep the recent active window so the current tool chain is intact
                tail_start = max(0, len(dialog_msgs) - (max_rounds * 2))
                for i in range(tail_start, len(dialog_msgs)):
                    keep_indices.add(i)
                
                # Build the initial compressed list
                compressed_dialog = select_compressed_dialogue(dialog_msgs, keep_indices)
                chat_messages = sys_msgs + compressed_dialog
                print(f"[Context] Compressed to {len(chat_messages)} msgs.")

        request.messages = sanitize_tool_calls(chat_messages)
        request.messages = ensure_thinking_fields(request.messages)
        # =========================================================================
        images = await images_in_messages(request.messages,fastapi_base_url)
        request.messages = await message_without_images(request.messages)

        m0 = None
        memoryId = None
        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != ""  and not request.is_sub_agent:
            memoryId = settings["memorySettings"]["selectedMemory"]
            cur_memory = None
            for memory in settings["memories"]:
                if memory["id"] == memoryId:
                    cur_memory = memory
                    break
            if cur_memory: _sanitize_card_strings(cur_memory)
            if cur_memory and cur_memory["providerId"]:
                print("Long-term memory enabled")
                # Use the existing FAISS index dimensions to avoid data loss when switching providers/models
                _effective_dims = cur_memory.get("embedding_dims", 1024)
                _faiss_path = os.path.join(MEMORY_CACHE_DIR, memoryId, "agent-party.faiss")
                if os.path.exists(_faiss_path):
                    try:
                        import faiss
                        _existing = faiss.read_index(_faiss_path)
                        if _existing.d != _effective_dims:
                            print(f"[WARNING] stored dims({_effective_dims}) != faiss actual dims({_existing.d}); using actual dimensions")
                        _effective_dims = _existing.d
                    except Exception as e:
                        print(f"[WARNING] Could not read existing FAISS index dimensions: {e}")
                config={
                    "embedder": {
                        "provider": 'openai',
                        "config": {
                            "model": cur_memory['model'],
                            "api_key": cur_memory['api_key'],
                            "openai_base_url":cur_memory["base_url"],
                            "embedding_dims":_effective_dims
                        },
                    },
                    "llm": {
                        "provider": 'openai',
                        "config": {
                            "model": settings['model'],
                            "api_key": settings['api_key'],
                            "openai_base_url":settings["base_url"]
                        }
                    },
                    "vector_store": {
                        "provider": "faiss",
                        "config": {
                            "collection_name": "agent-party",
                            "path": os.path.join(MEMORY_CACHE_DIR,memoryId),
                            "distance_strategy": "euclidean",
                            "embedding_model_dims": _effective_dims
                        }
                    }
                }
                m0 = Memory.from_config(config)
                print("Long-term memory configuration loaded")
        open_tag = "<think>"
        close_tag = "</think>"

        tools = request.tools or []
        tool_names = set() 
        if mcp_client_list:
            for server_name, mcp_client in mcp_client_list.items():
                if server_name in settings['mcpServers']:
                    if 'disabled' not in settings['mcpServers'][server_name]:
                        settings['mcpServers'][server_name]['disabled'] = False
                    if settings['mcpServers'][server_name]['disabled'] == False and settings['mcpServers'][server_name]['processingStatus'] == 'ready':
                        disable_tools = []
                        for tool in settings['mcpServers'][server_name].get("tools", []): 
                            if tool.get("enabled", True) == False:
                                disable_tools.append(tool["name"])
                        function = await mcp_client.get_openai_functions(disable_tools=disable_tools)
                        if function:
                            tools.extend(function)
        # Node extension tools
        for ext_id, tools_list in node_ext_mcp_tools.items():
            for tool in tools_list:
                tool_name = tool.get('name')
                if tool_name and tool_name not in tool_names:
                    tool_names.add(tool_name)
                    tools.append({
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "description": tool.get('description', f'Tool from extension {ext_id}'),
                            "parameters": tool.get('parameters', {
                                "type": "object",
                                "properties": {},
                                "required": []
                            })
                        }
                    })
                else:
                    print(f"[WARNING] Skipping duplicate tool: {tool_name}")

        get_llm_tool_fuction = await get_llm_tool(settings)
        if get_llm_tool_fuction:
            tools.append(get_llm_tool_fuction)
        get_agent_tool_fuction = await get_agent_tool(settings)
        if get_agent_tool_fuction:
            tools.append(get_agent_tool_fuction)
        get_a2a_tool_fuction = await get_a2a_tool(settings)
        if get_a2a_tool_fuction:
            tools.append(get_a2a_tool_fuction)
        if settings["HASettings"]["enabled"]:
            ha_tool = await HA_client.get_openai_functions(disable_tools=[])
            if ha_tool:
                tools.extend(ha_tool)
        if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='external':
            chromeMCP_tool = await ChromeMCP_client.get_openai_functions(disable_tools=[])
            if chromeMCP_tool:
                tools.extend(chromeMCP_tool)
        if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='internal':
            tools.extend(all_cdp_tools)
        lac = settings.get('localAppControlSettings', {})
        if lac.get('enabled'):
            if 'chromeMCPSettings' not in settings or not settings['chromeMCPSettings']['enabled'] or settings['chromeMCPSettings']['type'] != 'internal':
                tools.extend(ext_app_tools)
        if settings['sqlSettings']['enabled']:
            sql_tool = await sql_client.get_openai_functions(disable_tools=[])
            if sql_tool:
                tools.extend(sql_tool)
        if settings['CLISettings']['enabled']:
            if settings['CLISettings']['engine'] == 'ds':
                tools.extend(get_tools_for_mode('yolo'))
            elif settings['CLISettings']['engine'] == 'local':
                tools.extend(get_local_tools_for_mode('yolo'))
            elif settings['CLISettings']['engine'] == 'wsl':
                tools.extend(get_wsl_tools_for_mode('yolo'))
            elif settings['CLISettings']['engine'] == 'acp':
                tools.append(acp_agent_tool)
        if  settings['CLISettings']['mode_change']:
            tools.append(mode_change_tool)
        if settings['visionControlSettings']['enabled']:
            tools.extend(computer_use_tools)
            if settings['visionControlSettings']['mouse']:
                tools.extend(mouse_use_tools)
            if settings['visionControlSettings']['keyboard']:
                tools.extend(keyboard_use_tools)
            if not settings['visionControlSettings']['desktopVision']:
                tools.extend(desktopVision_use_tools)
        if settings['tools']['time']['enabled'] and settings['tools']['time']['triggerMode'] == 'afterThinking':
            tools.append(time_tool)
        if settings["tools"]["weather"]['enabled']:
            tools.append(weather_tool)
            tools.append(location_tool)
            tools.append(timer_weather_tool)
        if settings["tools"]["wikipedia"]['enabled']:
            tools.append(wikipedia_summary_tool)
            tools.append(wikipedia_section_tool)
        if settings["tools"]["arxiv"]['enabled']:
            tools.append(arxiv_tool)
        if (settings.get("diarySettings", {}) or {}).get("enabled", False):
            tools.append(diary_query_tool)
            tools.append(diary_books_tool)
        if settings['text2imgSettings']['enabled']:
            if settings['text2imgSettings']['engine'] == 'pollinations' and not _is_steam_build:
                tools.append(pollinations_image_tool)
            elif settings['text2imgSettings']['engine'] == 'openai':
                tools.append(openai_image_tool)
            elif settings['text2imgSettings']['engine'] == 'openaiChat':
                tools.append(openai_chat_image_tool)
        if settings['tools']['getFile']['enabled']:
            tools.append(file_tool)
            tools.append(image_tool)
        if settings['tools']['autoBehavior']['enabled'] and request.messages[-1]['role'] == 'user':
            tools.append(auto_behavior_tool)
        if settings["codeSettings"]['enabled']:
            if settings["codeSettings"]["engine"] == "e2b":
                tools.append(e2b_code_tool)
            elif settings["codeSettings"]["engine"] == "sandbox":
                tools.append(local_run_code_tool)
        if settings["custom_http"]:
            for custom_http in settings["custom_http"]:
                if custom_http["enabled"]:
                    if custom_http['body'] == "":
                        custom_http['body'] = "{}"
                    custom_http_tool = {
                        "type": "function",
                        "function": {
                            "name": f"custom_http_{custom_http['name']}",
                            "description": f"{custom_http['description']}",
                            "parameters": json.loads(custom_http['body']),
                        },
                    }
                    tools.append(custom_http_tool)
        if settings["workflows"]:
            for workflow in settings["workflows"]:
                if workflow["enabled"]:
                    comfyui_properties = {}
                    comfyui_required = []
                    if workflow["text_input"] is not None:
                        comfyui_properties["text_input"] = {
                            "description": "First text input: prompt for image or video generation. Use English unless otherwise specified.",
                            "type": "string"
                        }
                        comfyui_required.append("text_input")
                    if workflow["text_input_2"] is not None:
                        comfyui_properties["text_input_2"] = {
                            "description": "Second text input: prompt for image or video generation. Use English unless otherwise specified.",
                            "type": "string"
                        }
                        comfyui_required.append("text_input_2")
                    if workflow["image_input"] is not None:
                        comfyui_properties["image_input"] = {
                            "description": "First image input: an image URL, either external or on the local server, for example https://www.example.com/xxx.png or http://127.0.0.1:3456/xxx.jpg.",
                            "type": "string"
                        }
                        comfyui_required.append("image_input")
                    if workflow["image_input_2"] is not None:
                        comfyui_properties["image_input_2"] = {
                            "description": "Second image input: an image URL, either external or on the local server, for example https://www.example.com/xxx.png or http://127.0.0.1:3456/xxx.jpg.",
                            "type": "string"
                        }
                        comfyui_required.append("image_input_2")
                    comfyui_parameters = {
                        "type": "object",
                        "properties": comfyui_properties,
                        "required": comfyui_required
                    }
                    comfyui_tool = {
                        "type": "function",
                        "function": {
                            "name": f"comfyui_{workflow['unique_filename']}",
                            "description": f"{workflow['description']}+\nWhen supplying or editing an image prompt, use English where possible.\nFor image results, insert each image URL into Markdown image syntax, such as ![image](image_url), so the user can see it. For video results, put the video URL in the source src attribute of <video controls> <source src=''></video>. Separate multiple images or videos with line breaks.",
                            "parameters": comfyui_parameters,
                        },
                    }
                    tools.append(comfyui_tool)
        
        source_prompt = ""
        if request.fileLinks:
            print("fileLinks",request.fileLinks)
            # Retrieve file content asynchronously
            files_content = await get_files_content(request.fileLinks)
            fileLinks_message = f"\n\nRelevant file content: {files_content}"
            
            # Correct string concatenation
            content_append(request.messages, 'system', fileLinks_message)
            source_prompt += fileLinks_message

        user_prompt = request.messages[-1].get('content') or ""

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != "" and not request.is_sub_agent:
            # User name instruction (fixed)
            if settings["memorySettings"]["userName"]:
                print("Adding user name:\n\n" + settings["memorySettings"]["userName"] + "\n\nEnd of user name.\n\n")
                content_append(request.messages, 'system', "The default user speaking with you is: \n\n" + settings["memorySettings"]["userName"] + "\n\nUnless a message explicitly identifies another sender, treat it as coming from this user.\n\n")

            # Fixed persona: character description, personality, dialogue examples, custom and shared system prompts
            if cur_memory["description"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["description"] = cur_memory["description"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["description"] = cur_memory["description"].replace("{{char}}", cur_memory["name"])
                print("Adding character description:\n\n" + cur_memory["description"] + "\n\nEnd of character description.\n\n")
                content_append(request.messages, 'system', "Character description:\n\n" + cur_memory["description"] + "\n\nEnd of character description.\n\n")

            if cur_memory["personality"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["personality"] = cur_memory["personality"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["personality"] = cur_memory["personality"].replace("{{char}}", cur_memory["name"])
                print("Adding personality:\n\n" + cur_memory["personality"] + "\n\nEnd of personality.\n\n")
                content_append(request.messages, 'system', "Personality:\n\n" + cur_memory["personality"] + "\n\nEnd of personality.\n\n")

            if cur_memory['mesExample']:
                if settings["memorySettings"]["userName"]:
                    cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{char}}", cur_memory["name"])
                print("Adding example dialogue:\n\n" + cur_memory['mesExample'] + "\n\nEnd of example dialogue.\n\n")
                content_append(request.messages, 'system', "Example dialogue:\n\n" + cur_memory['mesExample'] + "\n\nEnd of example dialogue.\n\n")

            if cur_memory["systemPrompt"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{char}}", cur_memory["name"])
                content_append(request.messages, 'system', "\n\n" + cur_memory["systemPrompt"] + "\n\n")

            generic_prompt = resolve_generic_system_prompt(
                settings["memorySettings"].get("genericSystemPrompt", ""),
                settings["memorySettings"].get("userName", ""),
                cur_memory["name"]
            )
            if generic_prompt:
                content_append(request.messages, 'system', "\n\n" + generic_prompt + "\n\n")

        # ========== Diary integration: inject recent diary entries into context ==========
        diary_cfg = (settings.get("diarySettings", {}) or {}).get("chatIntegration", {}) or {}
        if diary_cfg.get("enabled", False) and not request.is_sub_agent:
            try:
                ms = (settings or {}).get("memorySettings", {}) or {}
                diary_book_id = DIARY_DEFAULT_BOOK
                if ms.get("is_memory") and ms.get("selectedMemory"):
                    diary_book_id = ms.get("selectedMemory")
                max_entries = max(1, int(diary_cfg.get("maxEntries", 5) or 5))
                recent = await get_recent_diary_entries(diary_book_id, max_entries)
                if recent:
                    diary_lines = []
                    for e in recent:
                        diary_title = e.get("title", "") or e.get("content", "")[:24]
                        diary_lines.append(f"- [{e.get('time', '')[:16]}] ({e.get('type', '')}) {diary_title}: {e.get('content', '')[:200]}")
                    diary_text = "\n".join(diary_lines)
                    content_append(request.messages, 'system',
                        "\n\n[Character diary - recent memories]\nRecent entries from the character diary, provided as context for mood and experiences:\n" + diary_text + "\n")
                    print(f"📔 [Diary Integration] Injected {len(recent)} diary entries into conversation context")
            except Exception as e:
                print(f"[Diary Integration] Failed to retrieve diary entries: {e}")

        # ========== Dynamic context collection (append to user message) ==========
        dynamic_user_context = ""

        # Worldbook matching (dynamic, triggered by current input/reply)
        lore_content = ""
        assistant_reply = ""
        for i in range(len(request.messages)-1, -1, -1):
            if request.messages[i]['role'] == 'assistant':
                assistant_reply = request.messages[i]['content']
                break

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and not request.is_sub_agent:
            if cur_memory.get("characterBook"):
                for lore in cur_memory["characterBook"]:
                    lore_keys = [key for key in lore.get("keysRaw", "").split("\n") if key != ""]
                    if lore_keys and any(key in user_prompt or key in assistant_reply for key in lore_keys):
                        lore_content += lore['content'] + "\n\n"

        if lore_content:
            if settings["memorySettings"]["userName"]:
                lore_content = lore_content.replace("{{user}}", settings["memorySettings"]["userName"])
            lore_content = lore_content.replace("{{char}}", cur_memory["name"])
            print("Adding world lore (dynamic, injected into the user message):\n\n" + lore_content + "\n\nEnd of world lore.\n\n")
            dynamic_user_context += f"\n\n[World information]\n{lore_content}"

        # Memory retrieval based on current user input
        if m0 and not request.is_sub_agent:
            memoryLimit = settings["memorySettings"]["memoryLimit"]
            try:
                relevant_memories = await asyncio.to_thread(
                    m0.search,
                    query=user_prompt,
                    user_id=settings["memorySettings"]["selectedMemory"],
                    limit=memoryLimit
                )
                relevant_memories = json.dumps(relevant_memories, ensure_ascii=False)
            except Exception as e:
                print("m0.search error:", e)
                relevant_memories = ""
            if relevant_memories:
                print("Adding relevant memories to user message:\n\n" + relevant_memories + "\n\nEnd of relevant memories.\n\n")
                dynamic_user_context += f"\n\n[Relevant memories]\n{relevant_memories}"

        # Append dynamic content to the last user message
        if dynamic_user_context:
            if request.messages and request.messages[-1]['role'] == 'user':
                request.messages[-1]['content'] += dynamic_user_context
        
        request = await tools_change_messages(request, settings)
        # ========== Conversation buffer: record user messages for idle-time summaries ==========
        try:
            diary_settings = (settings.get("diarySettings", {}) or {})
            if diary_settings.get("enabled", False) and diary_settings.get("chatSummary", {}).get("enabled", True):
                ms = (settings or {}).get("memorySettings", {}) or {}
                buffer_key = ms.get("selectedMemory") or DIARY_DEFAULT_BOOK
                update_buffer_identity(buffer_key, book_id=buffer_key,
                                       character_name=(ms.get("userName") or ""))
                last_msg = request.messages[-1] if request.messages else None
                if last_msg and last_msg.get("role") == "user":
                    append_to_chat_buffer(buffer_key, "user", _extract_text_content(last_msg.get("content", "")))
        except Exception as e:
            print(f"[DiaryBuffer] Failed to record conversation buffer: {e}")
        # Replace empty or whitespace-only system prompts with "you are a helpful assistant."
        if request.messages[0]['role'] == 'system' and not request.messages[0]['content'].strip():
            request.messages[0]['content'] = "you are a helpful assistant."
        chat_vendor = 'OpenAI'
        reasoner_vendor = 'OpenAI'
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['selectedProvider']:
                chat_vendor = modelProvider['vendor']
                break
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                reasoner_vendor = modelProvider['vendor']
                break
        if chat_vendor == 'Dify':
            try:
                if len(request.messages) >= 3:
                    if request.messages[2]['role'] == 'user':
                        if request.messages[1]['role'] == 'assistant':
                            request.messages[2]['content'] = "Your previous response:\n" +request.messages[0]['content'] + "\nEnd of previous response\n\nUser:" + request.messages[2]['content']
                        if request.messages[0]['role'] == 'system':
                            request.messages[2]['content'] = "System instructions:\n" +request.messages[0]['content'] + "\nEnd of system instructions\n\n" + request.messages[2]['content']
                elif len(request.messages) >= 2:
                    if request.messages[1]['role'] == 'user':
                        if request.messages[0]['role'] == 'system':
                            request.messages[1]['content'] = "System instructions:\n" +request.messages[0]['content'] + "\nEnd of system instructions\n\nUser:" + request.messages[1]['content']
            except Exception as e:
                print("Dify error:",e)
        model = settings['model']
        extra_params = settings['extra_params']
        # Remove extra_params entries whose name is empty or whitespace-only
        if extra_params:
            for extra_param in extra_params:
                if not extra_param['name'].strip():
                    extra_params.remove(extra_param)
            # Convert the list to a dictionary
            extra_params = process_extra_params(extra_params)
        else:
            extra_params = {}
        async def stream_generator(user_prompt,DRS_STAGE,tools,images):
            # ---------- Shared SSE wrapper ----------
            def make_sse(tool_data: dict) -> str:
                chunk = {
                    "choices": [{
                        "delta": {
                            "tool_content": tool_data, # Pass the dictionary directly
                        }
                    }]
                }
                return f"data: {json.dumps(chunk)}\n\n"
            try:
                extra = {}
                reasoner_extra = {}
                if chat_vendor == 'OpenAI':
                    extra['max_completion_tokens'] = request.max_tokens or settings['max_tokens']
                else:
                    extra['max_tokens'] = request.max_tokens or settings['max_tokens']
                if settings.get('enableOmniTTS',False) and not request.is_sub_agent:
                    extra['modalities'] = ["text", "audio"]
                    extra['audio'] ={"voice": settings.get('omniVoice',"Cherry"), "format": "wav"}
                if reasoner_vendor == 'OpenAI':
                    reasoner_extra['max_completion_tokens'] = settings['reasoner']['max_tokens']
                else:
                    reasoner_extra['max_tokens'] = settings['reasoner']['max_tokens']
                if request.reasoning_effort or settings['reasoning_effort']:
                    extra['reasoning_effort'] = request.reasoning_effort or settings['reasoning_effort']
                if settings['reasoner']['reasoning_effort'] is not None:
                    reasoner_extra['reasoning_effort'] = settings['reasoner']['reasoning_effort']
                # Process asynchronous tool ID queries
                if async_tools_id:
                    responses_to_send = []
                    responses_to_wait = []
                    async with async_tools_lock:
                        # Collect completed results and remove their entries
                        for tid in list(async_tools.keys()):  # Convert keys to a list to avoid mutation during iteration
                            if tid in async_tools_id:
                                if async_tools[tid]["status"] in ("completed", "error"):
                                    responses_to_send.append({
                                        "tool_id": tid,
                                        **async_tools.pop(tid)  # Remove the processed entry
                                    })
                                elif async_tools[tid]["status"] == "pending":
                                    responses_to_wait.append({
                                        "tool_id": tid,
                                        "name":async_tools[tid]["name"],
                                        "parameters": async_tools[tid]["parameters"]
                                    })
                    for response in responses_to_send:
                        tid = response["tool_id"]
                        if response["status"] == "completed":
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": response["name"], "content": str(response["result"]), "type": "tool_result"},
                                        "async_tool_id": tid,
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                            request.messages.insert(-1, 
                                {
                                    "tool_calls": [
                                        {
                                            "id": "agentParty",
                                            "function": {
                                                "arguments": json.dumps(response["parameters"]),
                                                "name": response["name"],
                                            },
                                            "type": "function",
                                        }
                                    ],
                                    "role": "assistant",
                                    "content": "",
                                    "reasoning_content": "",
                                }
                            )
                            request.messages.insert(-1, 
                                {
                                    "role": "tool",
                                    "tool_call_id": "agentParty",
                                    "name": response["name"],
                                    "content": f"Result of earlier asynchronous tool call ({tid}):\n\n{response['result']}\n\n====End of result====\n\nUse the tool result to address the unfinished request. Do not repeat this tool call unnecessarily."
                                }
                            )
                        if response["status"] == "error":
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"{tid}{await t('tool_result')}", "content": f"Error: {str(response['result'])}"},
                                        "async_tool_id": tid
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                            request.messages.append({
                                "role": "system",
                                "content": f"Earlier asynchronous tool call ({tid}) failed:\n\n{response['result']}\n\n====End of error====\n\n"
                            }) 
                    for response in responses_to_wait:
                        # Insert a new element before the last request message
                        request.messages.insert(-1, 
                            {
                                "tool_calls": [
                                    {
                                        "id": "agentParty",
                                        "function": {
                                            "arguments": json.dumps(response["parameters"]),
                                            "name": response["name"],
                                        },
                                        "type": "function",
                                    }
                                ],
                                "role": "assistant",
                                "content": "",
                                "reasoning_content": "",
                            }
                        )
                        results = f"{response['name']} has started successfully. It may take a long time to finish. Do not call it again: the result will be delivered automatically, and another call will not accelerate it. Tell the user that you will answer when the result is available."
                        request.messages.insert(-1, 
                            {
                                "role": "tool",
                                "tool_call_id": "agentParty",
                                "name": response["name"],
                                "content": str(results),
                            }
                        )
                kb_list = []
                if settings["knowledgeBases"]:
                    for kb in settings["knowledgeBases"]:
                        if kb["enabled"] and kb["processingStatus"] == "completed":
                            kb_list.append({"kb_id":kb["id"],"name": kb["name"],"introduction":kb["introduction"]})
                if settings["KBSettings"]["when"] == "before_thinking" or settings["KBSettings"]["when"] == "both":
                    if kb_list:
                        chunk_dict = {
                            "id": "webSearch",
                            "choices": [
                                {
                                    "finish_reason": None,
                                    "index": 0,
                                    "delta": {
                                        "role":"assistant",
                                        "content": "",
                                        "tool_content": {"title": "query_knowledge_base", "content": "", "type": "call"},
                                    }
                                }
                            ]
                        }
                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                        all_kb_content = []
                        # Query all knowledge bases in kb_list via query_knowledge_base
                        for kb in kb_list:
                            kb_content = await query_knowledge_base(kb["kb_id"],user_prompt)
                            all_kb_content.extend(kb_content)
                            if settings["KBSettings"]["is_rerank"]:
                                all_kb_content = await rerank_knowledge_base(user_prompt,all_kb_content)
                        if all_kb_content:
                            all_kb_content = json.dumps(all_kb_content, ensure_ascii=False, indent=4)
                            kb_message = f"\n\nRelevant knowledge base content: {all_kb_content}"
                            content_append(request.messages, 'user',  f"\n\nKnowledge-base content:{all_kb_content}\n\n")
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": "query_knowledge_base", "content": str(all_kb_content), "type": "tool_result"},
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                if settings["KBSettings"]["when"] == "after_thinking" or settings["KBSettings"]["when"] == "both":
                    if kb_list:
                        kb_list_message = f"\n\nAvailable knowledge bases: {json.dumps(kb_list, ensure_ascii=False)}"
                        content_append(request.messages, 'system', kb_list_message)
                else:
                    kb_list = []
                if settings['webSearch']['enabled'] or enable_web_search:
                    if settings['webSearch']['when'] == 'before_thinking' or settings['webSearch']['when'] == 'both':
                        chunk_dict = {
                            "id": "webSearch",
                            "choices": [
                                {
                                    "finish_reason": None,
                                    "index": 0,
                                    "delta": {
                                        "role":"assistant",
                                        "content": "",
                                        "tool_content": {"title": "web_search", "content": "", "type": "call"},
                                    }
                                }
                            ]
                        }
                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                        if settings['webSearch']['engine'] == 'duckduckgo':
                            results = await DDGsearch(user_prompt)
                        elif settings['webSearch']['engine'] == 'searxng':
                            results = await searxng(user_prompt)
                        elif settings['webSearch']['engine'] == 'tavily':
                            results = await Tavily_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'google':
                            results = await Google_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'brave':
                            results = await Brave_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'exa':
                            results = await Exa_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'serper':
                            results = await Serper_search(user_prompt)
                        elif settings['webSearch']['engine'] == 'youcom':
                            results = await youcom_search(user_prompt)
                        if results:
                            content_append(request.messages, 'user',  f"\n\nWeb search results:{results}\n\n")
                            tool_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": "web_search", "content": str(results), "type": "tool_result"},
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(tool_chunk)}\n\n"
                    if settings['webSearch']['when'] == 'after_thinking' or settings['webSearch']['when'] == 'both':
                        if settings['webSearch']['engine'] == 'duckduckgo' and not _is_steam_build:
                            tools.append(duckduckgo_tool)
                        elif settings['webSearch']['engine'] == 'searxng':
                            tools.append(searxng_tool)
                        elif settings['webSearch']['engine'] == 'tavily':
                            tools.append(tavily_tool)
                        elif settings['webSearch']['engine'] == 'google':
                            tools.append(google_tool)
                        elif settings['webSearch']['engine'] == 'brave':
                            tools.append(brave_tool)
                        elif settings['webSearch']['engine'] == 'exa':
                            tools.append(exa_tool)
                        elif settings['webSearch']['engine'] == 'serper':
                            tools.append(serper_tool)
                        elif settings['webSearch']['engine'] == 'youcom':
                            tools.append(youcom_tool)

                        if settings['webSearch']['crawler'] == 'jina':
                            tools.append(jina_crawler_tool)
                        elif settings['webSearch']['crawler'] == 'crawl4ai':
                            tools.append(Crawl4Ai_tool)
                        elif settings['webSearch']['crawler'] == 'firecrawl':
                            tools.append(firecrawl_tool)
                        elif settings['webSearch']['crawler'] == 'simpleRequest':
                            tools.append(simple_fetch_tool)
                        elif settings['webSearch']['crawler'] == 'mdnew':
                            tools.append(markdown_new_tool)
                if kb_list:
                    tools.append(kb_tool)

                # ==================== Read permission mode ====================
                cli_settings = settings.get("CLISettings", {})
                engine = cli_settings.get("engine", "")
                
                # Read permission mode for the environment type
                if engine == "local":
                    env_settings = settings.get("localEnvSettings", {})
                elif engine == "ds":
                    env_settings = settings.get("dsSettings", {})
                elif engine == "wsl":
                    env_settings = settings.get("wslSettings", {})
                else:
                    env_settings = settings.get("acpSettings", {})
                
                permission_mode = env_settings.get("permissionMode", "default")
                if permission_mode == "cowork" and settings['CLISettings']['enabled'] and not request.is_sub_agent:
                    tools = []
                    tools.append(create_subtask_tool)
                    tools.append(query_tasks_tool)
                    tools.append(cancel_subtask_tool)
                    if  settings['CLISettings']['mode_change']:
                        tools.append(mode_change_tool)

                if permission_mode == "goal" and settings['CLISettings']['enabled'] and not request.is_sub_agent:
                    tools.append(create_subtask_tool)
                    tools.append(query_tasks_tool)
                    tools.append(cancel_subtask_tool)
                    tools.append(finish_main_task_tool)
                    if settings['CLISettings']['mode_change']:
                        tools.append(mode_change_tool)

                if request.is_sub_agent:
                    tools.append(finish_task_tool)
                # For subagent calls or explicitly configured tool filters
                if request.is_sub_agent or request.enable_tools or request.disable_tools:
                    original_tool_count = len(tools)
                    
                    # 1. Enable Tools filter (allowlist mode)
                    if request.enable_tools and len(request.enable_tools) > 0:
                        # Keep only allowlisted tools
                        filtered_tools = []
                        enable_set = set(request.enable_tools)
                        
                        for tool in tools:
                            tool_name = tool.get("function", {}).get("name", "")
                            if tool_name in enable_set:
                                filtered_tools.append(tool)
                        
                        tools = filtered_tools
                        print(f"[Tool Filter] Enable mode: {original_tool_count} -> {len(tools)} tools (enabled: {request.enable_tools})")
                    
                    # 2. Disable Tools filter (denylist mode)
                    elif request.disable_tools and len(request.disable_tools) > 0:
                        # Remove denylisted tools
                        disable_set = set(request.disable_tools)
                        filtered_tools = []
                        
                        for tool in tools:
                            tool_name = tool.get("function", {}).get("name", "")
                            if tool_name not in disable_set:
                                filtered_tools.append(tool)
                        
                        tools = filtered_tools
                        print(f"[Tool Filter] Disable mode: {original_tool_count} -> {len(tools)} tools (disabled: {request.disable_tools})")
                    
                    # 3. Default subagent policy when enable/disable filters are absent
                    elif request.is_sub_agent:
                        # Keep only safe tools by default and remove high-risk operations
                        SUBAGENT_BLOCKED_TOOLS = [
                            
                            # Prevent subagents from managing processes or ports
                            "list_processes_tool",
                            "get_process_logs_tool",
                            "kill_process_tool",
                            "docker_manage_ports_tool",
                            "local_net_tool",
                            "send_process_input_tool",
                            
                            # Prevent subagents from creating subtasks recursively
                            "create_subtask",
                            
                            # Block high-risk browser operations
                            "new_page",
                            "close_page",
                            "evaluate_script",
                            
                            # Block nested agent calls
                            "agent_tool_call",
                            "todo_write_tool",
                        ]
                        
                        filtered_tools = []
                        blocked_count = 0
                        
                        for tool in tools:
                            tool_name = tool.get("function", {}).get("name", "")
                            if tool_name not in SUBAGENT_BLOCKED_TOOLS:
                                filtered_tools.append(tool)
                            else:
                                blocked_count += 1
                        
                        tools = filtered_tools
                        print(f"[SubAgent Safety] Blocked {blocked_count} dangerous tools: {original_tool_count} -> {len(tools)} tools")
            

                print(tools)
                request.messages = sanitize_tool_calls(request.messages)
                if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                    deepsearch_messages = copy.deepcopy(request.messages)
                    content_append(deepsearch_messages, 'user',  "\n\nBreak the user's question or current task into steps, describing each in a short sentence. Return only the outline, without answering or executing the steps, and retain all relevant details. If the input is casual conversation or contains no question or task, repeat the input unchanged. For a very simple question, one step is sufficient; otherwise, use multiple steps.")
                    
                    # 1. Enable streaming with stream=True
                    response = await client.chat.completions.create(
                        model=model,
                        messages=deepsearch_messages,
                        stream=True,  # Enable streaming
                        extra_body = extra_params, # Additional parameters
                    )
                    
                    user_prompt = ""
                    # Generate a unique ID so the frontend can update the same UI block
                    deepsearch_id = f"ds_{uuid.uuid4().hex[:8]}"
                    
                    # 2. Iterate streaming responses and forward them immediately
                    async for chunk in response:
                        if not chunk.choices:
                            continue
                        
                        # Support different OpenAI response object versions
                        chunk_dict = chunk.model_dump() if hasattr(chunk, 'model_dump') else chunk
                        delta = chunk_dict["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        
                        if content:
                            user_prompt += content
                            
                            # 3. Reuse the frontend tool_progress renderer
                            # The frontend creates a dynamically updated deep_research tool panel
                            progress_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_progress": {
                                            "name": "deep_research",
                                            "arguments": user_prompt, # Pass the accumulating content
                                            "tool_call_id": deepsearch_id
                                        }
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(progress_chunk)}\n\n"
                    
                    content_append(request.messages, 'user',  f"\n\nIf the user has not asked a question or assigned a task, converse normally. If the task is unclear or you need to understand the user's requirements better, you may defer execution and identify what needs clarification.")
                # If a reasoning model is enabled
                if settings['reasoner']['enabled'] or enable_thinking:
                    reasoner_messages = copy.deepcopy(request.messages)
                    if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                        content_append(reasoner_messages, 'user',  f"\n\nReference steps: {user_prompt}\n\n")
                        drs_msg = get_drs_stage(DRS_STAGE)
                        if drs_msg:
                            content_append(reasoner_messages, 'user',  f"\n\n{drs_msg}\n\n")
                    if tools:
                        content_append(reasoner_messages, 'system',  f"Available tools:{json.dumps(tools)}")
                    for modelProvider in settings['modelProviders']: 
                        if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                            vendor = modelProvider['vendor']
                            break
                    msg = await images_add_in_messages(reasoner_messages, images,settings)
                    if vendor == 'Ollama':
                        if settings['reasoner']['temperature'] !=1:
                            reasoner_extra['temperature'] = settings['reasoner']['temperature']

                        # Stream the reasoning model
                        reasoner_stream = await reasoner_client.chat.completions.create(
                            model=settings['reasoner']['model'],
                            messages=msg,
                            stream=True,
                            **reasoner_extra
                        )
                        full_reasoning = ""
                        buffer = ""  # Buffer content across chunks
                        in_reasoning = False  # Whether inside a reasoning tag
                        
                        async for chunk in reasoner_stream:
                            if not chunk.choices:
                                continue
                            chunk_dict = chunk.model_dump()
                            delta = chunk_dict["choices"][0].get("delta", {})
                            if delta:
                                current_content = delta.get("content", "")
                                buffer += current_content  # Accumulate in the buffer
                                
                                # Process the buffer incrementally
                                while True:
                                    reasoning_content = delta.get("reasoning_content", "")
                                    if reasoning_content:
                                        full_reasoning += reasoning_content
                                    else:
                                        reasoning_content = delta.get("reasoning", "")
                                        if reasoning_content:
                                            delta['reasoning_content'] = reasoning_content
                                            full_reasoning += reasoning_content
                                    if reasoning_content:
                                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                                        break
                                    if not in_reasoning:
                                        # Find an opening tag
                                        start_pos = buffer.find(open_tag)
                                        if start_pos != -1:
                                            # Content before the opening tag (not reasoning)
                                            non_reasoning = buffer[:start_pos]
                                            buffer = buffer[start_pos+len(open_tag):]
                                            in_reasoning = True
                                        else:
                                            break  # No opening tag; retain for later processing
                                    else:
                                        # Find the closing tag
                                        end_pos = buffer.find(close_tag)
                                        if end_pos != -1:
                                            # Extract reasoning content and build a response
                                            reasoning_part = buffer[:end_pos]
                                            chunk_dict["choices"][0]["delta"] = {
                                                "reasoning_content": reasoning_part,
                                                "content": ""  # Clear non-reasoning content
                                            }
                                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                                            full_reasoning += reasoning_part
                                            buffer = buffer[end_pos+len(close_tag):]
                                            in_reasoning = False
                                        else:
                                            # Send intermediate content before the closing tag
                                            if buffer:
                                                chunk_dict["choices"][0]["delta"] = {
                                                    "reasoning_content": buffer,
                                                    "content": ""
                                                }
                                                yield f"data: {json.dumps(chunk_dict)}\n\n"
                                                full_reasoning += buffer
                                                buffer = ""
                                            break  # Wait for additional content
                    else:
                        if settings['reasoner']['temperature'] !=1:
                            reasoner_extra['temperature'] = settings['reasoner']['temperature']
                        # Stream the reasoning model
                        reasoner_stream = await reasoner_client.chat.completions.create(
                            model=settings['reasoner']['model'],
                            messages=msg,
                            stream=True,
                            stop=settings['reasoner']['stop_words'],
                            **reasoner_extra
                        )
                        full_reasoning = ""
                        # Process the reasoning model's streaming response
                        async for chunk in reasoner_stream:
                            if not chunk.choices:
                                continue

                            chunk_dict = chunk.model_dump()
                            delta = chunk_dict["choices"][0].get("delta", {})
                            if delta:
                                reasoning_content = delta.get("reasoning_content", "")
                                if reasoning_content:
                                    full_reasoning += reasoning_content
                                else:
                                    reasoning_content = delta.get("reasoning", "")
                                    if reasoning_content:
                                        delta['reasoning_content'] = reasoning_content
                                        full_reasoning += reasoning_content
                                # Remove content so yielded chunks do not contain it
                                if 'content' in delta:
                                    del delta['content']
                            yield f"data: {json.dumps(chunk_dict)}\n\n"

                    # Add complete reasoning to the messages after reasoning ends
                    content_append(request.messages, 'assistant', f"<think>\n{full_reasoning}\n</think>")  # Reasoning for reference
                # State tracking variables
                in_reasoning = False
                reasoning_buffer = []
                content_buffer = []
                if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                    content_append(request.messages, 'user',  f"\n\nReference steps: {user_prompt}\n\n")
                    drs_msg = get_drs_stage(DRS_STAGE)
                    if drs_msg:
                        content_append(request.messages, 'user',  f"\n\n{drs_msg}\n\n")
                msg = await images_add_in_messages(request.messages, images,settings)
                if request.top_p != 1 or settings['top_p'] != 1:
                    extra['top_p'] = request.top_p or settings['top_p']

                if settings['temperature'] !=1:
                    extra['temperature'] = settings['temperature']

                if tools:
                    extra['tools'] = tools

                response = await _local_text_completion(
                    client, request, settings, local_history, tools, images,
                    enable_thinking, enable_deep_research, enable_web_search,
                    model=model,
                    messages=msg,  # Include image information in messages
                    stream=True,
                    stream_options={"include_usage": True},
                    extra_body = extra_params, # Additional parameters
                    **extra
                )

                tool_calls = []
                full_content = ""
                assistant_reasoning_content = "" 
                search_not_done = False
                search_task = ""
                is_tool_call = False
                async for chunk in response:
                    if not chunk.choices:
                        continue
                    choice = chunk.choices[0]
                    if choice.delta is None:  # Some services return delta:null in the final chunk
                        continue
                    if choice.delta.tool_calls:  # function_calling
                        is_tool_call = True
                        for tool in choice.delta.tool_calls:
                            idx = getattr(tool, 'index', len(tool_calls))
                            while len(tool_calls) <= idx:
                                tool_calls.append(None)
                            
                            if tool_calls[idx] is None:
                                tool_calls[idx] = tool
                            else:
                                if tool.function and tool.function.arguments:
                                    # Concatenate streamed function arguments
                                    if tool_calls[idx].function.arguments:
                                        tool_calls[idx].function.arguments += tool.function.arguments
                                    else:
                                        tool_calls[idx].function.arguments = tool.function.arguments
                            current_tool = tool_calls[idx]
                            if current_tool.function and current_tool.function.name:
                                progress_chunk = {
                                    "choices": [{
                                        "delta": {
                                            "tool_progress": {  # Separate progress field, distinct from final tool_content
                                                "name": current_tool.function.name,
                                                "arguments": current_tool.function.arguments or "",
                                                "index": idx,
                                                "id": current_tool.id or f"call_{idx}"
                                            }
                                        }
                                    }]
                                }
                                yield f"data: {json.dumps(progress_chunk)}\n\n"
                    else:
                        if hasattr(choice.delta, "audio") and choice.delta.audio and is_tool_call == False:
                            # Preserve Base64 audio data in delta unchanged
                            yield f"data: {chunk.model_dump_json()}\n\n"
                            continue
                        elif hasattr(choice.delta, "audio") and choice.delta.audio and is_tool_call == True:
                            continue
                        # Copy the original chunk
                        chunk_dict = chunk.model_dump()
                        delta = chunk_dict["choices"][0]["delta"]
                        
                        # Initialize required fields
                        delta.setdefault("content", "")
                        delta.setdefault("reasoning_content", "")
                        
                        # Process reasoning_content first
                        if delta["reasoning_content"]:
                            assistant_reasoning_content += delta["reasoning_content"]  # Accumulate reasoning
                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                            continue
                        if delta.get("reasoning", ""):
                            delta["reasoning_content"] = delta["reasoning"]
                            assistant_reasoning_content += delta["reasoning_content"]  # Accumulate reasoning
                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                            continue

                        # Process content
                        current_content = delta["content"]
                        buffer = current_content
                        
                        while buffer:
                            if not in_reasoning:
                                # Find the opening tag
                                start_pos = buffer.find(open_tag)
                                if start_pos != -1:
                                    # Process text before the opening tag
                                    content_buffer.append(buffer[:start_pos])
                                    buffer = buffer[start_pos+len(open_tag):]
                                    in_reasoning = True
                                else:
                                    content_buffer.append(buffer)
                                    buffer = ""
                            else:
                                # Find the closing tag
                                end_pos = buffer.find(close_tag)
                                if end_pos != -1:
                                    # Process reasoning content
                                    reasoning_buffer.append(buffer[:end_pos])
                                    buffer = buffer[end_pos+len(close_tag):]
                                    in_reasoning = False
                                else:
                                    reasoning_buffer.append(buffer)
                                    buffer = ""
                        
                        # Construct the new delta
                        new_content = "".join(content_buffer)
                        new_reasoning = "".join(reasoning_buffer)
                        
                        assistant_reasoning_content += new_reasoning  # Accumulate reasoning

                        # Update chunk content
                        delta["content"] = new_content.strip("\x00")  # Retain incomplete content
                        delta["reasoning_content"] = new_reasoning.strip("\x00") or None
                        
                        # Reset the buffer while preserving the unfinished portion
                        if in_reasoning:
                            content_buffer = [new_content.split(open_tag)[-1]] 
                        else:
                            content_buffer = []
                        reasoning_buffer = []
                        yield f"data: {json.dumps(chunk_dict)}\n\n"
                        full_content += delta.get("content") or "" 
                # Flush remaining content
                if content_buffer or reasoning_buffer:
                    final_chunk = {
                        "choices": [{
                            "delta": {
                                "content": "".join(content_buffer),
                                "reasoning_content": "".join(reasoning_buffer)
                            }
                        }]
                    }
                    yield f"data: {json.dumps(final_chunk)}\n\n"
                    full_content += final_chunk["choices"][0]["delta"].get("content", "")
                if settings.get("systemSettings", {}).get("contentSafety", False) and full_content:
                    is_safe, matched = await check_content_safety(full_content, min_cjk_chars=3)
                    if not is_safe:
                        print(f"[content_safety] output blocked words: {matched}")
                        correction = {"choices": [{"delta": {"content": "[This response was replaced by the content safety filter.]", "_safety_filtered": True}}]}
                        yield f"data: {json.dumps(correction)}\n\n"
                        full_content = "[This response was replaced by the content safety filter.]"
                if not tool_calls:
                    # Add the response to the message list
                    request.messages.append({
                        "role": "assistant",
                        "content": full_content,
                        "reasoning_content": assistant_reasoning_content
                    })
                    assistant_reasoning_content = ""  # Reset reasoning
                # Tools and deep search
                if tool_calls:
                    print("tool_calls",tool_calls)
                    pass
                elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                    search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,full_content)
                    response = await client.chat.completions.create(
                        model=model,
                        messages=[
                            {
                            "role": "system",
                            "content": source_prompt,
                            },
                            {
                            "role": "user",
                            "content": search_prompt,
                            }
                        ],
                        extra_body = extra_params, # Additional parameters
                    )
                    response_content = response.choices[0].message.content
                    # Extract JSON enclosed in a fenced json block
                    if "```json" in response_content:
                        try:
                            response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                        except:
                            # Extract content after the opening json fence
                            response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
                    try:
                        response_content = json.loads(response_content)
                    except json.JSONDecodeError:
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"❌{await t('task_error')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                    if response_content["status"] == "done":
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                   "tool_content": {"title": f"✅{await t('task_done')}", "content": ""},
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = False
                    elif response_content["status"] == "not_done":
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"❎{await t('task_not_done')}", "content": ""},
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        search_task = response_content["unfinished_task"]
                        task_prompt = f"Continue unfinished parts of the original task:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\nFinally, provide the complete answer to the original task."
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        assistant_reasoning_content = ""  # Archive reasoning for this turn
                        full_content = "" 
                        request.messages.append(
                            {
                                "role": "user",
                                "content": task_prompt,
                            }
                        )
                    elif response_content["status"] == "need_more_info":
                        DRS_STAGE = 2
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"❓{await t('task_need_more_info')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = False
                    elif response_content["status"] == "need_work":
                        DRS_STAGE = 2
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"🔍{await t('enter_search_stage')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        drs_msg = get_drs_stage(DRS_STAGE)
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        request.messages.append(
                            {
                                "role": "user",
                                "content": drs_msg,
                            }
                        )
                    elif response_content["status"] == "need_more_work":
                        DRS_STAGE = 2
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"🔍{await t('need_more_work')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        search_task = response_content["unfinished_task"]
                        task_prompt = f"Continue researching the following information:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\n"
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        assistant_reasoning_content = ""  # Archive reasoning for this turn
                        full_content = "" 
                        request.messages.append(
                            {
                                "role": "user",
                                "content": task_prompt,
                            }
                        )
                    elif response_content["status"] == "answer":
                        DRS_STAGE = 3
                        search_chunk = {
                            "choices": [{
                                "delta": {
                                    "tool_content": {"title": f"⭐{await t('enter_answer_stage')}", "content": ""}
                                }
                            }]
                        }
                        yield f"data: {json.dumps(search_chunk)}\n\n"
                        search_not_done = True
                        drs_msg = get_drs_stage(DRS_STAGE)
                        request.messages.append(
                            {
                                "role": "assistant",
                                "content": full_content,
                                "reasoning_content": assistant_reasoning_content,
                            }
                        )
                        assistant_reasoning_content = ""  # Archive reasoning for this turn
                        full_content = "" 
                        request.messages.append(
                            {
                                "role": "user",
                                "content": drs_msg,
                            }
                        )

                reasoner_messages = copy.deepcopy(request.messages)
                drs_rounds = 0
                MAX_DRS_ROUNDS = 10
                while tool_calls or search_not_done:
                    drs_rounds += 1
                    if drs_rounds > MAX_DRS_ROUNDS:
                        print(f"[DeepSearch] Maximum of {MAX_DRS_ROUNDS} rounds reached; ending deep research loop")
                        search_not_done = False
                        tool_calls = []
                        break
                    full_content = ""
                    if tool_calls:
                        # 1. Assemble and save the assistant tool_calls list
                        assistant_tool_calls_msg = {
                            "role": "assistant",
                            "content": "",
                            "reasoning_content": assistant_reasoning_content,
                            "tool_calls": []
                        }
                        assistant_reasoning_content = ""  # Reset after saving this turn's reasoning
                        assistant_tool_calls_str =[]
                        
                        for tc in tool_calls:
                            if tc is None: continue
                            response_content = tc.function
                            assistant_tool_calls_msg["tool_calls"].append({
                                "id": tc.id,
                                "function": {
                                    "arguments": response_content.arguments,
                                    "name": response_content.name,
                                },
                                "type": tc.type,
                            })
                            assistant_tool_calls_str.append(str(response_content))
                        
                        request.messages.append(assistant_tool_calls_msg)
                        reasoner_messages.append({
                            "role": "assistant",
                            "content": "\n".join(assistant_tool_calls_str),
                            "reasoning_content": "",
                        })

                        has_approval_required = False
                        
                        # 2. Execute parallel tool calls in sequence
                        for tc in tool_calls:
                            if tc is None: continue
                            response_content = tc.function
                            
                            # Handle models concatenating multiple JSON objects in a single tool argument
                            modified_data = '[' + response_content.arguments.replace('}{', '},{') + ']'
                            try:
                                data_list = json.loads(modified_data)
                            except:
                                try:
                                    data_list = [json.loads(response_content.arguments)]
                                except:
                                    data_list = [{}]
                            
                            if not isinstance(data_list, list):
                                data_list = [data_list]
                            if len(data_list) == 0:
                                data_list = [{}]

                            # Send an explicit call event to lock UI state and synchronize IDs
                            call_confirm_chunk = {
                                "choices":[{
                                    "delta": {
                                        "tool_call_id": tc.id,
                                        "tool_content": {
                                            "title": response_content.name,
                                            "content": response_content.arguments, # Send complete arguments to the frontend renderer
                                            "type": "call"
                                        }
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(call_confirm_chunk)}\n\n"

                            all_results_for_this_call =[]
                            is_streaming_result = False

                            # Execute the internal argument list (normally one element)
                            for arg_item in data_list:
                                if settings['tools']['asyncTools']['enabled']:
                                    tool_id = uuid.uuid4()
                                    async_tool_id = f"{response_content.name}_{tool_id}"
                                    chunk_dict = {
                                        "id": "agentParty",
                                        "choices":[
                                            {
                                                "finish_reason": None,
                                                "index": 0,
                                                "delta": {
                                                    "role": "assistant",
                                                    "content": "",
                                                    "async_tool_id": async_tool_id
                                                }
                                            }
                                        ]
                                    }
                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                    asyncio.create_task(
                                        execute_tool(
                                            async_tool_id,
                                            response_content.name,
                                            arg_item,
                                            settings,
                                            user_prompt
                                        )
                                    )
                                    async with async_tools_lock:
                                        async_tools[async_tool_id] = {
                                            "status": "pending",
                                            "result": None,
                                            "name": response_content.name,
                                            "parameters": arg_item
                                        }
                                    res = f"{response_content.name}tool has been successfully launched. It will take some time to run, and the results will be provided in the next round of conversation."
                                    all_results_for_this_call.append(res)
                                else:
                                    _tool_task = asyncio.create_task(dispatch_tool(response_content.name, arg_item, settings, request.is_sub_agent, approval_call_id=tc.id))
                                    while True:
                                        _done, _ = await asyncio.wait([_tool_task], timeout=30)
                                        if _tool_task in _done:
                                            res = _tool_task.result()
                                            break
                                        _heartbeat = {"choices": [{"delta": {"tool_heartbeat": {"name": response_content.name}}}]}
                                        yield f"data: {json.dumps(_heartbeat)}\n\n"

                                    if res is None:
                                        chunk = {
                                            "id": "extra_tools",
                                            "choices":[
                                                {
                                                    "index": 0,
                                                    "delta": {
                                                        "role":"assistant",
                                                        "content": "",
                                                        "tool_calls": response_content.arguments,
                                                    }
                                                }
                                            ]
                                        }
                                        yield f"data: {json.dumps(chunk)}\n\n"
                                        continue

                                    if response_content.name in["query_knowledge_base"] and type(res) == list:
                                        if settings["KBSettings"]["is_rerank"]:
                                            res = await rerank_knowledge_base(user_prompt, res)
                                        res = json.dumps(res, ensure_ascii=False, indent=4)
                                    
                                    # Process streamed tool results
                                    if isinstance(res, AsyncIterator):
                                        is_streaming_result = True
                                        buffer =[]
                                        first = True
                                        async for chunk in res:
                                            buffer.append(chunk)
                                            if first:
                                                stream_chunk = {
                                                    "choices":[{
                                                        "delta": {
                                                            "tool_call_id": tc.id,
                                                            "tool_content": {
                                                                "title": response_content.name,
                                                                "content": chunk,
                                                                "type": "tool_result_stream"
                                                            }
                                                        }
                                                    }]
                                                }
                                                yield f"data: {json.dumps(stream_chunk)}\n\n"
                                                first = False
                                            else:
                                                stream_chunk = {
                                                    "choices":[{
                                                        "delta": {
                                                            "tool_call_id": tc.id,
                                                            "tool_content": {
                                                                "title": "tool_result_stream",
                                                                "content": chunk,
                                                                "type": "tool_result_stream"
                                                            }
                                                        }
                                                    }]
                                                }
                                                yield f"data: {json.dumps(stream_chunk)}\n\n"
                                        res = "".join(buffer)

                                    if isinstance(res, str) and '"approval_required"' in res:
                                        try:
                                            parsed_res = json.loads(res)
                                            if parsed_res.get("type") == "approval_required":
                                                has_approval_required = True
                                        except Exception:
                                            pass
                                        
                                    all_results_for_this_call.append(str(res))

                            if len(all_results_for_this_call) == 0:
                                combined_results = "None"
                            elif len(all_results_for_this_call) == 1:
                                combined_results = all_results_for_this_call[0]
                            else:
                                combined_results = "\n\n".join(all_results_for_this_call)
                            
                            # Send combined results for non-streaming calls
                            if not is_streaming_result:
                                result_chunk = {
                                    "choices":[{
                                        "delta": {
                                            "tool_call_id": tc.id,
                                            "tool_content": {
                                                "title": response_content.name,
                                                "content": combined_results,
                                                "type": "tool_result"
                                            }
                                        }
                                    }]
                                }
                                yield f"data: {json.dumps(result_chunk)}\n\n"

                            request.messages.append(
                                {
                                    "role": "tool",
                                    "tool_call_id": tc.id,
                                    "name": response_content.name,
                                    "content": str(combined_results),
                                }
                            )
                            reasoner_messages.append(
                                {
                                    "role": "user",
                                    "content": f"{response_content.name} tool result: {combined_results}",
                                    "reasoning_content": "",
                                }
                            )
                        if has_approval_required:
                            break
                    # If a reasoning model is enabled
                    if settings['reasoner']['enabled'] or enable_thinking:
                        if tools:
                            content_append(reasoner_messages, 'system',  f"Available tools:{json.dumps(tools)}")
                        for modelProvider in settings['modelProviders']: 
                            if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                                vendor = modelProvider['vendor']
                                break
                        msg = await images_add_in_messages(reasoner_messages, images,settings)
                        if vendor == 'Ollama':
                            if settings['reasoner']['temperature'] !=1:
                                reasoner_extra['temperature'] = settings['reasoner']['temperature']
                            # Stream the reasoning model
                            reasoner_stream = await reasoner_client.chat.completions.create(
                                model=settings['reasoner']['model'],
                                messages=msg,
                                stream=True,
                                **reasoner_extra
                            )
                            full_reasoning = ""
                            buffer = ""  # Buffer content across chunks
                            in_reasoning = False  # Whether inside a reasoning tag
                            
                            async for chunk in reasoner_stream:
                                if not chunk.choices:
                                    continue
                                chunk_dict = chunk.model_dump()
                                delta = chunk_dict["choices"][0].get("delta", {})
                                if delta:
                                    current_content = delta.get("content", "")
                                    buffer += current_content  # Accumulate in the buffer
                                    
                                    # Process the buffer incrementally
                                    while True:
                                        reasoning_content = delta.get("reasoning_content", "")
                                        if reasoning_content:
                                            full_reasoning += reasoning_content
                                        else:
                                            reasoning_content = delta.get("reasoning", "")
                                            if reasoning_content:
                                                delta['reasoning_content'] = reasoning_content
                                                full_reasoning += reasoning_content
                                        if reasoning_content:
                                            yield f"data: {json.dumps(chunk_dict)}\n\n"
                                            break
                                        if not in_reasoning:
                                            # Find an opening tag
                                            start_pos = buffer.find(open_tag)
                                            if start_pos != -1:
                                                # Content before the opening tag (not reasoning)
                                                non_reasoning = buffer[:start_pos]
                                                buffer = buffer[start_pos+len(open_tag):]
                                                in_reasoning = True
                                            else:
                                                break  # No opening tag; retain for later processing
                                        else:
                                            # Find the closing tag
                                            end_pos = buffer.find(close_tag)
                                            if end_pos != -1:
                                                # Extract reasoning content and build a response
                                                reasoning_part = buffer[:end_pos]
                                                chunk_dict["choices"][0]["delta"] = {
                                                    "reasoning_content": reasoning_part,
                                                    "content": ""  # Clear non-reasoning content
                                                }
                                                yield f"data: {json.dumps(chunk_dict)}\n\n"
                                                full_reasoning += reasoning_part
                                                buffer = buffer[end_pos+len(close_tag):]
                                                in_reasoning = False
                                            else:
                                                # Send intermediate content before the closing tag
                                                if buffer:
                                                    chunk_dict["choices"][0]["delta"] = {
                                                        "reasoning_content": buffer,
                                                        "content": ""
                                                    }
                                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                                    full_reasoning += buffer
                                                    buffer = ""
                                                break  # Wait for additional content
                        else:
                            if settings['reasoner']['temperature'] !=1:
                                reasoner_extra['temperature'] = settings['reasoner']['temperature']

                            # Stream the reasoning model
                            reasoner_stream = await reasoner_client.chat.completions.create(
                                model=settings['reasoner']['model'],
                                messages=msg,
                                stream=True,
                                stop=settings['reasoner']['stop_words'],
                                **reasoner_extra
                            )
                            full_reasoning = ""
                            # Process the reasoning model's streaming response
                            async for chunk in reasoner_stream:
                                if not chunk.choices:
                                    continue

                                chunk_dict = chunk.model_dump()
                                delta = chunk_dict["choices"][0].get("delta", {})
                                if delta:
                                    reasoning_content = delta.get("reasoning_content", "")
                                    if reasoning_content:
                                        full_reasoning += reasoning_content
                                    else:
                                        reasoning_content = delta.get("reasoning", "")
                                        if reasoning_content:
                                            delta['reasoning_content'] = reasoning_content
                                            full_reasoning += reasoning_content
                                    # Remove content so yielded chunks do not contain it
                                    if 'content' in delta:
                                        del delta['content']
                                yield f"data: {json.dumps(chunk_dict)}\n\n"

                        # Add complete reasoning to the messages after reasoning ends
                        content_append(request.messages, 'user', f"\n\nReasoning for reference: {full_reasoning}") # Reasoning for reference

                    all_combined_results = ""
                    if tool_calls:
                        # Count non-None tool_calls
                        tool_msg_count = sum(1 for tc in tool_calls if tc is not None)
                        if tool_msg_count > 0:
                            # Extract and combine the latest tool results added to request.messages
                            recent_tool_msgs = request.messages[-tool_msg_count:]
                            all_combined_results = "\n".join([str(msg.get("content", "")) for msg in recent_tool_msgs if msg.get("role") == "tool"])

                    browser_vision_enabled = False
                    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='internal':
                        browser_vision_enabled = settings['chromeMCPSettings'].get('browserVision', False)

                    if browser_vision_enabled and '[Getting browser screenshot]' in all_combined_results:
                        import re, base64, os
                        match = re.search(r'\[Getting browser screenshot\]\s*(http[^\s]+)', all_combined_results)
                        if match:
                            browser_img_url = match.group(1)
                            if browser_img_url.startswith('http://127.0.0.1:'):
                                img_path = browser_img_url.split('/uploaded_files/', 1)[-1]
                                img_path = os.path.join(UPLOAD_FILES_DIR, img_path)
                                if os.path.exists(img_path):
                                    with open(img_path, 'rb') as f:
                                        b64 = base64.b64encode(f.read()).decode('utf-8')
                                    ext = os.path.splitext(img_path)[1].lower().lstrip('.')
                                    mime = 'image/' + ('jpeg' if ext in ('jpg','jpeg') else ext)
                                    browser_img_url = f"data:{mime};base64,{b64}"

                            current_browser_msg = {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": "[Getting browser screenshot]\n\n【system info】Current browser screenshot injected."},
                                    {"type": "image_url", "image_url": {"url": browser_img_url}}
                                ]
                            }
                            request.messages.append(current_browser_msg)
                            
                            # Optionally remove old browser screenshots to reduce token use
                            if settings.get('chromeMCPSettings', {}).get('onlyNewScreen', True):
                                for msg in request.messages[:-1]:
                                    if isinstance(msg.get('content'), list):
                                        # Filter out old image entries
                                        msg['content'] =[item for item in msg['content'] if item.get('type') != 'image_url']
                                        # If only text remains, restore a plain string
                                        if len(msg['content']) == 1 and msg['content'][0].get('type') == 'text':
                                            msg['content'] = msg['content'][0]['text']
                                        elif len(msg['content']) == 0:
                                            msg['content'] = ""

                    # === Automatically inject local application control screenshots ===
                    local_app_vision = (
                        settings.get('localAppControlSettings', {}).get('enabled', False) and
                        settings.get('localAppControlSettings', {}).get('browserVision', False)
                    )
                    if local_app_vision and not browser_vision_enabled and '[Getting browser screenshot]' in all_combined_results:
                        import re, base64, os
                        match = re.search(r'\[Getting browser screenshot\]\s*(http[^\s]+)', all_combined_results)
                        if match:
                            ext_img_url = match.group(1)
                            if ext_img_url.startswith('http://127.0.0.1:'):
                                ext_img_path = ext_img_url.split('/uploaded_files/', 1)[-1]
                                ext_img_path = os.path.join(UPLOAD_FILES_DIR, ext_img_path)
                                if os.path.exists(ext_img_path):
                                    with open(ext_img_path, 'rb') as f:
                                        b64 = base64.b64encode(f.read()).decode('utf-8')
                                    ext = os.path.splitext(ext_img_path)[1].lower().lstrip('.')
                                    mime = 'image/' + ('jpeg' if ext in ('jpg','jpeg') else ext)
                                    ext_img_url = f"data:{mime};base64,{b64}"

                            current_ext_msg = {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": "[Getting browser screenshot]\n\n【system info】Local app screenshot injected."},
                                    {"type": "image_url", "image_url": {"url": ext_img_url}}
                                ]
                            }
                            request.messages.append(current_ext_msg)

                            if settings.get('localAppControlSettings', {}).get('onlyNewScreen', True):
                                for msg in request.messages[:-1]:
                                    if isinstance(msg.get('content'), list):
                                        msg['content'] = [item for item in msg['content'] if item.get('type') != 'image_url']
                                        if len(msg['content']) == 1 and msg['content'][0].get('type') == 'text':
                                            msg['content'] = msg['content'][0]['text']
                                        elif len(msg['content']) == 0:
                                            msg['content'] = ""


                    vision_control_enabled = settings.get('visionControlSettings', {}).get('enabled', False)
                    
                    # === Match results by containment in all_combined_results rather than exact equality ===
                    if vision_control_enabled and ('[Getting screenshot]' in all_combined_results or settings.get('visionControlSettings', {}).get('desktopVision', False)):
                        try:
                            import pyautogui
                            # Import the tool's region-setting method
                            from py.computer_use_tool import set_screen_region
                            # Import the cross-platform UI tree capture helper
                            from py.ui_tree_helper import get_desktop_ui_tree
                            
                            v_settings = settings.get('visionControlSettings', {})
                            is_grid_enabled = v_settings.get('isEnableGrid', False)
                            is_full_screen = v_settings.get('isFullScreen', True)
                            # ScreenSize format: [x, y, width, height]
                            screen_size = v_settings.get('ScreenSize',[0, 0, 1920, 1080])
                            time.sleep(0.5) # Allow the screenshot tool to initialize
                            print(f"Capturing desktop screenshot (full screen: {is_full_screen}, grid: {is_grid_enabled})...")
                            
                            # Initialize coordinate offsets
                            offset_x, offset_y = 0, 0
                            
                            # --- 1. Select capture region and capture ---
                            if not is_full_screen and len(screen_size) == 4:
                                # Regional screenshot mode
                                rx, ry, rw, rh = map(int, screen_size)
                                offset_x, offset_y = rx, ry  # Record the region's top-left coordinate offset
                                
                                # Tell the mouse tool to map 0-1000 coordinates into this rectangle
                                set_screen_region((rx, ry, rw, rh))
                                
                                # Logical dimensions match the selected region
                                logical_width, logical_height = rw, rh
                                # Capture the specified region
                                screenshot = await asyncio.to_thread(pyautogui.screenshot, region=(rx, ry, rw, rh))
                            else:
                                # Full-screen capture mode
                                set_screen_region(None) # Restore full-screen mapping
                                logical_width, logical_height = pyautogui.size()
                                screenshot = await asyncio.to_thread(pyautogui.screenshot)
                            
                            # --- 2. Resize to logical coordinates to correct Windows scaling ---
                            if screenshot.width != logical_width or screenshot.height != logical_height:
                                screenshot = await asyncio.to_thread(
                                    screenshot.resize, (logical_width, logical_height), Image.Resampling.LANCZOS
                                )
                            
                            # Limit transmission dimensions to balance token use
                            target_w, target_h = scale_to_fit(logical_width, logical_height, 1280, 720)
                            if screenshot.width > target_w or screenshot.height > target_h:
                                screenshot = await asyncio.to_thread(
                                    screenshot.resize, (target_w, target_h), Image.Resampling.LANCZOS
                                )

                            # --- 3. Draw visual feedback ---
                            action_feedback_hint = ""
                            
                            # Use all_combined_results instead of results
                            if all_combined_results and "[LAST_ACTION:" in all_combined_results:
                                screenshot = await asyncio.to_thread(draw_action_feedback, screenshot, all_combined_results)
                                action_feedback_hint = (
                                    " Notice: The colored markers show your PREVIOUS actions relative to this view. "
                                    "Cyan = Click. Blue = Double Click. Green-Yellow = Drag."
                                )

                            # --- 4. Draw the helper grid ---
                            if is_grid_enabled:
                                display_image = await asyncio.to_thread(draw_grid_on_image, screenshot.copy(), grid_spacing=10)
                                region_text = "partial region" if not is_full_screen else "full desktop"
                                grid_hint = f"\n\n【system info】Screenshot of {region_text} with coordinate grid (0-1000) injected. Use coordinates for precise clicking within this view.\n{action_feedback_hint}"
                            else:
                                display_image = screenshot
                                grid_hint = f"\n\n【system info】Current screenshot injected.\n{action_feedback_hint}"

                            ui_tree_hint = ""
                            if vision_control_enabled:
                                print("Extracting cross-platform accessibility UI tree asynchronously and aligning coordinates to 0-1000...")
                                # Pass logical viewport dimensions and coordinate offsets
                                ui_tree_json = await get_desktop_ui_tree(
                                    logical_width=logical_width,
                                    logical_height=logical_height,
                                    offset_x=offset_x,
                                    offset_y=offset_y
                                )
                                ui_tree_hint = f"\n\n【system info】Current Interactive UI Elements (Index of clickable items on screen with 0-1000 grid):\n```json\n{ui_tree_json}\n```\nYou can click any element using the provided [center_x, center_y] coordinates (which correspond perfectly to your 0-1000 grid input)."

                            # --- 5. Save and inject into messages ---
                            desktop_img_name = f"desktop_view_{uuid.uuid4().hex}.png"
                            desktop_img_path = os.path.join(UPLOAD_FILES_DIR, desktop_img_name)
                            await asyncio.to_thread(display_image.save, desktop_img_path, optimize=True)
                            
                            desktop_url = f"{fastapi_base_url}uploaded_files/{desktop_img_name}"
                            
                            # Merge grid_hint and ui_tree_hint into the message text node
                            current_user_msg = {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": '[Getting screenshot]' + grid_hint + ui_tree_hint},
                                    {"type": "image_url", "image_url": {"url": desktop_url}}
                                ]
                            }
                            request.messages.append(current_user_msg)
                            
                            # --- 6. Remove older screenshots ---
                            if v_settings.get('onlyNewScreen', False):
                                for msg in request.messages[:-1]:
                                    if isinstance(msg.get('content'), list):
                                        msg['content'] = [item for item in msg['content'] if item.get('type') != 'image_url']
                                        if len(msg['content']) == 1 and msg['content'][0].get('type') == 'text':
                                            msg['content'] = msg['content'][0]['text']
                                        elif len(msg['content']) == 0:
                                            msg['content'] = ""

                        except Exception as e:
                            print(f"Failed to capture desktop or retrieve UI tree: {e}")
                            
                        images = await images_in_messages(request.messages, fastapi_base_url)
                        request.messages = await message_without_images(request.messages)
                    msg = await images_add_in_messages(request.messages, images, settings)
                    if request.top_p != 1 or settings['top_p'] != 1:
                        extra['top_p'] = request.top_p or settings['top_p']

                    if settings['temperature'] !=1:
                        extra['temperature'] = settings['temperature']

                    if tools:
                        extra['tools'] = tools
                    response = await client.chat.completions.create(
                        model=model,
                        messages=msg,  # Include image information in messages
                        stream=True,
                        stream_options={"include_usage": True},
                        extra_body = extra_params, # Additional parameters
                        **extra
                    )
                    tool_calls = []
                    async for chunk in response:
                        if not chunk.choices:
                            continue
                        if chunk.choices:
                            choice = chunk.choices[0]
                            if choice.delta is None:  # Some services return delta:null in the final chunk
                                continue
                            if hasattr(choice.delta, "audio") and choice.delta.audio:
                                # Preserve Base64 audio data in delta unchanged
                                yield f"data: {chunk.model_dump_json()}\n\n"
                                continue
                            if choice.delta.tool_calls:  # function_calling
                                for tool in choice.delta.tool_calls:
                                    idx = getattr(tool, 'index', len(tool_calls))
                                    while len(tool_calls) <= idx:
                                        tool_calls.append(None)
                                    
                                    if tool_calls[idx] is None:
                                        tool_calls[idx] = tool
                                    else:
                                        if tool.function and tool.function.arguments:
                                            # Concatenate streamed function arguments
                                            if tool_calls[idx].function.arguments:
                                                tool_calls[idx].function.arguments += tool.function.arguments
                                            else:
                                                tool_calls[idx].function.arguments = tool.function.arguments
                                current_tool = tool_calls[idx]
                                if current_tool.function and current_tool.function.name:
                                    progress_chunk = {
                                        "choices": [{
                                            "delta": {
                                                "tool_progress": {  # Separate progress field, distinct from final tool_content
                                                    "name": current_tool.function.name,
                                                    "arguments": current_tool.function.arguments or "",
                                                    "index": idx,
                                                    "id": current_tool.id or f"call_{idx}"
                                                }
                                            }
                                        }]
                                    }
                                    yield f"data: {json.dumps(progress_chunk)}\n\n"
                            else:
                                # Copy the original chunk
                                chunk_dict = chunk.model_dump()
                                delta = chunk_dict["choices"][0]["delta"]
                                
                                # Initialize required fields
                                delta.setdefault("content", "")
                                delta.setdefault("reasoning_content", "")

                                # Process reasoning_content first
                                if delta["reasoning_content"]:
                                    assistant_reasoning_content += delta["reasoning_content"]  # Accumulate reasoning
                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                    continue
                                if delta.get("reasoning", ""):
                                    delta["reasoning_content"] = delta["reasoning"]
                                    assistant_reasoning_content += delta["reasoning_content"]  # Accumulate reasoning
                                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                                    continue
                                # Process content
                                current_content = delta["content"]
                                buffer = current_content
                                
                                while buffer:
                                    if not in_reasoning:
                                        # Find the opening tag
                                        start_pos = buffer.find(open_tag)
                                        if start_pos != -1:
                                            # Process text before the opening tag
                                            content_buffer.append(buffer[:start_pos])
                                            buffer = buffer[start_pos+len(open_tag):]
                                            in_reasoning = True
                                        else:
                                            content_buffer.append(buffer)
                                            buffer = ""
                                    else:
                                        # Find the closing tag
                                        end_pos = buffer.find(close_tag)
                                        if end_pos != -1:
                                            # Process reasoning content
                                            reasoning_buffer.append(buffer[:end_pos])
                                            buffer = buffer[end_pos+len(close_tag):]
                                            in_reasoning = False
                                        else:
                                            reasoning_buffer.append(buffer)
                                            buffer = ""
                                
                                # Construct the new delta
                                new_content = "".join(content_buffer)
                                new_reasoning = "".join(reasoning_buffer)

                                assistant_reasoning_content += new_reasoning
                                
                                # Update chunk content
                                delta["content"] = new_content.strip("\x00")  # Retain incomplete content
                                delta["reasoning_content"] = new_reasoning.strip("\x00") or None
                                
                                # Reset the buffer while preserving the unfinished portion
                                if in_reasoning:
                                    content_buffer = [new_content.split(open_tag)[-1]] 
                                else:
                                    content_buffer = []
                                reasoning_buffer = []
                                
                                yield f"data: {json.dumps(chunk_dict)}\n\n"
                                full_content += delta.get("content") or "" 
                    # Flush remaining content
                    if content_buffer or reasoning_buffer:
                        final_chunk = {
                            "choices": [{
                                "delta": {
                                    "content": "".join(content_buffer),
                                    "reasoning_content": "".join(reasoning_buffer)
                                }
                            }]
                        }
                        yield f"data: {json.dumps(final_chunk)}\n\n"
                        full_content += final_chunk["choices"][0]["delta"].get("content", "")
                    if settings.get("systemSettings", {}).get("contentSafety", False) and full_content:
                        is_safe, matched = await check_content_safety(full_content, min_cjk_chars=3)
                        if not is_safe:
                            print(f"[content_safety] output blocked words: {matched}")
                            correction = {"choices": [{"delta": {"content": "[This response was replaced by the content safety filter.]", "_safety_filtered": True}}]}
                            yield f"data: {json.dumps(correction)}\n\n"
                            full_content = "[This response was replaced by the content safety filter.]"
                    if not tool_calls:
                        # Add the response to the message list
                        request.messages.append({
                            "role": "assistant",
                            "content": full_content,
                            "reasoning_content": assistant_reasoning_content
                        })
                        assistant_reasoning_content = ""  # Reset reasoning
                    # Tools and deep search
                    if tool_calls:
                        pass
                    elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                        search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,full_content)
                        response = await client.chat.completions.create(
                            model=model,
                            messages=[                        
                                {
                                "role": "system",
                                "content": source_prompt,
                                },
                                {
                                "role": "user",
                                "content": search_prompt,
                                }
                            ],
                            extra_body = extra_params, # Additional parameters
                        )
                        response_content = response.choices[0].message.content
                        if response_content is None:
                            response_content = ""
                        # Extract JSON enclosed in a fenced json block
                        if "```json" in response_content:
                            try:
                                response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                            except:
                                # Extract content after the opening json fence
                                response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
                        try:
                            response_content = json.loads(response_content)
                        except json.JSONDecodeError:
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"❌{await t('task_error')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                        if response_content["status"] == "done":
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"✅{await t('task_done')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = False
                        elif response_content["status"] == "not_done":
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"❎{await t('task_not_done')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            search_task = response_content["unfinished_task"]
                            task_prompt = f"Continue unfinished parts of the original task:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\nFinally, provide the complete answer to the original task."
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # Archive reasoning for this turn
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": task_prompt,
                                }
                            )
                        elif response_content["status"] == "need_more_info":
                            DRS_STAGE = 2
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"❓{await t('task_need_more_info')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = False
                        elif response_content["status"] == "need_work":
                            DRS_STAGE = 2
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"🔍{await t('enter_search_stage')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            drs_msg = get_drs_stage(DRS_STAGE)
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # Archive reasoning for this turn
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": drs_msg,
                                }
                            )
                        elif response_content["status"] == "need_more_work":
                            DRS_STAGE = 2
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"🔍{await t('need_more_work')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            search_task = response_content["unfinished_task"]
                            task_prompt = f"Continue researching the following information:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\n"
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # Archive reasoning for this turn
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": task_prompt,
                                }
                            )
                        elif response_content["status"] == "answer":
                            DRS_STAGE = 3
                            search_chunk = {
                                "choices": [{
                                    "delta": {
                                        "tool_content": {"title": f"⭐{await t('enter_answer_stage')}", "content": ""}
                                    }
                                }]
                            }
                            yield f"data: {json.dumps(search_chunk)}\n\n"
                            search_not_done = True
                            drs_msg = get_drs_stage(DRS_STAGE)
                            request.messages.append(
                                {
                                    "role": "assistant",
                                    "content": full_content,
                                    "reasoning_content": assistant_reasoning_content,
                                }
                            )
                            assistant_reasoning_content = ""  # Archive reasoning for this turn
                            full_content = "" 
                            request.messages.append(
                                {
                                    "role": "user",
                                    "content": drs_msg,
                                }
                            )
                logger.info(f"all msg: {request.messages}")
                yield "data: [DONE]\n\n"
                if not request.is_sub_agent:
                    try:
                        increment_heatmap()
                        await ws_manager.broadcast({
                            "type": "island_ai_reply_done",
                            "data": {"text": "The task is finished. Come take a look!"}
                        })
                    except Exception:
                        pass
                if settings.get('loveSettings', {}).get('enabled', False) and not request.is_sub_agent:
                    try:
                        from py.affection_system import extract_and_update_affection
                        # full_content is the complete AI response for this turn
                        await extract_and_update_affection(full_content)
                    except Exception as e:
                        print(f"Failed to parse relationship tags: {e}")
                # ========== Conversation buffer: record assistant replies for idle-time summaries ==========
                try:
                    diary_settings_inner = (settings.get("diarySettings", {}) or {})
                    if diary_settings_inner.get("enabled", False) and diary_settings_inner.get("chatSummary", {}).get("enabled", True):
                        ms = (settings or {}).get("memorySettings", {}) or {}
                        buffer_key = ms.get("selectedMemory") or DIARY_DEFAULT_BOOK
                        if full_content:
                            append_to_chat_buffer(buffer_key, "assistant", full_content)
                except Exception as e:
                    print(f"[DiaryBuffer] Failed to record assistant reply: {e}")
                if m0 and not request.is_sub_agent:
                    print("Submitting memory update task")
                    messages = f"User said: {user_prompt}\n\n---\n\nYou said: {full_content}"
                    infer = cur_memory.get('infer', False) or False
                    
                    def run_task():
                        import asyncio  # Import here
                        import traceback
                        
                        async def add():
                            loop = asyncio.get_running_loop()
                            with ThreadPoolExecutor() as executor:
                                metadata = {
                                    "timetamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                }
                                func = partial(m0.add, user_id=memoryId, metadata=metadata, infer=infer)
                                await loop.run_in_executor(executor, func, messages)
                                print("Memory update complete")
                        
                        try:
                            loop = asyncio.get_running_loop()
                            task = asyncio.create_task(add())
                            task.add_done_callback(
                                lambda t: print(f"Task exception: {t.exception()}") if t.exception() else None
                            )
                        except RuntimeError:
                            # No running event loop
                            asyncio.run(add())
                        except Exception as e:
                            print(f"run_task exception: {e}")
                            traceback.print_exc()
                    
                    import threading
                    thread = threading.Thread(target=run_task, daemon=True)
                    thread.start()
                    print("Memory update task submitted to background thread")

                return
            except Exception as e:
                logger.error(f"{request.messages}")
                # Catch exceptions and return structured errors
                error_chunk = {
                    "choices": [{
                        "delta": {
                            "tool_content": {
                                "title": "❎ Error", # Shared error title
                                "content": str(e),   # Error details
                                "type": "error"      # Mark the type for frontend styling
                            }
                        }
                    }]
                }
                yield f"data: {json.dumps(error_chunk)}\n\n"
                yield "data: [DONE]\n\n"  # Ensure the stream terminates
                return
        
        return StreamingResponse(
            heartbeat_wrapper(stream_generator(user_prompt, DRS_STAGE, tools, images)),
            media_type="text/event-stream",
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    except Exception as e:
        logger.error(f"Error occurred: {e}")
        # Use e.status_code when available; otherwise use 500
        return JSONResponse(
            status_code=getattr(e, "status_code", 500),
            content={"error": str(e)},
        )

async def generate_complete_response(client,reasoner_client, request: ChatRequest, settings: dict,fastapi_base_url,enable_thinking,enable_deep_research,enable_web_search,local_history=None):
    from mem0 import Memory
    global mcp_client_list,HA_client,ChromeMCP_client,sql_client
    DRS_STAGE = 1 # 1: Requirement clarification; 2: Tool use; 3: Result generation
    if len(request.messages) > 2:
        DRS_STAGE = 2

        # =========================================================================
        # Stage one: compress context only above the threshold, deciding which messages to retain
        # =========================================================================
        max_rounds = settings.get("max_rounds", 0)
        chat_messages = request.messages # chat_messages includes system messages
        
        if max_rounds > 0:
            
            # Separate system and conversation messages
            sys_msgs = [m for m in chat_messages if get_role(m) == "system"]
            dialog_msgs = [m for m in chat_messages if get_role(m) != "system"]
            
            # Compress when non-system messages exceed max_rounds * 2 + 1
            if len(dialog_msgs) > (max_rounds * 2 + 1):
                keep_indices = set()
                
                # 1. Always retain the first message (anchor user prompt)
                if len(dialog_msgs) > 0: keep_indices.add(0)
                
                # 2. Keep all user messages
                for i, m in enumerate(dialog_msgs):
                    if get_role(m) == "user": keep_indices.add(i)
                
                # 3. Retain each turn's final assistant message
                for i in range(len(dialog_msgs)):
                    if get_role(dialog_msgs[i]) == "assistant":
                        is_last = True
                        for j in range(i + 1, len(dialog_msgs)):
                            if get_role(dialog_msgs[j]) == "assistant":
                                is_last = False; break
                            if get_role(dialog_msgs[j]) == "user": break
                        if is_last: keep_indices.add(i)
                
                # 4. Keep the recent active window so the current tool chain is intact
                tail_start = max(0, len(dialog_msgs) - (max_rounds * 2))
                for i in range(tail_start, len(dialog_msgs)):
                    keep_indices.add(i)
                
                # Build the initial compressed list
                compressed_dialog = select_compressed_dialogue(dialog_msgs, keep_indices)
                chat_messages = sys_msgs + compressed_dialog
                print(f"[Context] Compressed to {len(chat_messages)} msgs.")

        request.messages = sanitize_tool_calls(chat_messages)
        request.messages = ensure_thinking_fields(request.messages)
        # =========================================================================

    m0 = None
    if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != "":
        memoryId = settings["memorySettings"]["selectedMemory"]
        cur_memory = None
        for memory in settings["memories"]:
            if memory["id"] == memoryId:
                cur_memory = memory
                break
        if cur_memory: _sanitize_card_strings(cur_memory)
        if cur_memory and cur_memory["providerId"]:
            print("Long-term memory enabled")
            _effective_dims = cur_memory.get("embedding_dims", 1024)
            _faiss_path = os.path.join(MEMORY_CACHE_DIR, memoryId, "agent-party.faiss")
            if os.path.exists(_faiss_path):
                try:
                    import faiss
                    _existing = faiss.read_index(_faiss_path)
                    if _existing.d != _effective_dims:
                        print(f"[WARNING] stored dims({_effective_dims}) != faiss actual dims({_existing.d}); using actual dimensions")
                    _effective_dims = _existing.d
                except Exception as e:
                    print(f"[WARNING] Could not read existing FAISS index dimensions: {e}")
            config={
                "embedder": {
                    "provider": 'openai',
                    "config": {
                        "model": cur_memory['model'],
                        "api_key": cur_memory['api_key'],
                        "openai_base_url":cur_memory["base_url"],
                        "embedding_dims":_effective_dims
                    },
                },
                "llm": {
                    "provider": 'openai',
                    "config": {
                        "model": settings['model'],
                        "api_key": settings['api_key'],
                        "openai_base_url":settings["base_url"]
                    }
                },
                "vector_store": {
                    "provider": "faiss",
                    "config": {
                        "collection_name": "agent-party",
                        "path": os.path.join(MEMORY_CACHE_DIR,memoryId),
                        "distance_strategy": "euclidean",
                        "embedding_model_dims": _effective_dims
                    }
                }
            }
            m0 = Memory.from_config(config)
    images = await images_in_messages(request.messages,fastapi_base_url)
    request.messages = await message_without_images(request.messages)
    open_tag = "<think>"
    close_tag = "</think>"
    tools = request.tools or []
    tools = request.tools or []
    extra = {}
    reasoner_extra = {}
    if mcp_client_list:
        for server_name, mcp_client in mcp_client_list.items():
            if server_name in settings['mcpServers']:
                if 'disabled' not in settings['mcpServers'][server_name]:
                    settings['mcpServers'][server_name]['disabled'] = False
                if settings['mcpServers'][server_name]['disabled'] == False and settings['mcpServers'][server_name]['processingStatus'] == 'ready':
                    disable_tools = []
                    for tool in settings['mcpServers'][server_name]["tools"]: 
                        if tool.get("enabled", True) == False:
                            disable_tools.append(tool["name"])
                    function = await mcp_client.get_openai_functions(disable_tools=disable_tools)
                    if function:
                        tools.extend(function)
    get_llm_tool_fuction = await get_llm_tool(settings)
    if get_llm_tool_fuction:
        tools.append(get_llm_tool_fuction)
    get_agent_tool_fuction = await get_agent_tool(settings)
    if get_agent_tool_fuction:
        tools.append(get_agent_tool_fuction)
    get_a2a_tool_fuction = await get_a2a_tool(settings)
    if get_a2a_tool_fuction:
        tools.append(get_a2a_tool_fuction)
    if settings["HASettings"]["enabled"]:
        ha_tool = await HA_client.get_openai_functions(disable_tools=[])
        if ha_tool:
            tools.extend(ha_tool)
    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='external':
        chromeMCP_tool = await ChromeMCP_client.get_openai_functions(disable_tools=[])
        if chromeMCP_tool:
            tools.extend(chromeMCP_tool)
    if settings['chromeMCPSettings']['enabled'] and settings['chromeMCPSettings']['type']=='internal':
        tools.extend(all_cdp_tools)
    if settings.get('localAppControlSettings', {}).get('enabled'):
        if 'chromeMCPSettings' not in settings or not settings['chromeMCPSettings']['enabled'] or settings['chromeMCPSettings']['type'] != 'internal':
            tools.extend(ext_app_tools)
    if settings['sqlSettings']['enabled']:
        sql_tool = await sql_client.get_openai_functions(disable_tools=[])
        if sql_tool:
            tools.extend(sql_tool)
    if settings['CLISettings']['enabled']:
        if settings['CLISettings']['engine'] == 'ds':
            tools.extend(get_tools_for_mode('yolo'))
        elif settings['CLISettings']['engine'] == 'local':
            tools.extend(get_local_tools_for_mode('yolo'))
        elif settings['CLISettings']['engine'] == 'acp':
            tools.append(acp_agent_tool)
    if  settings['CLISettings']['mode_change']:
        tools.append(mode_change_tool)
    if settings['visionControlSettings']['enabled']:
        tools.extend(computer_use_tools)
        if settings['visionControlSettings']['mouse']:
            tools.extend(mouse_use_tools)
        if settings['visionControlSettings']['keyboard']:
            tools.extend(keyboard_use_tools)
        if not settings['visionControlSettings']['desktopVision']:
            tools.extend(desktopVision_use_tools)
    if settings['tools']['time']['enabled'] and settings['tools']['time']['triggerMode'] == 'afterThinking':
        tools.append(time_tool)
    if settings["tools"]["weather"]['enabled']:
        tools.append(weather_tool)
        tools.append(location_tool)
        tools.append(timer_weather_tool)
    if settings["tools"]["wikipedia"]['enabled']:
        tools.append(wikipedia_summary_tool)
        tools.append(wikipedia_section_tool)
    if settings["tools"]["arxiv"]['enabled']:
        tools.append(arxiv_tool)
    if (settings.get("diarySettings", {}) or {}).get("enabled", False):
        tools.append(diary_query_tool)
        tools.append(diary_books_tool)
    if settings['text2imgSettings']['enabled']:
        if settings['text2imgSettings']['engine'] == 'pollinations' and not _is_steam_build:
            tools.append(pollinations_image_tool)
        elif settings['text2imgSettings']['engine'] == 'openai':
            tools.append(openai_image_tool)
        elif settings['text2imgSettings']['engine'] == 'openaiChat':
            tools.append(openai_chat_image_tool)
    if settings['tools']['getFile']['enabled']:
        tools.append(file_tool)
        tools.append(image_tool)
    if settings['tools']['autoBehavior']['enabled'] and request.messages[-1]['role'] == 'user':
        tools.append(auto_behavior_tool)
    if settings["codeSettings"]['enabled']:
        if settings["codeSettings"]["engine"] == "e2b":
            tools.append(e2b_code_tool)
        elif settings["codeSettings"]["engine"] == "sandbox":
            tools.append(local_run_code_tool)
    if settings["custom_http"]:
        for custom_http in settings["custom_http"]:
            if custom_http["enabled"]:
                if custom_http['body'] == "":
                    custom_http['body'] = "{}"
                custom_http_tool = {
                    "type": "function",
                    "function": {
                        "name": f"custom_http_{custom_http['name']}",
                        "description": f"{custom_http['description']}",
                        "parameters": json.loads(custom_http['body']),
                    },
                }
                tools.append(custom_http_tool)
    if settings["workflows"]:
        for workflow in settings["workflows"]:
            if workflow["enabled"]:
                comfyui_properties = {}
                comfyui_required = []
                if workflow["text_input"] is not None:
                    comfyui_properties["text_input"] = {
                        "description": "First text input: prompt for image or video generation. Use English unless otherwise specified.",
                        "type": "string"
                    }
                    comfyui_required.append("text_input")
                if workflow["text_input_2"] is not None:
                    comfyui_properties["text_input_2"] = {
                        "description": "Second text input: prompt for image or video generation. Use English unless otherwise specified.",
                        "type": "string"
                    }
                    comfyui_required.append("text_input_2")
                if workflow["image_input"] is not None:
                    comfyui_properties["image_input"] = {
                        "description": "First image input: an image URL, either external or on the local server, for example https://www.example.com/xxx.png or http://127.0.0.1:3456/xxx.jpg.",
                        "type": "string"
                    }
                    comfyui_required.append("image_input")
                if workflow["image_input_2"] is not None:
                    comfyui_properties["image_input_2"] = {
                        "description": "Second image input: an image URL, either external or on the local server, for example https://www.example.com/xxx.png or http://127.0.0.1:3456/xxx.jpg.",
                        "type": "string"
                    }
                    comfyui_required.append("image_input_2")
                comfyui_parameters = {
                    "type": "object",
                    "properties": comfyui_properties,
                    "required": comfyui_required
                }
                comfyui_tool = {
                    "type": "function",
                    "function": {
                        "name": f"comfyui_{workflow['unique_filename']}",
                        "description": f"{workflow['description']}+\nWhen supplying or editing an image prompt, use English where possible.\nFor image results, insert each image URL into Markdown image syntax, such as ![image](image_url), so the user can see it. For video results, put the video URL in the source src attribute of <video controls> <source src=''></video>. Separate multiple images or videos with line breaks.",
                        "parameters": comfyui_parameters,
                    },
                }
                tools.append(comfyui_tool)
    search_not_done = False
    search_task = ""
    try:
        model = settings['model']
        extra_params = settings['extra_params']
        # Remove extra_params entries whose name is empty or whitespace-only
        if extra_params:
            for extra_param in extra_params:
                if not extra_param['name'].strip():
                    extra_params.remove(extra_param)
            # Convert the list to a dictionary
            extra_params = process_extra_params(extra_params)
        else:
            extra_params = {}
        if request.fileLinks:
            # Retrieve file content asynchronously
            files_content = await get_files_content(request.fileLinks)
            system_message = f"\n\nRelevant file content: {files_content}"
            
            # Correct string concatenation
            content_append(request.messages, 'system', system_message)
        kb_list = []
        user_prompt = request.messages[-1].get('content') or ""

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and settings["memorySettings"]["selectedMemory"] != "" and not request.is_sub_agent:
            # User name instruction (fixed)
            if settings["memorySettings"]["userName"]:
                print("Adding user name:\n\n" + settings["memorySettings"]["userName"] + "\n\nEnd of user name.\n\n")
                content_append(request.messages, 'system', "The default user speaking with you is: \n\n" + settings["memorySettings"]["userName"] + "\n\nUnless a message explicitly identifies another sender, treat it as coming from this user.\n\n")

            # Fixed persona: character description, personality, dialogue examples, custom and shared system prompts
            if cur_memory["description"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["description"] = cur_memory["description"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["description"] = cur_memory["description"].replace("{{char}}", cur_memory["name"])
                print("Adding character description:\n\n" + cur_memory["description"] + "\n\nEnd of character description.\n\n")
                content_append(request.messages, 'system', "Character description:\n\n" + cur_memory["description"] + "\n\nEnd of character description.\n\n")

            if cur_memory["personality"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["personality"] = cur_memory["personality"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["personality"] = cur_memory["personality"].replace("{{char}}", cur_memory["name"])
                print("Adding personality:\n\n" + cur_memory["personality"] + "\n\nEnd of personality.\n\n")
                content_append(request.messages, 'system', "Personality:\n\n" + cur_memory["personality"] + "\n\nEnd of personality.\n\n")

            if cur_memory['mesExample']:
                if settings["memorySettings"]["userName"]:
                    cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory['mesExample'] = cur_memory['mesExample'].replace("{{char}}", cur_memory["name"])
                print("Adding example dialogue:\n\n" + cur_memory['mesExample'] + "\n\nEnd of example dialogue.\n\n")
                content_append(request.messages, 'system', "Example dialogue:\n\n" + cur_memory['mesExample'] + "\n\nEnd of example dialogue.\n\n")

            if cur_memory["systemPrompt"]:
                if settings["memorySettings"]["userName"]:
                    cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{user}}", settings["memorySettings"]["userName"])
                cur_memory["systemPrompt"] = cur_memory["systemPrompt"].replace("{{char}}", cur_memory["name"])
                content_append(request.messages, 'system', "\n\n" + cur_memory["systemPrompt"] + "\n\n")

            generic_prompt = resolve_generic_system_prompt(
                settings["memorySettings"].get("genericSystemPrompt", ""),
                settings["memorySettings"].get("userName", ""),
                cur_memory["name"]
            )
            if generic_prompt:
                content_append(request.messages, 'system', "\n\n" + generic_prompt + "\n\n")

        # ========== Dynamic context collection (append to user message) ==========
        dynamic_user_context = ""

        # Worldbook matching (dynamic, triggered by current input/reply)
        lore_content = ""
        assistant_reply = ""
        for i in range(len(request.messages)-1, -1, -1):
            if request.messages[i]['role'] == 'assistant':
                assistant_reply = request.messages[i]['content']
                break

        if settings["memorySettings"]["is_memory"] and settings["memorySettings"]["selectedMemory"] and not request.is_sub_agent:
            if cur_memory.get("characterBook"):
                for lore in cur_memory["characterBook"]:
                    lore_keys = [key for key in lore.get("keysRaw", "").split("\n") if key != ""]
                    if lore_keys and any(key in user_prompt or key in assistant_reply for key in lore_keys):
                        lore_content += lore['content'] + "\n\n"

        if lore_content:
            if settings["memorySettings"]["userName"]:
                lore_content = lore_content.replace("{{user}}", settings["memorySettings"]["userName"])
            lore_content = lore_content.replace("{{char}}", cur_memory["name"])
            print("Adding world lore (dynamic, injected into the user message):\n\n" + lore_content + "\n\nEnd of world lore.\n\n")
            dynamic_user_context += f"\n\n[World information]\n{lore_content}"

        # Memory retrieval based on current user input
        if m0 and not request.is_sub_agent:
            memoryLimit = settings["memorySettings"]["memoryLimit"]
            try:
                relevant_memories = await asyncio.to_thread(
                    m0.search,
                    query=user_prompt,
                    user_id=settings["memorySettings"]["selectedMemory"],
                    limit=memoryLimit
                )
                relevant_memories = json.dumps(relevant_memories, ensure_ascii=False)
            except Exception as e:
                print("m0.search error:", e)
                relevant_memories = ""
            if relevant_memories:
                print("Adding relevant memories to user message:\n\n" + relevant_memories + "\n\nEnd of relevant memories.\n\n")
                dynamic_user_context += f"\n\n[Relevant memories]\n{relevant_memories}"

        # Append dynamic content to the last user message
        if dynamic_user_context:
            if request.messages and request.messages[-1]['role'] == 'user':
                request.messages[-1]['content'] += dynamic_user_context
        
        if settings["knowledgeBases"]:
            for kb in settings["knowledgeBases"]:
                if kb["enabled"] and kb["processingStatus"] == "completed":
                    kb_list.append({"kb_id":kb["id"],"name": kb["name"],"introduction":kb["introduction"]})
        if settings["KBSettings"]["when"] == "before_thinking" or settings["KBSettings"]["when"] == "both":
            if kb_list:
                all_kb_content = []
                # Query all knowledge bases in kb_list via query_knowledge_base
                for kb in kb_list:
                    kb_content = await query_knowledge_base(kb["kb_id"],user_prompt)
                    all_kb_content.extend(kb_content)
                    if settings["KBSettings"]["is_rerank"]:
                        all_kb_content = await rerank_knowledge_base(user_prompt,all_kb_content)
                if all_kb_content:
                    kb_message = f"\n\nRelevant knowledge base content: {all_kb_content}"
                    content_append(request.messages, 'user',  f"{kb_message}\n\nUser:{user_prompt}")
        if settings["KBSettings"]["when"] == "after_thinking" or settings["KBSettings"]["when"] == "both":
            if kb_list:
                kb_list_message = f"\n\nAvailable knowledge bases: {json.dumps(kb_list, ensure_ascii=False)}"
                content_append(request.messages, 'system', kb_list_message)
        else:
            kb_list = []
        request = await tools_change_messages(request, settings)
        # Replace empty or whitespace-only system prompts with "you are a helpful assistant."
        if request.messages[0]['role'] == 'system' and not request.messages[0]['content'].strip():
            request.messages[0]['content'] = "you are a helpful assistant."
        chat_vendor = 'OpenAI'
        reasoner_vendor = 'OpenAI'
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['selectedProvider']:
                chat_vendor = modelProvider['vendor']
                break
        for modelProvider in settings['modelProviders']: 
            if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                reasoner_vendor = modelProvider['vendor']
                break
        if chat_vendor == 'Dify':
            try:
                if len(request.messages) >= 3:
                    if request.messages[2]['role'] == 'user':
                        if request.messages[1]['role'] == 'assistant':
                            request.messages[2]['content'] = "Your previous response:\n" +request.messages[0]['content'] + "\nEnd of previous response\n\nUser:" + request.messages[2]['content']
                        if request.messages[0]['role'] == 'system':
                            request.messages[2]['content'] = "System instructions:\n" +request.messages[0]['content'] + "\nEnd of system instructions\n\n" + request.messages[2]['content']
                elif len(request.messages) >= 2:
                    if request.messages[1]['role'] == 'user':
                        if request.messages[0]['role'] == 'system':
                            request.messages[1]['content'] = "System instructions:\n" +request.messages[0]['content'] + "\nEnd of system instructions\n\nUser:" + request.messages[1]['content']
            except Exception as e:
                print("Dify error:",e)
        if settings['webSearch']['enabled'] or enable_web_search:
            if settings['webSearch']['when'] == 'before_thinking' or settings['webSearch']['when'] == 'both':
                if settings['webSearch']['engine'] == 'duckduckgo':
                    results = await DDGsearch(user_prompt)
                elif settings['webSearch']['engine'] == 'searxng':
                    results = await searxng(user_prompt)
                elif settings['webSearch']['engine'] == 'tavily':
                    results = await Tavily_search(user_prompt)
                elif settings['webSearch']['engine'] == 'google':
                    results = await Google_search(user_prompt)
                elif settings['webSearch']['engine'] == 'brave':
                    results = await Brave_search(user_prompt)
                elif settings['webSearch']['engine'] == 'exa':
                    results = await Exa_search(user_prompt)
                elif settings['webSearch']['engine'] == 'serper':
                    results = await Serper_search(user_prompt)
                elif settings['webSearch']['engine'] == 'youcom':
                    results = await youcom_search(user_prompt)
                if results:
                    content_append(request.messages, 'user',  f"\n\nWeb search results: {results}")
            if settings['webSearch']['when'] == 'after_thinking' or settings['webSearch']['when'] == 'both':
                if settings['webSearch']['engine'] == 'duckduckgo' and not _is_steam_build:
                    tools.append(duckduckgo_tool)
                elif settings['webSearch']['engine'] == 'searxng':
                    tools.append(searxng_tool)
                elif settings['webSearch']['engine'] == 'tavily':
                    tools.append(tavily_tool)
                elif settings['webSearch']['engine'] == 'google':
                    tools.append(google_tool)
                elif settings['webSearch']['engine'] == 'brave':
                    tools.append(brave_tool)
                elif settings['webSearch']['engine'] == 'exa':
                    tools.append(exa_tool)
                elif settings['webSearch']['engine'] == 'serper':
                    tools.append(serper_tool)
                elif settings['webSearch']['engine'] == 'youcom':
                    tools.append(youcom_tool)

                if settings['webSearch']['crawler'] == 'jina' and not _is_steam_build:
                    tools.append(jina_crawler_tool)
                elif settings['webSearch']['crawler'] == 'crawl4ai':
                    tools.append(Crawl4Ai_tool)
                elif settings['webSearch']['crawler'] == 'firecrawl':
                    tools.append(firecrawl_tool)
                elif settings['webSearch']['crawler'] == 'simpleRequest':
                    tools.append(simple_fetch_tool)
                elif settings['webSearch']['crawler'] == 'mdnew':
                    tools.append(markdown_new_tool)
        if kb_list:
            tools.append(kb_tool)
        if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
            deepsearch_messages = copy.deepcopy(request.messages)
            content_append(deepsearch_messages, 'user',  "\n\nBreak the user's question or current task into steps, describing each in a short sentence. Return only the outline, without answering or executing the steps, and retain all relevant details. If the input is casual conversation or contains no question or task, repeat the input unchanged. For a very simple question, one step is sufficient; otherwise, use multiple steps.")
            response = await client.chat.completions.create(
                model=model,
                messages=deepsearch_messages,
                temperature=0.5, 
                extra_body = extra_params, # Additional parameters
            )
            user_prompt = response.choices[0].message.content
            content_append(request.messages, 'user',  f"\n\nIf the user has not asked a question or assigned a task, converse normally. If the task is unclear or you need to understand the user's requirements better, you may defer execution and identify what needs clarification.")
        if settings['reasoner']['enabled'] or enable_thinking:
            reasoner_messages = copy.deepcopy(request.messages)
            if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                drs_msg = get_drs_stage(DRS_STAGE)
                if drs_msg:
                    content_append(reasoner_messages, 'user',  f"\n\n{drs_msg}\n\n")
                content_append(reasoner_messages, 'user',  f"\n\nReference steps: {user_prompt}\n\n")
            if tools:
                content_append(reasoner_messages, 'system',  f"Available tools:{json.dumps(tools)}")
            for modelProvider in settings['modelProviders']: 
                if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                    vendor = modelProvider['vendor']
                    break
            msg = await images_add_in_messages(reasoner_messages, images,settings)   
            if chat_vendor == 'OpenAI':
                extra['max_completion_tokens'] = request.max_tokens or settings['max_tokens']
            else:
                extra['max_tokens'] = request.max_tokens or settings['max_tokens']
            if reasoner_vendor == 'OpenAI':
                reasoner_extra['max_completion_tokens'] = settings['reasoner']['max_tokens']
            else:
                reasoner_extra['max_tokens'] = settings['reasoner']['max_tokens']
            if request.reasoning_effort or settings['reasoning_effort']:
                extra['reasoning_effort'] = request.reasoning_effort or settings['reasoning_effort']
            if settings['reasoner']['reasoning_effort'] is not None:
                reasoner_extra['reasoning_effort'] = settings['reasoner']['reasoning_effort'] 
            if vendor == 'Ollama':
                reasoner_response = await reasoner_client.chat.completions.create(
                    model=settings['reasoner']['model'],
                    messages=msg,
                    stream=False,
                    temperature=settings['reasoner']['temperature'],
                    **reasoner_extra
                )
                reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning_content']
                if reasoning_buffer:
                    content_prepend(request.messages, 'assistant', reasoning_buffer) # Reasoning for reference
                else:
                    reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning']
                    if reasoning_buffer:
                        content_prepend(request.messages, 'assistant', reasoning_buffer) # Reasoning for reference
                    else:
                        # Extract reasoning text from the result
                        reasoning_content = reasoner_response.model_dump()['choices'][0]['message']['content']
                        # Content between open_tag and close_tag
                        start_index = reasoning_content.find(open_tag) + len(open_tag)
                        end_index = reasoning_content.find(close_tag)
                        if start_index != -1 and end_index != -1:
                            reasoning_content = reasoning_content[start_index:end_index]
                        else:
                            reasoning_content = ""
                        content_prepend(request.messages, 'assistant', reasoning_content) # Reasoning for reference
            else:
                reasoner_response = await reasoner_client.chat.completions.create(
                    model=settings['reasoner']['model'],
                    messages=msg,
                    stream=False,
                    stop=settings['reasoner']['stop_words'],
                    temperature=settings['reasoner']['temperature'],
                    **reasoner_extra
                )
                reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning_content']
                if reasoning_buffer:
                    content_prepend(request.messages, 'assistant', reasoning_buffer) # Reasoning for reference
                else:
                    reasoning_buffer = reasoner_response.model_dump()['choices'][0]['message']['reasoning']
                    if reasoning_buffer:
                        content_prepend(request.messages, 'assistant', reasoning_buffer) # Reasoning for reference
                    else:
                        reasoning_buffer = ""
                        content_prepend(request.messages, 'assistant', reasoning_buffer) # Reasoning for reference
        if settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
            content_append(request.messages, 'user',  f"\n\nReference steps: {user_prompt}\n\n")
            drs_msg = get_drs_stage(DRS_STAGE)
            if drs_msg:
                content_append(request.messages, 'user',  f"\n\n{drs_msg}\n\n")
        msg = await images_add_in_messages(request.messages, images,settings)
        if request.top_p != 1 or settings['top_p'] != 1:
            extra['top_p'] = request.top_p or settings['top_p']
        if tools:
            response = await client.chat.completions.create(
                model=model,
                messages=msg,  # Include image information in messages
                temperature=request.temperature or settings['temperature'],
                tools=tools,
                stream=False,
                extra_body = extra_params, # Additional parameters
                **extra
            )
        else:
            response = await _local_text_completion(
                client, request, settings, local_history, tools, images,
                enable_thinking, enable_deep_research, enable_web_search,
                model=model,
                messages=msg,  # Include image information in messages
                temperature=request.temperature or settings['temperature'],
                stream=False,
                extra_body = extra_params, # Additional parameters
                **extra
            )
        if response.choices[0].message and response.choices[0].message.tool_calls:
            pass
        elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
            search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,response.choices[0].message.content)
            research_response = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                    "role": "user",
                    "content": search_prompt,
                    }
                ],
                temperature=0.5,
                extra_body = extra_params, # Additional parameters
            )
            response_content = research_response.choices[0].message.content
            if response_content is None:
                response_content = ""

            # Extract JSON enclosed in a fenced json block
            if "```json" in response_content:
                try:
                    response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                except:
                    # Extract content after the opening json fence
                    response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
            response_content = json.loads(response_content)
            if response_content["status"] == "done":
                search_not_done = False
            elif response_content["status"] == "not_done":
                search_not_done = True
                search_task = response_content["unfinished_task"]
                task_prompt = f"Continue unfinished parts of the original task:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\nFinally, provide the complete answer to the original task."
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": task_prompt,
                    }
                )
            elif response_content["status"] == "need_more_info":
                DRS_STAGE = 2
                search_not_done = False
            elif response_content["status"] == "need_work":
                DRS_STAGE = 2
                search_not_done = True
                drs_msg = get_drs_stage(DRS_STAGE)
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": drs_msg,
                    }
                )
            elif response_content["status"] == "need_more_work":
                DRS_STAGE = 2
                search_not_done = True
                search_task = response_content["unfinished_task"]
                task_prompt = f"Continue researching the following information:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\n"
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": task_prompt,
                    }
                )
            elif response_content["status"] == "answer":
                DRS_STAGE = 3
                search_not_done = True
                drs_msg = get_drs_stage(DRS_STAGE)
                request.messages.append(
                    {
                        "role": "assistant",
                        "content": research_response.choices[0].message.content,
                        "reasoning_content": "",
                    }
                )
                request.messages.append(
                    {
                        "role": "user",
                        "content": drs_msg,
                    }
                )
        reasoner_messages = copy.deepcopy(request.messages)
        while (response.choices[0].message and response.choices[0].message.tool_calls) or search_not_done:
            assistant_message = response.choices[0].message
            calls = assistant_message.tool_calls if assistant_message else None
            if calls:
                call_ids = [call.id for call in calls]
                if not all(isinstance(call_id, str) and call_id for call_id in call_ids) or len(set(call_ids)) != len(call_ids):
                    raise ValueError("Tool call IDs must be nonempty and unique")
                arguments_by_call = [json.loads(call.function.arguments) for call in calls]
                if not all(isinstance(arguments, dict) for arguments in arguments_by_call):
                    raise ValueError("Tool arguments must be JSON objects")
                request.messages.append({
                    "role": "assistant",
                    "content": assistant_message.content or "",
                    "tool_calls": [
                        {"id": call.id, "type": call.type, "function": {
                            "name": call.function.name, "arguments": call.function.arguments,
                        }}
                        for call in calls
                    ],
                })
                for call, arguments in zip(calls, arguments_by_call):
                    function = call.function
                    result = await dispatch_tool(function.name, arguments, settings)
                    if isinstance(result, AsyncIterator):
                        result = "".join([str(chunk) async for chunk in result])
                    if function.name == "query_knowledge_base" and settings["KBSettings"]["is_rerank"]:
                        result = await rerank_knowledge_base(user_prompt, result)
                    content = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
                    request.messages.append({
                        "role": "tool", "tool_call_id": call.id, "name": function.name, "content": content,
                    })
                    reasoner_messages.extend([
                        {"role": "assistant", "content": str(function), "reasoning_content": ""},
                        {"role": "user", "content": f"{function.name} tool result: {content}"},
                    ])
            if settings["webSearch"]["when"] in ("after_thinking", "both"):
                content_append(request.messages, "user",
                    "\nIf the web search results are sufficient, answer the question directly. Otherwise, look for the information still needed.")
            if settings['reasoner']['enabled'] or enable_thinking:
                if tools:
                    content_append(reasoner_messages, 'system',  f"Available tools:{json.dumps(tools)}")
                for modelProvider in settings['modelProviders']: 
                    if modelProvider['id'] == settings['reasoner']['selectedProvider']:
                        vendor = modelProvider['vendor']
                        break
                msg = await images_add_in_messages(reasoner_messages, images,settings)
                if vendor == 'Ollama':
                    reasoner_response = await reasoner_client.chat.completions.create(
                        model=settings['reasoner']['model'],
                        messages=msg,
                        stream=False,
                        temperature=settings['reasoner']['temperature'],
                        **reasoner_extra
                    )
                    # Extract reasoning text from the result
                    reasoning_content = reasoner_response.model_dump()['choices'][0]['message']['content']
                    # Content between open_tag and close_tag
                    start_index = reasoning_content.find(open_tag) + len(open_tag)
                    end_index = reasoning_content.find(close_tag)
                    if start_index != -1 and end_index != -1:
                        reasoning_content = reasoning_content[start_index:end_index]
                    else:
                        reasoning_content = ""
                    content_prepend(request.messages, 'assistant', reasoning_content) # Reasoning for reference
                else:
                    reasoner_response = await reasoner_client.chat.completions.create(
                        model=settings['reasoner']['model'],
                        messages=msg,
                        stream=False,
                        stop=settings['reasoner']['stop_words'],
                        temperature=settings['reasoner']['temperature'],
                        **reasoner_extra
                    )
                    content_prepend(request.messages, 'assistant', reasoner_response.model_dump()['choices'][0]['message']['reasoning_content']) # Reasoning for reference
            msg = await images_add_in_messages(request.messages, images,settings)
            if request.top_p != 1 or settings['top_p'] != 1:
                extra['top_p'] = request.top_p or settings['top_p']
            if tools:
                response = await client.chat.completions.create(
                    model=model,
                    messages=msg,  # Include image information in messages
                    temperature=request.temperature or settings['temperature'],
                    tools=tools,
                    stream=False,
                    extra_body = extra_params, # Additional parameters
                    **extra
                )
            else:
                response = await client.chat.completions.create(
                    model=model,
                    messages=msg,  # Include image information in messages
                    temperature=request.temperature or settings['temperature'],
                    stream=False,
                    extra_body = extra_params, # Additional parameters
                    **extra
                )
            if response.choices[0].message and response.choices[0].message.tool_calls:
                pass
            elif settings['tools']['deepsearch']['enabled'] or enable_deep_research: 
                search_prompt = get_drs_stage_system_message(DRS_STAGE,user_prompt,response.choices[0].message.content)
                research_response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                        "role": "user",
                        "content": search_prompt,
                        }
                    ],
                    temperature=0.5,
                    extra_body = extra_params, # Additional parameters
                )
                response_content = research_response.choices[0].message.content
                # Extract JSON enclosed in a fenced json block
                if "```json" in response_content:
                    try:
                        response_content = re.search(r'```json(.*?)```', response_content, re.DOTALL).group(1)
                    except:
                        # Extract content after the opening json fence
                        response_content = re.search(r'```json(.*?)', response_content, re.DOTALL).group(1)
                response_content = json.loads(response_content)
                if response_content["status"] == "done":
                    search_not_done = False
                elif response_content["status"] == "not_done":
                    search_not_done = True
                    search_task = response_content["unfinished_task"]
                    task_prompt = f"Continue unfinished parts of the original task:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\nFinally, provide the complete answer to the original task."
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": task_prompt,
                        }
                    )
                elif response_content["status"] == "need_more_info":
                    DRS_STAGE = 2
                    search_not_done = False
                elif response_content["status"] == "need_work":
                    DRS_STAGE = 2
                    search_not_done = True
                    drs_msg = get_drs_stage(DRS_STAGE)
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": drs_msg,
                        }
                    )
                elif response_content["status"] == "need_more_work":
                    DRS_STAGE = 2
                    search_not_done = True
                    search_task = response_content["unfinished_task"]
                    task_prompt = f"Continue researching the following information:\n\n{search_task}\n\nOriginal task:{user_prompt}\n\n"
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": task_prompt,
                        }
                    )
                elif response_content["status"] == "answer":
                    DRS_STAGE = 3
                    search_not_done = True
                    drs_msg = get_drs_stage(DRS_STAGE)
                    request.messages.append(
                        {
                            "role": "assistant",
                            "content": research_response.choices[0].message.content,
                            "reasoning_content": "",
                        }
                    )
                    request.messages.append(
                        {
                            "role": "user",
                            "content": drs_msg,
                        }
                    )
       # Process response content
        response_dict = response.model_dump()
        content = response_dict["choices"][0]['message']['content']
        if response_dict["choices"][0]['message'].get('reasoning_content',""):
            pass
        else:
            response_dict["choices"][0]['message']['reasoning_content'] = response_dict["choices"][0]['message'].get('reasoning',"")
        if open_tag in content and close_tag in content:
            reasoning_content = re.search(fr'{open_tag}(.*?)\{close_tag}', content, re.DOTALL)
            if reasoning_content:
                # Store in reasoning_content
                response_dict["choices"][0]['message']['reasoning_content'] = reasoning_content.group(1).strip()
                # Remove tags from the original content
                response_dict["choices"][0]['message']['content'] = re.sub(fr'{open_tag}(.*?)\{close_tag}', '', content, flags=re.DOTALL).strip()
        if m0:
            messages=f"User said: {user_prompt}\n\n---\n\nYou said: {response_dict["choices"][0]['message']['content']}"
            executor = ThreadPoolExecutor()
            infer = cur_memory.get('infer') or False
            async def add():
                loop = asyncio.get_event_loop()
                # Bind the user_id keyword argument
                metadata = {
                    "timetamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                }
                func = partial(m0.add, user_id=memoryId,metadata=metadata,infer=infer)
                # Pass messages as a positional argument
                await loop.run_in_executor(executor, func, messages)
                print("Knowledge base update complete")

            asyncio.create_task(add())
        return JSONResponse(content=response_dict)
    except Exception as e:
        return JSONResponse(
            content={"error": {"message": str(e), "type": "api_error"}}
        )

@app.post("/execute_tool_manually")
async def execute_tool_manually(request: Request):
    """
    Endpoint invoked by the frontend approval button; supports streamed AsyncIterator results.
    """
    try:
        data = await request.json()
        approval_type = data.get("approval_type")
        if approval_type not in ("once", "always", "deny"):
            return JSONResponse({"detail": "Invalid approval decision"}, status_code=400)

        settings = await load_settings()
        cwd = settings.get("CLISettings", {}).get("cc_path")
        approved = pending_tool_approvals.consume(data.get("approval_token"), data.get("tool_call_id"), cwd)
        if approved is None:
            return JSONResponse({"detail": "Approval is stale, already used, or does not match the pending call"}, status_code=409)
        tool_name, tool_params = approved
        if approval_type == "deny":
            return {"result": f"User denied the execution of tool '{tool_name}'."}

        # ==================== Handle the Always permission allowlist ====================
        if approval_type == "always":
            if cwd:
                try:
                    add_tool_to_project_config(cwd, tool_name)
                    print(f"[Permission] Added {tool_name} to whitelist for project {cwd}")
                except Exception as e:
                    return {"result": f"[System Error] Failed to save permission: {str(e)}"}
            else:
                 return {"result": "[System Error] No working directory found to save config."}

        # ==================== Delegate execution directly to dispatch_tool ====================
        result = await dispatch_tool(tool_name, tool_params, settings, force_allow=True)
        
        if inspect.isawaitable(result):
            result = await result

        # ==================== Stream results from AsyncIterator ====================
        # If the tool streams output, return StreamingResponse as SSE data events
        if inspect.isgenerator(result) or inspect.isasyncgen(result) or hasattr(result, "__aiter__"):
            async def event_generator():
                try:
                    async for chunk in result:
                        yield f"data: {json.dumps({'chunk': chunk}, ensure_ascii=False)}\n\n"
                except Exception as stream_err:
                    yield f"data: {json.dumps({'error': str(stream_err)}, ensure_ascii=False)}\n\n"
            return StreamingResponse(event_generator(), media_type="text/event-stream")
            
        # Ordinary tool result (single response)
        return {"result": str(result)}

    except Exception as e:
        traceback.print_exc()
        return {"result": f"Backend System Error: {str(e)}\n{traceback.format_exc()}"}


# Additional route
@app.get("/v1/models")
async def get_models():
    """
    Get the model list.
    """
    from openai.types import Model
    from openai.pagination import SyncPage
    try:
        # Reload current settings
        current_settings = await load_settings()
        agents = current_settings['agents']
        # Construct OpenAI-compatible Model objects
        model_data = [
            Model(
                id=agent["name"],  
                created=0,  
                object="model",
                owned_by="super-agent-party"  # Nonempty string
            )
            for agent in agents.values()  
        ]
        # Add default super-model
        model_data.append(
            Model(
                id='super-model',
                created=0,
                object="model",
                owned_by="super-agent-party"  # Nonempty string
            )
        )

        # Construct the full SyncPage response
        response = SyncPage[Model](
            object="list",
            data=model_data,
            has_more=False  # Pagination flag
        )
        # Return the model dictionary for FastAPI JSON serialization
        return response.model_dump()  
        
    except Exception as e:
        return JSONResponse(
            status_code=e.status_code,
            content={
                "error": {
                    "message": str(e),
                    "type": "api_error",
                }
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": str(e),
                    "type": "server_error",
                    "code": 500
                }
            }
        )

# Additional route
@app.get("/v1/agents",operation_id="get_agents")
async def get_agents():
    """
    Get the model list.
    """
    from openai.types import Model
    from openai.pagination import SyncPage
    try:
        # Reload current settings
        current_settings = await load_settings()
        agents = current_settings['agents']
        # Construct OpenAI-compatible Model objects
        model_data = [
            {
                "name": agent["name"],
                "description": agent["system_prompt"],
            }
            for agent in agents.values()  
        ]
        # Add default super-model
        model_data.append(
            {
                "name": 'super-model',
                "description": "Super-Agent-Party default agent",
            }
        )
        return model_data
        
    except Exception as e:
        return JSONResponse(
            status_code=e.status_code,
            content={
                "error": {
                    "message": str(e),
                    "type": "api_error",
                }
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "message": str(e),
                    "type": "server_error",
                    "code": 500
                }
            }
        )

class ProviderModelRequest(BaseModel):
    url: str
    api_key: str
    vendor: Optional[str] = None  # Optional provider field

@app.post("/v1/providers/models")
async def fetch_provider_models(request: ProviderModelRequest):
    try:
        global global_http_client
        vendor = getattr(request, 'vendor', None)
        print(f"Fetching models from provider: {vendor} at URL: {request.url}")
        # 1. Handle Claude
        if vendor == 'customAnthropic':
            client = AsyncClaudeAsOpenAI(
                api_key=request.api_key, 
                base_url=request.url,
                http_client=global_http_client
            )
        # 2. Handle Gemini
        elif vendor == 'Gemini':
            client = AsyncGeminiAsOpenAI(
                api_key=request.api_key,
                base_url=request.url,
                http_client=global_http_client
            )
        # 2.5. Handle OpenAI Responses API
        elif vendor == 'OpenAIResponses':
            client = AsyncResponsesAsOpenAI(
                api_key=request.api_key,
                base_url=request.url,
                http_client=global_http_client
            )
        # 3. Handle Dify
        elif vendor == 'Dify':
            client = DifyOpenAIAsync(
                api_key=request.api_key, 
                base_url=request.url,
                http_client=global_http_client
            )
        # 4. Fall back to standard OpenAI
        else:
            client = AsyncOpenAI(
                api_key=request.api_key, 
                base_url=request.url,
                http_client=global_http_client
            )

        model_list = await client.models.list()
        return JSONResponse(content={"data":[model.id for model in model_list.data]})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions", operation_id="chat_with_agent_party")
async def chat_endpoint(request: ChatRequest, fastapi_request: Request):
    """
    Chat with the configured agent party model.
    """
    fastapi_base_url = str(fastapi_request.base_url)
    # Use the global fast_client
    global client, reasoner_client, fast_client, settings, mcp_client_list
    
    raw_model = request.model or 'super-model'
    override_memory_id = None
    
    if raw_model.startswith("memory/"):
        parts = raw_model.split('/', 2) 
        if len(parts) >= 2:
            override_memory_id = parts[1]
            request.model = parts[2] if len(parts) > 2 else 'super-model'
            print(f"Dynamic memory ID detected: {override_memory_id}; target model updated to {request.model}")
    
    model = request.model or 'super-model'
    enable_thinking = request.enable_thinking or False
    enable_deep_research = request.enable_deep_research or False
    enable_web_search = request.enable_web_search or False
    async_tools_id = request.asyncToolsID or None

    current_settings = await load_settings()
    if current_settings.get("systemSettings", {}).get("contentSafety", False):
        all_text = ""
        for msg in request.messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                all_text += " " + content
            elif isinstance(content, list):
                all_text += " " + " ".join(item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text")
        is_safe, matched = await check_content_safety(all_text)
        if not is_safe:
            print(f"[content_safety] input blocked words: {matched}")
            return JSONResponse(
                status_code=403,
                content={"error": {"message": "Your input was blocked by the content safety policy.", "type": "content_safety", "code": 403}}
            )

    local_history = None
    if model == 'super-model' and not request.is_app_bot and not request.is_sub_agent:
        local_history = capture_text_history(
            request.messages, local_context_window(os.environ.get("SAP_LOCAL_CONTEXT_WINDOW"))
        )
    try:
        await _apply_group_memory_context(request)
    except ContextHistoryError as exc:
        return JSONResponse(
            status_code=400,
            content={"error": {"message": str(exc), "type": "invalid_request_error", "code": 400}}
        )

    if model == 'super-model':
        current_settings = await load_settings()
        
        # Create request-specific settings to avoid mutating global configuration
        request_settings = current_settings.copy()
        active_client = client  # Use the main model by default
        
        if current_settings['fast']['enabled'] and not request.is_sub_agent:
            fast_cfg = current_settings['fast']
            use_fast_model = False
            
            if fast_cfg.get('triggerMode') == 'always':
                use_fast_model = True
            elif fast_cfg.get('triggerMode') == 'conditional':
                last_user_text = ""
                has_image = False
                for msg in reversed(request.messages):
                    if msg.get('role') == 'user':
                        content = msg.get('content')
                        if isinstance(content, str):
                            last_user_text = content
                        elif isinstance(content, list):
                            texts = []
                            for item in content:
                                if item.get('type') == 'text':
                                    texts.append(item.get('text', ''))
                                elif item.get('type') == 'image_url':
                                    has_image = True
                            last_user_text = "".join(texts)
                        break
                
                has_files = bool(request.fileLinks) 
                condition_pass = True
                
                max_len = fast_cfg.get('conditionMaxLen', 0)
                if max_len > 0 and len(last_user_text) > max_len:
                    condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoNewline', False):
                    if '\n' in last_user_text:
                        condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoFiles', True):
                    if has_image or has_files:
                        condition_pass = False
                        
                if condition_pass:
                    use_fast_model = True

            if use_fast_model:
                exclude_keys = ['enabled', 'triggerMode', 'conditionMaxLen', 'conditionNoNewline', 'conditionNoFiles']
                fast_config = {k: v for k, v in fast_cfg.items() if k not in exclude_keys}
                
                # Update request-specific settings without affecting current_settings
                request_settings.update(fast_config)
                
                # Refresh the quick model client only when its configuration changes
                old_fast_cfg = settings.get('fast', {}) if settings else {}
                if (fast_client is None 
                    or fast_cfg.get('api_key') != old_fast_cfg.get('api_key') 
                    or fast_cfg.get('base_url') != old_fast_cfg.get('base_url')):
                    
                    f_provider = fast_cfg.get('selectedProvider', current_settings.get('selectedProvider'))
                    f_class = get_client_class(current_settings, f_provider)
                    fast_client = f_class(
                        api_key=fast_cfg.get('api_key') or current_settings.get('api_key'),
                        base_url=fast_cfg.get('base_url') or current_settings.get('base_url') or "https://api.openai.com/v1"
                    )
                    _wrap_client_chat_with_retry(fast_client)

                # Use the quick client for this request
                active_client = fast_client

        if override_memory_id:
            request_settings["memorySettings"]["is_memory"] = True
            request_settings["memorySettings"]["selectedMemory"] = override_memory_id
            
        if len(current_settings['modelProviders']) <= 0:
            return JSONResponse(status_code=500, content={"error": {"message": await t("NoModelProvidersConfigured"), "type": "server_error", "code": 500}})

        # Refresh the main model client only when its configuration changes
        if (current_settings['api_key'] != settings['api_key'] 
            or current_settings['base_url'] != settings['base_url']
            or client is None):
            c_class = get_client_class(current_settings, current_settings['selectedProvider'])
            client = c_class(
                api_key=current_settings['api_key'],
                base_url=current_settings['base_url'] or "https://api.openai.com/v1",
            )
            _wrap_client_chat_with_retry(client)
            # When quick mode is not triggered, use the latest main client
            if active_client != fast_client:
                active_client = client

        # Refresh the reasoning client
        if (current_settings['reasoner']['api_key'] != settings['reasoner']['api_key'] 
            or current_settings['reasoner']['base_url'] != settings['reasoner']['base_url']
            or reasoner_client is None):
            r_class = get_client_class(current_settings, current_settings['reasoner']['selectedProvider'])
            reasoner_client = r_class(
                api_key=current_settings['reasoner']['api_key'],
                base_url=current_settings['reasoner']['base_url'] or "https://api.openai.com/v1",
            )
            _wrap_client_chat_with_retry(reasoner_client)

        print('model:', request_settings['model'])
        
        # Insert system_prompt into request.messages[0].content using request_settings
        if request_settings['system_prompt']:
            content_prepend(request.messages, 'system', request_settings['system_prompt'] + "\n\n")
            
        # Compare against unmodified current_settings
        if current_settings != settings:
            settings = current_settings
            
        try:
            # Pass active_client for immediate switching and request_settings
            if request.stream:
                cli_settings = request_settings.get("CLISettings", {})
                engine = cli_settings.get("engine", "")
                if engine == "local":
                    env_settings = request_settings.get("localEnvSettings", {})
                elif engine == "ds":
                    env_settings = request_settings.get("dsSettings", {})
                elif engine == "wsl":
                    env_settings = request_settings.get("wslSettings", {})
                else:
                    env_settings = request_settings.get("acpSettings", {})
                permission_mode = env_settings.get("permissionMode", "default")
                goal_mode_active = (permission_mode == "goal" and cli_settings.get("enabled", False) and not request.is_sub_agent)
                max_goal_iterations = request_settings.get("systemSettings", {}).get("goal_iterations", 30)

                if not goal_mode_active:
                    return await generate_stream_response(active_client, reasoner_client, request, request_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, async_tools_id, local_history=local_history)

                async def goal_wrapper(iteration_counter):
                    while True:
                        msg_count_before = len(request.messages)
                        stream_resp = await generate_stream_response(active_client, reasoner_client, request, request_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, async_tools_id)
                        async for chunk in stream_resp.body_iterator:
                            if isinstance(chunk, bytes):
                                chunk = chunk.decode('utf-8')
                            if chunk.startswith("data: [DONE]"):
                                continue
                            yield chunk

                        finish_called = False
                        for msg in request.messages[msg_count_before:]:
                            tcs = msg.get("tool_calls", []) if isinstance(msg, dict) else []
                            for tc in (tcs or []):
                                if isinstance(tc, dict) and tc.get("function", {}).get("name") == "finish_main_task":
                                    finish_called = True
                                    break
                            if finish_called:
                                break

                        if finish_called:
                            yield "data: [DONE]\n\n"
                            return

                        iteration_counter[0] += 1
                        if iteration_counter[0] >= max_goal_iterations:
                            max_chunk = {"choices": [{"delta": {"content": f"\n\nMaximum goal iterations reached ({max_goal_iterations}); the task has ended automatically."}}]}
                            yield f"data: {json.dumps(max_chunk)}\n\n"
                            yield "data: [DONE]\n\n"
                            return

                        request.messages.append({
                            "role": "user",
                            "content": "Assess whether the task is complete. If it is, call finish_main_task with the final output to mark it complete; otherwise continue working."
                        })

                return StreamingResponse(goal_wrapper([0]), media_type="text/event-stream")
            return await generate_complete_response(active_client, reasoner_client, request, request_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, local_history=local_history)
        except asyncio.CancelledError:
            print("Client disconnected")
            raise
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": {"message": str(e), "type": "server_error", "code": 500}})
            
    else:
        # ===== Agent handling =====
        # agent_settings is a new dictionary loaded from JSON on each request,
        # so these settings do not mutate the shared main-model configuration.
        
        current_settings = await load_settings()
        agentSettings = current_settings['agents'].get(model, {})
        if not agentSettings:
            for agentId , agentConfig in current_settings['agents'].items():
                if current_settings['agents'][agentId]['name'] == model:
                    agentSettings = current_settings['agents'][agentId]
                    break
        if not agentSettings:
            return JSONResponse(status_code=404, content={"error": {"message": f"Agent {model} not found", "type": "not_found", "code": 404}})
            
        # Read a fresh agent_settings dictionary each time
        if agentSettings['config_path']:
            with open(agentSettings['config_path'], 'r' , encoding='utf-8') as f:
                agent_settings = json.load(f)
            if agentSettings['system_prompt']:
                content_prepend(request.messages, 'user', agentSettings['system_prompt'] + "\n\n")
        
        if agent_settings['fast']['enabled'] and not request.is_sub_agent:
            fast_cfg = agent_settings['fast']
            use_fast_model = False
            
            if fast_cfg.get('triggerMode') == 'always':
                use_fast_model = True
            elif fast_cfg.get('triggerMode') == 'conditional':
                last_user_text = ""
                has_image = False
                for msg in reversed(request.messages):
                    if msg.get('role') == 'user':
                        content = msg.get('content')
                        if isinstance(content, str):
                            last_user_text = content
                        elif isinstance(content, list):
                            texts = []
                            for item in content:
                                if item.get('type') == 'text':
                                    texts.append(item.get('text', ''))
                                elif item.get('type') == 'image_url':
                                    has_image = True
                            last_user_text = "".join(texts)
                        break
                
                has_files = bool(request.fileLinks)
                condition_pass = True
                max_len = fast_cfg.get('conditionMaxLen', 0)
                if max_len > 0 and len(last_user_text) > max_len: condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoNewline', False):
                    if '\n' in last_user_text: condition_pass = False
                if condition_pass and fast_cfg.get('conditionNoFiles', True):
                    if has_image or has_files: condition_pass = False
                        
                if condition_pass:
                    use_fast_model = True

            if use_fast_model:
                exclude_keys = ['enabled', 'triggerMode', 'conditionMaxLen', 'conditionNoNewline', 'conditionNoFiles']
                fast_config = {k: v for k, v in fast_cfg.items() if k not in exclude_keys}
                agent_settings.update(fast_config) # Safe to update this local agent settings dictionary
                
        # Reuse the helper above
        a_client_class = get_client_class(agent_settings, agent_settings.get('selectedProvider'))
        agent_client = a_client_class(
            api_key=agent_settings.get('api_key', ''),
            base_url=agent_settings.get('base_url') or "https://api.openai.com/v1"
        )
        _wrap_client_chat_with_retry(agent_client)

        ar_client_class = get_client_class(agent_settings, agent_settings.get('reasoner', {}).get('selectedProvider'))
        agent_reasoner_client = ar_client_class(
            api_key=agent_settings.get('reasoner', {}).get('api_key', ''),
            base_url=agent_settings.get('reasoner', {}).get('base_url') or "https://api.openai.com/v1"
        )
        _wrap_client_chat_with_retry(agent_reasoner_client)
        
        try:
            if request.stream:
                return await generate_stream_response(agent_client, agent_reasoner_client, request, agent_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search, async_tools_id)
            return await generate_complete_response(agent_client, agent_reasoner_client, request, agent_settings, fastapi_base_url, enable_thinking, enable_deep_research, enable_web_search)
        except asyncio.CancelledError:
            print("Client disconnected")
            raise
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": {"message": str(e), "type": "server_error", "code": 500}})

@app.post("/simple_chat")
async def simple_chat_endpoint(request: ChatRequest):
    """
    Supports both streaming (stream=true) and non-streaming (stream=false).
    Uses fast_client by default for faster responses.
    """
    global fast_client, settings

    current_settings = await load_settings()
    if len(current_settings['modelProviders']) <= 0:
        return JSONResponse(
            status_code=500,
            content={"error": {"message": await t("NoModelProvidersConfigured"),
                               "type": "server_error", "code": 500}}
        )

    # safety check for all input including system prompt
    if current_settings.get("systemSettings", {}).get("contentSafety", False):
        all_text = ""
        for msg in request.messages:
            all_text += " " + _extract_text_content(msg.get("content", ""))
        is_safe, matched = await check_content_safety(all_text)
        if not is_safe:
            print(f"[content_safety] blocked words: {matched}")
            return JSONResponse(
                status_code=403,
                content={"error": {"message": "Your input was blocked by the content safety policy.",
                                   "type": "content_safety", "code": 403}}
            )

    fast_cfg = current_settings.get('fast', {})
    
    # Initialize or refresh fast_client
    if (fast_client is None 
        or fast_cfg.get('api_key') != settings.get('fast', {}).get('api_key')
        or fast_cfg.get('base_url') != settings.get('fast', {}).get('base_url')):
        
        f_provider = fast_cfg.get('selectedProvider', current_settings.get('selectedProvider'))
        f_class = get_client_class(current_settings, f_provider)
        fast_client = f_class(
            api_key=fast_cfg.get('api_key') or current_settings.get('api_key'),
            base_url=fast_cfg.get('base_url') or current_settings.get('base_url') or "https://api.openai.com/v1"
        )
        _wrap_client_chat_with_retry(fast_client)
    
    # Override current request settings with quick-model settings
    if fast_cfg:
        exclude_keys = ['enabled', 'triggerMode', 'conditionMaxLen', 'conditionNoNewline', 'conditionNoFiles']
        fast_config = {k: v for k, v in fast_cfg.items() if k not in exclude_keys}
        for key, value in fast_config.items():
            current_settings[key] = value

    # --------------- Call the model ---------------
    response = await fast_client.chat.completions.create(
        model=current_settings['model'],
        messages=request.messages,
        stream=request.stream,
        temperature=request.temperature or settings.get('temperature', 0.7),
    )

    # --------------- Non-streaming: return JSON once ---------------
    if not request.stream:
        # OpenAI returns a ChatCompletion object
        return JSONResponse(content=response.model_dump())

    # --------------- Streaming: retain StreamingResponse ---------------
    async def openai_raw_stream():
        async for chunk in response:
            yield chunk.model_dump_json() + '\n'
        # Do not send [DONE]

    return StreamingResponse(
        openai_raw_stream(),
        media_type="text/plain",      # May also use text/event-stream
        headers={"Cache-Control": "no-cache"}
    )

class GroupMemoryExtractRequest(BaseModel):
    group_id: Union[str, int, float]
    conversation_id: Union[str, int, float]
    user_message_id: Optional[Union[str, int, float]] = None
    assistant_message_id: Optional[Union[str, int, float]] = None
    user_message: str
    assistant_message: str

class DeleteConversationRequest(BaseModel):
    conversation_id: Union[str, int, float]
    delete_memory: bool = False

class ClearGroupMemoryRequest(BaseModel):
    group_id: Union[str, int, float]

@app.post("/api/group-memory/extract")
async def extract_group_memory_endpoint(req: GroupMemoryExtractRequest):
    req.group_id = _normalize_entity_id(req.group_id)
    req.conversation_id = _normalize_entity_id(req.conversation_id)
    req.user_message_id = _normalize_entity_id(req.user_message_id) or None
    req.assistant_message_id = _normalize_entity_id(req.assistant_message_id) or None

    group_map = await _load_group_map()
    group = group_map.get(req.group_id)
    if not group or not (group.get("memoryConfig") or {}).get("enabled"):
        return {"success": True, "memories": 0}

    current_settings = await load_settings()
    client_class = get_client_class(current_settings, current_settings.get('selectedProvider'))
    memory_client = client_class(
        api_key=current_settings.get('api_key'),
        base_url=current_settings.get('base_url') or "https://api.openai.com/v1",
    )
    memories = await _extract_group_memories(memory_client, current_settings, req.model_dump())
    await _upsert_group_memories(
        req.group_id,
        req.conversation_id,
        req.assistant_message_id or req.user_message_id or req.conversation_id,
        memories,
    )
    return {"success": True, "memories": len(memories)}

@app.post("/api/conversations/delete")
async def delete_conversation_endpoint(req: DeleteConversationRequest):
    req.conversation_id = _normalize_entity_id(req.conversation_id)
    covs = await load_covs()
    conversations = covs.get("conversations", []) or []
    covs["conversations"] = [conv for conv in conversations if conv.get("id") != req.conversation_id]
    await save_covs(covs)
    if req.delete_memory:
        await _invalidate_group_memories_by_chat(req.conversation_id)
    return {"success": True}

@app.post("/api/group-memory/clear-group")
async def clear_group_memory_endpoint(req: ClearGroupMemoryRequest):
    req.group_id = _normalize_entity_id(req.group_id)
    await _invalidate_group_memories_by_group(req.group_id)
    return {"success": True}

@app.post("/api/group-memory/clear-all")
async def clear_all_group_memory_endpoint():
    await _invalidate_all_group_memories()
    return {"success": True}

from py.task_center import get_task_center
from py.sub_agent import run_subtask_in_background

# --- Task center API ---

class TaskCreateRequest(BaseModel):
    title: str
    description: str
    agent_type: str = "default"
    task_type: str = "once"  # once, time, cycle
    platforms: List[str] = []
    trigger_config: Optional[Dict[str, Any]] = None

@app.get("/v1/tasks/list")
async def list_tasks_endpoint():
    """Get all tasks in the current workspace."""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    
    if not workspace_dir:
        return {"tasks": [], "error": "No workspace configured"}
        
    try:
        task_center = await get_task_center(workspace_dir)
        tasks = await task_center.list_tasks()
        return {"tasks": [t.model_dump() for t in tasks]}
    except Exception as e:
        return {"tasks": [], "error": str(e)}

@app.post("/v1/tasks/create")
async def create_task_endpoint(req: TaskCreateRequest):
    """Create a task manually: one-time, scheduled or periodic."""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    
    if not workspace_dir:
        raise HTTPException(status_code=400, detail="Workspace path is not configured")

    try:
        task_center = await get_task_center(workspace_dir)
        
        # Construct initial context
        context = {
            "task_type": req.task_type,
            "trigger_config": getattr(req, "trigger_config", {}), # Default if missing
            "history": [],
            "ran_count": 0
        }
        
        # 1. Create the task record and pass req.platforms
        task = await task_center.create_task(
            title=req.title,
            description=req.description,
            agent_type=req.agent_type,
            parent_task_id="USER",
            context=context,
            platforms=req.platforms  # Pass the requested platforms
        )
        
        # 2. Read consensus (optional)
        consensus_content = None
        consensus_file = Path(workspace_dir) / ".agents" / "consensus.md"
        if consensus_file.exists():
            import aiofiles
            async with aiofiles.open(consensus_file, 'r', encoding='utf-8') as f:
                consensus_content = await f.read()

        # 3. Dispatch execution
        if req.task_type == "once":
            # Immediate mode: submit to the background worker
            asyncio.create_task(
                run_subtask_in_background(
                    task_id=task.task_id,
                    workspace_dir=workspace_dir,
                    settings=current_settings,
                    consensus_content=consensus_content
                )
            )
            msg = "Task started"
        else:
            # For scheduled or periodic mode, scheduler.py executes later; save only here
            msg = f"Scheduled task created (mode: {req.task_type})"
            
        return {"success": True, "message": msg, "task": task.model_dump()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
    
@app.post("/v1/tasks/cancel/{task_id}")
async def cancel_task_endpoint(task_id: str):
    """Cancel a task."""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    if not workspace_dir:
        raise HTTPException(status_code=400, detail="No workspace")
        
    task_center = await get_task_center(workspace_dir)
    success = await task_center.cancel_task(task_id)
    return {"success": success}

@app.delete("/v1/tasks/{task_id}")
async def delete_task_endpoint(task_id: str):
    """Delete a task."""
    current_settings = await load_settings()
    workspace_dir = current_settings.get("CLISettings", {}).get("cc_path")
    if not workspace_dir:
        raise HTTPException(status_code=400, detail="No workspace")
        
    task_center = await get_task_center(workspace_dir)
    success = await task_center.delete_task(task_id)
    return {"success": success}

def sanitize_proxy_url(input_url: str) -> str:
    """
    URL filtering for proxy requests.
    """
    if not input_url:
        raise HTTPException(status_code=400, detail="URL must not be empty")
    
    # 1. Parse URL
    parsed = urlparse(input_url)
    
    # 2. Validate the protocol (disallow file://, gopher://, etc.)
    if parsed.scheme not in ["http", "https"]:
        raise HTTPException(status_code=400, detail="Only http or https URLs are supported")
    
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid domain or IP address")

    # 3. Reconstruct the URL from selected components
    # Exclude userinfo; retain only necessary components
    safe_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    if parsed.query:
        safe_url += f"?{parsed.query}"
    if parsed.fragment:
        safe_url += f"#{parsed.fragment}"

    # 4. Private-network checks
    if is_private_ip(parsed.hostname):
        logger.warning(f"Internal access detected: {safe_url}")

    return safe_url

@app.api_route("/extension_proxy", methods=["GET", "POST"])
async def extension_proxy(request: Request, url: str):
    """
    General proxy endpoint for SAP plugins to access URLs despite browser CORS restrictions.
    """
    BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    # --- Stage A: validate requests to limit SSRF risk ---
    try:
        target_url = sanitize_proxy_url(url)
    except HTTPException as e:
        return Response(content=e.detail, status_code=e.status_code)
    
    # --- Stage B: execute the proxy request ---
    method = request.method
    body = await request.body()
    
    # Construct headers with necessary fields and identification
    # Exclude headers that could leak fingerprints or cause rejection
    excluded_headers = {
        'host', 'content-length', 'connection', 'keep-alive', 
        'upgrade-insecure-requests', 'accept-encoding', 'cookie', 'user-agent'
    }
    
    headers = {
        k: v for k, v in request.headers.items() 
        if k.lower() not in excluded_headers
    }
    
    # Use a standard browser user-agent
    headers["User-Agent"] = BROWSER_USER_AGENT
    
    # Declare support for XML and RSS content
    if "accept" not in headers or "*/*" in headers["accept"]:
        headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"

    # Handle Referer according to the target site's requirements
    # Prefer omitting Referer or using the target origin
    headers.pop("Referer", None) 
    
    print(f"--- [Extension Proxy] ---")
    print(f"Target: {target_url} | Method: {method} | Mode: Browser Emulation")
    
    # trust_env=False prevents unintended system HTTP proxy use
    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=30.0, trust_env=False) as client:
        try:
            resp = await client.request(
                method=method,
                url=target_url,
                headers=headers,
                content=body
            )
            
            # Filter response headers to avoid forwarding incompatible encoding or transfer metadata
            resp_headers = {
                k: v for k, v in resp.headers.items()
                if k.lower() not in {
                    'content-encoding', 'content-length', 'transfer-encoding', 
                    'server', 'set-cookie' # Do not forward Set-Cookie
                }
            }
            
            # Return a 403 response body for frontend diagnostics
            if resp.status_code == 403:
                print(f"[Proxy Warning] Target returned 403. Body sample: {resp.content[:100]}")

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=resp_headers,
                media_type=resp.headers.get("content-type", "application/octet-stream")
            )

        except httpx.ConnectError as e:
            err_msg = f"Proxy Connect Error: {e}"
            # Return structured JSON errors for frontend handling
            return Response(content=f'{{"error": "{err_msg}"}}', status_code=502, media_type="application/json")
            
        except Exception as e:
            print(f"[Proxy Error] System: {repr(e)}")
            return Response(content='{"error": "Internal Proxy Error"}', status_code=500, media_type="application/json")

        
# Store active ASR WebSocket connections
asr_connections = []

# Store audio frames for each connection
audio_buffer: Dict[str, Dict[str, Any]] = {}

# ASR WebSocket handling
@app.websocket("/ws/asr")
async def asr_websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Generate unique connection ID
    connection_id = str(uuid.uuid4())
    asr_connections.append(websocket)
    # Track connection state
    asr_engine = None
    
    try:
        # Process messages
        async for message in websocket.iter_json():
            msg_type = message.get("type")
            
            if msg_type == "init":
                # Load settings
                settings = await load_settings()
                asr_settings = settings.get('asrSettings', {})
                asr_engine = asr_settings.get('engine', 'sherpa')  # Store engine type
                if asr_engine not in ("sherpa", "openai"):
                    await websocket.send_json({"type": "error", "message": "Unsupported speech engine. Select a supported engine in speech recognition settings."})
                    continue
                await websocket.send_json({
                    "type": "init_response",
                    "status": "ready"
                })
                print("ASR WebSocket connected:",asr_engine)
            elif msg_type in ("audio_start", "audio_stream"):
                # Retained clients may send these events; supported engines use complete audio.
                continue
            elif msg_type == "audio_complete":
                # Process complete audio data in non-streaming mode
                frame_id = message.get("id")
                audio_b64 = message.get("audio")
                audio_format = message.get("format", "wav")
                
                if audio_b64:
                    # Decode Base64 data
                    audio_bytes = base64.b64decode(audio_b64)
                    print(f"Received audio data: {len(audio_bytes)} bytes, format: {audio_format}")
                    
                    try:
                        # Load settings
                        settings = await load_settings()
                        asr_settings = settings.get('asrSettings', {})
                        asr_engine = asr_settings.get('engine', 'sherpa')
                        if asr_engine not in ("sherpa", "openai"):
                            await websocket.send_json({"type": "error", "id": frame_id, "message": "Unsupported speech engine. Select a supported engine in speech recognition settings."})
                            continue
                        
                        result = ""
                        
                        if asr_engine == "openai":
                            # OpenAI ASR
                            audio_file = BytesIO(audio_bytes)
                            audio_file.name = f"audio.{audio_format}"
                            
                            client = AsyncOpenAI(
                                api_key=asr_settings.get('api_key', ''),
                                base_url=asr_settings.get('base_url', '') or "https://api.openai.com/v1"
                            )
                            response = await client.audio.transcriptions.create(
                                file=audio_file,
                                model=asr_settings.get('model', 'whisper-1'),
                            )
                            result = response.text
                            # Send result
                            await websocket.send_json({
                                "type": "transcription",
                                "id": frame_id,
                                "text": result,
                                "is_final": True
                            })
                        elif asr_engine == "sherpa":
                            from py.sherpa_asr import sherpa_recognize
                            # Handle Sherpa
                            result = await sherpa_recognize(audio_bytes)
                            print(f"Sherpa result: {result}")
                            await websocket.send_json({
                                "type": "transcription",
                                "id": frame_id,
                                "text": result,
                                "is_final": True
                            })

                    except WebSocketDisconnect:
                        print(f"ASR WebSocket disconnected: {connection_id}")
                    except Exception as e:
                        print(f"ASR WebSocket error: {e}")
    finally:
        # Clean up resources
        if connection_id in audio_buffer:
            del audio_buffer[connection_id]
        if websocket in asr_connections:
            asr_connections.remove(websocket)

@app.post("/asr")
async def asr_transcription(
    audio: UploadFile = File(...),
    format: str = Form(default="auto")
):
    """
    HTTP ASR endpoint.
    Supports multiple audio formats and selects the configured ASR engine.
    """
    # Use the global cache
    global openai_asr_clients_cache, settings

    try:
        # 1. Read the uploaded audio
        audio_bytes = await audio.read()
        print(f"Received audio file: {audio.filename}, size: {len(audio_bytes)} bytes")
        
        # 2. Detect the format
        if format == "auto":
            if audio.filename:
                file_ext = audio.filename.split('.')[-1].lower()
                format = file_ext if file_ext in ['wav', 'mp3', 'flac', 'ogg', 'm4a'] else 'wav'
            else:
                format = 'wav'
        
        # 3. Load settings
        current_settings = await load_settings()
        asr_settings = current_settings.get('asrSettings', {})
        asr_engine = asr_settings.get('engine', 'sherpa')
        
        result = ""
        
        # ==========================================
        # ASR engine: OpenAI (Whisper)
        # ==========================================
        if asr_engine == "openai":
            api_key = asr_settings.get('api_key', '')
            base_url = asr_settings.get('base_url', '') or "https://api.openai.com/v1"
            
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI ASR API key is not configured")

            # Use the cached client
            cache_key = (api_key, base_url)
            if cache_key not in openai_asr_clients_cache:
                print(f"Initializing new OpenAI ASR Client for: {base_url}")
                openai_asr_clients_cache[cache_key] = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url
                )
            client = openai_asr_clients_cache[cache_key]
            # --------------------------------

            print(f"Using OpenAI ASR engine ({asr_settings.get('model', 'whisper-1')})")
            
            # Wrap audio data
            audio_file = BytesIO(audio_bytes)
            # The OpenAI SDK requires a filename extension to detect format
            audio_file.name = f"audio.{format}"
            
            response = await client.audio.transcriptions.create(
                file=audio_file,
                model=asr_settings.get('model', 'whisper-1'),
            )
            result = response.text
            
        # ==========================================
        # ASR engine: local Sherpa
        # ==========================================
        elif asr_engine == "sherpa":
            from py.sherpa_asr import sherpa_recognize
            print("Using Sherpa ASR engine")
            # Sherpa inference consumes CPU/GPU resources rather than connection setup time
            result = await sherpa_recognize(audio_bytes)
        

        else:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": f"Unsupported ASR engine: {asr_engine}",
                    "text": ""
                }
            )
        
        # 4. Return recognition result
        return JSONResponse(
            content={
                "success": True,
                "text": result.strip() if result else "",
                "engine": asr_engine,
                "format": format
            }
        )
        
    except Exception as e:
        print(f"ASR HTTP interface error: {e}")
        import traceback
        traceback.print_exc()
        
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "text": ""
            }
        )

class TTSConnectionManager:
    def __init__(self):
        self.main_connections: List[WebSocket] = []
        self.vrm_connections: List[WebSocket] = []
        self.tha_connections: List[WebSocket] = []
        self.soulx_connections: List[WebSocket] = []
        self.overlay_connections: list[WebSocket] = []

    async def connect_main(self, websocket: WebSocket):
        await websocket.accept()
        self.main_connections.append(websocket)
        logging.info(f"Main interface connected. Total: {len(self.main_connections)}")

    async def connect_vrm(self, websocket: WebSocket):
        await websocket.accept()
        self.vrm_connections.append(websocket)
        logging.info(f"VRM interface connected. Total: {len(self.vrm_connections)}")

    async def connect_tha(self, websocket: WebSocket):
        await websocket.accept()
        self.tha_connections.append(websocket)
        logging.info(f"THA interface connected. Total: {len(self.tha_connections)}")

    def disconnect_main(self, websocket: WebSocket):
        if websocket in self.main_connections:
            self.main_connections.remove(websocket)

    def disconnect_vrm(self, websocket: WebSocket):
        if websocket in self.vrm_connections:
            self.vrm_connections.remove(websocket)

    def disconnect_tha(self, websocket: WebSocket):
        if websocket in self.tha_connections:
            self.tha_connections.remove(websocket)

    async def connect_soulx(self, websocket: WebSocket):
        await websocket.accept()
        self.soulx_connections.append(websocket)
        logging.info(f"SoulX interface connected. Total: {len(self.soulx_connections)}")

    def disconnect_soulx(self, websocket: WebSocket):
        if websocket in self.soulx_connections:
            self.soulx_connections.remove(websocket)

    async def broadcast_to_vrm(self, message: Union[str, bytes]):
        """Forward both JSON strings and binary blobs."""
        if not self.vrm_connections:
            return
        disconnected = []
        for connection in self.vrm_connections:
            try:
                if isinstance(message, bytes):
                    await connection.send_bytes(message)
                else:
                    await connection.send_text(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_vrm(conn)

    async def send_to_main(self, message: str):
        if not self.main_connections:
            return
        disconnected = []
        for connection in self.main_connections:
            try:
                await connection.send_text(message)
            except:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_main(conn)

    async def connect_overlay(self, websocket: WebSocket):
        """Dedicated subtitle-page connection."""
        await websocket.accept()
        self.overlay_connections.append(websocket)

    def disconnect_overlay(self, websocket: WebSocket):
        if websocket in self.overlay_connections:
            self.overlay_connections.remove(websocket)

    async def broadcast_to_vrm(self, message: Union[str, bytes]):
        """Broadcast according to content type."""
        # 1. Forward binary audio to VRM and SoulX windows
        if isinstance(message, bytes):
            for conn in list(self.vrm_connections):
                try: await conn.send_bytes(message)
                except: self.disconnect_vrm(conn)
            for conn in list(self.soulx_connections):
                try: await conn.send_bytes(message)
                except: self.disconnect_soulx(conn)
        
        # 2. Forward text and commands to VRM, SoulX and subtitles
        else:
            for conn in list(self.vrm_connections):
                try: await conn.send_text(message)
                except: self.disconnect_vrm(conn)
            for conn in list(self.soulx_connections):
                try: await conn.send_text(message)
                except: self.disconnect_soulx(conn)
            for conn in list(self.overlay_connections):
                try: await conn.send_text(message)
                except: self.disconnect_overlay(conn)

    async def broadcast_emotion_to_tha(self, emotion: str):
        """Send one expression or motion tag to all THA pose generators."""
        await self.broadcast_expressions_to_tha([emotion])

    async def broadcast_expressions_to_tha(self, expressions: list):
        """Parse and blend weighted expression tags; trigger motion tags once.

        Formats: "happy" (weight 1.0) and "happy:0.3" (weighted).
        Blend multiple expressions through compose_emotion_pose to avoid conflicts.
        """
        from py.tha_engine import THA_MOTIONS

        # Deduplication fast path: omniStreaming resends accumulated tags on each increment.
        # Most increments have unchanged tags; a list comparison skips unnecessary
        # parsing, composition and broadcasting.
        # If the old list is a prefix, process only the new suffix; otherwise process all tags.
        exps = [str(e) for e in expressions]
        prev = getattr(self, '_last_tha_expressions', None)
        if prev == exps:
            return
        if prev is not None and len(exps) > len(prev) and exps[:len(prev)] == prev:
            batch = exps[len(prev):]
        else:
            batch = exps
        self._last_tha_expressions = exps

        weights = {}
        motions = []
        for exp in batch:
            name, sep, w = exp.partition(':')
            name = name.strip()
            if name in THA_MOTIONS:
                motions.append(name)
            elif not sep or not w.strip():
                # Bare tags (<happy>) switch expressions and reset accumulated weights,
                # matching the old last-tag-wins set_emotion behavior.
                weights = {name: 1.0}
            else:
                # Weighted tags (<happy:0.3>) deliberately blend by accumulating weights
                try:
                    weights[name] = float(w)
                except ValueError:
                    continue
        conns = list(self.tha_connections)
        for conn in conns:
            try:
                gen = getattr(conn, '_tha_gen', None)
                if gen:
                    if weights:
                        gen.set_emotion_mix(weights)
                    for m in motions:
                        gen.set_motion(m)
            except:
                self.disconnect_tha(conn)


tts_manager = TTSConnectionManager()

async def broadcast_to_vrm(self, message: Union[str, bytes]):
    if not self.vrm_connections:
        return
    disconnected = []
    for connection in self.vrm_connections:
        try:
            if isinstance(message, bytes):
                await connection.send_bytes(message)
            else:
                await connection.send_text(message)
        except:
            disconnected.append(connection)
    for conn in disconnected:
        self.disconnect_vrm(conn)

from py.vts_manager import vts_instance

@app.websocket("/ws/tts")
async def tts_websocket_endpoint(websocket: WebSocket):
    await tts_manager.connect_main(websocket)
    try:
        while True:
            msg = await websocket.receive()
            
            # 1. Process binary audio
            if "bytes" in msg:
                data_bytes = msg["bytes"]
                if len(data_bytes) > 4:
                    try:
                        json_len = struct.unpack('<I', data_bytes[:4])[0]
                        metadata_bytes = data_bytes[4 : 4 + json_len]
                        audio_file_bytes = data_bytes[4 + json_len :]
                        
                        if vts_instance.is_running and len(audio_file_bytes) > 0:
                            import subprocess
                            import imageio_ffmpeg  
                            def decode_audio_to_pcm(b_data):
                                ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
                                process = subprocess.Popen([
                                    ffmpeg_exe,
                                    '-i', 'pipe:0',       
                                    '-f', 's16le',        
                                    '-ar', '24000',       
                                    '-ac', '1',           
                                    'pipe:1'              
                                ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                                pcm_raw_bytes, _ = process.communicate(input=b_data)
                                return pcm_raw_bytes

                            pcm_raw_bytes = await asyncio.to_thread(decode_audio_to_pcm, audio_file_bytes)
                            if pcm_raw_bytes:
                                asyncio.create_task(vts_instance.drive_mouth(pcm_raw_bytes))
                        
                        await tts_manager.broadcast_to_vrm(data_bytes)
                    except Exception as e:
                        logging.error(f"Omni audio decoding failed: {e}")
            
            # 2. Process text (commands and expressions)
            elif "text" in msg:
                try:
                    payload = json.loads(msg["text"]) 
                    msg_type = payload.get("type")
                    
                    # === Clear VTS deduplication markers when a new speech session begins ===
                    if msg_type in ["ttsStarted", "startSpeaking"]:
                        if hasattr(vts_instance, "triggered_tags_in_session"):
                            vts_instance.triggered_tags_in_session.clear()
                        # Reset THA expression to neutral at TTS start
                        if msg_type == "ttsStarted":
                            asyncio.create_task(tts_manager.broadcast_emotion_to_tha("neutral"))
                    
                    if msg_type == "startVTS_Driver":
                        success = await vts_instance.connect(payload.get("data", {}))
                        feedback = {
                            "type": "vts_connection_status",
                            "data": {
                                "success": success,
                                "message": "Connected to VTube Studio" if success else "Failed to connect. Please make sure VTube Studio is running and the API is enabled."
                            }
                        }
                        await websocket.send_text(json.dumps(feedback))
                        
                    elif msg_type == "stopVTS_Driver":
                        await vts_instance.stop()
                        await websocket.send_text(json.dumps({
                            "type": "vts_connection_status",
                            "data": {"success": False, "message": "VTS Disconnected"}
                        }))
                    elif msg_type == "startSpeaking":
                        data_content = payload.get("data", {})
                        expressions = data_content.get("expressions",[])
                        if vts_instance.is_running:
                            for exp in expressions:
                                exp = str(exp)
                                name, sep, w = exp.partition(':')
                                # Strip colon suffix only if it is a numeric weight (happy:0.5);
                                # preserve ordinary hotkey names containing colons (emote:wave).
                                hotkey = name if (sep and re.fullmatch(r'\s*\d*\.?\d+\s*', w)) else exp
                                asyncio.create_task(vts_instance.trigger_hotkey(hotkey))
                        # Broadcast the THA expression group for weighted composition
                        if expressions:
                            asyncio.create_task(tts_manager.broadcast_expressions_to_tha(expressions))

                    # === Support expressions and motions in omniStreaming when TTS is disabled ===
                    elif msg_type == "omniStreaming":
                        data_content = payload.get("data", {})
                        expressions = data_content.get("expressions", [])
                        if vts_instance.is_running:
                            for exp in expressions:
                                exp = str(exp)
                                name, sep, w = exp.partition(':')
                                # Strip colon suffix only if it is a numeric weight (happy:0.5);
                                # preserve ordinary hotkey names containing colons (emote:wave).
                                hotkey = name if (sep and re.fullmatch(r'\s*\d*\.?\d+\s*', w)) else exp
                                asyncio.create_task(vts_instance.trigger_hotkey(hotkey))
                        # Broadcast the THA expression group for weighted composition
                        if expressions:
                            asyncio.create_task(tts_manager.broadcast_expressions_to_tha(expressions))

                    await tts_manager.broadcast_to_vrm(msg["text"])
                except Exception as e:
                    logging.error(f"[PY] WS Text Error: {e}")

    except Exception as e:
        logging.error(f"[PY] WS Global Error: {e}")
    finally:
        tts_manager.disconnect_main(websocket)

@app.websocket("/ws/vrm")
async def vrm_websocket_endpoint(websocket: WebSocket):
    """VRM window WebSocket: receive data from the main window."""
    await tts_manager.connect_vrm(websocket)
    try:
        while True:
            msg = await websocket.receive()
            if "text" in msg:
                # Handle VRM feedback such as requestAudioData or animationComplete
                data = json.loads(msg["text"])
                if data.get('type') == 'animationComplete':
                    await tts_manager.send_to_main(msg["text"])
            # VRM normally does not send binary data to the main window
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        logging.error(f"WS error in VRM: {e}")
    finally:
        tts_manager.disconnect_vrm(websocket)

@app.websocket("/ws/soulx")
async def soulx_websocket_endpoint(websocket: WebSocket):
    """SoulX FlashHead WebSocket: receive TTS audio and commands."""
    await tts_manager.connect_soulx(websocket)
    try:
        while True:
            msg = await websocket.receive()
            if "text" in msg:
                data = json.loads(msg["text"])
                if data.get('type') == 'animationComplete':
                    await tts_manager.send_to_main(msg["text"])
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        logging.error(f"WS error in SoulX: {e}")
    finally:
        tts_manager.disconnect_soulx(websocket)

@app.websocket("/ws/tha")
async def tha_websocket_endpoint(websocket: WebSocket):
    """THA desktop companion WebSocket: receive commands and return JPEG frames."""
    from py.tha_engine import THAPoseGenerator, get_engine, clear_engine_cache

    settings = await load_settings()
    tha_config = settings.get("THAConfig", {})
    selected_id = tha_config.get("selectedModelId", "Lyra")
    sr_mode = tha_config.get("srMode", "cnnx2vl")
    jpeg_quality = 90 if sr_mode != "off" else 50

    # 1. Locate model files (.mlpackage preferred on macOS; otherwise .onnx only)
    is_mac = (sys.platform == 'darwin')

    def _find_model_in(scan_dir):
        try:
            for entry in os.listdir(scan_dir):
                entry_path = os.path.join(scan_dir, entry)
                if os.path.isdir(entry_path) and entry == selected_id:
                    if is_mac:
                        mlp = os.path.join(entry_path, "model.mlpackage")
                        if os.path.isdir(mlp):
                            return mlp
                    mp = os.path.join(entry_path, "model.onnx")
                    if os.path.exists(mp):
                        return mp
        except FileNotFoundError:
            pass
        return None

    model_path = _find_model_in(os.path.join(base_path, "tha_models"))
    if not model_path:
        model_path = _find_model_in(THA_USER_MODELS_DIR)

    if not model_path:
        logging.error(f"[THA WS] Model not found: {selected_id}")
        await websocket.accept()
        await websocket.close()
        return

    try:
        engine = get_engine(model_path)
        gen = THAPoseGenerator()

        await tts_manager.connect_tha(websocket)
        websocket._tha_gen = gen

        # 2. Control-stream receive task
        async def recv_loop():
            try:
                while True:
                    msg = await websocket.receive_text()
                    data = json.loads(msg)
                    cmd_type = data.get("type", "")
                    if cmd_type == "emotion":
                        gen.set_emotion(data.get("emotion", "neutral"))
                    elif cmd_type == "motion":
                        gen.set_motion(data.get("motion", ""))
                    elif cmd_type == "motionClear":
                        gen.clear_motion()
                    elif cmd_type == "mouth":
                        gen.set_mouth(float(data.get("amplitude", 0)))
                    elif cmd_type == "mouse":
                        gen.set_mouse(float(data.get("x", 0)), float(data.get("y", 0)))
            except WebSocketDisconnect:
                return
            except Exception as e:
                logging.error(f"[THA WS] Instruction receive error: {e}")

        # 3. Render and send task
        async def render_loop():
            target_fps = 30
            frame_interval = 1.0 / target_fps
            loop = asyncio.get_running_loop()
            
            try:
                while True:
                    start_time = time.perf_counter()
                    
                    pose = gen.step()
                    jpeg = await loop.run_in_executor(None, engine.render, pose, jpeg_quality)
                    
                    await websocket.send_bytes(jpeg)
                    
                    elapsed = time.perf_counter() - start_time
                    sleep_time = max(0.0, frame_interval - elapsed)
                    await asyncio.sleep(sleep_time)
            except WebSocketDisconnect:
                return
            except Exception as e:
                logging.error(f"[THA WS] Frame render error: {e}")

        # 4. Run concurrent receive and render tasks
        recv_task = asyncio.create_task(recv_loop())
        render_task = asyncio.create_task(render_loop())

        done, pending = await asyncio.wait(
            [recv_task, render_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logging.error(f"[THA WS] Main loop runtime error: {e}")
    finally:
        tts_manager.disconnect_tha(websocket)

@app.websocket("/ws/subtitles")
async def subtitles_websocket_endpoint(websocket: WebSocket):
    """Subtitle overlay endpoint; excluded from audio playback checks."""
    await tts_manager.connect_overlay(websocket)
    try:
        while True:
            await websocket.receive_text() # Maintain heartbeat
    except WebSocketDisconnect:
        tts_manager.disconnect_overlay(websocket)

# Expose VTS connection status without affecting mute detection
@app.get("/tts/status")
async def get_tts_status():
    return {
        "vrm_connections": len(tts_manager.vrm_connections),
        "soulx_connections": len(tts_manager.soulx_connections),
        "vts_active": vts_instance.is_running,
        "overlay_connections": len(tts_manager.overlay_connections),
        "main_connections": len(tts_manager.main_connections)
    }

@app.post("/tts")
async def text_to_speech(request: Request):
    import edge_tts
    import subprocess
    
    # Declare global caches and clients
    global global_http_client, openai_tts_clients_cache, tetos_speakers_cache

    try:
        data = await request.json()
        text = data.get('text', '')
        if not text:
            return JSONResponse(status_code=400, content={"error": "Text is empty"})
        
        # Force Opus for mobile clients
        mobile_optimized = data.get('mobile_optimized', False)
        target_format = "opus" if mobile_optimized else data.get('format', 'mp3')
        
        new_voice = data.get('voice', 'default')
        tts_settings = data.get('ttsSettings', {})
        
        # Resolve inherited voice configuration
        if new_voice in tts_settings.get('newtts', {}) and new_voice != 'default':
            voice_settings = tts_settings['newtts'][new_voice]
            parent_settings = tts_settings
            
            inherited_fields = ['api_key', 'base_url', 'model', 'selectedProvider', 'vendor']
            for field in inherited_fields:
                child_value = voice_settings.get(field, '')
                parent_value = parent_settings.get(field, '')
                if not child_value and parent_value:
                    voice_settings[field] = parent_value
            
            selected_provider_id = voice_settings.get('selectedProvider')
            if selected_provider_id and not voice_settings.get('api_key'):
                model_providers = parent_settings.get('modelProviders', [])
                for provider in model_providers:
                    if provider.get('id') == selected_provider_id:
                        voice_settings['api_key'] = provider.get('apiKey', '')
                        voice_settings['base_url'] = provider.get('url', '')
                        voice_settings['model'] = provider.get('modelId', '')
                        voice_settings['vendor'] = provider.get('vendor', '')
                        break
            tts_settings = voice_settings

        index = data.get('index', 0)
        tts_engine = tts_settings.get('engine', 'edgetts')
                
        print(f"TTS request - engine: {tts_engine}, format: {target_format}, mobile optimization: {mobile_optimized}")
                
        # ==========================================
        # 1. EdgeTTS engine
        # ==========================================
        if tts_engine == 'edgetts':
            if _is_steam_build:
                return JSONResponse({"error": "EdgeTTS is not available in this build"}, status_code=403)
            edgettsLanguage = tts_settings.get('edgettsLanguage', 'en-US')
            edgettsVoice = tts_settings.get('edgettsVoice', 'JennyNeural')
            rate = tts_settings.get('edgettsRate', 1.0)
            full_voice_name = f"{edgettsLanguage}-{edgettsVoice}"
            
            if mobile_optimized:
                rate = min(rate * 0.95, 1.1)
            
            rate_text = "+0%"
            if rate >= 1.0:
                rate_text = f"+{int((rate - 1.0) * 100)}%"
            elif rate < 1.0:
                rate_text = f"-{int((1.0 - rate) * 100)}%"
            
            async def generate_audio():
                communicate = edge_tts.Communicate(text, full_voice_name, rate=rate_text)
                if target_format == "opus":
                    audio_chunks = []
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            audio_chunks.append(chunk["data"])
                    
                    full_audio = b''.join(audio_chunks)
                    convert_result = await asyncio.to_thread(convert_to_opus_simple, full_audio)
                    opus_audio = convert_result[0] if isinstance(convert_result, tuple) else convert_result
                    
                    chunk_size = 4096
                    for i in range(0, len(opus_audio), chunk_size):
                        yield opus_audio[i:i + chunk_size]
                else:
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            yield chunk["data"]

            media_type = "audio/ogg" if target_format == "opus" else "audio/mpeg"
            filename = f"tts_{index}.opus" if target_format == "opus" else f"tts_{index}.mp3"
            
            return StreamingResponse(
                generate_audio(),
                media_type=media_type,
                headers={"Content-Disposition": f"inline; filename={filename}", "X-Audio-Index": str(index), "X-Audio-Format": target_format}
            )

        # ==========================================
        # 2. CustomTTS engine using the global connection pool
        # ==========================================
        elif tts_engine == 'customTTS':
            key_text = tts_settings.get('customTTSKeyText', 'text')
            key_speaker = tts_settings.get('customTTSKeySpeaker', 'speaker')
            key_speed = tts_settings.get('customTTSKeySpeed', 'speed')
            speaker_value = tts_settings.get('customTTSspeaker', '')
            speed_value = tts_settings.get('customTTSspeed', 1.0)
            
            if mobile_optimized:
                speed_value = min(speed_value * 0.95, 1.2)

            params = {key_text: text, key_speaker: speaker_value, key_speed: speed_value}
            servers = [s for s in tts_settings.get('customTTSserver', 'http://127.0.0.1:9880').split('\n') if s.strip()]
            custom_tt_server = servers[index % len(servers)]
            custom_streaming = tts_settings.get('customStream', False)
            
            async def generate_audio():
                safe_url = sanitize_url(input_url=custom_tt_server, default_base="http://127.0.0.1:9880", endpoint="")
                try:
                    # Reuse the global client rather than opening a new httpx.AsyncClient
                    async with global_http_client.stream("GET", safe_url, params=params) as response:
                        response.raise_for_status()
                        if custom_streaming:
                            async for chunk in response.aiter_bytes():
                                yield chunk
                        else:
                            audio_data = await response.aread()
                            if target_format == "opus":
                                convert_result = await asyncio.to_thread(convert_to_opus_simple, audio_data)
                                audio_data = convert_result[0] if isinstance(convert_result, tuple) else convert_result
                            
                            chunk_size = 4096
                            for i in range(0, len(audio_data), chunk_size):
                                yield audio_data[i:i + chunk_size]
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"Custom TTS connection failed: {str(e)}")

            media_type = "audio/ogg" if target_format == "opus" else "audio/wav"
            filename = f"tts_{index}.opus" if target_format == "opus" else f"tts_{index}.wav"
            return StreamingResponse(generate_audio(), media_type=media_type, headers={"Content-Disposition": f"inline; filename={filename}", "X-Audio-Index": str(index)})

        # ==========================================
        # 3. GSV engine using the global connection pool
        # ==========================================
        elif tts_engine == 'GSV':
            audio_path = os.path.join(UPLOAD_FILES_DIR, tts_settings.get('gsvRefAudioPath', ''))
            if not os.path.exists(audio_path): audio_path = tts_settings.get('gsvRefAudioPath', '')

            gsv_params = {
                "text": text, "text_lang": tts_settings.get('gsvTextLang', 'zh'),
                "ref_audio_path": audio_path, "prompt_lang": tts_settings.get('gsvPromptLang', 'zh'),
                "prompt_text": tts_settings.get('gsvPromptText', ''), "speed_factor": tts_settings.get('gsvRate', 1.0),
                "sample_steps": tts_settings.get('gsvSample_steps', 4), "streaming_mode": True,
                "media_type": "ogg", "batch_size": 1, "seed": 42,
            }
            if mobile_optimized: gsv_params["speed_factor"] = min(gsv_params["speed_factor"] * 0.95, 1.1)
            
            servers = [s for s in tts_settings.get('gsvServer', 'http://127.0.0.1:9880').split('\n') if s.strip()]
            gsvServer = servers[index % len(servers)]
                
            async def generate_audio():
                safe_url = sanitize_url(input_url=gsvServer, default_base="http://127.0.0.1:9880", endpoint="/tts")
                try:
                    async with global_http_client.stream("POST", safe_url, json=gsv_params) as response:
                        response.raise_for_status()
                        async for chunk in response.aiter_bytes():
                            yield chunk
                except Exception as e:
                    raise HTTPException(status_code=502, detail=f"GSV service error: {str(e)}")
            
            return StreamingResponse(generate_audio(), media_type="audio/ogg", headers={"Content-Disposition": f"inline; filename=tts_{index}.opus"})

        # ==========================================
        # 5. OpenAI TTS using cached instances
        # ==========================================
        elif tts_engine == 'openai':
            api_key = tts_settings.get('api_key', '')
            base_url = tts_settings.get('base_url', 'https://api.openai.com/v1')
            if not api_key: raise HTTPException(status_code=400, detail="TTS API key is not configured")
            
            # Get or create a cached client
            cache_key = (api_key, base_url)
            if cache_key not in openai_tts_clients_cache:
                openai_tts_clients_cache[cache_key] = AsyncOpenAI(api_key=api_key, base_url=base_url)
            client = openai_tts_clients_cache[cache_key]

            speed = float(tts_settings.get('openaiSpeed', 1.0))
            if mobile_optimized: speed = min(speed * 0.95, 1.2)
            
            async def generate_audio():
                response_format = target_format if target_format in ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] else 'mp3'
                params = {'model': tts_settings.get('model', 'tts-1'), 'input': text, 'speed': max(0.25, min(4.0, speed)), 'response_format': response_format}
                
                ref_audio = tts_settings.get('gsvRefAudioPath', '')
                if ref_audio:
                    audio_file_path = os.path.join(UPLOAD_FILES_DIR, ref_audio)
                    audio_base64 = base64.b64encode(open(audio_file_path, "rb").read()).decode('utf-8')
                    params['extra_body'] = {"references": [{"text": tts_settings.get('gsvPromptText', ''), "audio": f"data:audio/{Path(audio_file_path).suffix[1:]};base64,{audio_base64}"}]}
                else:
                    params['voice'] = tts_settings.get('openaiVoice', 'alloy')

                if tts_settings.get('openaiStream', False):
                    async with client.audio.speech.with_streaming_response.create(**params) as response:
                        async for chunk in response.iter_bytes(chunk_size=4096): yield chunk
                else:
                    response = await client.audio.speech.create(**params)
                    content = await response.aread()
                    for i in range(0, len(content), 4096): yield content[i:i + 4096]

            media_map = {"opus": "audio/ogg", "wav": "audio/wav", "aac": "audio/aac", "flac": "audio/flac"}
            return StreamingResponse(generate_audio(), media_type=media_map.get(target_format, "audio/mpeg"))

        # ==========================================
        # 6. Native system TTS
        # ==========================================
        elif tts_engine == 'systemtts':
            system_voice_name = tts_settings.get('systemVoiceName', None)
            system_rate = int(tts_settings.get('systemRate', 200))
            if mobile_optimized: system_rate = int(system_rate * 0.95)

            def sync_generate_wav(input_text, voice_name, rate, req_index):
                temp_filename = os.path.join(TOOL_TEMP_DIR, f"temp_tts_{req_index}_{uuid.uuid4().hex[:8]}.wav")
                wav_data = b""
                ps_file_path = ""
                try:
                    if platform.system() == 'Darwin':
                        cmd = ['say', '-o', temp_filename, '--data-format=LEI16@22050', input_text]
                        if voice_name: cmd.extend(['-v', voice_name])
                        if rate: cmd.extend(['-r', str(rate)])
                        subprocess.run(cmd, check=True)
                    else:
                        # Use a PowerShell System.Speech subprocess instead of pyttsx3
                        # The pyttsx3 singleton can hang in _inLoop on long text, silencing later TTS
                        rate_val = int(round((rate - 175) / 25))
                        rate_val = max(-10, min(10, rate_val))
                        ps_file_path = os.path.join(TOOL_TEMP_DIR, f"tts_script_{uuid.uuid4().hex[:8]}.ps1")
                        text_file = temp_filename + '.txt'
                        with open(text_file, 'w', encoding='utf-8') as tf:
                            tf.write(input_text)
                        with open(ps_file_path, 'w', encoding='utf-8') as f:
                            f.write('$ErrorActionPreference = "Stop"\n')
                            f.write('Add-Type -AssemblyName System.Speech\n')
                            f.write(f'$s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n')
                            f.write(f'$s.Rate = {rate_val}\n')
                            if voice_name:
                                f.write(f'$vn = "{voice_name}"\n')
                                f.write('try { $s.SelectVoice($vn) } catch {}\n')
                            f.write(f'$s.SetOutputToWaveFile("{temp_filename}")\n')
                            f.write(f'$text = Get-Content -Path "{text_file}" -Raw -Encoding UTF8\n')
                            f.write('$s.Speak($text)\n')
                            f.write('$s.Dispose()\n')
                        subprocess.run(
                            ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps_file_path],
                            check=True, capture_output=True, timeout=60
                        )
                        if os.path.exists(text_file): os.remove(text_file)
                    if os.path.exists(temp_filename): wav_data = open(temp_filename, 'rb').read()
                except subprocess.TimeoutExpired:
                    logger.warning(f"System TTS timeout ({len(input_text)} chars), text truncated in response")
                finally:
                    if os.path.exists(temp_filename): os.remove(temp_filename)
                    if ps_file_path and os.path.exists(ps_file_path): os.remove(ps_file_path)
                return wav_data

            async def generate_audio():
                wav_content = await asyncio.to_thread(sync_generate_wav, text, system_voice_name, system_rate, index)
                final = wav_content
                if target_format == "opus":
                    res = await asyncio.to_thread(convert_to_opus_simple, wav_content)
                    final = res[0] if isinstance(res, tuple) else res
                for i in range(0, len(final), 4096): yield final[i:i + 4096]
            
            media_type = "audio/ogg" if target_format == "opus" else "audio/wav"
            return StreamingResponse(generate_audio(), media_type=media_type)

        # ==========================================
        # 7. Tetos SDK (cached instances for configured providers)
        # ==========================================
        elif tts_engine in ['azure', 'fish', 'google']:
            selected_voice = tts_settings.get(f'{tts_engine}Voice', '') or None
            
            # Build a cache key for the engine
            if tts_engine == 'azure': cache_key = (tts_engine, tts_settings.get('azureSpeechKey'), tts_settings.get('azureRegion'), selected_voice)
            elif tts_engine == 'fish': cache_key = (tts_engine, tts_settings.get('fishApiKey'), selected_voice)
            elif tts_engine == 'google': cache_key = (tts_engine, hash(tts_settings.get('googleServiceAccount', '')), selected_voice)
            else: cache_key = None

            temp_filename = os.path.join(TOOL_TEMP_DIR, f"temp_tetos_{index}_{uuid.uuid4().hex[:8]}.mp3")

            def run_tetos_sync():
                if cache_key in tetos_speakers_cache:
                    speaker = tetos_speakers_cache[cache_key]
                else:
                    if tts_engine == 'azure':
                        from tetos.azure import AzureSpeaker
                        speaker = AzureSpeaker(speech_key=cache_key[1], speech_region=cache_key[2], voice=selected_voice)
                    elif tts_engine == 'fish':
                        from tetos.fish import FishSpeaker
                        speaker = FishSpeaker(api_key=cache_key[1], voice=selected_voice)
                    elif tts_engine == 'google':
                        from tetos.google import GoogleSpeaker
                        sa_json = tts_settings.get('googleServiceAccount', '')
                        if sa_json:
                            import tempfile
                            with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as tmp:
                                tmp.write(sa_json); os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
                        speaker = GoogleSpeaker(voice=selected_voice)
                    tetos_speakers_cache[cache_key] = speaker
                speaker.say(text, temp_filename)

            await asyncio.to_thread(run_tetos_sync)
            
            async def generate_from_file():
                try:
                    if os.path.exists(temp_filename):
                        data = open(temp_filename, "rb").read()
                        if target_format == "opus":
                            res = await asyncio.to_thread(convert_to_opus_simple, data)
                            data = res[0] if isinstance(res, tuple) else res
                        for i in range(0, len(data), 4096): yield data[i:i + 4096]
                finally:
                    if os.path.exists(temp_filename): os.remove(temp_filename)

            media_type = "audio/ogg" if target_format == "opus" else "audio/mpeg"
            return StreamingResponse(generate_from_file(), media_type=media_type)

        # ==========================================
        # 8. ElevenLabs TTS
        # ==========================================
        elif tts_engine == 'elevenlabs':
            from elevenlabs.client import ElevenLabs as ElevenLabsClient
            
            api_key = tts_settings.get('elevenLabsApiKey', '')
            voice_id = tts_settings.get('elevenLabsVoice', '')
            model_id = tts_settings.get('elevenLabsModel', 'eleven_multilingual_v2')
            rate = float(tts_settings.get('elevenLabsRate', 1.0))
            
            if not api_key:
                raise HTTPException(status_code=400, detail="ElevenLabs API key is not configured")
            if not voice_id:
                raise HTTPException(status_code=400, detail="ElevenLabs voice ID is not configured")
            
            if mobile_optimized:
                rate = min(rate * 0.95, 1.2)
            
            client = ElevenLabsClient(api_key=api_key)
            
            # 1. Establish the connection and request early so an invalid voice ID raises immediately
            # Before StreamingResponse starts, an HTTPException can still set the status code
            try:
                audio_stream = await asyncio.to_thread(
                    client.text_to_speech.convert,
                    text=text,
                    voice_id=voice_id,
                    model_id=model_id or 'eleven_multilingual_v2',
                    output_format='mp3_44100_128'
                )
            except Exception as e:
                error_msg = str(e)
                if "API key" in error_msg.lower() or "authentication" in error_msg.lower():
                    raise HTTPException(status_code=401, detail="Invalid ElevenLabs API key")
                elif "voice" in error_msg.lower() or "not found" in error_msg.lower():
                    raise HTTPException(status_code=400, detail=f"Invalid voice ID: {voice_id}")
                elif "model" in error_msg.lower():
                    raise HTTPException(status_code=400, detail=f"Invalid model ID: {model_id}")
                elif "credit" in error_msg.lower() or "quota" in error_msg.lower() or "characters" in error_msg.lower():
                    raise HTTPException(status_code=429, detail="Insufficient ElevenLabs quota")
                else:
                    raise HTTPException(status_code=502, detail=f"ElevenLabs service error: {error_msg}")

            async def generate_audio():
                # 2. Read the synchronous generator in a worker thread to avoid blocking the event loop
                def get_next_chunk():
                    try:
                        return next(audio_stream)
                    except StopIteration:
                        return None

                while True:
                    try:
                        chunk = await asyncio.to_thread(get_next_chunk)
                        if chunk is None:
                            break
                        if chunk:
                            yield chunk
                    except Exception as e:
                        # If streaming fails after it begins, stop the stream rather than raising HTTPException
                        print(f"ElevenLabs stream interrupted: {str(e)}")
                        break

            # Mobile: convert to Opus after collecting all chunks
            if target_format == "opus":
                async def generate_opus():
                    collected = bytearray()
                    async for chunk in generate_audio():
                        collected.extend(chunk)
                    if collected:
                        res = await asyncio.to_thread(convert_to_opus_simple, bytes(collected))
                        final = res[0] if isinstance(res, tuple) else res
                        for i in range(0, len(final), 4096):
                            yield final[i:i + 4096]
                return StreamingResponse(
                    generate_opus(),
                    media_type="audio/ogg",
                    headers={
                        "Content-Disposition": f"inline; filename=tts_{index}.opus",
                        "X-Audio-Index": str(index),
                        "X-Audio-Format": "opus"
                    }
                )
            else:
                # Stream MP3 directly from the generator
                return StreamingResponse(
                    generate_audio(),
                    media_type="audio/mpeg",
                    headers={
                        "Content-Disposition": f"inline; filename=tts_{index}.mp3",
                        "X-Audio-Index": str(index),
                        "X-Audio-Format": "mp3"
                    }
                )
            
        # ==========================================
        # 9. MOSS TTS (local CPU engine, lazy-loaded)
        # ==========================================
        elif tts_engine == 'moss':
            from py.moss_tts import moss_generate_audio
            
            # Read MOSS settings
            moss_voice = tts_settings.get('mossVoice', 'Ava')
            moss_speed = float(tts_settings.get('mossSpeed', 1.0))
            
            # Limit mobile playback speed
            if mobile_optimized:
                moss_speed = min(moss_speed * 0.95, 1.2)
            
            # Handle voice cloning
            # MOSS reuses gsvRefAudioPath to select a reference file
            clone_audio_path = tts_settings.get('gsvRefAudioPath', '')
            abs_clone_path = ""
            if clone_audio_path:
                abs_clone_path = os.path.join(UPLOAD_FILES_DIR, clone_audio_path)
                if not os.path.exists(abs_clone_path):
                    abs_clone_path = clone_audio_path # Fallback for an absolute path
                    
            async def generate_moss_audio():
                try:
                    # Get generated WAV bytes
                    wav_data = await moss_generate_audio(
                        text=text,
                        voice=moss_voice,
                        speed=moss_speed,
                        prompt_audio_path=abs_clone_path
                    )
                    
                    final_data = wav_data
                    # Convert to Opus when requested by a mobile client
                    if target_format == "opus":
                        res = await asyncio.to_thread(convert_to_opus_simple, wav_data)
                        final_data = res[0] if isinstance(res, tuple) else res
                    
                    # Stream in slices
                    chunk_size = 4096
                    for i in range(0, len(final_data), chunk_size):
                        yield final_data[i:i + chunk_size]
                        
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print(f"MOSS TTS generation failed: {e}")
                    raise HTTPException(status_code=500, detail=f"MOSS TTS error: {str(e)}")

            # Choose response headers based on output format
            media_type = "audio/ogg" if target_format == "opus" else "audio/wav"
            filename = f"tts_{index}.opus" if target_format == "opus" else f"tts_{index}.wav"
            return StreamingResponse(
                generate_moss_audio(), 
                media_type=media_type, 
                headers={
                    "Content-Disposition": f"inline; filename={filename}", 
                    "X-Audio-Index": str(index),
                    "X-Audio-Format": target_format
                }
            )

        raise HTTPException(status_code=400, detail="Unsupported TTS engine")
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Internal server error: {str(e)}"})

@app.post("/tts/tetos/list_voices")
async def list_tetos_voices(request: Request):
    """
    Get voices through Tetos.
    Receive configuration, instantiate Speaker, and call .list_voices().
    """
    try:
        data = await request.json()
        provider = data.get('provider', '').lower()
        config = data.get('config', {})  # User-provided authentication configuration

        if not provider:
            return JSONResponse(status_code=400, content={"error": "Missing 'provider' parameter"})

        # Define synchronous work to execute in a worker thread
        def _sync_fetch_voices():
            voices = []

            # ---------------------------
            # Azure TTS
            # ---------------------------
            if provider == 'azure':
                from tetos.azure import AzureSpeaker
                # Instantiate
                speaker = AzureSpeaker(
                    speech_key=config.get('speech_key') or config.get('api_key'),
                    speech_region=config.get('speech_region') or config.get('region')
                )
                # Get list
                voices = speaker.list_voices()

            elif provider == 'fish':
                api_key = config.get('api_key')
                if not api_key:
                    raise ValueError("Fish Audio requires an API key")

                # Request the official Fish Audio API
                # Use page_size 30 to retrieve more popular voices
                url = "https://api.fish.audio/model?page_size=30&page_number=1&sort_by=score"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Mozilla/5.0" 
                }
                
                response = requests.get(url, headers=headers, timeout=60)
                response.raise_for_status() # Check HTTP errors
                res_json = response.json()
                
                # Parse response structure
                items = res_json.get("items", [])
                
                for item in items:
                    # Convert Fish Audio results to the shared frontend structure
                    # getVoiceValue prefers id
                    # getVoiceLabel prefers DisplayName or name
                    # getVoiceDesc prefers Locale
                    voices.append({
                        "id": item.get("_id"),            # Actual voice ID
                        "name": item.get("title"),        # Display name
                        "DisplayName": item.get("title"), # Compatibility field
                        "Locale": item.get("languages", ["Unknown"])[0] if item.get("languages") else "" # Language label
                    })


            # ---------------------------
            # Google TTS
            # ---------------------------
            elif provider == 'google':
                from tetos.google import GoogleSpeaker
                # Google: Tetos uses GOOGLE_APPLICATION_CREDENTIALS
                # Write a supplied service-account JSON object to a temporary file
                
                service_account_data = config.get('service_account')
                temp_path = None
                
                try:
                    if service_account_data:
                        # Create temporary file
                        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as tmp:
                            if isinstance(service_account_data, dict):
                                json.dump(service_account_data, tmp)
                            else:
                                tmp.write(str(service_account_data))
                            temp_path = tmp.name
                        
                        # Set environment variable
                        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_path
                    
                    # GoogleSpeaker usually reads credentials from the environment
                    speaker = GoogleSpeaker()
                    voices = speaker.list_voices()
                    
                finally:
                    # Cleanup
                    if temp_path:
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                        # Remove an environment variable set here to avoid affecting other requests
                        if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") == temp_path:
                            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

            else:
                pass

            return voices

        # Use asyncio.to_thread to avoid blocking FastAPI's event loop
        voice_list = await asyncio.to_thread(_sync_fetch_voices)

        return JSONResponse(content={
            "status": "success",
            "provider": provider,
            "data": voice_list
        })

    except Exception as e:
        print(f"Failed to retrieve {provider} voices: {e}")
        # Catch authentication and network errors
        return JSONResponse(status_code=500, content={
            "status": "error", 
            "message": str(e),
            "detail": f"Failed to retrieve {provider} voices; check the API key configuration."
        })

@app.get("/system/voices")
async def get_system_voices():
    """
    List available system pyttsx3 voices.
    Voice selection:
    1. Prefer high-quality Siri/Premium voices.
    2. Infer missing locale identifiers from voice IDs.
    3. Prefix high-quality voices with [Siri].
    """
    import pyttsx3
    import sys
    import re

    def fetch_voices_sync():
        try:
            # 1. Retain the denylist of unusable novelty voices
            mac_novelty_voices = {
                'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
                'Deranged', 'Good News', 'Hysterical', 'Pipe Organ', 'Trinoids', 
                'Whisper', 'Zarvox', 'Organ'
            }

            engine = pyttsx3.init()
            voices = engine.getProperty('voices')
            
            processed_voices = []

            for v in voices:
                voice_name = v.name
                voice_id = str(v.id) # Ensure string type
                lower_id = voice_id.lower()

                # --- Filtering ---
                if sys.platform == 'darwin':
                    if voice_name in mac_novelty_voices:
                        continue
                    
                    # Do not exclude Siri voices
                    # Exclude only unusable entries, often very short or invalid IDs
                    # Keep IDs containing siri, premium or compact

                # --- Locale parsing ---
                lang = "Unknown"
                
                # Try pyttsx3 attributes first
                if hasattr(v, 'languages') and v.languages:
                    raw_lang = v.languages[0] if isinstance(v.languages, list) else v.languages
                    if isinstance(raw_lang, bytes):
                        try:
                            lang = raw_lang.decode('utf-8', errors='ignore').replace('\x05', '')
                        except:
                            lang = str(raw_lang)
                    else:
                        lang = str(raw_lang)

                # If the locale is missing, extract it from the ID using regex
                # Example macOS voice ID: com.apple.speech.synthesis.voice.en_US.samantha.premium
                if lang == "Unknown" or lang == "":
                    # Match locale segments such as .en_US.
                    match = re.search(r'\.([a-z]{2}[_-][A-Z]{2})\.', voice_id)
                    if match:
                        lang = match.group(1).replace('_', '-') # Normalize to language-region format

                # --- Identify Siri and high-quality voices ---
                # Keywords: siri, premium, compact (compressed high-quality voices)
                is_high_quality = False
                quality_tag = ""
                
                if any(k in lower_id for k in ['siri', 'premium', 'compact']):
                    is_high_quality = True
                    quality_tag = "[Siri/Premium] "
                
                # Some systems name voices "Siri Voice 1"
                if "siri" in voice_name.lower():
                    is_high_quality = True
                    quality_tag = "[Siri] "

                # Assemble data
                processed_voices.append({
                    "id": voice_id,
                    "name": f"{quality_tag}{voice_name}", # Prefix the display name with the quality tag
                    "original_name": voice_name,
                    "lang": lang,
                    "gender": getattr(v, 'gender', 'Unknown'),
                    "is_siri": is_high_quality # Sorting flag
                })

            # --- Sorting ---
            # Python sort is stable.
            # Sort by not x['is_siri']; True sorts after False.
            # Siri voices therefore appear first.
            processed_voices.sort(key=lambda x: (not x['is_siri'], x['lang'], x['name']))

            return processed_voices
            
        except ImportError:
            print("Error: pyttsx3 driver not found")
            return []
        except Exception as e:
            print(f"Failed to retrieve system voices: {str(e)}")
            return []

    try:
        available_voices = await asyncio.to_thread(fetch_voices_sync)
        return {
            "count": len(available_voices),
            "voices": available_voices
        }
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


# State storage
mcp_status = {}
@app.post("/create_mcp")
async def create_mcp_endpoint(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    mcp_id = data.get("mcpId")
    
    if not mcp_id:
        raise HTTPException(status_code=400, detail="Missing mcpId")
    
    # Add task to the background queue
    background_tasks.add_task(process_mcp, mcp_id)
    
    return {"success": True, "message": "MCP server initialization started"}

@app.get("/mcp_status/{mcp_id}")
async def get_mcp_status(mcp_id: str):
    global mcp_client_list, mcp_status
    status = mcp_status.get(mcp_id, "not_found")
    if status == "ready":
        # Ensure _tools contains serializable dictionaries, lists and primitives
        tools = await mcp_client_list[mcp_id].get_openai_functions(disable_tools=[])
        tools = json.dumps(mcp_client_list[mcp_id]._tools_list)
        return {"mcp_id": mcp_id, "status": status, "tools": tools}
    return {"mcp_id": mcp_id, "status": status, "tools": []}

async def process_mcp(mcp_id: str):
    """
    Initialize an MCP server and synchronize failure callbacks without sleeping.
    """
    global mcp_client_list, mcp_status

    # 1. Synchronization event and failure reason
    init_done = asyncio.Event()
    fail_reason: str | None = None

    async def on_failure(error_message: str):
        nonlocal fail_reason
        # Only the first notification takes effect
        if fail_reason is not None:
            return
        fail_reason = error_message
        mcp_status[mcp_id] = f"failed: {error_message}"

        # Mark disabled only if a client was created
        if mcp_id in mcp_client_list:
            mcp_client_list[mcp_id].disabled = True
            await mcp_client_list[mcp_id].close()
            print(f"Stopping MCP server: {mcp_id}")

        init_done.set()          # Wake the main coroutine

    # 2. Start initialization
    mcp_status[mcp_id] = "initializing"
    try:
        cur_settings = await load_settings()
        server_config = cur_settings["mcpServers"][mcp_id]

        mcp_client_list[mcp_id] = McpClient()
        init_task = asyncio.create_task(
            mcp_client_list[mcp_id].initialize(
                mcp_id,
                server_config,
                on_failure_callback=on_failure
            )
        )
        # 2.1 Wait for initialization itself (up to six seconds)
        await asyncio.wait_for(init_task, timeout=6)

        # 2.2 Wait for on_failure (up to five seconds)
        try:
            await asyncio.wait_for(init_done.wait(), timeout=5)
        except asyncio.TimeoutError:
            # Treat absence of failure callback within five seconds as success
            pass

        # 3. Final state decision
        if fail_reason:
            # The callback has closed the client; synchronize state
            mcp_client_list[mcp_id].disabled = True
            return
        tool = []
        retry = 0 
        while tool == [] and retry < 10:
            try:
                tool = await mcp_client_list[mcp_id].get_openai_functions(disable_tools=[])
            except Exception as e:
                print(f"Failed to retrieve tools: {str(e)}")
            finally:
                retry += 1
                await asyncio.sleep(0.5)
        mcp_status[mcp_id] = "ready"
        mcp_client_list[mcp_id].disabled = False

    except Exception as e:
        # Handle all exceptions, including timeout and crashes
        mcp_status[mcp_id] = f"failed: {str(e)}"
        mcp_client_list[mcp_id].disabled = True
        await mcp_client_list[mcp_id].close()

    finally:
        # Cancel the task if still running
        if "init_task" in locals() and not init_task.done():
            init_task.cancel()
            try:
                await init_task
            except asyncio.CancelledError:
                pass

@app.delete("/remove_mcp")
async def remove_mcp_server(request: Request):
    global settings, mcp_client_list
    try:
        data = await request.json()
        server_name = data.get("serverName", "")

        if not server_name:
            raise HTTPException(status_code=400, detail="No server names provided")

        # Remove the specified MCP server
        current_settings = await load_settings()
        if server_name in current_settings['mcpServers']:
            del current_settings['mcpServers'][server_name]
            await save_settings(current_settings)
            settings = current_settings

            # Remove from mcp_client_list
            if server_name in mcp_client_list:
                mcp_client_list[server_name].disabled = True
                await mcp_client_list[server_name].close()
                del mcp_client_list[server_name]
                print(f"Stopping MCP server: {server_name}")

            return JSONResponse({"success": True, "removed": server_name})
        else:
            raise HTTPException(status_code=404, detail="Server not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        logger.error(f"Failed to remove MCP server: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/remove_memory")
async def remove_memory_endpoint(request: Request):
    data = await request.json()
    memory_id = data.get("memoryId")
    if memory_id:
        try:
            # Delete the memory_id directory under MEMORY_CACHE_DIR
            memory_dir = os.path.join(MEMORY_CACHE_DIR, memory_id)
            shutil.rmtree(memory_dir)
            return JSONResponse({"success": True, "message": "Memory removed"})
        except Exception as e:
            return JSONResponse({"success": False, "message": str(e)})
    else:
        return JSONResponse({"success": False, "message": "No memoryId provided"})

@app.delete("/remove_agent")
async def remove_agent_endpoint(request: Request):
    data = await request.json()
    agent_id = data.get("agentId")
    if agent_id:
        try:
            # Delete the agent_id directory under AGENT_CACHE_DIR
            agent_dir = os.path.join(AGENT_DIR, f"{agent_id}.json")
            shutil.rmtree(agent_dir)
            return JSONResponse({"success": True, "message": "Agent removed"})
        except Exception as e:
            return JSONResponse({"success": False, "message": str(e)})
    else:
        return JSONResponse({"success": False, "message": "No agentId provided"})

@app.post("/a2a")
async def initialize_a2a(request: Request):
    from python_a2a import A2AClient
    data = await request.json()
    try:
        client = A2AClient(data['url'])
        agent_card = client.agent_card.to_json()
        agent_card = json.loads(agent_card)
        return JSONResponse({
            **agent_card,
            "status": "ready",
            "enabled": True
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/start_HA")
async def start_HA(request: Request):
    data = await request.json()
    API_TOKEN = data['data']['api_key']
    ha_config = {
        "type": "sse",
        "url": data['data']['url'].rstrip('/') + "/mcp_server/sse",
        "headers": {"Authorization": f"Bearer {API_TOKEN}"}
    }

    global HA_client
    if HA_client is not None:
        # Already initialized
        return JSONResponse({"status": "ready", "enabled": True})

    # Event signaling connection failure
    conn_failed_event = asyncio.Event()
    failure_reason = None

    async def on_failure(error_message: str):
        nonlocal failure_reason
        failure_reason = error_message
        conn_failed_event.set()

    try:
        HA_client = McpClient()
        await HA_client.initialize("HA", ha_config, on_failure_callback=on_failure)

        # Wait briefly to verify the connection
        try:
            # An event within five seconds indicates failure
            await asyncio.wait_for(conn_failed_event.wait(), timeout=5.0)
            # Connection failed
            raise RuntimeError(f"HA client connection failed: {failure_reason}")
        except asyncio.TimeoutError:
            # No failure notification indicates success
            pass

        return JSONResponse({"status": "ready", "enabled": True})

    except Exception as e:
        HA_client = None
        return JSONResponse(status_code=500, content={"error": str(e)})
    
@app.get("/stop_HA")
async def stop_HA():
    global HA_client
    try:
        if HA_client is not None:
            await HA_client.close()
            HA_client = None
            print(f"HA client stopped")
        return JSONResponse({
            "status": "stopped",
            "enabled": False
        })
    except Exception as e:
        HA_client = None
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/start_ChromeMCP")
async def start_ChromeMCP(request: Request):
    data = await request.json()
    chromeMCPSettings = data.get('data', {})

    # 1. Determine package name
    if chromeMCPSettings.get('mcpName', 'browser-mcp') == 'browser-mcp':
        target_package = "@browsermcp/mcp@latest"
    else:
        target_package = "@playwright/mcp@latest"

    # 2. Prepare basic variables
    command = ""
    args = []
    
    # 3. Prepare environment variables to avoid permission issues
    env = os.environ.copy()

    # A. Set the Playwright browser download path to a writable directory
    # Avoid attempts to write to system directories or require sudo
    # Locate the browsers directory under the application runtime directory
    browser_storage = os.path.join(os.getcwd(), "browsers")
    if not os.path.exists(browser_storage):
        os.makedirs(browser_storage, exist_ok=True)
    
    env["PLAYWRIGHT_BROWSERS_PATH"] = browser_storage
    
    # B. Prevent interactive npx install confirmation
    # The environment setting supplements the -y argument
    env["npm_config_yes"] = "true"

    # 4. Command detection
    system_npx = shutil.which("npx")

    if system_npx:
        # --- Option A: system npx (Docker or local development) ---
        print(f"Using system npx: {system_npx}")
        command = system_npx
        # Use -y to automatically confirm package installation
        args = ["-y", target_package] 
    
    else:
        # --- Option B: Electron runtime ---
        electron_node = os.environ.get("ELECTRON_NODE_EXEC")
        electron_npm = os.environ.get("ELECTRON_NPM_CLI")
        
        if electron_node and electron_npm:
            print(f"System npx not found. Falling back to Electron Node.")
            command = electron_node
            # Construct electron node npm-cli.js exec --yes -- @package
            # --yes automatically installs missing packages
            args = [electron_npm, "exec", "--yes", "--", target_package]
            
            # Required to avoid an Electron dialog
            env["ELECTRON_RUN_AS_NODE"] = "1"
        else:
            return JSONResponse(
                status_code=500, 
                content={"error": "Node.js runtime not found."}
            )

    # 5. Assemble configuration
    Chrome_config = {
        "command": command,
        "args": args,
        "env": env
    }

    # ... (remaining connection logic unchanged) ...
    global ChromeMCP_client
    if ChromeMCP_client is not None:
        return JSONResponse({"status": "ready", "enabled": True})

    conn_failed_event = asyncio.Event()
    failure_reason = None

    async def on_failure(error_message: str):
        nonlocal failure_reason
        failure_reason = error_message
        conn_failed_event.set()

    try:
        ChromeMCP_client = McpClient()
        await ChromeMCP_client.initialize(
            "ChromeMCP", 
            Chrome_config, 
            on_failure_callback=on_failure
        )
        
        # ... (wait for connection) ...
        try:
            await asyncio.wait_for(conn_failed_event.wait(), timeout=5.0)
            raise RuntimeError(f"ChromeMCP client connection failed: {failure_reason}")
        except asyncio.TimeoutError:
            pass

        return JSONResponse({"status": "ready", "enabled": True})

    except Exception as e:
        ChromeMCP_client = None
        print(f"Start ChromeMCP Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

# Stop endpoint remains unchanged
@app.get("/stop_ChromeMCP")
async def stop_ChromeMCP():
    global ChromeMCP_client
    try:
        if ChromeMCP_client is not None:
            await ChromeMCP_client.close()
            ChromeMCP_client = None
            print(f"ChromeMCP client stopped")
        return JSONResponse({
            "status": "stopped",
            "enabled": False
        })
    except Exception as e:
        ChromeMCP_client = None
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# ============================================================
# Local application control endpoints
# ============================================================
@app.post("/scan-local-apps")
async def scan_local_apps_endpoint(request: Request):
    from py.local_app_control import scan_local_apps
    try:
        data = await request.json()
    except Exception:
        data = {}
    search_paths = data.get("searchPaths", None)
    try:
        result = scan_local_apps(search_paths)
        return JSONResponse({"apps": result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/validate-app-path")
async def validate_app_path(request: Request):
    """Validate whether the manually selected application path is a Chromium app."""
    from py.local_app_control import _is_chromium_dir, _classify_chromium_app, _find_main_exe
    import os
    try:
        data = await request.json()
    except Exception:
        data = {}
    path = data.get("path", "").strip().strip('"').strip("'").strip()
    if not path or not os.path.exists(path):
        return JSONResponse({"valid": False, "error": "File does not exist"})
    if os.path.isdir(path):
        from pathlib import Path
        d = Path(path)
        exe = _find_main_exe(str(d))
        if exe:
            path = exe
        else:
            return JSONResponse({"valid": False, "error": "No executable found in the directory"})
    if not path.lower().endswith(".exe"):
        return JSONResponse({"valid": False, "error": "Select an .exe file"})
    import subprocess
    name = os.path.splitext(os.path.basename(path))[0]
    version = ""
    try:
        si = subprocess.run(["powershell", "-NoProfile", "-Command",
            f"$v=(Get-Item '{path}').VersionInfo; Write-Output ('PN:'+$v.ProductName);Write-Output ('PV:'+$v.ProductVersion)"],
            capture_output=True, text=True, timeout=10)
        for line in si.stdout.splitlines():
            if line.startswith("PN:"): name = line[3:].strip() or name
            if line.startswith("PV:"): version = line[3:].strip()
    except Exception:
        pass
    return JSONResponse({"valid": True, "name": name, "version": version, "appType": "chromium"})

@app.post("/connect-app-cdp")
async def connect_app_cdp(request: Request):
    from py.local_app_control import connect_to_external_app
    data = await request.json()
    port = data.get("port", 9223)
    app_id = data.get("appId", "")
    app_name = data.get("appName", "")
    result = await connect_to_external_app(port, app_id, app_name)
    return JSONResponse(result)

@app.post("/disconnect-app-cdp")
async def disconnect_app_cdp(request: Request):
    from py.local_app_control import disconnect_from_external_app
    data = await request.json()
    port = data.get("port", 0)
    result = await disconnect_from_external_app(port)
    return JSONResponse(result)

@app.post("/execute-external-cdp")
async def execute_external_cdp_endpoint(request: Request):
    from py.local_app_control import execute_external_cdp
    data = await request.json()
    port = data.get("port", 0)
    method = data.get("method", "")
    params = data.get("params", {})
    result = await execute_external_cdp(port, method, params)
    return JSONResponse(result)

@app.get("/app-cdp-status")
async def app_cdp_status():
    from py.local_app_control import get_all_connection_info
    result = get_all_connection_info()
    return JSONResponse({"connections": result})

@app.post("/select-external-target")
async def select_external_target_endpoint(request: Request):
    from py.local_app_control import select_external_target
    data = await request.json()
    port = data.get("port", 0)
    target_url = data.get("targetUrl", "")
    result = await select_external_target(port, target_url)
    return JSONResponse(result)

@app.post("/switch-external-target")
async def switch_external_target_endpoint(request: Request):
    from py.local_app_control import switch_external_target
    data = await request.json()
    port = data.get("port", 0)
    target_id = data.get("targetId", "")
    result = await switch_external_target(port, target_id)
    return JSONResponse(result)

@app.post("/refresh-external-targets")
async def refresh_external_targets_endpoint(request: Request):
    from py.local_app_control import refresh_external_targets as _refresh
    data = await request.json()
    port = data.get("port", 0)
    result = await _refresh(port)
    return JSONResponse(result)

@app.post("/start_sql")
async def start_sql(request: Request):
    data = await request.json()
    sql_args = []
    user = str(data['data'].get('user', '')).strip()
    password = str(data['data'].get('password', '')).strip()
    host = str(data['data'].get('host', '')).strip()
    port = str(data['data'].get('port', '')).strip()
    dbname = str(data['data'].get('dbname', '')).strip()
    dbpath = str(data['data'].get('dbpath', '')).strip()
    sql_url = ""
    if (data['data']['engine']=='sqlite'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"sqlite:///{dbpath}"
        print(sql_url)
    elif (data['data']['engine']=='mysql'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "pymysql",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{dbname}"
    elif (data['data']['engine']=='postgres'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "psycopg2-binary",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    elif (data['data']['engine']=='mssql'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "pymssql",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"mssql+pymssql://{user}:{password}@{host}:{port}/{dbname}"
    elif (data['data']['engine']=='oracle'):
        sql_args = ["--from", "mcp-alchemy==2025.8.15.91819", "--with", "oracledb",
               "--refresh-package", "mcp-alchemy", "mcp-alchemy"]
        sql_url = f"oracle+oracledb://{user}:{password}@{host}:{port}/{dbname}"

    sql_config = {
        "type": "stdio",
        "command": "uvx",
        "args": sql_args,
        "env": {
            "DB_URL": sql_url.strip(),
        }
    }

    global sql_client
    if sql_client is not None:
        # Already initialized
        return JSONResponse({"status": "ready", "enabled": True})

    # Event signaling connection failure
    conn_failed_event = asyncio.Event()
    failure_reason = None

    async def on_failure(error_message: str):
        nonlocal failure_reason
        failure_reason = error_message
        conn_failed_event.set()

    try:
        sql_client = McpClient()
        await sql_client.initialize("sqlMCP", sql_config, on_failure_callback=on_failure)

        # Wait briefly to verify the connection
        try:
            # An event within five seconds indicates failure
            await asyncio.wait_for(conn_failed_event.wait(), timeout=5.0)
            # Connection failed
            raise RuntimeError(f"sqlMCP client connection failed: {failure_reason}")
        except asyncio.TimeoutError:
            # No failure notification indicates success
            pass

        return JSONResponse({"status": "ready", "enabled": True})
    except Exception as e:
        sql_client = None
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/stop_sql")
async def stop_sql():
    global sql_client
    try:
        if sql_client is not None:
            await sql_client.close()
            sql_client = None
            print(f"sqlMCP client stopped")
        return JSONResponse({
            "status": "stopped",
            "enabled": False
        })
    except Exception as e:
        sql_client = None
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# Health route
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/load_file")
async def load_file_endpoint(request: Request, files: List[UploadFile] = File(None)):
    fastapi_base_url = str(request.base_url)
    file_links = []
    textFiles = []
    imageFiles = []
    vedioFiles = []
    
    # Helper: identify type from extension
    def get_file_type(ext):
        ext = ext.lower().lstrip('.')
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            return 'image'
        if ext in ALLOWED_VIDEO_EXTENSIONS:
            return 'video'
        return 'file'

    content_type = request.headers.get('Content-Type', '')
    try:
        if 'multipart/form-data' in content_type:
            for file in files:
                file_extension = os.path.splitext(file.filename)[1]
                unique_filename = f"{uuid.uuid4()}{file_extension}"
                destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
                
                with open(destination, "wb") as buffer:
                    content = await file.read()
                    buffer.write(content)
                
                # Determine type from extension
                current_type = get_file_type(file_extension)
                
                file_link = {
                    "path": f"{fastapi_base_url}uploaded_files/{unique_filename}",
                    "name": file.filename,
                    "type": current_type  # Return to frontend
                }
                file_links.append(file_link)
                
                # Maintain compatibility with existing category lists
                file_meta = {"unique_filename": unique_filename, "original_filename": file.filename}
                ext_clean = file_extension[1:].lower()
                if ext_clean in ALLOWED_EXTENSIONS:
                    textFiles.append(file_meta)
                elif ext_clean in ALLOWED_IMAGE_EXTENSIONS:
                    imageFiles.append(file_meta)
                elif ext_clean in ALLOWED_VIDEO_EXTENSIONS:
                    vedioFiles.append(file_meta)

        elif 'application/json' in content_type:
            data = await request.json()
            for file_info in data.get("files", []):
                file_path = file_info.get("path")
                file_name = file_info.get("name", os.path.basename(file_path))
                file_extension = os.path.splitext(file_name)[1]
                
                unique_filename = f"{uuid.uuid4()}{file_extension}"
                destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
                
                with open(file_path, "rb") as src, open(destination, "wb") as dst:
                    dst.write(src.read())
                
                # Determine type from extension
                current_type = get_file_type(file_extension)
                
                file_link = {
                    "path": f"{fastapi_base_url}uploaded_files/{unique_filename}",
                    "name": file_name,
                    "type": current_type
                }
                file_links.append(file_link)
                
                file_meta = {"unique_filename": unique_filename, "original_filename": file_name}
                ext_clean = file_extension[1:].lower()
                if ext_clean in ALLOWED_EXTENSIONS:
                    textFiles.append(file_meta)
                elif ext_clean in ALLOWED_IMAGE_EXTENSIONS:
                    imageFiles.append(file_meta)
                elif ext_clean in ALLOWED_VIDEO_EXTENSIONS:
                    vedioFiles.append(file_meta)

        return JSONResponse(content={"success": True, "fileLinks": file_links, "textFiles": textFiles, "imageFiles": imageFiles, "vedioFiles": vedioFiles})
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

from py.upload_paths import InvalidUploadPath, resolve_upload_path

@app.delete("/delete_file")
async def delete_file_endpoint(request: Request):
    data = await request.json()
    file_name = data.get("fileName")
    try:
        file_path = resolve_upload_path(UPLOAD_FILES_DIR, file_name)
    except InvalidUploadPath:
        raise HTTPException(status_code=403, detail="Invalid upload filename")
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return JSONResponse(content={"success": True})
        else:
            return JSONResponse(content={"success": False, "message": "File not found"})
    except Exception as e:
        return JSONResponse(content={"success": False, "message": str(e)})

class FileNames(BaseModel):
    fileNames: List[str]

@app.delete("/delete_files")
async def delete_files_endpoint(req: FileNames):
    success_files = []
    errors = []
    for name in req.fileNames:
        try:
            path = resolve_upload_path(UPLOAD_FILES_DIR, name)
        except InvalidUploadPath:
            errors.append("Invalid upload filename")
            continue
        try:
            if os.path.exists(path):
                os.remove(path)
                success_files.append(name)
            else:
                errors.append(f"{name} not found")
        except Exception as e:
            errors.append(f"{name}: {str(e)}")

    return JSONResponse(content={
        "success": len(success_files) > 0,   # Success if at least one file succeeded
        "successFiles": success_files,
        "errors": errors
    })

ALLOWED_AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'aac']

@app.post("/upload_gsv_ref_audio")
async def upload_gsv_ref_audio(
    request: Request,
    file: UploadFile = File(...),
):
    fastapi_base_url = str(request.base_url)
    
    # Check file extension
    file_extension = file.filename.split('.')[-1].lower()
    if file_extension not in ALLOWED_AUDIO_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"Unsupported file type: {file_extension}"}
        )
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
    
    try:
        # Save file
        with open(destination, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Build response
        file_link = f"{fastapi_base_url}uploaded_files/{unique_filename}"
        
        return JSONResponse(content={
            "success": True,
            "message": "Reference audio uploaded successfully",
            "file": {
                "path": file_link,
                "name": file.filename,
                "unique_filename": unique_filename
            }
        })
    
    except Exception as e:
        logger.error(f"Failed to upload reference audio: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to save file: {str(e)}"}
        )

@app.delete("/delete_audio/{filename}")
async def delete_audio(filename: str):
    try:
        file_path = os.path.join(UPLOAD_FILES_DIR, filename)
        
        # Require a UUID filename to prevent path traversal
        if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\w+$", filename):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid filename"}
            )
        
        if os.path.exists(file_path):
            os.remove(file_path)
            return JSONResponse(content={
                "success": True,
                "message": "Audio file deleted"
            })
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "File not found"}
            )
            
    except Exception as e:
        logger.error(f"Failed to delete audio: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Deletion failed: {str(e)}"}
        )

# Allowed VRM file extensions
ALLOWED_VRM_EXTENSIONS = {'vrm'}

@app.post("/upload_vrm_model")
async def upload_vrm_model(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    fastapi_base_url = str(request.base_url)
    
    # Check file extension
    file_extension = file.filename.split('.')[-1].lower()
    if file_extension not in ALLOWED_VRM_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"Unsupported file type: {file_extension}; only .vrm files are supported"}
        )
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)
    
    try:
        # Save file
        with open(destination, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Build response
        file_link = f"{fastapi_base_url}uploaded_files/{unique_filename}"
        
        return JSONResponse(content={
            "success": True,
            "message": "VRM model uploaded successfully",
            "file": {
                "path": file_link,
                "display_name": display_name,
                "original_name": file.filename,
                "unique_filename": unique_filename
            }
        })
    
    except Exception as e:
        logger.error(f"VRM model upload failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to save file: {str(e)}"}
        )

@app.get("/get_default_vrm_models")
async def get_default_vrm_models(request: Request):
    try:
        fastapi_base_url = str(request.base_url)
        models = []
        
        # Ensure directory exists
        if not os.path.exists(DEFAULT_VRM_DIR):
            os.makedirs(DEFAULT_VRM_DIR, exist_ok=True)
            return JSONResponse(content={
                "success": True,
                "models": []
            })
        
        # Scan the default VRM directory for .vrm files
        vrm_files = glob.glob(os.path.join(DEFAULT_VRM_DIR, "*.vrm"))
        
        for vrm_file in vrm_files:
            file_name = os.path.basename(vrm_file)
            # Use filename without extension as display name
            display_name = os.path.splitext(file_name)[0]
            
            # Build file URL
            file_url = f"{fastapi_base_url}vrm/{file_name}"
            
            models.append({
                "id": os.path.splitext(file_name)[0].lower(),  # Use filename as ID
                "name": display_name,
                "path": file_url,
                "type": "default"
            })
        
        # Sort by name
        models.sort(key=lambda x: x['name'])
        return JSONResponse(content={
            "success": True,
            "models": models
        })
        
    except Exception as e:
        logger.error(f"Failed to retrieve default VRM models: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to retrieve default models: {str(e)}"}
        )

# VRM deletion endpoint with safety checks
@app.delete("/delete_vrm_model/{filename}")
async def delete_vrm_model(filename: str):
    try:
        # Only delete uploaded models, not defaults
        file_path = os.path.join(UPLOAD_FILES_DIR, filename)
        
        # Require a UUID filename to prevent path traversal
        if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.vrm$", filename):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid filename"}
            )
        
        # Ensure path is under upload directory to protect default models
        if not file_path.startswith(os.path.abspath(UPLOAD_FILES_DIR)):
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "Cannot delete default models"}
            )
        
        if os.path.exists(file_path):
            os.remove(file_path)
            return JSONResponse(content={
                "success": True,
                "message": "VRM model file deleted"
            })
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "File not found"}
            )
            
    except Exception as e:
        logger.error(f"Failed to delete VRM model: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Deletion failed: {str(e)}"}
        )

ALLOWED_VRMA_EXTENSIONS = {"vrma"}

animation_dir = os.path.join(DEFAULT_VRM_DIR, "animations")

def make_file_url(request: Request, file_path: str) -> str:
    """Convert a local file path into an accessible URL."""
    return str(request.base_url) + file_path.lstrip("/")


def scan_motion_files(directory: str, allowed_ext: set) -> List[dict]:
    """
    Scan the specified directory for files matching the extensions and return a list:
    [
      {
        "id": "filename without extension",
        "name": "filename without extension",
        "path": "complete accessible URL",
        "type": "default" | "user"
      }
    ]
    """
    files = []
    if not os.path.exists(directory):
        return files

    for f in os.listdir(directory):
        if f.lower().endswith(tuple(allowed_ext)):
            file_id = Path(f).stem
            file_path = os.path.join(directory, f)
            # Return relative paths here; construct URLs later
            files.append({
                "id": file_id,
                "name": file_id,
                "path": file_path,
                "type": "default" if directory == animation_dir else "user"
            })
    # Sort by filename
    files.sort(key=lambda x: x["name"])
    return files

@app.get("/get_default_vrma_motions")
async def get_default_vrma_motions(request: Request):
    try:
        motions = scan_motion_files(animation_dir, ALLOWED_VRMA_EXTENSIONS)

        # Convert disk paths to URLs
        for m in motions:
            file_name = os.path.basename(m["path"])
            m["path"] = str(request.base_url) + f"vrm/animations/{file_name}"

        return {"success": True, "motions": motions}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to retrieve default motions: {str(e)}"}
        )


@app.get("/get_user_vrma_motions")
async def get_user_vrma_motions(request: Request):
    try:
        motions = scan_motion_files(UPLOAD_FILES_DIR)

        # Convert disk paths to URLs
        for m in motions:
            file_name = os.path.basename(m["path"])
            m["path"] = str(request.base_url) + f"uploaded_files/{file_name}"

        return {"success": True, "motions": motions}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to retrieve user motions: {str(e)}"}
        )


@app.post("/upload_vrma_motion")
async def upload_vrma_motion(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    # Check extension
    file_extension = Path(file.filename).suffix.lower().lstrip(".")
    if file_extension not in ALLOWED_VRMA_EXTENSIONS:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": f"Unsupported file type: {file_extension}"}
        )

    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}.vrma"
    destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)

    try:
        # Save file
        os.makedirs(UPLOAD_FILES_DIR, exist_ok=True)
        with open(destination, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Build return data
        file_url = make_file_url(request, f"uploaded_files/{unique_filename}")

        return JSONResponse(content={
            "success": True,
            "message": "Motion uploaded successfully",
            "file": {
                "unique_filename": unique_filename,
                "display_name": display_name,
                "path": file_url
            }
        })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to save file: {str(e)}"}
        )


@app.delete("/delete_vrma_motion/{filename}")
async def delete_vrma_motion(filename: str):
    try:
        # Only allow deletion from UPLOAD_FILES_DIR
        if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.vrma$", filename):
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid filename"}
            )

        file_path = os.path.join(UPLOAD_FILES_DIR, filename)
        abs_upload = os.path.abspath(UPLOAD_FILES_DIR)
        abs_file = os.path.abspath(file_path)

        if not abs_file.startswith(abs_upload):
            return JSONResponse(
                status_code=403,
                content={"success": False, "message": "System files cannot be deleted"}
            )

        if os.path.exists(file_path):
            os.remove(file_path)
            return {"success": True, "message": "Motion file deleted"}
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "File not found"}
            )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Deletion failed: {str(e)}"}
        )

# -------------- GAUSS scene resources --------------
GAUSS_DIR     = os.path.join(DEFAULT_VRM_DIR, "scene")       # Default scene directory
ALLOWED_GAUSS = {"ply", "spz", "splat", "ksplat", "sog"}     # Extensions supported by Spark

@app.post("/upload_gauss_scene")
async def upload_gauss_scene(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_GAUSS:
        return JSONResponse(status_code=400, content={
            "success": False,
            "message": f"Unsupported file type: {ext}"
        })
    unique = f"{uuid.uuid4()}.{ext}"
    destination = os.path.join(UPLOAD_FILES_DIR, unique)
    try:
        os.makedirs(UPLOAD_FILES_DIR, exist_ok=True)
        with open(destination, "wb") as f:
            f.write(await file.read())
        url = str(request.base_url) + f"uploaded_files/{unique}"
        return JSONResponse(content={
            "success": True,
            "file": {
                "unique_filename": unique,
                "display_name": display_name,
                "path": url
            }
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/get_default_gauss_scenes")
async def get_default_gauss_scenes(request: Request):
    try:
        os.makedirs(GAUSS_DIR, exist_ok=True)
        scenes = []
        for f in os.listdir(GAUSS_DIR):
            ext = Path(f).suffix.lower().lstrip(".")
            if ext in ALLOWED_GAUSS:
                scenes.append({
                    "id":   Path(f).stem,
                    "name": Path(f).stem,
                    "path": str(request.base_url) + f"vrm/scene/{f}",
                    "type": "default"
                })
        scenes.sort(key=lambda x: x["name"])
        return {"success": True, "scenes": scenes}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/get_user_gauss_scenes")
async def get_user_gauss_scenes(request: Request):
    try:
        scenes = []
        for f in os.listdir(UPLOAD_FILES_DIR):
            ext = Path(f).suffix.lower().lstrip(".")
            if ext in ALLOWED_GAUSS:
                scenes.append({
                    "id":   Path(f).stem,
                    "name": Path(f).stem,
                    "path": str(request.base_url) + f"uploaded_files/{f}",
                    "type": "user"
                })
        scenes.sort(key=lambda x: x["name"])
        return {"success": True, "scenes": scenes}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.delete("/delete_gauss_scene/{filename}")
async def delete_gauss_scene(filename: str):
    if not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(ply|spz|splat|ksplat|sog)$", filename):
        return JSONResponse(status_code=400, content={"success": False, "message": "Invalid filename"})
    file_path = os.path.join(UPLOAD_FILES_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"success": True, "message": "Scene deleted"}
    return JSONResponse(status_code=404, content={"success": False, "message": "File not found"})


@app.get("/update_storage")
async def update_storage_endpoint(request: Request):
    settings = await load_settings()
    textFiles = [item for item in (settings.get("textFiles") or []) if isinstance(item,dict) and 'unique_filename' in item]
    imageFiles = [item for item in (settings.get("imageFiles") or []) if isinstance(item,dict) and 'unique_filename' in item]
    videoFiles = [item for item in (settings.get("videoFiles") or []) if isinstance(item,dict) and 'unique_filename' in item]
    # Scan UPLOAD_FILES_DIR and classify by supported text, image and video extensions; add missing files to the corresponding list.
    # Each list contains dictionaries with unique_filename and original_filename.
    
    for file in os.listdir(UPLOAD_FILES_DIR):
        file_path = os.path.join(UPLOAD_FILES_DIR, file)
        if os.path.isfile(file_path):
            file_extension = os.path.splitext(file)[1][1:]
            if file_extension in ALLOWED_EXTENSIONS:
                if file not in [item["unique_filename"] for item in textFiles]:
                    textFiles.append({"unique_filename": file, "original_filename": file})
            elif file_extension in ALLOWED_IMAGE_EXTENSIONS:
                if file not in [item["unique_filename"] for item in imageFiles]:
                    imageFiles.append({"unique_filename": file, "original_filename": file})
            elif file_extension in ALLOWED_VIDEO_EXTENSIONS:
                if file not in [item["unique_filename"] for item in videoFiles]:
                    videoFiles.append({"unique_filename": file, "original_filename": file})

    # Send to frontend
    return JSONResponse(content={"textFiles": textFiles, "imageFiles": imageFiles, "videoFiles": videoFiles})

@app.get("/get_file_content")
async def get_file_content_endpoint(file_url: str):
    try:
        file_path = resolve_upload_path(UPLOAD_FILES_DIR, file_url)
    except InvalidUploadPath:
        raise HTTPException(status_code=403, detail="Invalid upload filename")
    content = await get_file_content(file_path)
    return JSONResponse(content={"content": content})

@app.post("/create_kb")
async def create_kb_endpoint(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    kb_id = data.get("kbId")
    
    if not kb_id:
        raise HTTPException(status_code=400, detail="Missing kbId")
    
    # Add task to the background queue
    background_tasks.add_task(process_kb, kb_id)
    
    return {"success": True, "message": "Knowledge base processing started; check its status later"}

@app.delete("/remove_kb")
async def remove_kb_endpoint(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    kb_id = data.get("kbId")

    if not kb_id:
        raise HTTPException(status_code=400, detail="Missing kbId")
    try:
        background_tasks.add_task(remove_kb, kb_id)
    except Exception as e:
        return {"success": False, "message": str(e)}
    return {"success": True, "message": "Knowledge base deleted"}

# Delete knowledge base
async def remove_kb(kb_id):
    # Delete the KB_DIR/kb_id directory
    kb_dir = os.path.join(KB_DIR, str(kb_id))
    if os.path.exists(kb_dir):
        shutil.rmtree(kb_dir)
    else:
        print(f"KB directory {kb_dir} does not exist.")
    return

# State storage
kb_status = {}
@app.get("/kb_status/{kb_id}")
async def get_kb_status(kb_id):
    status = kb_status.get(kb_id, "not_found")
    print (f"kb_status: {kb_id} - {status}")
    return {"kb_id": kb_id, "status": status}

# Update process_kb
async def process_kb(kb_id):
    kb_status[kb_id] = "processing"
    try:
        from py.know_base import process_knowledge_base
        await process_knowledge_base(kb_id)
        kb_status[kb_id] = "completed"
    except Exception as e:
        kb_status[kb_id] = f"failed: {str(e)}"

@app.post("/create_sticker_pack")
async def create_sticker_pack(
    request: Request,
    files: List[UploadFile] = File(..., description="Expression image files"),
    pack_name: str = Form(..., description="Sticker pack name"),
    descriptions: List[str] = Form(..., description="Expression descriptions")
):
    """
    Create a new sticker pack.
    - files: uploaded image files
    - pack_name: sticker pack name
    - descriptions: description for each expression
    """
    fastapi_base_url = str(request.base_url)
    imageFiles = []
    stickers_data = []
    
    try:
        # Validate input
        if not pack_name:
            raise HTTPException(status_code=400, detail="Sticker pack name must not be empty")
        if len(files) == 0:
            raise HTTPException(status_code=400, detail="Upload at least one sticker")
        if len(descriptions) != len(files):
            raise HTTPException(
                status_code=400, 
                detail=f"Description count ({len(descriptions)}) does not match file count ({len(files)})"
            )

        # Process uploaded expression files
        for idx, file in enumerate(files):
            # Get file extension
            file_extension = os.path.splitext(file.filename)[1].lower()
            
            # Validate file type
            if file_extension not in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Unsupported file type: {file_extension}"
                )
            
            # Generate unique filename
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            destination = os.path.join(UPLOAD_FILES_DIR, unique_filename)

            # Save file
            with open(destination, "wb") as buffer:
                content = await file.read()
                buffer.write(content)

            # Build return data
            imageFiles.append({
                "unique_filename": unique_filename,
                "original_filename": file.filename,
            })
            
            # Get matching description, guarding against index overflow
            description = descriptions[idx] if idx < len(descriptions) else ""

            # Build expression data
            stickers_data.append({
                "unique_filename": unique_filename,
                "original_filename": file.filename,
                "url": f"{fastapi_base_url}uploaded_files/{unique_filename}",
                "description": description
            })

        # Create sticker pack ID (can be replaced with database storage)
        sticker_pack_id = str(uuid.uuid4())
        
        return JSONResponse(content={
            "success": True,
            "id": sticker_pack_id,
            "name": pack_name,
            "stickers": stickers_data,
            "imageFiles": imageFiles,
            "cover": stickers_data[0]["url"] if stickers_data else None
        })
    
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Failed to create sticker pack: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

# ==========================================
# Optional bot managers (lazy initialization)
# ==========================================
class BotContainer:
    """Keep managers for supported optional messaging services."""
    _discord = None
    _slack = None
    _telegram = None

    @classmethod
    def get_discord(cls):
        if cls._discord is None:
            from py.discord_bot_manager import DiscordBotManager
            cls._discord = DiscordBotManager()
        return cls._discord

    @classmethod
    def get_slack(cls):
        if cls._slack is None:
            from py.slack_bot_manager import SlackBotManager
            cls._slack = SlackBotManager()
        return cls._slack

    @classmethod
    def get_telegram(cls):
        if cls._telegram is None:
            from py.telegram_bot_manager import TelegramBotManager
            cls._telegram = TelegramBotManager()
        return cls._telegram

# ==========================================
# 4. Discord bot routes
# ==========================================

@app.post("/start_discord_bot")
async def start_discord_bot(config_data: dict):
    try:
        from py.discord_bot_manager import DiscordBotConfig
        config = DiscordBotConfig(**config_data)
        BotContainer.get_discord().start_bot(config)
        return {"success": True, "message": "Discord bot started"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.post("/stop_discord_bot")
async def stop_discord_bot():
    if BotContainer._discord:
        BotContainer.get_discord().stop_bot()
    return {"success": True, "message": "Discord bot stopped"}

@app.get("/discord_bot_status")
async def discord_bot_status():
    if BotContainer._discord is None:
        return {"is_running": False}
    return BotContainer.get_discord().get_status()

@app.post("/reload_discord_bot")
async def reload_discord_bot(config_data: dict):
    try:
        from py.discord_bot_manager import DiscordBotConfig
        config = DiscordBotConfig(**config_data)
        manager = BotContainer.get_discord()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "Discord bot reloaded"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

# ==========================================
# 5. Slack bot routes
# ==========================================

@app.post("/start_slack_bot")
async def start_slack_bot(config_data: dict):
    try:
        from py.slack_bot_manager import SlackBotConfig
        config = SlackBotConfig(**config_data)
        BotContainer.get_slack().start_bot(config)
        return {"success": True, "message": "Slack bot started"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "message": str(e)})

@app.post("/stop_slack_bot")
async def stop_slack_bot():
    if BotContainer._slack:
        BotContainer.get_slack().stop_bot()
    return {"success": True, "message": "Slack bot stopped"}

@app.get("/slack_bot_status")
async def slack_bot_status():
    if BotContainer._slack is None:
        return {"is_running": False}
    return BotContainer.get_slack().get_status()

@app.post("/reload_slack_bot")
async def reload_slack_bot(config_data: dict):
    try:
        from py.slack_bot_manager import SlackBotConfig
        config = SlackBotConfig(**config_data)
        manager = BotContainer.get_slack()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "Slack bot reloaded"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

# ==========================================
# 6. Telegram bot routes
# ==========================================

@app.post("/start_telegram_bot")
async def start_telegram_bot(config_data: dict):
    try:
        from py.telegram_bot_manager import TelegramBotConfig
        config = TelegramBotConfig(**config_data)
        BotContainer.get_telegram().start_bot(config)
        return {"success": True, "message": "Telegram bot started successfully", "environment": "thread-based"}
    except Exception as e:
        logger.error(f"Failed to start Telegram bot: {e}")
        return JSONResponse(status_code=400, content={"success": False, "message": f"Startup failed: {str(e)}", "error_type": "startup_error"})

@app.post("/stop_telegram_bot")
async def stop_telegram_bot():
    try:
        if BotContainer._telegram:
            BotContainer.get_telegram().stop_bot()
        return {"success": True, "message": "Telegram bot stopped"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

@app.get("/telegram_bot_status")
async def telegram_bot_status():
    if BotContainer._telegram is None:
        return {"is_running": False}
    status = BotContainer.get_telegram().get_status()
    if status.get("startup_error") and not status.get("is_running"):
        status["error_message"] = f"Startup failed: {status['startup_error']}"
    return status

@app.post("/reload_telegram_bot")
async def reload_telegram_bot(config_data: dict):
    try:
        from py.telegram_bot_manager import TelegramBotConfig
        config = TelegramBotConfig(**config_data)
        manager = BotContainer.get_telegram()
        manager.stop_bot()
        await asyncio.sleep(1)
        manager.start_bot(config)
        return {"success": True, "message": "Telegram bot reloaded", "config_changed": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


@app.post("/add_workflow")
async def add_workflow(file: UploadFile = File(...), workflow_data: str = Form(...)):
    # Verify JSON file type
    if file.content_type != "application/json":
        raise HTTPException(
            status_code=400,
            detail="Only JSON files are allowed."
        )

    # Generate unique filename with uuid.uuid4(), without hyphens
    unique_filename = str(uuid.uuid4()).replace('-', '')

    # Join file path
    file_path = os.path.join(UPLOAD_FILES_DIR, unique_filename + ".json")

    # Save file
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )

    # Parse workflow_data
    workflow_data_dict = json.loads(workflow_data)

    # Return file information
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "File uploaded successfully",
            "file": {
                "unique_filename": unique_filename,
                "original_filename": file.filename,
                "url": f"/uploaded_files/{unique_filename}",
                "enabled": True,
                "text_input": workflow_data_dict.get("textInput"),
                "text_input_2": workflow_data_dict.get("textInput2"),
                "image_input": workflow_data_dict.get("imageInput"),
                "image_input_2": workflow_data_dict.get("imageInput2"),
                "seed_input": workflow_data_dict.get("seedInput"),
                "seed_input2": workflow_data_dict.get("seedInput2"),
                "description": workflow_data_dict.get("description")
            }
        }
    )

@app.delete("/delete_workflow/{filename}")
async def delete_workflow(filename: str):
    file_path = os.path.join(UPLOAD_FILES_DIR, filename + ".json")
    
    # Check file existence
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Delete file
    try:
        os.remove(file_path)
        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "File deleted successfully"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )

@app.get("/cur_language")
async def cur_language():
    settings = await load_settings()
    return {"language": "en-US"}

@app.get("/vrm_config")
async def vrm_config():
    settings = await load_settings()
    return {"VRMConfig": settings.get("VRMConfig", {})}

@app.get("/tha_config")
async def tha_config():
    settings = await load_settings()
    return {"THAConfig": settings.get("THAConfig", {})}


@app.get("/soulx_config")
async def soulx_config():
    settings = await load_settings()
    return {"SoulxConfig": settings.get("SoulxConfig", {})}


@app.post("/soulx_config")
async def set_soulx_config(request: Request):
    """Update the selected reference image from the SoulX frontend."""
    try:
        payload = await request.json()
        settings = await load_settings()
        soulx = settings.get("SoulxConfig", {})
        if "selectedImageId" in payload:
            soulx["selectedImageId"] = payload["selectedImageId"]
            settings["SoulxConfig"] = soulx
            await save_settings(settings)
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


def _soulx_image_id_from_name(display_name: str) -> str:
    """Generate a safe image ID used as filename and FlashHead person_name."""
    safe = re.sub(r'[\\/:*?"<>|.\s]+', '_', display_name).strip('_')[:50]
    if not safe:
        safe = f"img_{uuid.uuid4().hex[:8]}"
    candidate = safe
    idx = 2
    while os.path.exists(os.path.join(SOULX_IMAGES_DIR, f"{candidate}.png")):
        candidate = f"{safe}_{idx}"
        idx += 1
    return candidate


@app.post("/upload_soulx_image")
async def upload_soulx_image(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    try:
        data = await file.read()
        img = Image.open(io.BytesIO(data)).convert("RGB")
        image_id = _soulx_image_id_from_name(display_name.strip() or (file.filename or "").rsplit('.', 1)[0])
        os.makedirs(SOULX_IMAGES_DIR, exist_ok=True)
        img.save(os.path.join(SOULX_IMAGES_DIR, f"{image_id}.png"), format="PNG")
        return JSONResponse(content={
            "success": True,
            "image": {
                "id": image_id,
                "name": display_name.strip() or image_id,
                "url": f"/uploaded_files/soulx_images/{image_id}.png"
            }
        })
    except Exception as e:
        logger.error(f"Failed to upload SoulX reference image: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Upload failed: {str(e)}"}
        )


@app.get("/get_soulx_images")
async def get_soulx_images(request: Request):
    try:
        images = []
        seen = set()
        # Default images are listed first and cannot be deleted or overwritten
        default_dir = DEFAULT_SOULX_IMAGES_DIR
        if os.path.isdir(default_dir):
            for fname in sorted(os.listdir(default_dir)):
                if fname.lower().endswith('.png'):
                    stem = fname[:-4]
                    seen.add(stem)
                    images.append({
                        "id": stem,
                        "name": stem,
                        "url": f"/default_soulx_images/{fname}",
                        "default": True
                    })
        # User-uploaded images
        if os.path.isdir(SOULX_IMAGES_DIR):
            for fname in sorted(os.listdir(SOULX_IMAGES_DIR)):
                if fname.lower().endswith('.png'):
                    stem = fname[:-4]
                    if stem in seen: continue
                    images.append({
                        "id": stem,
                        "name": stem,
                        "url": f"/uploaded_files/soulx_images/{fname}"
                    })
        return JSONResponse(content={
            "success": True,
            "images": images,
            "dir": os.path.abspath(SOULX_IMAGES_DIR)
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to retrieve reference images: {str(e)}"}
        )


@app.delete("/delete_soulx_image/{image_id}")
async def delete_soulx_image(image_id: str):
    try:
        if not re.fullmatch(r'[\w\-]+', image_id):
            return JSONResponse(status_code=400, content={"success": False, "message": "Invalid image ID"})
        # Prevent deletion of default images
        default_path = os.path.join(DEFAULT_SOULX_IMAGES_DIR, f"{image_id}.png")
        if os.path.exists(default_path):
            return JSONResponse(status_code=403, content={"success": False, "message": "The default avatar cannot be deleted"})
        path = os.path.join(SOULX_IMAGES_DIR, f"{image_id}.png")
        if not os.path.exists(path):
            return JSONResponse(status_code=404, content={"success": False, "message": "Image not found"})
        os.remove(path)
        settings = await load_settings()
        soulx = settings.get("SoulxConfig", {})
        if soulx.get("selectedImageId") == image_id:
            soulx["selectedImageId"] = ""
            settings["SoulxConfig"] = soulx
            await save_settings(settings)
        return JSONResponse(content={"success": True, "message": "Reference image deleted"})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Deletion failed: {str(e)}"}
        )


@app.post("/tha_config")
async def set_tha_config(request: Request):
    """Update the model selection from the THA frontend."""
    try:
        payload = await request.json()
        settings = await load_settings()
        tha = settings.get("THAConfig", {})
        if "selectedModelId" in payload:
            tha["selectedModelId"] = payload["selectedModelId"]
            settings["THAConfig"] = tha
            await save_settings(settings)
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


@app.post("/tha_emotion")
async def tha_emotion(request: Request):
    """Broadcast expressions or motions to connected THA companions for debugging and integration.

    Supports three formats:
        {"emotion": "happy"}                          Single expression
        {"expressions": ["happy:0.3", "surprised:0.5"]} Weighted tag list
        {"emotions": {"happy": 0.3, "surprised": 0.5}}  Weight dictionary
    """
    try:
        payload = await request.json()
        if "emotions" in payload:
            emotions = payload["emotions"]
            if not isinstance(emotions, dict) or not all(
                    isinstance(v, (int, float)) for v in emotions.values()):
                return JSONResponse(status_code=400, content={
                    "success": False, "message": "emotions must be a mapping of expression names to numeric weights"})
            expressions = [f"{k}:{v}" for k, v in emotions.items()]
        elif "expressions" in payload:
            if not isinstance(payload["expressions"], list):
                return JSONResponse(status_code=400, content={
                    "success": False, "message": "expressions must be a list of strings"})
            expressions = payload["expressions"]
        elif "emotion" in payload:
            if not isinstance(payload["emotion"], str):
                return JSONResponse(status_code=400, content={
                    "success": False, "message": "emotion must be a string"})
            expressions = [payload["emotion"]]
        else:
            return JSONResponse(status_code=400, content={
                "success": False, "message": "Provide one of emotion, expressions or emotions"})
        await tts_manager.broadcast_expressions_to_tha(expressions)
        return {"success": True, "expressions": expressions}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "message": str(e)})


@app.post("/upload_tha_model")
async def upload_tha_model(
    request: Request,
    file: UploadFile = File(...),
    display_name: str = Form(...)
):
    from py.tha_engine import THAModelManager

    file_extension = file.filename.split('.')[-1].lower()
    if file_extension not in ('onnx', 'zip'):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Only .onnx or .zip (CoreML) THA model files are supported"}
        )

    try:
        data = await file.read()
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        if file_extension == 'onnx':
            success, msg, info = manager.install_onnx(data, display_name)
        else:
            success, msg, info = manager.install_mlpackage(data, display_name)

        if success:
            return JSONResponse(content={
                "success": True,
                "message": msg,
                "model": info
            })
        else:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": msg}
            )
    except Exception as e:
        logger.error(f"THA model upload failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Upload failed: {str(e)}"}
        )


@app.get("/get_default_tha_models")
async def get_default_tha_models(request: Request):
    from py.tha_engine import THAModelManager
    try:
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        models = manager.scan_default_models()
        return JSONResponse(content={"success": True, "models": models})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to retrieve default models: {str(e)}"}
        )


@app.get("/get_user_tha_models")
async def get_user_tha_models(request: Request):
    from py.tha_engine import THAModelManager
    try:
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        models = manager.scan_user_models()
        return JSONResponse(content={"success": True, "models": models})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Failed to retrieve user models: {str(e)}"}
        )


@app.delete("/delete_tha_model/{model_id}")
async def delete_tha_model(model_id: str):
    from py.tha_engine import THAModelManager
    try:
        manager = THAModelManager(DEFAULT_THA_DIR, THA_USER_MODELS_DIR)
        if manager.delete_model(model_id):
            return JSONResponse(content={"success": True, "message": "THA model deleted"})
        else:
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "Model does not exist or is a protected default model"}
            )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Deletion failed: {str(e)}"}
        )


from py.live_router import router as live_router, ws_router as live_ws_router

# 2. Mount separately
app.include_router(live_router)     # /api/live/*
app.include_router(live_ws_router)  # /ws/live/*


from py.overlay_router import router as overlay_router
app.include_router(overlay_router)

# ---------- Helpers ----------
def _sanitize_card_strings(memory: dict) -> None:
    """Remove control characters from character card text (preserve \\n \\r \\t) to avoid invalid API requests."""
    import re
    _bad_ctrl = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
    text_keys = ('description', 'personality', 'mesExample', 'systemPrompt',
                 'firstMes', 'name', 'characterBook')
    for key in text_keys:
        val = memory.get(key)
        if isinstance(val, str):
            memory[key] = _bad_ctrl.sub('', val)
    alt_gs = memory.get('alternateGreetings')
    if isinstance(alt_gs, list):
        for i in range(len(alt_gs)):
            if isinstance(alt_gs[i], str):
                alt_gs[i] = _bad_ctrl.sub('', alt_gs[i])


def fmt_iso8605_to_local(iso: str) -> str:
    """
    ISO-8601 -> server local time yyyy-MM-dd HH:mm:ss
    """
    try:
        dt = datetime.fromisoformat(iso)      # Parse input, which may include a timezone
        dt = dt.astimezone()                  # Convert to the server's current timezone
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return iso        # Return original value on parse failure


async def _get_m0_config_for_memory(memory_id: str):
    """Get mem0 configuration for memory_id or raise HTTPException."""
    from py.get_setting import load_settings
    settings_data = await load_settings()
    mems = settings_data.get("memories") or []
    cur_memory = None
    for m in mems:
        if m.get("id") == memory_id:
            cur_memory = m
            break
    if not cur_memory:
        raise HTTPException(status_code=404, detail="memory config not found")
    if not cur_memory.get("providerId"):
        raise HTTPException(status_code=400, detail="memory has no embedding provider configured")

    _effective_dims = cur_memory.get("embedding_dims", 1024)
    _faiss_path = os.path.join(MEMORY_CACHE_DIR, memory_id, "agent-party.faiss")
    if os.path.exists(_faiss_path):
        try:
            import faiss
            _existing = faiss.read_index(_faiss_path)
            if _existing.d != _effective_dims:
                print(f"[WARNING] stored dims({_effective_dims}) != faiss actual dims({_existing.d}); using actual dimensions")
            _effective_dims = _existing.d
        except Exception as e:
            print(f"[WARNING] Could not read existing FAISS index dimensions: {e}")

    # Ensure pickle uses mem0-compatible (docstore, index_to_id) tuple format
    _ppath = os.path.join(MEMORY_CACHE_DIR, memory_id, "agent-party.pkl")
    if os.path.exists(_ppath):
        try:
            with open(_ppath, "rb") as f:
                _raw = pickle.load(f)
            _needs_migration = False
            _needs_repair = False
            if not (isinstance(_raw, tuple) and len(_raw) == 2 and isinstance(_raw[0], dict)):
                _needs_migration = True
            else:
                # Already migrated, but user_id may be missing; inspect first entry
                _docstore = _raw[0]
                if _docstore:
                    _first = next(iter(_docstore.values()), {})
                    if isinstance(_first, dict) and "user_id" not in _first:
                        _needs_repair = True
            if _needs_migration or _needs_repair:
                import faiss
                index = faiss.read_index(_faiss_path)
                if _needs_migration:
                    if isinstance(_raw, dict):
                        meta_for_migration = _raw
                    elif isinstance(_raw, tuple) and isinstance(_raw[0], dict):
                        meta_for_migration = _raw[0]
                    else:
                        meta_for_migration = {}
                else:
                    # _needs_repair: rebuild existing (docstore, idx2id) format to add user_id
                    _existing_idx2id = _raw[1]
                    meta_for_migration = {}
                    for _idx in sorted(_existing_idx2id.keys()):
                        _vid = _existing_idx2id[_idx]
                        _payload = _raw[0].get(_vid, {})
                        meta_for_migration[_vid] = {
                            "data": _payload.get("data", ""),
                            "created_at": _payload.get("created_at", ""),
                            "timetamp": _payload.get("updated_at", _payload.get("created_at", "")),
                        }
                docstore = {}
                idx2id = {}
                for idx, (vid, rec) in enumerate(meta_for_migration.items()):
                    data_t = rec.get("data", "") if isinstance(rec, dict) else ""
                    docstore[vid] = {
                        "data": data_t,
                        "hash": hashlib.md5(data_t.encode()).hexdigest(),
                        "created_at": rec.get("created_at", "") if isinstance(rec, dict) else "",
                        "updated_at": rec.get("timetamp", rec.get("created_at", "")) if isinstance(rec, dict) else "",
                        "user_id": memory_id,
                    }
                    idx2id[idx] = vid
                with open(_ppath, "wb") as f:
                    pickle.dump((docstore, idx2id), f)
                action = "Migrated" if _needs_migration else "Repaired (added user_id)"
                print(f"[INFO] pickle {action} to mem0-compatible format: {_ppath}")
        except Exception as e:
            print(f"[WARNING] pickle processing failed: {e}")

    config = {
        "embedder": {
            "provider": "openai",
            "config": {
                "model": cur_memory["model"],
                "api_key": cur_memory["api_key"],
                "openai_base_url": cur_memory.get("base_url", ""),
                "embedding_dims": _effective_dims,
            },
        },
        "llm": {
            "provider": "openai",
            "config": {
                "model": settings_data.get("model", ""),
                "api_key": settings_data.get("api_key", ""),
                "openai_base_url": settings_data.get("base_url", ""),
            },
        },
        "vector_store": {
            "provider": "faiss",
            "config": {
                "collection_name": "agent-party",
                "path": os.path.join(MEMORY_CACHE_DIR, memory_id),
                "distance_strategy": "euclidean",
                "embedding_model_dims": _effective_dims,
            },
        },
    }
    return config


# ---------- Models ----------
class TextUpdate(BaseModel):
    new_text: str


# ---------- 1. List all memory entries ----------
@app.get("/memory/{memory_id}")
async def read_memory(memory_id: str) -> List[Dict[str, Any]]:
    try:
        config = await _get_m0_config_for_memory(memory_id)
        from mem0 import Memory
        m0 = Memory.from_config(config)
        results = await asyncio.to_thread(m0.get_all, user_id=memory_id, limit=10000)
        # mem0 v1.1+ returns {"results": [...]} format
        items = results.get("results", []) if isinstance(results, dict) else (results or [])
        flat = []
        for item in items:
            flat.append({
                "idx": len(flat),
                "uuid": item.get("id", ""),
                "text": item.get("memory", ""),
                "created_at": fmt_iso8605_to_local(item.get("created_at", "")),
                "timetamp": fmt_iso8605_to_local(item.get("updated_at") or item.get("created_at", "")),
            })
        return flat
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- 2. Add memory entry ----------
@app.post("/memory/{memory_id}")
async def add_text(memory_id: str, body: TextUpdate = Body(...)) -> dict:
    config = await _get_m0_config_for_memory(memory_id)
    from mem0 import Memory
    m0 = Memory.from_config(config)
    await asyncio.to_thread(m0.add, body.new_text, user_id=memory_id, infer=False)
    return {"message": "added"}


# ---------- 3. Edit memory content ----------
@app.put("/memory/{memory_id}/{uuid}")
async def update_text(memory_id: str, uuid: str, body: TextUpdate = Body(...)) -> dict:
    config = await _get_m0_config_for_memory(memory_id)
    from mem0 import Memory
    m0 = Memory.from_config(config)
    await asyncio.to_thread(m0.update, memory_id=uuid, data=body.new_text)
    return {"message": "updated", "uuid": uuid}


# ---------- 4. Delete memory entry ----------
@app.delete("/memory/{memory_id}/{uuid}")
async def delete_text(memory_id: str, uuid: str) -> dict:
    config = await _get_m0_config_for_memory(memory_id)
    from mem0 import Memory
    m0 = Memory.from_config(config)
    await asyncio.to_thread(m0.delete, memory_id=uuid)
    return {"message": "deleted", "uuid": uuid}

@app.post("/api/update_proxy") # Use POST for state changes
async def update_proxy():
    try:
        from py.get_setting import load_settings  # Import the settings loader
        settings = await load_settings()
        
        if not settings:
            return {"message": "Settings not found", "success": False}

        sys_set = settings.get("systemSettings", {})
        mode = sys_set.get("proxyMode")
        manual_url = sys_set.get("proxy", "").strip()

        # All proxy-related environment variable keys
        proxy_keys = ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'all_proxy']

        # Package registries remain controlled by the operating environment.

        # --- 2. Update proxy environment variables ---
        if mode == "manual" and manual_url:
            # Remove SOCKS variables with a warning to avoid httpx failure
            if manual_url.lower().startswith("socks"):
                for key in proxy_keys:
                    os.environ.pop(key, None)
                return {"message": "Detected SOCKS proxy, disabled to prevent crash. Please use HTTP/HTTPS proxy.", "success": False}
            
            # Configure manual proxy
            for key in proxy_keys:
                os.environ[key] = manual_url
                
        elif mode == "system":
            # System mode: remove explicit Python overrides so the underlying client uses system settings
            for key in proxy_keys:
                os.environ.pop(key, None)
        else:
            # Proxy disabled: clear or remove variables
            for key in proxy_keys:
                os.environ[key] = "" 

        # --- 3. Attempt to refresh global_http_client dynamically ---
        # Environment changes affect subsequently created processes and clients.
        # To apply proxy changes immediately to OpenAI requests,
        # reinitialize global_http_client here.

        return {
            "message": "Proxy and mirrors updated successfully", 
            "success": True, 
            "current_mode": mode,
            "china_mirror": is_china_proxy
        }
    except Exception as e:
        return {"message": str(e), "success": False}

@app.get("/api/get_userfile")
async def get_userfile():
    try:
        userfile = USER_DATA_DIR
        return {"message": "Userfile loaded successfully", "userfile": userfile, "success": True}
    except Exception as e:
        return {"message": str(e), "success": False}

@app.get("/api/get_extfile")
async def get_extfile():
    try:
        extfile = EXT_DIR
        return {"message": "Extfile loaded successfully", "extfile": extfile, "success": True}
    except Exception as e:
        return {"message": str(e), "success": False}

def get_internal_ip():
    """Get the local network IP address."""
    try:
        # Use a socket to determine the outbound interface address without sending application data
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        s.connect(("8.8.8.8", 80))  # Use Google DNS as the routing destination
        internal_ip = s.getsockname()[0]
        s.close()
        return internal_ip
    except Exception:
        return "127.0.0.1"

@app.get("/api/ip")
def get_ip():
    ip = get_internal_ip()
    return {"ip": ip}

_ip_city_cache = None

@app.get("/api/ip-city")
async def get_ip_city():
    global _ip_city_cache
    if _ip_city_cache is not None:
        return _ip_city_cache
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://ip-api.com/json/", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if data.get("status") == "success":
                        _ip_city_cache = {
                            "city": data.get("city", ""),
                            "regionName": data.get("regionName", ""),
                            "country": data.get("country", ""),
                            "lat": data.get("lat"),
                            "lon": data.get("lon"),
                        }
                        return _ip_city_cache
    except Exception as e:
        print(f"[IP City] Failed to fetch: {e}")
    return {"city": "", "regionName": "", "country": "", "lat": None, "lon": None}

@app.get("/api/weather")
async def proxy_weather(lat: float, lon: float, daily: str = None, forecast_days: int = None):
    try:
        params = {"latitude": lat, "longitude": lon, "current_weather": "true"}
        if daily:
            params["daily"] = daily
        if forecast_days:
            params["forecast_days"] = str(forecast_days)
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.open-meteo.com/v1/forecast",
                params=params,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        print(f"[Weather Proxy] Failed: {e}")
    return {"error": "weather_fetch_failed"}

@app.get("/api/geocode")
async def proxy_geocode(city: str, lang: str = "en"):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": lang},
                timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        print(f"[Geocode Proxy] Failed: {e}")
    return {"error": "geocode_failed"}

HEATMAP_FILE = os.path.join(USER_DATA_DIR, "island_heatmap.json")

def _load_heatmap() -> dict:
    try:
        with open(HEATMAP_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_heatmap(data: dict):
    os.makedirs(os.path.dirname(HEATMAP_FILE), exist_ok=True)
    with open(HEATMAP_FILE, "w") as f:
        json.dump(data, f)

def increment_heatmap():
    today = datetime.now().strftime("%Y-%m-%d")
    data = _load_heatmap()
    data[today] = data.get(today, 0) + 1
    _save_heatmap(data)

@app.get("/api/heatmap")
async def get_heatmap():
    return _load_heatmap()

@app.post("/api/heatmap/increment")
async def post_heatmap_increment():
    increment_heatmap()
    return {"ok": True}


async def sync_all_bots_behavior(settings_dict: dict):
    """Sync running optional bot instances with the current behavior configuration."""
    behavior_data = settings_dict.get("behaviorSettings", {})
    platforms = (
        ("discord", "discordBotConfig", "py.discord_bot_manager", "DiscordBotConfig"),
        ("telegram", "telegramBotConfig", "py.telegram_bot_manager", "TelegramBotConfig"),
        ("slack", "slackBotConfig", "py.slack_bot_manager", "SlackBotConfig"),
    )
    for name, settings_key, module_name, config_class_name in platforms:
        try:
            if getattr(BotContainer, "_" + name) is None:
                continue
            manager = getattr(BotContainer, "get_" + name)()
            if manager.is_running:
                module = importlib.import_module(module_name)
                config_class = getattr(module, config_class_name)
                config_data = dict(settings_dict.get(settings_key, {}))
                config_data["behaviorSettings"] = behavior_data
                manager.update_behavior_config(config_class(**config_data))
                logger.info("WebSocket Sync: %s bot behavior settings updated", name)
        except Exception as exc:
            logger.error("WebSocket Sync Error (%s): %s", name, exc)

settings_lock = asyncio.Lock()
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Establish connection
    await ws_manager.connect(websocket)
    print(f"[DEBUG] WebSocket connection established")
    # Generate a unique connection ID and initialize state
    connection_id = str(shortuuid.ShortUUID().random(length=8))
    print(f"[DEBUG] Connection ID: {connection_id}")
    has_sent_prompt = False
    has_start_tts = False
    registered_ext_ids = set()
    try:
        # 2. Send initial data
        async with settings_lock:
            current_settings = await load_settings()
            # Compatibility: store conversations separately from settings
            if current_settings.get("conversations", None):
                await save_covs({
                    "conversations": current_settings["conversations"],
                    "conversationGroups": current_settings.get("conversationGroups", [])
                })
                del current_settings["conversations"]
                if current_settings.get("conversationGroups", None) is not None:
                    del current_settings["conversationGroups"]
                await save_settings(current_settings)
            
            covs = await load_covs()
            current_settings["conversations"] = covs.get("conversations", [])
            current_settings["conversationGroups"] = covs.get("conversationGroups", [])

        if 'localAppControlSettings' in current_settings:
            from py.local_app_control import get_connected_ports
            live_ports = get_connected_ports()
            stored = current_settings['localAppControlSettings'].get('connectedApps', {})
            if stored:
                cleaned = {}
                for app_id, conn in stored.items():
                    if conn.get('port') in live_ports:
                        cleaned[app_id] = conn
                if len(cleaned) != len(stored):
                    current_settings['localAppControlSettings']['connectedApps'] = cleaned
                    await save_settings(current_settings)

        await ws_manager.send_json({"type": "settings", "data": current_settings}, websocket)

        # 3. Message handling loop
        while True:
            try:
                data = await websocket.receive_json()
            except RuntimeError as e:
                # Handle receive calls on a disconnected connection
                if "receive" in str(e):
                    break # Exit loop
                raise e # Propagate other runtime errors
            
            msg_type = data.get("type")
            
            if msg_type == "ping":
                await ws_manager.send_json({"type": "pong"}, websocket)

            elif msg_type == "save_settings":
                settings_dict = data.get("data", {})
                cur_settings = await load_settings()
                if cur_settings.get("systemSettings", {}).get("contentSafety", False):
                    sys_prompt = settings_dict.get("system_prompt", "")
                    if sys_prompt:
                        is_safe, matched = await check_content_safety(sys_prompt)
                        if not is_safe:
                            print(f"[content_safety] ws save_settings blocked words: {matched}")
                            await ws_manager.send_json({"type": "error", "message": "The system prompt was blocked by the content safety policy; settings were not saved."}, websocket)
                            break
                from py.get_setting import deep_update
                deep_update(cur_settings, settings_dict)
                if 'localAppControlSettings' in settings_dict:
                    cur_settings['localAppControlSettings'] = settings_dict['localAppControlSettings']
                await save_settings(cur_settings)
                await sync_all_bots_behavior(cur_settings)
                try:
                    from py.diary_engine import global_diary_engine
                    global_diary_engine.update_config(cur_settings.get("diarySettings"))
                except Exception as e:
                    print(f"Failed to synchronize diary engine configuration: {e}")

                await ws_manager.send_json({
                    "type": "settings_saved",
                    "correlationId": data.get("correlationId"),
                    "success": True
                }, websocket)
                
                # Broadcast to other clients
                await ws_manager.broadcast_settings_update(cur_settings, exclude=websocket)

            elif msg_type == "save_conversations":
                cov_data = data.get("data", {})
                cur_settings = await load_settings()
                if cur_settings.get("systemSettings", {}).get("contentSafety", False):
                    covs = cov_data.get("conversations", [])
                    for conv in covs:
                        for msg in conv.get("messages", []):
                            if msg.get("role") == "assistant":
                                content = msg.get("content", "")
                                if isinstance(content, str):
                                    is_safe, matched = await check_content_safety(content, min_cjk_chars=3)
                                    if not is_safe:
                                        print(f"[content_safety] ws save_conversations blocked words: {matched}")
                                        msg["content"] = "[This response was replaced by the content safety filter.]"
                                        msg["_safety_filtered"] = True
                                elif isinstance(content, list):
                                    text = " ".join(item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text")
                                    is_safe, matched = await check_content_safety(text, min_cjk_chars=3)
                                    if not is_safe:
                                        print(f"[content_safety] ws save_conversations blocked words: {matched}")
                                        msg["content"] = "[This response was replaced by the content safety filter.]"
                                        msg["_safety_filtered"] = True
                await save_covs(cov_data)
                await ws_manager.send_json({
                    "type": "conversations_saved",
                    "correlationId": data.get("correlationId"),
                    "success": True
                }, websocket)

            elif msg_type == "save_current_conversation":
                conv_id = data.get("conversationId")
                conv_data = data.get("conversation")
                if conv_id and conv_data:
                    try:
                        await save_single_cov(conv_id, conv_data)
                    except Exception as e:
                        print(f"[save_current_conversation] Save failed: {e}")

            elif msg_type == "get_settings":
                settings = await load_settings()
                if settings.get("conversations", None):
                    await save_covs({
                        "conversations": settings["conversations"],
                        "conversationGroups": settings.get("conversationGroups", [])
                    })
                    del settings["conversations"]
                    if settings.get("conversationGroups", None) is not None:
                        del settings["conversationGroups"]
                    await save_settings(settings)
                covs = await load_covs()
                settings["conversations"] = covs.get("conversations", [])
                settings["conversationGroups"] = covs.get("conversationGroups", [])
                await ws_manager.send_json({"type": "settings", "data": settings}, websocket)

            elif msg_type == "save_agent":
                current_settings = await load_settings()
                agent_id = str(shortuuid.ShortUUID().random(length=8))
                config_path = os.path.join(AGENT_DIR, f"{agent_id}.json")
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(current_settings, f, indent=4, ensure_ascii=False)
                
                current_settings['agents'][agent_id] = {
                    "id": agent_id,
                    "name": data['data']['name'],
                    "system_prompt": data['data']['system_prompt'],
                    "config_path": config_path,
                    "enabled": False,
                }
                await save_settings(current_settings)

            elif msg_type == "set_user_input":
                user_input = data.get("data", {}).get("text", "")
                await ws_manager.broadcast({
                    "type": "update_user_input",
                    "data": {"text": user_input}
                })

            elif msg_type == "set_system_prompt":
                has_sent_prompt = True # Mark that this connection sent a prompt
                extension_system_prompt = data.get("data", {}).get("text", "")
                cur_settings = await load_settings()
                if cur_settings.get("systemSettings", {}).get("contentSafety", False):
                    is_safe, matched = await check_content_safety(extension_system_prompt)
                    if not is_safe:
                        print(f"[content_safety] ws set_system_prompt blocked words: {matched}")
                        await ws_manager.send_json({"type": "error", "message": "The system prompt was blocked by the content safety policy."}, websocket)
                        break
                await ws_manager.broadcast({
                    "type": "update_system_prompt",
                    "data": {
                        "id": connection_id,
                        "text": extension_system_prompt
                    }
                })

            elif msg_type == "remove_system_prompt":
                # Remove the system prompt previously injected by this connection
                has_sent_prompt = False
                await ws_manager.broadcast({
                    "type": "remove_system_prompt",
                    "data": {"id": connection_id}
                })

            elif msg_type == "set_tool_input":
                tool_input = data.get("data", {}).get("text", "")
                await ws_manager.broadcast({
                    "type": "update_tool_input",
                    "data": {"text": tool_input}
                })

            elif msg_type == "start_read":
                has_start_tts = True
                read_input = data.get("data", {}).get("text", "")
                await ws_manager.broadcast({
                    "type": "start_tts",
                    "data": {"text": read_input}
                })

            elif msg_type == "stop_read":
                await ws_manager.broadcast({
                    "type": "stop_tts",
                    "data": {}
                })

            elif msg_type == "register_node_extension_mcp":
                ext_id = data.get("data", {}).get("ext_id")
                tools = data.get("data", {}).get("tools", [])
                
                if ext_id and tools:
                    node_ext_mcp_tools[ext_id] = tools
                    registered_ext_ids.add(ext_id)  # Track extension registration
                    print(f"[MCP] Node extension {ext_id} registered {len(tools)} tools")
                    
                    # Notify all clients to refresh the tool list
                    await ws_manager.broadcast({
                        "type": "node_ext_mcp_registered",
                        "data": {
                            "ext_id": ext_id,
                            "tools": tools
                        }
                    })
                    
                    # Optionally return registration success
                    await websocket.send_json({
                        "type": "mcp_registered",
                        "data": {"ext_id": ext_id, "status": "success"}
                    })

            elif msg_type == "unregister_node_extension_mcp":
                ext_id = data.get("data", {}).get("ext_id")
                if ext_id in node_ext_mcp_tools:
                    del node_ext_mcp_tools[ext_id]
                    registered_ext_ids.discard(ext_id)  # Remove registration
                    print(f"[MCP] Node extension {ext_id} unregistered")
                    
                    await ws_manager.broadcast({
                        "type": "node_ext_mcp_unregistered",
                        "data": {"ext_id": ext_id}
                    })

            elif msg_type == "island_enable":
                result = dynamic_island_enable()
                print(f"[DynamicIsland] Frontend requested enable: {result}")
                await ws_manager.broadcast({
                    "type": "island_state",
                    "data": result
                })
                await ws_manager.broadcast({
                    "type": "node_ext_mcp_registered",
                    "data": {
                        "ext_id": "dynamic_island",
                        "tools": result.get("tools", [])
                    }
                })

            elif msg_type == "island_disable":
                result = dynamic_island_disable()
                print(f"[DynamicIsland] Frontend requested disable: {result}")
                await ws_manager.broadcast({
                    "type": "island_state",
                    "data": result
                })
                await ws_manager.broadcast({
                    "type": "node_ext_mcp_unregistered",
                    "data": {"ext_id": "dynamic_island"}
                })

            elif msg_type == "island_music_control":
                action = data.get("data", {}).get("action")
                if action == "play":
                    result = island_music_play()
                elif action == "pause":
                    result = island_music_pause()
                elif action == "next":
                    result = island_music_next()
                elif action == "prev":
                    result = island_music_prev()
                elif action == "volume":
                    level = data.get("data", {}).get("level", 50)
                    result = island_music_set_volume(int(level))
                else:
                    result = "Unknown operation"
                await ws_manager.send_json({
                    "type": "island_music_result",
                    "data": {"action": action, "result": result}
                }, websocket)

            elif msg_type == "island_track_set":
                track_info = data.get("data", {})
                await island_track_set(ws_manager, track_info)

            elif msg_type == "island_poll_music":
                from py.dynamic_island import poll_music_state
                state = await poll_music_state()
                await ws_manager.send_json({
                    "type": "island_music_state",
                    "data": state
                }, websocket)

            elif msg_type == "island_request_clipboard":
                try:
                    if platform.system() == 'Darwin':
                        text = subprocess.check_output(['pbpaste'], text=True)
                    elif platform.system() == 'Windows':
                        text = subprocess.check_output(['powershell', '-Command', 'Get-Clipboard'], text=True)
                    else:
                        text = subprocess.check_output(['xclip', '-selection', 'clipboard', '-o'], text=True)
                except:
                    text = ''
                await ws_manager.send_json({
                    "type": "island_clipboard_text",
                    "data": text.strip() if text else ''
                }, websocket)

            elif msg_type == "island_write_clipboard":
                text = data.get("data", {}).get("text", "")
                try:
                    p = subprocess.Popen(
                        ['pbcopy'] if platform.system() == 'Darwin' else (
                            ['powershell', '-Command', 'Set-Clipboard -Value $input'] if platform.system() == 'Windows' else ['xclip', '-selection', 'clipboard']
                        ),
                        stdin=subprocess.PIPE,
                        text=True
                    )
                    p.communicate(input=text)
                except:
                    pass
                await ws_manager.send_json({"type": "island_clipboard_write_result", "data": "ok"}, websocket)

            elif msg_type == "island_request_tasks":
                current_settings = await load_settings()
                workspace_dir = current_settings.get("CLISettings", {}).get("cc_path", "")
                tasks = []
                if workspace_dir:
                    from py.task_center import get_task_center
                    tc = await get_task_center(workspace_dir)
                    raw = await tc.list_tasks()
                    for t in raw:
                        tasks.append({
                            "task_id": t.task_id,
                            "title": t.title,
                            "description": t.description,
                            "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
                            "progress": t.progress,
                            "agent_type": t.agent_type,
                            "created_at": t.created_at,
                            "started_at": t.started_at,
                            "completed_at": t.completed_at
                        })
                await ws_manager.send_json({
                    "type": "island_task_list",
                    "data": tasks
                }, websocket)

            elif msg_type == "mcp_tool_result":
                call_id = data.get("data", {}).get("call_id")
                result = data.get("data", {}).get("result")
                
                if call_id in mcp_call_results:
                    mcp_call_results[call_id].set_result(result)

            elif msg_type == "trigger_close_extension":
                await ws_manager.broadcast({"type": "trigger_close_extension", "data": {}})

            elif msg_type == "trigger_send_message":
                await ws_manager.broadcast({"type": "trigger_send_message", "data": {}})
                    
            elif msg_type == "trigger_clear_message":
                await ws_manager.broadcast({"type": "trigger_clear_message", "data": {}})

            elif msg_type == "live_enqueue":
                """
                Requests pushed by extensions such as sap-snack-director must not trigger sendMessage directly.
                Instead, enqueue them in the main window for serial scheduling by processDanmuQueue.

                Why set_user_input plus trigger_send_message is insufficient:
                    - trigger_send_message calls sendMessage(), which invokes stopAllAudioPlayback() and clears TTSrunning,
                        interrupting currently playing speech.
                    - sendMessage() starts with if (this.isTyping) return;
                        so requests arriving during generation are silently dropped.
                Queueing resolves both issues: requests wait until the system is idle.

                data: { text: str (required), id?, source?, platform?, silent? }
                """
                await ws_manager.broadcast({
                    "type": "live_enqueue",
                    "data": data.get("data", {}) or {}
                }, exclude=websocket)

            elif msg_type == "get_messages":
                await ws_manager.broadcast({"type": "request_messages", "data": {}})

            elif msg_type == "broadcast_messages":
                messages_data = data.get("data", {})
                # Broadcast to every other client
                await ws_manager.broadcast({
                    "type": "messages_update",
                    "data": messages_data
                }, exclude=websocket)

    except Exception as e:
        print(f"WebSocket error for {connection_id}: {e}")
    finally:
        for ext_id in registered_ext_ids:
            if ext_id in node_ext_mcp_tools:
                del node_ext_mcp_tools[ext_id]
                print(f"[MCP] Connection closed; cleaned up extension {ext_id}")
                
                await ws_manager.broadcast({
                    "type": "node_ext_mcp_unregistered",
                    "data": {"ext_id": ext_id}
                })

        # 4. Disconnect and clean up
        ws_manager.disconnect(websocket)
        
        if has_sent_prompt:
            print(f"Extension {connection_id} disconnected. Removing prompt.")
            await ws_manager.broadcast({
                "type": "remove_system_prompt",
                "data": {"id": connection_id}
            })
            
        if has_start_tts:
            print(f"Extension {connection_id} disconnected. Stopping tts.")
            await ws_manager.broadcast({
                "type": "stop_tts",
                "data": {}
            })

@app.post("/sys/shutdown")
async def shutdown_server():
    """
    On receiving this request, send SIGTERM to the current process,
    triggering FastAPI lifespan shutdown and Node process cleanup.
    """
    if IS_DOCKER:
        return {"message": "Not allowed in Docker mode."}

    print("Received shutdown request via API...")
    # Get the current process ID and send termination signal
    # SIGTERM is supported on Windows, Linux and macOS
    os.kill(os.getpid(), signal.SIGTERM)
    return {"message": "Shutting down..."}

from py.acpx_tools import check_acpx_available
@app.get("/api/acpx/status")
async def acpx_status():
    """Return ACPX installation status and environment information."""
    return check_acpx_available()


@app.get("/api/system/data-path")
async def get_data_path():
    """Get the current data path."""
    return {
        "path": USER_DATA_DIR,
        "is_docker": IS_DOCKER
    }

class PathUpdateReq(BaseModel):
    path: str

@app.post("/api/system/set-path")
async def set_data_path(req: PathUpdateReq):
    """Change the data path."""
    success, msg = set_custom_user_data_dir(req.path)
    if success:
        return {"success": True, "new_path": msg}
    else:
        raise HTTPException(status_code=500, detail=msg)

@app.post("/api/system/reset-path")
async def reset_data_path():
    """Reset the data path."""
    success, msg = reset_user_data_dir()
    if success:
        return {"success": True, "path": msg}
    else:
        raise HTTPException(status_code=500, detail=msg)

from py.uv_api import router as uv_router
app.include_router(uv_router)

from py.node_api import router as node_router 
app.include_router(node_router)

from py.docker_api import router as docker_router 
app.include_router(docker_router)

from py.extensions import router as extensions_router

app.include_router(extensions_router)

from py.skills import router as skills_router

app.include_router(skills_router)

from py.sherpa_model_manager import router as sherpa_model_router
app.include_router(sherpa_model_router)

from py.moss_model_manager import router as moss_model_router
app.include_router(moss_model_router)

from py.ebd_model_manager import router as ebd_model_router
app.include_router(ebd_model_router)

from py.minilm_router import router as minilm_router
app.include_router(minilm_router)

from py.ebd_api import router as embedding_router
app.include_router(embedding_router)

from py.affection_api import router as affection_router
app.include_router(affection_router)

from py.diary_api import router as diary_router
app.include_router(diary_router)

mcp = FastApiMCP(
    app,
    name="Agent party MCP - chat with multiple agents",
    include_operations=["get_agents", "chat_with_agent_party"],
)

mcp.mount()

app.mount("/vrm", StaticFiles(directory=DEFAULT_VRM_DIR), name="vrm")
app.mount("/tha_models", StaticFiles(directory=DEFAULT_THA_DIR), name="tha_models")
app.mount("/default_soulx_images", StaticFiles(directory=DEFAULT_SOULX_IMAGES_DIR), name="default_soulx_images")
app.mount("/tool_temp", StaticFiles(directory=TOOL_TEMP_DIR), name="tool_temp")
app.mount("/uploaded_files", StaticFiles(directory=UPLOAD_FILES_DIR), name="uploaded_files")
app.mount("/ext", StaticFiles(directory=EXT_DIR), name="ext")
app.mount("/", StaticFiles(directory=os.path.join(base_path, "static"), html=True), name="static")

# Main entry point
app.add_middleware(SessionPermissions, token=DESKTOP_SESSION_TOKEN)

if __name__ == "__main__":
    import uvicorn

    # Format the displayed address
    display_host = "127.0.0.1" if HOST == "0.0.0.0" else HOST
    
    print("\n" + "="*50)
    print(f"Backend service started")
    print(f"Local address: http://{display_host}:{PORT}")
    print(f"API documentation: http://{display_host}:{PORT}/docs") # FastAPI documentation
    print("="*50 + "\n")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="warning"
    )
