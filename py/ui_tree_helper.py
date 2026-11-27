# py/ui_tree_helper.py
import platform
import asyncio
import json
import re
import os

# Activate accessibility support in native Qt and GTK frameworks
os.environ["QT_ACCESSIBILITY"] = "1"
os.environ["GTK_A11Y"] = "1"

# ==========================================
# Global cache mapping IDs to native handles
# ==========================================
UI_ELEMENT_CACHE = {}
_id_counter = 0

def reset_ui_cache():
    """Clear the previous cache before rebuilding the UI tree to prevent leaks and stale handles."""
    global _id_counter, UI_ELEMENT_CACHE
    UI_ELEMENT_CACHE.clear()
    _id_counter = 0

def cache_element(system_str: str, native_handle) -> int:
    """Store a native accessibility handle in the local cache and return an integer ID to the agent."""
    global _id_counter, UI_ELEMENT_CACHE
    _id_counter += 1
    UI_ELEMENT_CACHE[_id_counter] = (system_str, native_handle)
    return _id_counter

def get_cached_element(id_int: int):
    """Resolve an agent-supplied logical ID to its native handle in the local dictionary."""
    global UI_ELEMENT_CACHE
    return UI_ELEMENT_CACHE.get(id_int)


# ==========================================
# Core entry point and positioning helpers
# ==========================================
async def get_desktop_ui_tree(logical_width: int, logical_height: int, offset_x: int = 0, offset_y: int = 0) -> str:
    """
    Asynchronously retrieve a compact UI tree for the foreground window across platforms.
    Node centers are converted to relative coordinates from 0 to 1000 aligned with the screenshot viewport.
    """
    # Reset the cache first so IDs start at 1 and no stale session data remains
    reset_ui_cache()
    
    system = platform.system()
    logical_width = logical_width if logical_width > 0 else 1920
    logical_height = logical_height if logical_height > 0 else 1080
    
    try:
        if system == "Windows":
            return await asyncio.to_thread(_get_windows_ui_tree, logical_width, logical_height, offset_x, offset_y)
        elif system == "Darwin":
            return await asyncio.to_thread(_get_mac_ui_tree, logical_width, logical_height, offset_x, offset_y)
        elif system == "Linux":
            return await asyncio.to_thread(_get_linux_ui_tree, logical_width, logical_height, offset_x, offset_y)
        else:
            return "[]"
    except Exception:
        return "[]"

def _normalize_coords(absolute_x: float, absolute_y: float, logical_width: int, logical_height: int, offset_x: int, offset_y: int):
    logical_x = absolute_x - offset_x
    logical_y = absolute_y - offset_y
    
    grid_x = int((logical_x / logical_width) * 1000)
    grid_y = int((logical_y / logical_height) * 1000)
    
    grid_x = max(0, min(1000, grid_x))
    grid_y = max(0, min(1000, grid_y))
    return grid_x, grid_y


# ==========================================
# Windows implementation (including UIA accessibility activation for Chromium)
# ==========================================
def _get_windows_ui_tree(logical_width: int, logical_height: int, offset_x: int, offset_y: int) -> str:
    try:
        import uiautomation as auto
        import ctypes
    except ImportError:
        return "[]"
    
    # Enable DPI awareness to keep screenshot and click coordinates consistent under display scaling
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

    foreground_window = auto.GetForegroundControl()
    if not foreground_window:
        return "[]"
        
    # Activate the Windows Chromium accessibility engine
    try:
        doc = foreground_window.DocumentControl(searchDepth=4)
        if doc.Exists(0.1):
            _ = doc.Name
            _ = doc.GetLegacyIAccessiblePattern()
    except Exception:
        pass
        
    elements = []
    max_elements = 60
    interactive_types = {
        "ButtonControl", "EditControl", "HyperlinkControl", "MenuItemControl", 
        "TabItemControl", "CheckBoxControl", "ComboBoxControl", "ListItemControl"
    }
    
    for control, depth in auto.WalkControl(foreground_window, includeTop=True):
        if len(elements) >= max_elements:
            break
            
        ctrl_type = control.ControlTypeName or ""
        name = control.Name or ""
        rect = control.BoundingRectangle
        is_interactive = ctrl_type in interactive_types
        
        if not rect or (not name and not is_interactive):
            continue
            
        width = rect.right - rect.left
        height = rect.bottom - rect.top
        if width <= 5 or height <= 5:
            continue
            
        abs_x = rect.left + width // 2
        abs_y = rect.top + height // 2
        grid_x, grid_y = _normalize_coords(abs_x, abs_y, logical_width, logical_height, offset_x, offset_y)
        
        # Cache the current element and obtain its unique local ID
        node_id = cache_element("Windows", control)
        
        clean_type = ctrl_type.replace("Control", "")
        elements.append({
            "id": node_id,
            "type": clean_type,
            "name": name if name else "[Actionable]",
            "center": [grid_x, grid_y]
        })
        
    class_name = foreground_window.ClassName or ""
    if "SunAwt" in class_name and len(elements) == 0:
        elements.append({
            "type": "Warning",
            "name": "[Java Access Bridge (JAB) is disabled. Run 'jabswitch -enable' in Admin Cmd to wake up Java elements.]",
            "center": [500, 500]
        })
        
    return json.dumps(elements, ensure_ascii=False, indent=2)


