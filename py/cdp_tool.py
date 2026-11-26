import json
import os
import time
import uuid
import requests
import asyncio
import websockets
from py.get_setting import UPLOAD_FILES_DIR, get_port, load_settings

# Global variables that preserve the current context
CURRENT_PAGE_INDEX = 0

async def get_cdp_port():
    settings = await load_settings()
    # Read the configured CDP port
    return settings.get('chromeMCPSettings', {}).get('CDPport', 3456) # Default main-process port

async def get_targets():
    """Get all CDP targets."""
    port = await get_cdp_port()
    try:
        resp = requests.get(f'http://127.0.0.1:{port}/json/list')
        return resp.json()
    except Exception as e:
        print(f"CDP Connection Error: {e}")
        return []

async def get_main_window_ws():
    """Get the WebSocket URL for the main window (Vue controller)."""
    targets = await get_targets()
    
    # Debug: print all targets to identify the open windows
    # print("Current CDP Targets:", json.dumps(targets, indent=2))
    
    for t in targets:
        url = t.get('url', '')
        title = t.get('title', '')
        target_type = t.get('type')

        # 1. Require the page type (exclude webview tabs, service_worker, etc.)
        if target_type != 'page':
            continue

        # 2. Exclude the VRM window
        # VRM window URLs usually contain 'vrm.html'
        if 'vrm.html' in url:
            continue
            
        # 3. Exclude the developer tools window if DevTools is open
        if 'devtools://' in url:
            continue
            
        # 4. Optionally exclude extension windows
        if 'ext' in url:
            continue

        # 5. Find the main window
        # The main window usually has one of these characteristics:
        # - URL contains 'skeleton.html' during initial loading
        # - URL is 'http://127.0.0.1:port/' once loading is complete
        # - A remaining page target is normally the main window
        return t.get('webSocketDebuggerUrl')
        
    print("Error: Could not find Main Window in CDP targets.")
    return None

async def get_webview_ws(index=None):
    """Get the WebSocket URL for a specific web page."""
    targets = await get_targets()
    # Filter for webviews (actual browser tabs)
    webviews = [t for t in targets if t['type'] == 'webview']
    
    target_idx = index if index is not None else CURRENT_PAGE_INDEX
    
    if 0 <= target_idx < len(webviews):
        return webviews[target_idx].get('webSocketDebuggerUrl')
    return None

async def cdp_command(ws_url, method, params=None):
    """Send a CDP command."""
    if not ws_url:
        return {"error": "Target not found"}
    
    # Include the max_size parameter
    # None means unlimited; alternatively set 10 * 1024 * 1024 (10 MB)
    async with websockets.connect(ws_url, max_size=10 * 1024 * 1024) as ws:
        cmd_id = 1
        message = {
            "id": cmd_id,
            "method": method,
            "params": params or {}
        }
        await ws.send(json.dumps(message))
        
        while True:
            response = await ws.recv()
            data = json.loads(response)
            if data.get('id') == cmd_id:
                return data.get('result', {})

# ==========================================
# Input Automation (Via Vue Controller)
# ==========================================

