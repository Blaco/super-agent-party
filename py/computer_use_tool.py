import asyncio
import time
import platform
import json
import os
from typing import List, Optional, Tuple
from functools import wraps

# ================== Lazy imports for GUI libraries ==================
_pag = None
_pp = None
GUI_AVAILABLE = False

def _lazy_pag():
    global _pag, GUI_AVAILABLE
    if _pag is not None:
        return _pag
    import pyautogui
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05
    _pag = pyautogui
    GUI_AVAILABLE = True
    return _pag

def _lazy_pp():
    global _pp
    if _pp is not None:
        return _pp
    import pyperclip
    _pp = pyperclip
    return _pp

def _check_gui():
    if GUI_AVAILABLE:
        return True
    if _pag is not None:
        return True
    try:
        _lazy_pag()
        _lazy_pp()
        return True
    except (KeyError, ImportError, Exception) as e:
        print(f"⚠️ [Warning] Desktop mouse and keyboard tools are unavailable (missing DISPLAY or GUI initialization failed): {e}")
        return False

def require_gui(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        if not _check_gui():
            return "Operation failed: desktop input is unavailable in this environment (for example, a headless Docker container)."
        return await func(*args, **kwargs)
    return wrapper
# ==============================================================


CURRENT_SCREEN_REGION = None

def set_screen_region(region: Optional[Tuple[int, int, int, int]]):
    """Set the active screen mapping region."""
    global CURRENT_SCREEN_REGION
    CURRENT_SCREEN_REGION = region

def _percent_to_pixel(x_percent: float, y_percent: float) -> Tuple[int, int]:
    """Convert normalized coordinates (0 to 1000) to pixels in the current screen or region."""
    x_percent = max(0, min(1000, float(x_percent)))
    y_percent = max(0, min(1000, float(y_percent)))
    
    # Map coordinates within the specified screen region
    if CURRENT_SCREEN_REGION is not None:
        rx, ry, rw, rh = CURRENT_SCREEN_REGION
        px = rx + int(rw * (x_percent / 1000))
        py = ry + int(rh * (y_percent / 1000))
        
        # Keep coordinates within the region bounds
        px = min(px, rx + rw - 1)
        py = min(py, ry + rh - 1)
        return px, py
        
    # Otherwise map to the full screen
    width, height = _lazy_pag().size()
    px = min(int(width * (x_percent / 1000)), width - 1)
    py = min(int(height * (y_percent / 1000)), height - 1)
    
    return px, py


@require_gui
async def mouse_move(x: float, y: float, duration: float = 0.5) -> str:
    """Move the mouse to normalized screen coordinates."""
    if x < 0 or x > 1000 or y < 0 or y > 1000:
        return "Coordinates are out of range; enter values from 0 to 1000."
    
    px, py = _percent_to_pixel(x, y)
    
    def _move():
        _lazy_pag().moveTo(px, py, duration=duration, tween=_lazy_pag().easeInOutQuad)
        time.sleep(0.02)
    
    await asyncio.to_thread(_move)
    return f"Mouse moved to ({x}‰, {y}‰). [LAST_ACTION: MOVE({x},{y})]"


@require_gui
async def mouse_click(button: str = "left", clicks: int = 1, x: Optional[float] = None, y: Optional[float] = None) -> str:
    """Click the mouse, optionally at normalized coordinates."""
    if x is not None and y is not None:
        if x < 0 or x > 1000 or y < 0 or y > 1000:    
            return "Coordinates are out of range; enter values from 0 to 1000."
        
        def _click_at():
            px, py = _percent_to_pixel(x, y)
            _lazy_pag().moveTo(px, py, duration=0.2)
            time.sleep(0.2) 
            _lazy_pag().click(x=px, y=py, clicks=clicks, button=button, interval=0.1)
            
        await asyncio.to_thread(_click_at)
        # Select the tag according to the number of clicks
        tag = f"CLICK({x},{y})" if clicks == 1 else f"DOUBLE_CLICK({x},{y})"
        return f"Mouse moved to ({x}‰, {y}‰) and clicked {clicks} time(s) with the {button} button. [LAST_ACTION: {tag}]"
    else:
        # Without coordinates, the click cannot be marked accurately on the screenshot
        await asyncio.to_thread(_lazy_pag().click, clicks=clicks, button=button, interval=0.1)
        return f"Clicked {clicks} time(s) with the {button} button at the current position. [LAST_ACTION: CLICK_CURRENT]"


@require_gui
async def mouse_double_click(button: str = "left", x: Optional[float] = None, y: Optional[float] = None) -> str:
    """Double-click the mouse."""
    if x is not None and y is not None:
        if x < 0 or x > 1000 or y < 0 or y > 1000:    
            return "Coordinates are out of range; enter values from 0 to 1000."
        
        def _double_click():
            px, py = _percent_to_pixel(x, y)
            _lazy_pag().moveTo(px, py, duration=0.2)
            time.sleep(0.2)
            _lazy_pag().click(x=px, y=py, clicks=2, button=button, interval=0.1)
            
        await asyncio.to_thread(_double_click)
        return f"Mouse moved to ({x}‰, {y}‰) and double-clicked with the {button} button. [LAST_ACTION: DOUBLE_CLICK({x},{y})]"
    else:
        await asyncio.to_thread(_lazy_pag().click, clicks=2, button=button, interval=0.1)
        return f"Double-clicked with the {button} button at the current position. [LAST_ACTION: CLICK_CURRENT]"


@require_gui
async def mouse_drag(x1: float, y1: float, x2: float, y2: float, duration: float = 1.0, button: str = "left") -> str:
    """Drag from (x1, y1) to (x2, y2)."""
    try:
        coords = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
        for name, val in coords.items():
            if val < 0 or val > 1000:
                return f"Error: {name} coordinate ({val}) is out of range; enter values from 0 to 1000."
        
        px1, py1 = _percent_to_pixel(x1, y1)
        px2, py2 = _percent_to_pixel(x2, y2)
        
        def _drag():
            _lazy_pag().moveTo(px1, py1, duration=0.2)
            time.sleep(0.2) 
            _lazy_pag().dragTo(x=px2, y=py2, duration=duration, button=button, tween=_lazy_pag().easeInOutQuad)
            time.sleep(0.1)
            
        await asyncio.to_thread(_drag)
        return f"Dragged from ({x1}‰, {y1}‰) to ({x2}‰, {y2}‰). [LAST_ACTION: DRAG({x1},{y1},{x2},{y2})]"
    except Exception as e:
        return f"Drag failed: {e}"


@require_gui
async def mouse_scroll(clicks: int) -> str:
    """Scroll the mouse wheel."""
    def _scroll():
        chunk_size = 10 if abs(clicks) > 10 else abs(clicks)
        direction = 1 if clicks > 0 else -1
        remaining = abs(clicks)
        
        while remaining > 0:
            current_chunk = min(chunk_size, remaining)
            _lazy_pag().scroll(current_chunk * direction)
            remaining -= current_chunk
            if remaining > 0:
                time.sleep(0.01)
    
    await asyncio.to_thread(_scroll)
    direction = "up" if clicks > 0 else "down"
    # Scrolling has no point marker; return the status only
    return f"Mouse wheel scrolled {direction} by {abs(clicks)} units. [LAST_ACTION: SCROLL]"


@require_gui
async def mouse_hold(button: str, duration: float) -> str:
    """Hold a mouse button."""
    if duration > 30: duration = 30
    
    def _hold_logic():
        try:
            _lazy_pag().mouseDown(button=button)
            time.sleep(duration)
        finally:
            _lazy_pag().mouseUp(button=button)
    
    await asyncio.to_thread(_hold_logic)
    return f"Held the {button} mouse button for {duration} seconds. [LAST_ACTION: HOLD]"



@require_gui
async def copy_to_input_box(text: str) -> str:
    """Paste text, avoiding the occasional issue where only 'v' is typed."""
    def _type_text():
        old_clipboard = ""
        try:
            old_clipboard = _lazy_pp().paste()
        except Exception:
            pass
        
        sys_os = platform.system()
        
        try:
            _lazy_pp().copy("")
            _lazy_pp().copy(text)
            wait_time = 0.2 if sys_os == "Windows" else 0.15
            time.sleep(wait_time)
            
            for i in range(3):
                if _lazy_pp().paste() == text: break
                time.sleep(0.1)
                _lazy_pp().copy(text)
            
            modifier = 'command' if sys_os == "Darwin" else 'ctrl'
            
            # Explicitly press the modifier and wait for the operating system to register Ctrl/Cmd.
            _lazy_pag().keyDown(modifier)
            time.sleep(0.05)  # Allow 50 ms for the system input queue
            _lazy_pag().press('v')
            time.sleep(0.05)  # Brief wait before releasing the modifier
            _lazy_pag().keyUp(modifier)
            
            time.sleep(0.15)
        finally:
            time.sleep(0.05)
            for _ in range(2):
                try:
                    if old_clipboard: _lazy_pp().copy(old_clipboard)
                    break
                except Exception:
                    time.sleep(0.05)

    await asyncio.to_thread(_type_text)
    return f"Pasted text into the focused input: '{text}'"

@require_gui
async def keyboard_press(key: str, presses: int = 1) -> str:
    """Press a single key repeatedly."""
    def _press_logic():
        _lazy_pag().press(key, presses=presses, interval=0.05)
    
    await asyncio.to_thread(_press_logic)
    return f"Pressed '{key}' {presses} time(s)."


@require_gui
async def keyboard_sequence(keys: List[str]) -> str:
    """Press several keys in sequence with a 0.5-second interval."""
    if not keys:
        return "Error: no key list supplied."

    def _sequence_logic():
        for i, key in enumerate(keys):
            _lazy_pag().press(key)
            # Wait 0.5 seconds unless this is the last key
            if i < len(keys) - 1:
                time.sleep(0.5)

    await asyncio.to_thread(_sequence_logic)
    return f"Pressed keys in sequence: {', '.join(keys)}, with a 0.5-second interval."

@require_gui
async def keyboard_hotkey(keys: List[str]) -> str:
    """Press a keyboard shortcut."""
    if not keys: return "Error: no key combination supplied"
    
    def _hotkey():
        if len(keys) == 1:
            _lazy_pag().press(keys[0])
        else:
            modifier = keys[0]
            rest_keys = keys[1:]
            with _lazy_pag().hold(modifier):
                for k in rest_keys:
                    _lazy_pag().press(k)
                    time.sleep(0.02)
    
    await asyncio.to_thread(_hotkey)
    return f"Pressed shortcut: {' + '.join(keys)}."


@require_gui
async def keyboard_hold(keys: List[str], duration: float) -> str:
    """Hold keyboard keys."""
    if duration > 30: duration = 30
    
    def _hold_logic():
        start_time = time.time()
        try:
            for key in keys:
                _lazy_pag().keyDown(key)
                time.sleep(0.02)
            
            elapsed = 0
            while elapsed < duration:
                sleep_time = min(0.1, duration - elapsed)
                time.sleep(sleep_time)
                elapsed = time.time() - start_time
        except Exception as e:
            print(f"Error while holding keys: {e}")
        finally:
            for key in reversed(keys):
                try:
                    _lazy_pag().keyUp(key)
                    time.sleep(0.02)
                except Exception:
                    pass

    await asyncio.to_thread(_hold_logic)
    return f"Held key combination {keys} for {duration} seconds."


@require_gui
async def logical_click(id: int) -> str:
    """Invoke a UI tree node through the platform accessibility API."""
    # Import the UI tree cache lookup dynamically
    from py.ui_tree_helper import get_cached_element
    
    cached = get_cached_element(id)
    if not cached:
        return f"Error: no valid UI element found for ID {id}. The interface may have changed; obtain a fresh screenshot and try again."
        
    system, handle = cached
    
    try:
        if system == "Windows":
            def _win_click():
                # First try the standard Invoke action used by most buttons
                try:
                    pattern = handle.GetInvokePattern()
                    if pattern:
                        pattern.Invoke()
                        return True
                except Exception:
                    pass
                
                # Then try Toggle for checkboxes or radio buttons
                try:
                    pattern = handle.GetTogglePattern()
                    if pattern:
                        pattern.Toggle()
                        return True
                except Exception:
                    pass
                
                # Then try SelectionItem for list items or tabs
                try:
                    pattern = handle.GetSelectionItemPattern()
                    if pattern:
                        pattern.Select()
                        return True
                except Exception:
                    pass
                
                # Finally try an accessibility click without moving the physical mouse
                try:
                    handle.Click(simulateMove=True)
                    return True
                except Exception:
                    pass
                
                raise Exception("This Windows UIA node does not support any recognized accessibility click action.")
                
            await asyncio.to_thread(_win_click)
            return f"Invoked UI node {id} through Windows UIA. [LAST_ACTION: LOGICAL_CLICK({id})]"
            
        elif system == "Darwin":
            import ApplicationServices as AX
            
            def _mac_click():
                # First try AXPress (standard macOS button action)
                err = AX.AXUIElementPerformAction(handle, "AXPress")
                if err == 0:
                    return True
                
                # Then try AXPick (menu item selection)
                err = AX.AXUIElementPerformAction(handle, "AXPick")
                if err == 0:
                    return True
                
                # Then try AXShowMenu (context or drop-down menu)
                err = AX.AXUIElementPerformAction(handle, "AXShowMenu")
                if err == 0:
                    return True
                
                raise Exception(f"AXUIElementPerformAction returned accessibility error code: {err}")
                
            await asyncio.to_thread(_mac_click)
            return f"Invoked UI node {id} through macOS AXPress. [LAST_ACTION: LOGICAL_CLICK({id})]"
            
        elif system == "Linux":
            import pyatspi
            
            def _linux_click():
                action = handle.queryAction()
                if action and action.nActions > 0:
                    # Invoke the first associated action (normally click or activate)
                    action.doAction(0)
                    return True
                raise Exception("This Linux AT-SPI node does not provide an action interface.")
                
            await asyncio.to_thread(_linux_click)
            return f"Invoked UI node {id} through Linux AT-SPI. [LAST_ACTION: LOGICAL_CLICK({id})]"
            
        else:
            return f"Unknown operating system: {system}."
            
    except Exception as e:
        # If the accessibility API fails, suggest the existing physical mouse fallback
        return f"Logical click on ID {id} failed: {str(e)}. If appropriate, use mouse_click with the node's center coordinates."


@require_gui
async def logical_type(id: int, text: str) -> str:
    """Enter text through a UI accessibility node without physical mouse movement or clipboard use."""
    from py.ui_tree_helper import get_cached_element
    cached = get_cached_element(id)
    if not cached:
        return f"Error: no valid input field found for ID {id}. The interface may have changed; obtain a fresh screenshot."
        
    system, handle = cached
    try:
        if system == "Windows":
            def _win_type():
                # First try UIA ValuePattern (standard input-field assignment)
                try:
                    pattern = handle.GetValuePattern()
                    if pattern:
                        pattern.SetValue(text)
                        return True
                except Exception:
                    pass
                # Then try LegacyIAccessiblePattern assignment
                try:
                    pattern = handle.GetLegacyIAccessiblePattern()
                    if pattern:
                        pattern.SetValue(text)
                        return True
                except Exception:
                    pass
                raise Exception("This element does not support the Windows UIA Value pattern.")
                
            await asyncio.to_thread(_win_type)
            return f"Entered text into field {id} through Windows UIA: '{text}'"
            
        elif system == "Darwin":
            import ApplicationServices as AX
            
            def _mac_type():
                # Set AXValue directly through the macOS accessibility API
                err = AX.AXUIElementSetAttributeValue(handle, "AXValue", text)
                if err == 0:
                    return True
                raise Exception(f"macOS AXValue assignment failed, accessibility error code: {err}")
                
            await asyncio.to_thread(_mac_type)
            return f"Entered text into field {id} through macOS AXValue: '{text}'"
            
        else:
            return f"Logical text entry is not supported on this platform."
    except Exception as e:
        # If logical input fails, suggest the existing physical click and paste method
        return f"Logical text entry failed: {str(e)}. If appropriate, click the intended field and use copy_to_input_box to paste text."

# wait does not require a GUI; do not add @require_gui
async def wait(seconds: float) -> str:
    """Wait for a page or application to load."""
    seconds = min(max(0, seconds), 60)
    await asyncio.sleep(seconds)
    return f"Waited {seconds} seconds."

async def screenshot() -> str:
    """Capture a screenshot."""
    await asyncio.sleep(0.3)
    return "[Getting screenshot]"

# ================= Corresponding OpenAI tool schemas =================

mouse_move_tool = {
    "type": "function",
    "function": {
        "name": "mouse_move",
        "description": "Move the mouse to a screen position using normalized coordinates (0 to 1000). (0,0) is the top left, (1000,1000) the bottom right, and (500,500) the center.",
        "parameters": {
            "type": "object",
            "properties": {
                "x": {"type": "number", "description": "Target horizontal coordinate, 0 to 1000; 500 is the horizontal center.","maximum": 1000, "minimum": 0},
                "y": {"type": "number", "description": "Target vertical coordinate, 0 to 1000; 500 is the vertical center.","maximum": 1000, "minimum": 0},
                "duration": {"type": "number", "description": "Movement duration in seconds, default 0.5. A nonzero duration gives smoother movement.", "default": 0.5}
            },
            "required": ["x", "y"]
        }
    }
}

mouse_click_tool = {
    "type": "function",
    "function": {
        "name": "mouse_click",
        "description": "Click the mouse. If normalized coordinates are supplied, move there first; otherwise click at the current position.",
        "parameters": {
            "type": "object",
            "properties": {
                "button": {"type": "string", "enum": ["left", "right", "middle"], "description": "Mouse button to click."},
                "clicks": {"type": "integer", "description": "Number of clicks: 1 for single-click, 2 for double-click. Use the appropriate action for the target control or file.", "default": 1},
                "x": {"type": "number", "description": "Optional target horizontal coordinate before clicking (0 to 1000).","maximum": 1000, "minimum": 0},
                "y": {"type": "number", "description": "Optional target vertical coordinate before clicking (0 to 1000).","maximum": 1000, "minimum": 0}
            },
            "required": ["button"]
        }
    }
}

mouse_double_click_tool = {
    "type": "function",
    "function": {
        "name": "mouse_double_click",
        "description": "Double-click the mouse, for example to open a file or application. If normalized coordinates are supplied, move there first; otherwise double-click at the current position.",
        "parameters": {
            "type": "object",
            "properties": {
                "button": {"type": "string", "enum": ["left", "right", "middle"], "description": "Mouse button to click."},
                "x": {"type": "number", "description": "Optional target horizontal coordinate before clicking (0 to 1000).","maximum": 1000, "minimum": 0},
                "y": {"type": "number", "description": "Optional target vertical coordinate before clicking (0 to 1000).","maximum": 1000, "minimum": 0}
            },
            "required": ["button"]
        }
    }
}

mouse_drag_tool = {
    "type": "function",
    "function": {
        "name": "mouse_drag",
        "description": "Hold a mouse button and drag from the start to the end coordinates, for example to move a window, adjust a slider, move a file or select an area.",
        "parameters": {
            "type": "object",
            "properties": {
                "x1": {"type": "number", "description": "Start horizontal coordinate (0-1000)","maximum": 1000, "minimum": 0},
                "y1": {"type": "number", "description": "Start vertical coordinate (0-1000)","maximum": 1000, "minimum": 0},
                "x2": {"type": "number", "description": "End horizontal coordinate (0-1000)","maximum": 1000, "minimum": 0},
                "y2": {"type": "number", "description": "End vertical coordinate (0-1000)","maximum": 1000, "minimum": 0},
                "duration": {"type": "number", "description": "Drag duration in seconds, default 1.0.", "default": 1.0},
                "button": {"type": "string", "enum": ["left", "right"], "description": "Mouse button held while dragging, default left.", "default": "left"}
            },
            "required": ["x1", "y1", "x2", "y2"]
        }
    }
}

mouse_hold_tool = {
    "type": "function",
    "function": {
        "name": "mouse_hold",
        "description": "Hold a mouse button for a specified duration, for example for a long-press menu.",
        "parameters": {
            "type": "object",
            "properties": {
                "button": {
                    "type": "string", 
                    "enum": ["left", "right", "middle"],
                    "description": "Mouse button to hold."
                },
                "duration": {
                    "type": "number", 
                    "description": "Hold duration in seconds."
                }
            },
            "required": ["button", "duration"]
        }
    }
}


mouse_scroll_tool = {
    "type": "function",
    "function": {
        "name": "mouse_scroll",
        "description": "Scroll the mouse wheel to browse a page or document. Positive values scroll up and negative values scroll down.",
        "parameters": {
            "type": "object",
            "properties": {
                "clicks": {"type": "integer", "description": "Scroll units; positive for up, negative for down. For example, 500 or -500. Adjust the amount to the page."}
            },
            "required": ["clicks"]
        }
    }
}

keyboard_type_tool = {
    "type": "function",
    "function": {
        "name": "copy_to_input_box",
        "description": "Paste text into the focused input field. Supports Unicode text. Ensure the intended field has focus before calling. This uses clipboard paste, not individual key presses.",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to enter."}
            },
            "required": ["text"]
        }
    }
}