# ==========================================
# macOS implementation (native CoreFoundation booleans, multiple activation paths and text attributes)
# ==========================================
def _get_mac_ui_tree(logical_width: int, logical_height: int, offset_x: int, offset_y: int) -> str:
    try:
        import AppKit
        import ApplicationServices as AX
        import time
        # 1. Import native CFBooleanRef directly from CoreFoundation
        # Pass native kCFBooleanTrue to the C API to avoid NSNumber type mismatches rejected by Chromium
        from CoreFoundation import kCFBooleanTrue
    except ImportError:
        # Compatibility fallback
        try:
            import objc
            kCFBooleanTrue = objc.YES
        except Exception:
            kCFBooleanTrue = True

    workspace = AppKit.NSWorkspace.sharedWorkspace()
    active_app = workspace.frontmostApplication()
    if not active_app:
        return "[]"
        
    pid = active_app.processIdentifier()
    app_element = AX.AXUIElementCreateApplication(pid)
    
    # 2. System-level accessibility activation using native kCFBooleanTrue
    try:
        system_wide = AX.AXUIElementCreateSystemWide()
        AX.AXUIElementSetAttributeValue(system_wide, "AXEnhancedUserInterface", kCFBooleanTrue)
    except Exception as e:
        print(f"[Warning] System-wide accessibility wake-up failed: {e}")
    
    # 3. Application-level activation through two paths
    AX.AXUIElementSetAttributeValue(app_element, "AXEnhancedUserInterface", kCFBooleanTrue)
    AX.AXUIElementSetAttributeValue(app_element, "AXManualAccessibility", kCFBooleanTrue)
    
    # 4. Window-level activation across all active windows
    err, windows = AX.AXUIElementCopyAttributeValue(app_element, "AXWindows", None)
    if err == 0 and windows:
        for window in windows:
            AX.AXUIElementSetAttributeValue(window, "AXEnhancedUserInterface", kCFBooleanTrue)
            AX.AXUIElementSetAttributeValue(window, "AXManualAccessibility", kCFBooleanTrue)
    
    # 5. Allow 400 ms for initialization
    # Allow Chromium time to construct the accessibility tree after receiving kCFBooleanTrue
    time.sleep(0.4)
    
    elements = []
    max_elements = 80
    interactive_roles = {
        "AXButton", "AXTextField", "AXLink", "AXCheckBox", 
        "AXRadioButton", "AXPopUpButton", "AXTextArea", "AXStaticText"
    }
    
    pos_re = re.compile(r"x:\s*([\d.-]+)\s+y:\s*([\d.-]+)")
    size_re = re.compile(r"w:\s*([\d.-]+)\s+h:\s*([\d.-]+)")

    def get_element_name(element) -> str:
        """
        Extract text, input values and placeholders using multiple fallback attributes.
        """
        err, title = AX.AXUIElementCopyAttributeValue(element, "AXTitle", None)
        if err == 0 and title and str(title).strip():
            return str(title).strip()
            
        err, val = AX.AXUIElementCopyAttributeValue(element, "AXValue", None)
        if err == 0 and val and str(val).strip():
            val_str = str(val).strip()
            if len(val_str) > 60:
                val_str = val_str[:60] + "..."
            return val_str
            
        err, desc = AX.AXUIElementCopyAttributeValue(element, "AXDescription", None)
        if err == 0 and desc and str(desc).strip():
            return str(desc).strip()
            
        return ""

    def extract_bounds_safely(pos_obj, size_obj):
        x, y, w, h = None, None, None, None
        try:
            x, y = pos_obj.x, pos_obj.y
            w, h = size_obj.width, size_obj.height
        except Exception:
            pass
        if x is None:
            try:
                x, y = pos_obj[0], pos_obj[1]
                w, h = size_obj[0], size_obj[1]
            except Exception:
                pass
        if x is None:
            try:
                pos_str, size_str = str(pos_obj), str(size_obj)
                pos_match = pos_re.search(pos_str)
                size_match = size_re.search(size_str)
                if pos_match and size_match:
                    x, y = float(pos_match.group(1)), float(pos_match.group(2))
                    w, h = float(size_match.group(1)), float(size_match.group(2))
            except Exception:
                pass
        return x, y, w, h

    def walk(element, depth=0):
        if len(elements) >= max_elements:
            return
            
        err, role = AX.AXUIElementCopyAttributeValue(element, "AXRole", None)
        role_str = role if err == 0 else ""
        
        title_str = get_element_name(element)
        is_interactive = role_str in interactive_roles
        
        if not is_interactive and not title_str:
            err, children = AX.AXUIElementCopyAttributeValue(element, "AXChildren", None)
            if err == 0 and children:
                for child in children:
                    walk(child, depth + 1)
            return
            
        err, pos = AX.AXUIElementCopyAttributeValue(element, "AXPosition", None)
        err2, size = AX.AXUIElementCopyAttributeValue(element, "AXSize", None)
        
        if err == 0 and err2 == 0 and pos and size:
            x, y, w, h = extract_bounds_safely(pos, size)
            
            if x is not None and w > 5 and h > 5:
                abs_x = x + w / 2
                abs_y = y + h / 2
                grid_x, grid_y = _normalize_coords(abs_x, abs_y, logical_width, logical_height, offset_x, offset_y)
                
                node_id = cache_element("Darwin", element)
                
                elements.append({
                    "id": node_id,
                    "type": role_str.replace("AX", ""),
                    "name": title_str if title_str else "[Actionable]",
                    "center": [grid_x, grid_y]
                })
                
        err, children = AX.AXUIElementCopyAttributeValue(element, "AXChildren", None)
        if err == 0 and children:
            for child in children:
                walk(child, depth + 1)
                
    walk(app_element)
    
    app_name = active_app.localizedName() or ""
    if ("java" in app_name.lower() or "idea" in app_name.lower() or "clion" in app_name.lower()) and len(elements) == 0:
        elements.append({
            "type": "Warning",
            "name": "[Java Accessibility might be disabled. Please check your JDK's accessibility.properties.]",
            "center": [500, 500]
        })
        
    return json.dumps(elements, ensure_ascii=False, indent=2)