async def call_vue_method(method_name, args_list=None):
    """
    Call a window.aiBrowser method with retries.
    """
    max_retries = 3
    retry_delay = 1.0 # Wait one second

    ws_url = await get_main_window_ws()
    if not ws_url:
        return {"error": "Main window not found"}

    # Construct the argument string
    if args_list:
        json_args = [json.dumps(arg) for arg in args_list]
        args_str = ", ".join(json_args)
    else:
        args_str = ""
    
    expression = f"window.aiBrowser.{method_name}({args_str})"

    for attempt in range(max_retries):
        # Reconnect the WebSocket on each retry to handle connection loss
        try:
            # Check that window.aiBrowser is initialized
            if attempt == 0:
                check_res = await cdp_command(ws_url, "Runtime.evaluate", {
                    "expression": "typeof window.aiBrowser !== 'undefined'",
                    "returnByValue": True
                })
                check_value = check_res.get('result', {}).get('value', False)
                if not check_value:
                    print(f"[Warn] window.aiBrowser not ready, retrying {method_name}...")
                    raise ValueError("aiBrowser not initialized")

            res = await cdp_command(ws_url, "Runtime.evaluate", {
                "expression": expression,
                "returnByValue": True, 
                "awaitPromise": True
            })
            
            # 1. Check for CDP protocol errors
            if 'exceptionDetails' in res:
                exc = res['exceptionDetails']
                msg = exc.get('text', 'Unknown Error')
                if 'exception' in exc and 'description' in exc['exception']:
                    msg = f"{msg}: {exc['exception']['description']}"
                
                # Retryable errors: Illegal invocation, GUEST_VIEW_MANAGER_CALL, aiBrowser not ready
                retryable = any(kw in msg for kw in [
                    "Illegal invocation",
                    "GUEST_VIEW_MANAGER_CALL",
                    "Cannot read properties of undefined",
                    "aiBrowser is not defined",
                    "aiBrowser is undefined"
                ])
                if retryable:
                    print(f"[Warn] Retrying {method_name} due to error: {msg}")
                    raise ValueError("Retryable Error")
                
                return f"Error executing {method_name}: {msg}"

            # 2. Check for error messages returned by the JavaScript try-catch (e.g. "Fill Error: ...")
            remote_object = res.get('result', {})
            value = remote_object.get('value', "")
            
            # Treat a returned string containing a retryable error as a failure
            retryable = any(kw in str(value) for kw in [
                "Illegal invocation",
                "GUEST_VIEW_MANAGER_CALL",
                "Cannot read properties of undefined",
                "aiBrowser is not defined",
                "aiBrowser is undefined"
            ])
            if isinstance(value, str) and retryable:
                print(f"[Warn] Retrying {method_name} due to JS Result error: {value}")
                raise ValueError("Retryable Error")

            if 'value' in remote_object:
                return remote_object['value']
            
            if remote_object.get('type') == 'undefined':
                return "Success"
                
            return f"Operation completed (Type: {remote_object.get('type')})"

        except Exception as e:
            # Give up after the last attempt
            if attempt == max_retries - 1:
                return f"Failed {method_name} after {max_retries} retries. Last error: {str(e)}"
            
            # Wait before retrying
            await asyncio.sleep(retry_delay)
            # Refresh the main-window WebSocket URL in case it changed
            ws_url = await get_main_window_ws() or ws_url

# ------------------------------------------
# Interaction Tools (Complete List)
# ------------------------------------------

async def take_snapshot(filePath=None, verbose=False):
    """
    Get a DOM tree snapshot of interactive elements on the page.
    """
    # Call the Vue method to generate the snapshot string
    result = await call_vue_method('getWebviewSnapshot', [verbose])
    
    # Save to a file if filePath is specified
    if filePath and result and isinstance(result, str):
        try:
            with open(filePath, 'w', encoding='utf-8') as f:
                f.write(result)
            return f"Snapshot saved to {filePath}"
        except Exception as e:
            return f"Error saving snapshot: {str(e)}"
            
    # Otherwise return the snapshot directly
    return result

async def click(uid, dblClick=False):
    """Click an element."""
    return await call_vue_method('webviewClick', [uid, dblClick])

async def fill(uid, value):
    """Fill an input field."""
    return await call_vue_method('webviewFill', [uid, value])

async def fill_form(elements):
    """
    Fill multiple form fields.
    elements: [{'uid': '...', 'value': '...'}, ...]
    """
    return await call_vue_method('webviewFillForm', [elements])

async def drag(from_uid, to_uid):
    """Drag an element."""
    return await call_vue_method('webviewDrag', [from_uid, to_uid])

async def handle_dialog(action, promptText=None):
    """Handle a dialog (alert/confirm/prompt)."""
    return await call_vue_method('webviewHandleDialog', [action, promptText])

async def hover(uid):
    """Hover over an element."""
    return await call_vue_method('webviewHover', [uid])

async def press_key(key,uid):
    """Press a key."""
    return await call_vue_method('webviewPressKey', [key, uid])

# ------------------------------------------
# Navigation Tools
# ------------------------------------------

async def list_pages():
    """List all tabs."""
    return await call_vue_method('getPagesInfo')

