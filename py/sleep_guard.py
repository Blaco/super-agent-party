"""
Cross-platform sleep prevention module
Supports Windows, macOS and Linux
Usage:
    from sleep_guard import SleepGuard
    guard = SleepGuard()
    guard.start()  # Start sleep prevention
    # ... your main program ...
    guard.stop()   # Stop sleep prevention (optional)
"""

import threading
import platform
import subprocess
import time
import sys
import os
from typing import Optional


class _BaseGuard:
    """Base class for sleep prevention."""
    def start(self) -> bool:
        raise NotImplementedError
    
    def stop(self) -> None:
        raise NotImplementedError


class _WindowsGuard(_BaseGuard):
    """Windows implementation."""
    def __init__(self):
        self._running = False
        self._thread = None
        self._check_interval = 30  # Refresh every 30 seconds
        
    def start(self) -> bool:
        try:
            import ctypes
            self._ctypes = ctypes
            self._running = True
            self._thread = threading.Thread(target=self._keep_awake, daemon=True)
            self._thread.start()
            return True
        except Exception as e:
            print(f"[SleepGuard] Failed to start sleep prevention on Windows: {e}")
            return False
    
    def _keep_awake(self):
        """Background thread: periodically call the API to prevent sleep."""
        # Prevent system sleep and display power-off
        ES_CONTINUOUS = 0x80000000
        ES_SYSTEM_REQUIRED = 0x00000001
        ES_DISPLAY_REQUIRED = 0x00000002
        flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        
        while self._running:
            self._ctypes.windll.kernel32.SetThreadExecutionState(flags)
            time.sleep(self._check_interval)
    
    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=1)
        # Restore the default state (allow normal system sleep)
        if hasattr(self, '_ctypes'):
            ES_CONTINUOUS = 0x80000000
            self._ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)


class _MacOSGuard(_BaseGuard):
    """macOS implementation using the caffeinate subprocess."""
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        
    def start(self) -> bool:
        try:
            # -d: prevent display sleep, -i: prevent idle system sleep, -s: prevent sleep on AC power
            self._process = subprocess.Popen(
                ['caffeinate', '-dims'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL
            )
            # Check whether the process started successfully
            if self._process.poll() is None:
                return True
            return False
        except Exception as e:
            print(f"[SleepGuard] Failed to start sleep prevention on macOS: {e}")
            return False
    
    def stop(self):
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._process.kill()


class _LinuxGuard(_BaseGuard):
    """Linux implementation using multiple fallback methods."""
    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._method = None
        
    def start(self) -> bool:
        # Method 1: systemd-inhibit (standard approach)
        try:
            self._process = subprocess.Popen(
                ['systemd-inhibit', '--what=idle', '--why=Application is running', 
                 '--mode=block', 'sleep', 'infinity'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL
            )
            if self._process.poll() is None:
                self._method = 'systemd'
                return True
        except (FileNotFoundError, Exception):
            pass
        
        # Method 2: simulate activity with xdotool (requires xdotool)
        try:
            # Check whether xdotool is available
            subprocess.run(['xdotool', '--version'], 
                          stdout=subprocess.DEVNULL, 
                          stderr=subprocess.DEVNULL, 
                          check=True)
            self._method = 'xdotool'
            self._running = True
            self._thread = threading.Thread(target=self._simulate_activity, daemon=True)
            self._thread.start()
            return True
        except (FileNotFoundError, subprocess.CalledProcessError, Exception):
            pass
        
        print("[SleepGuard] Failed to start sleep prevention on Linux: systemd-inhibit and xdotool unavailable")
        return False
    
    def _simulate_activity(self):
        """Prevent sleep by simulating keystrokes."""
        while self._running:
            subprocess.run(['xdotool', 'key', 'Shift_L'], 
                          stdout=subprocess.DEVNULL, 
                          stderr=subprocess.DEVNULL)
            time.sleep(30)
    
    def stop(self):
        if self._method == 'systemd' and self._process:
            self._process.terminate()
            try:
                self._process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._process.kill()
        elif self._method == 'xdotool':
            self._running = False


class SleepGuard:
    """
    Cross-platform sleep prevention manager
    
    Example:
        guard = SleepGuard()
        guard.start()  # Start sleep prevention (non-blocking)
        # Your main program code...
        guard.stop()   # Stop sleep prevention (optional; cleaned up at program exit)
        
    Also supports use as a context manager:
        with SleepGuard() as guard:
            # Start automatically and stop on exit
            run_your_app()
    """
    
    def __init__(self, verbose: bool = False):
        """
        Initialize the sleep prevention manager
        
        Args:
            verbose: Whether to print detailed logs
        """
        self.verbose = verbose
        self._guard: Optional[_BaseGuard] = None
        self._system = platform.system()
        
    def start(self) -> bool:
        """Start sleep prevention (non-blocking)."""
        if self._guard is not None:
            if self.verbose:
                print("[SleepGuard] Sleep prevention is already running")
            return True
        
        # Select the implementation for the current operating system
        if self._system == 'Windows':
            self._guard = _WindowsGuard()
        elif self._system == 'Darwin':  # macOS
            self._guard = _MacOSGuard()
        elif self._system == 'Linux':
            self._guard = _LinuxGuard()
        else:
            if self.verbose:
                print(f"[SleepGuard] Unsupported operating system: {self._system}")
            return False
        
        success = self._guard.start()
        if success and self.verbose:
            print(f"[SleepGuard] Sleep prevention started ({self._system})")
        elif not success and self.verbose:
            print(f"[SleepGuard] Failed to start sleep prevention ({self._system})")
        
        return success
    
    def stop(self) -> None:
        """Stop sleep prevention."""
        if self._guard is not None:
            self._guard.stop()
            if self.verbose:
                print(f"[SleepGuard] Sleep prevention stopped")
            self._guard = None
    
    def is_running(self) -> bool:
        """Check whether sleep prevention is running."""
        if self._guard is None:
            return False
        if self._system == 'Windows':
            return hasattr(self._guard, '_running') and self._guard._running
        elif self._system == 'Darwin':
            return (self._guard._process is not None and 
                    self._guard._process.poll() is None)
        elif self._system == 'Linux':
            if hasattr(self._guard, '_method') and self._guard._method == 'systemd':
                return self._guard._process.poll() is None
            return hasattr(self._guard, '_running') and self._guard._running
        return False
    
    def __enter__(self):
        """Enter the context manager."""
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit the context manager."""
        self.stop()


# ============= Usage examples =============
if __name__ == '__main__':
    # Example 1: Basic usage
    guard = SleepGuard(verbose=True)
    guard.start()
    
    print("Sleep prevention started. The system will remain awake...")
    print("Press Ctrl+C to exit")
    
    try:
        # Simulate the main program running
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting...")
    finally:
        guard.stop()
    
    # Example 2: Using the context manager (more concise)
    # with SleepGuard(verbose=True):
    #     print("The program is running; the system will stay awake...")
    #     time.sleep(10)
    #     print("Normal sleep behavior is restored on exit")