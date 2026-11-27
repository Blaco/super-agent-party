"""Validate flat uploaded-file identifiers before storage operations."""

import os
from pathlib import Path


class InvalidUploadPath(ValueError):
    """The requested identifier does not name an ordinary upload file."""


def resolve_upload_path(root, name):
    """Resolve a single filename within the canonical upload directory.

    The storage UI enumerates ordinary top-level files. Do not accept path
    components, Windows device names, alternate data streams or links.
    Missing ordinary files are allowed so callers retain not-found behavior.
    This is containment validation, not a race-proof filesystem sandbox.
    """
    if not isinstance(name, str) or not name or name in (".", ".."):
        raise InvalidUploadPath("Invalid upload filename")
    if any(ch in name for ch in '/\\:<>|" ?*'.replace(" ", "")):
        raise InvalidUploadPath("Invalid upload filename")
    if any(ord(ch) < 32 for ch in name) or name.endswith((" ", ".")):
        raise InvalidUploadPath("Invalid upload filename")
    # Windows treats these device names as special even with extensions.
    stem = name.split(".", 1)[0].rstrip(" ").upper()
    devices = {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"}
    devices.update(prefix + digit for prefix in ("COM", "LPT")
                   for digit in "123456789\u00b9\u00b2\u00b3")
    if stem in devices:
        raise InvalidUploadPath("Invalid upload filename")
    try:
        base = Path(root).resolve(strict=True)
        if not base.is_dir():
            raise InvalidUploadPath("Invalid upload directory")
        candidate = base / name
        if candidate.is_symlink() or getattr(candidate, "is_junction", lambda: False)():
            raise InvalidUploadPath("Linked uploads are not permitted")
        resolved = candidate.resolve()
        if os.path.normcase(str(resolved.parent)) != os.path.normcase(str(base)):
            raise InvalidUploadPath("File is outside upload storage")
        if candidate.exists() and not candidate.is_file():
            raise InvalidUploadPath("Upload must be an ordinary file")
        return str(resolved)
    except (OSError, RuntimeError, ValueError) as exc:
        if isinstance(exc, InvalidUploadPath):
            raise
        raise InvalidUploadPath("Invalid upload filename") from exc
