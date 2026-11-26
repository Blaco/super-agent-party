import shutil
from fastapi import APIRouter

router = APIRouter(prefix="/api/docker")

@router.get("/probe")
def probe_docker():
    """
    Check whether the docker command is available on PATH.
    shutil.which checks .exe on Windows and executable permissions on Linux/macOS.
    """
    docker_path = shutil.which("docker")
    return {
        "installed": docker_path is not None,
        "path": docker_path  # Optional: return the actual installation path
    }