async def new_page(url, timeout=0):
    """Open a new tab."""
    return await call_vue_method('openUrlInNewTab', [url])

async def close_page(pageIdx):
    """Close a tab."""
    return await call_vue_method('closeTabByIndex', [pageIdx])

async def select_page(pageIdx, bringToFront=True):
    """Select or switch tabs."""
    return await call_vue_method('switchTabByIndex', [pageIdx])

async def navigate_page(type="url", url=None, ignoreCache=False, timeout=0):
    """Navigate the page."""
    return await call_vue_method('browserNavigate', [type, url, ignoreCache])

async def wait_for(text, timeout=1000):
    """Wait for text to appear."""
    return await call_vue_method('webviewWaitFor', [text, timeout])

# ------------------------------------------
# Debugging Tools
# ------------------------------------------

async def evaluate_script(script_code, args=None):
    """Execute JavaScript with input recovery."""
    
    # 1. Trim whitespace and Markdown code fences from AI-generated JavaScript
    clean_code = script_code.strip().strip('`')
    if clean_code.startswith('javascript'):
        clean_code = clean_code[10:].strip()

    # 2. Handle a bare function body (e.g. a return statement without a function)
    if not clean_code.startswith("function") and not clean_code.startswith("() =>") and not clean_code.startswith("async function"):
        print(f"[Agent Warning] AI forgot to wrap function, auto-wrapping it...")
        # Wrap it in a standard function
        clean_code = f"function() {{\n{clean_code}\n}}"
        
    # 3. Navigation guard: prevent context loss and WebSocket disconnection during page navigation
    if "submit()" in clean_code or "location" in clean_code:
        safe_code = f"""
        function() {{
            setTimeout(function() {{
                ({clean_code})();
            }}, 100);
            return 'Command scheduled (Async execution for navigation safety)';
        }}
        """
        return await call_vue_method('executeInActiveWebview', [safe_code, args or []])
    
    # 4. Execute normally
    return await call_vue_method('executeInActiveWebview', [clean_code, args or []])

async def take_screenshot(fullPage=False, uid=None):
    """
    Take a screenshot.
    The Vue frontend saves the image to uploaded_files and returns its URL.
    """
    # Call directly to obtain the URL (e.g. http://127.0.0.1:3456/uploaded_files/xxx.jpg)
    result = await call_vue_method('captureWebviewScreenshot', [fullPage, uid])
    
    # Basic error check
    if not result or result.startswith("Error") or result.startswith("Screenshot Error"):
        return f"Failed to capture screenshot: {result}"
        
    return f"[Getting browser screenshot] {result}"

# ==========================================
# Tool Definitions (JSON Schemas)
# ==========================================