keyboard_press_tool = {
    "type": "function",
    "function": {
        "name": "keyboard_press",
        "description": "Press a single key, optionally multiple times, for example to delete characters or move down.",
        "parameters": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string", 
                    "description": "Key name, e.g. 'enter', 'backspace', 'tab', 'down', 'esc'."
                },
                "presses": {
                    "type": "integer", 
                    "description": "Number of key presses, default 1.", 
                    "default": 1
                }
            },
            "required": ["key"]
        }
    }
}

keyboard_sequence_tool = {
    "type": "function",
    "function": {
        "name": "keyboard_sequence",
        "description": "Press keys in sequence, automatically pausing 0.5 seconds between keys. For example, press Tab to change focus and Enter to confirm.",
        "parameters": {
            "type": "object",
            "properties": {
                "keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of key names, e.g. ['tab', 'enter'] or ['up', 'up', 'space']."
                }
            },
            "required": ["keys"]
        }
    }
}

keyboard_hotkey_tool = {
    "type": "function",
    "function": {
        "name": "keyboard_hotkey",
        "description": "Press a keyboard shortcut. For example, copy is ['ctrl', 'c'] and switch windows is ['alt', 'tab']. On macOS use 'command' where appropriate.",
        "parameters": {
            "type": "object",
            "properties": {
                "keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Shortcut keys in press order, e.g. ['ctrl', 'shift', 'esc']."
                }
            },
            "required": ["keys"]
        }
    }
}