# ==========================================
# Linux implementation
# ==========================================
def _get_linux_ui_tree(logical_width: int, logical_height: int, offset_x: int, offset_y: int) -> str:
    try:
        import pyatspi
    except ImportError:
        return "[]"
        
    try:
        registry = pyatspi.Registry
        desktop = registry.getDesktop(0)
        elements = []
        max_elements = 50
        interactive_roles = {"push button", "entry", "link", "check box", "radio button", "combo box"}
        
        def walk(obj, depth=0):
            if len(elements) >= max_elements or not obj:
                return
                
            role = obj.getRoleName()
            name = obj.getName()
            is_interactive = role in interactive_roles
            
            if is_interactive or name:
                try:
                    comp = obj.getComponent()
                    if comp:
                        rect = comp.getExtents(pyatspi.XY_SCREEN)
                        x, y, w, h = rect.x, rect.y, rect.width, rect.height
                        if w > 5 and h > 5:
                            abs_x = x + w / 2
                            abs_y = y + h / 2
                            grid_x, grid_y = _normalize_coords(abs_x, abs_y, logical_width, logical_height, offset_x, offset_y)
                            
                            # Cache the current element and obtain its unique local ID
                            node_id = cache_element("Linux", obj)
                            
                            elements.append({
                                "id": node_id,
                                "type": role,
                                "name": name if name else "[Actionable]",
                                "center": [grid_x, grid_y]
                            })
                except Exception:
                    pass
            
            try:
                child_count = obj.getChildCount()
                for i in range(child_count):
                    walk(obj.getChildAtIndex(i), depth + 1)
            except Exception:
                pass
                
        for app in desktop:
            walk(app)
            if len(elements) > 0:
                break
                
        return json.dumps(elements, ensure_ascii=False, indent=2)
    except Exception:
        return "[]"