all_cdp_tools = [
    # --- Navigation ---
    {
        "type": "function",
        "function": {
            "name": "list_pages",
            "description": "Get a list of pages open in the browser.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "new_page",
            "description": "Creates a new page in the browser tab bar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL to load"},
                    "timeout": {"type": "integer"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "close_page",
            "description": "Closes the page by its index.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pageIdx": {"type": "integer", "description": "Index of the page to close"}
                },
                "required": ["pageIdx"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "select_page",
            "description": "Switch tab to the specified page index.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pageIdx": {"type": "integer"},
                    "bringToFront": {"type": "boolean"}
                },
                "required": ["pageIdx"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "navigate_page",
            "description": "Navigates the currently selected page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["url", "back", "forward", "reload"]},
                    "url": {"type": "string"},
                    "ignoreCache": {"type": "boolean"}
                },
                "required": ["type"]
            }
        }
    },
    
    # --- Debugging & Input ---
    {
        "type": "function",
        "function": {
            "name": "take_snapshot",
            "description": "Get the accessibility tree of the current page to find UIDs for interaction.",
            "parameters": {
                "type": "object",
                "properties": {
                    "verbose": {"type": "boolean"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "click",
            "description": "Clicks an element identified by UID from take_snapshot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "uid": {"type": "string", "description": "The BackendNodeId from snapshot"},
                    "dblClick": {"type": "boolean"}
                },
                "required": ["uid"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fill",
            "description": "Type text into an input element.",
            "parameters": {
                "type": "object",
                "properties": {
                    "uid": {"type": "string"},
                    "value": {"type": "string"}
                },
                "required": ["uid", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_script",
            "description": "Run JS in the current page. You MUST wrap your code in a valid Javascript function expression.\n\nGOOD Example:\n`function() { return document.title; }`\n\nBAD Example (DO NOT DO THIS):\n`return document.title;`",
            "parameters": {
                "type": "object",
                "properties": {
                    "script_code": {
                        "type": "string", 
                        "description": "The complete JS function expression to execute."
                    },
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Arguments to pass into the function."
                    }
                },
                "required": ["script_code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "hover",
            "description": "Hover over an element identified by UID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "uid": {"type": "string", "description": "The BackendNodeId from snapshot"}
                },
                "required": ["uid"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "press_key",
            "description": "Press a key or key combination (e.g. 'Enter', 'Control+a', 'ArrowDown').",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "The key combination to press."},
                    "uid": {"type": "string", "description": "The BackendNodeId from snapshot"}
                },
                "required": ["key","uid"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "wait_for",
            "description": "Wait for specific text to appear on the page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The text to wait for."},
                    "timeout": {"type": "integer", "description": "Timeout in milliseconds (default 1000).","minimum": 100,"default": 1000,"maximum": 10000}
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": "Take a screenshot of the current page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "fullPage": {"type": "boolean", "description": "If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid."},
                    "uid": {"type": "string", "description": "The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot."}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fill_form",
            "description": "Fill multiple form fields at once efficiently.",
            "parameters": {
                "type": "object",
                "properties": {
                    "elements": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "uid": {"type": "string", "description": "The UID of the input element."},
                                "value": {"type": "string", "description": "The value to fill."}
                            },
                            "required": ["uid", "value"]
                        },
                        "description": "List of elements to fill, e.g., [{'uid': 'ai-1', 'value': 'john'}, ...]"
                    }
                },
                "required": ["elements"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "drag",
            "description": "Drag an element from one position to another using UIDs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_uid": {"type": "string", "description": "The UID of the element to drag."},
                    "to_uid": {"type": "string", "description": "The UID of the target element to drop onto."}
                },
                "required": ["from_uid", "to_uid"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "handle_dialog",
            "description": "Handle JavaScript dialogs (alert, confirm, prompt).",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["accept", "dismiss"], "description": "Whether to accept or dismiss the dialog."},
                    "promptText": {"type": "string", "description": "Text to enter if the dialog is a prompt."}
                },
        "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "click_by_text",
            "description": "Search for an interactive element by keyword (matches aria-label, innerText, title) and click it. Much more reliable than coordinate-based or UID-based clicks for React/Vue apps where buttons may not be standard <button> tags.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Keyword to search (e.g. 'Play', 'Search', 'Submit')"}
                },
                "required": ["text"]
            }
        }
    },
]

async def click_by_text(text):
    script = f"""
    function() {{
        const q = {json.dumps(text)};
        const sel = 'a, button, [role="button"], [role="tab"], [role="menuitem"], li, div, span, [aria-label]';
        const els = document.querySelectorAll(sel);
        let best = null, bestScore = 0;
        for (const el of els) {{
            if (el.offsetWidth === 0) continue;
            let score = 0;
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const tit = (el.getAttribute('title') || '').toLowerCase();
            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (aria === q) score = 100;
            else if (aria.includes(q)) score = 80;
            else if (txt === q) score = 60;
            else if (txt.includes(q)) score = 40;
            else if (tit === q) score = 30;
            else if (tit.includes(q)) score = 20;
            if (score > bestScore) {{ best = el; bestScore = score; }}
        }}
        if (!best) return JSON.stringify({{error: 'Element not found: "' + q + '"'}});
        const ariaLabel = best.getAttribute('aria-label') || '';
        best.scrollIntoView({{behavior:'instant', block:'center'}});
        best.focus();
        best.click();
        return JSON.stringify({{tag: best.tagName, text: (best.innerText||'').slice(0,40), ariaLabel: ariaLabel.slice(0,60), score: bestScore}});
    }}
    """
    return await evaluate_script(script)