keyboard_hold_tool = {
    "type": "function",
    "function": {
        "name": "keyboard_hold",
        "description": "Hold one or more keyboard keys for a specified duration.",
        "parameters": {
            "type": "object",
            "properties": {
                "keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of keys to hold, e.g. ['shift'] or ['ctrl', 'shift']."
                },
                "duration": {
                    "type": "number", 
                    "description": "Hold duration in seconds."
                }
            },
            "required": ["keys", "duration"]
        }
    }
}


wait_tool = {
    "type": "function",
    "function": {
        "name": "wait",
        "description": "Pause to allow the interface to update after opening a page or application or entering content. Wait for the target to be ready before continuing.",
        "parameters": {
            "type": "object",
            "properties": {
                "seconds": {"type": "number", "description": "Seconds to wait, e.g. 1, 2.5 or 5. Allow more time if loading is slow."}
            },
            "required": ["seconds"]
        }
    }
}
screenshot_tool = {
    "type": "function",
    "function": {
        "name": "screenshot",
        "description": "Capture a desktop screenshot with a normalized coordinate grid.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
}

# Logical click tool schema
logical_click_tool = {
    "type": "function",
    "function": {
        "name": "logical_click",
        "description": "Invoke a node in the current page or window UI tree through the accessibility API without moving the physical mouse. Prefer a valid node ID to coordinate-based clicking when appropriate.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "integer", 
                    "description": "ID of the UI element to invoke (the id field in the current UI tree JSON)."
                }
            },
            "required": ["id"]
        }
    }
}


logical_type_tool = {
    "type": "function",
    "function": {
        "name": "logical_type",
        "description": "Enter text in an input field identified by its current UI tree node ID through the accessibility API, without moving the physical mouse. Prefer a valid input node ID to clipboard paste when appropriate.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {
                    "type": "integer", 
                    "description": "ID of the input field or text area (the id field in the current UI tree JSON)."
                },
                "text": {
                    "type": "string",
                    "description": "Text to enter."
                }
            },
            "required": ["id", "text"]
        }
    }
}

# Export all tools in a list for registration by the main application
computer_use_tools = [
    wait_tool
    
]

desktopVision_use_tools = [
    screenshot_tool
]

mouse_use_tools = [
    mouse_move_tool,
    mouse_click_tool,
    mouse_double_click_tool,
    mouse_drag_tool,
    mouse_scroll_tool,
    mouse_hold_tool,
    logical_click_tool,
]

keyboard_use_tools = [
    keyboard_type_tool,
    keyboard_press_tool,
    keyboard_sequence_tool,
    keyboard_hotkey_tool,
    keyboard_hold_tool,
    logical_type_tool,
]