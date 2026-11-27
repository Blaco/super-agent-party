import shutil
import tempfile
import json
import os
import httpx
import yaml
import re
import asyncio
import logging
from pathlib import Path
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from py.get_setting import SKILLS_DIR

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["skills"])

# ==================== Data models ====================

class Skill(BaseModel):
    id: str
    name: str
    description: str = "No description"
    version: str = "1.0.0"
    author: str = "Unknown"
    files: List[str] = []

class SkillsResponse(BaseModel):
    skills: List[Skill]

class GitHubSkillInstallRequest(BaseModel):
    url: str = Field(..., description="GitHub URL (repository or specific path)")

class SkillSyncRequest(BaseModel):
    skill_id: str
    project_path: str
    action: str  # "install", "remove", or "sync_to_global"

class InstallResponse(BaseModel):
    status: str
    message: str
    installed_ids: Optional[List[str]] = None
    error: Optional[str] = None

# ==================== Utility functions ====================

def robust_rmtree(path: Path):
    """Remove a directory, handling Windows permissions or files in use."""
    if path.exists():
        try:
            shutil.rmtree(path, ignore_errors=True)
        except Exception as e:
            print(f"Failed to remove directory {path}: {e}")

def parse_github_url(url: str):
    """
    Parse GitHub URLs, including deep links.
    Example: https://github.com/anthropics/skills/tree/main/skills/docx
    Returns: (zip_download_url, branch, subpath)
    """
    url = url.strip().rstrip('/').removesuffix('.git')
    # Match owner, repository and optional tree/branch/path
    pattern = r"github\.com/([^/]+)/([^/]+)(?:/(?:tree|blob)/([^/]+)/(.*))?"
    match = re.search(pattern, url)
    
    if not match:
        raise ValueError("Invalid GitHub URL")
        
    owner, repo, branch, subpath = match.groups()
    
    # Resolve the default branch dynamically when not specified in the URL
    if not branch:
        import httpx
        try:
            api_url = f"https://api.github.com/repos/{owner}/{repo}"
            with httpx.Client(timeout=5.0) as client:
                response = client.get(api_url)
                if response.status_code == 200:
                    repo_info = response.json()
                    branch = repo_info.get("default_branch", "main")
                else:
                    branch = "main"  # Fallback
        except Exception:
            branch = "main"  # Fallback when the API call fails
    else:
        branch = branch
    
    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
    return zip_url, branch, subpath

async def download_zip(url: str, dest: Path):
    """Download a file asynchronously."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        async with client.stream("GET", url) as resp:
            if resp.status_code != 200:
                raise Exception(f"Download failed: status {resp.status_code}")
            with open(dest, "wb") as f:
                async for chunk in resp.aiter_bytes():
                    f.write(chunk)

def get_skill_metadata(skill_dir: Path, skill_id: str) -> Skill:
    """
    Parse skill metadata from the YAML frontmatter in SKILL.md.
    
    Args:
        skill_dir: Path to the skill directory
        skill_id: Unique skill identifier
    
    Returns:
        Skill: Skill metadata object
    
    Raises:
        ValueError: If skill_dir is invalid
    """
    
    # 1. Validate parameters
    if not isinstance(skill_dir, Path):
        try:
            skill_dir = Path(skill_dir)
        except Exception as e:
            raise ValueError(f"Invalid skill_dir path: {skill_dir}, error: {e}")
    
    if not isinstance(skill_id, str) or not skill_id.strip():
        skill_id = skill_dir.name if isinstance(skill_dir, Path) else "unknown"
        logger.warning(f"Invalid skill_id provided; using directory name: {skill_id}")
    
    skill_id = skill_id.strip()
    
    # 2. Check that the directory exists
    if not skill_dir.exists():
        logger.error(f"Skill directory does not exist: {skill_dir}")
        return _create_default_skill(skill_id, skill_dir, [])
    
    if not skill_dir.is_dir():
        logger.error(f"skill_dir is not a directory: {skill_dir}")
        return _create_default_skill(skill_id, skill_dir, [])
    
    # 3. Find the metadata file (case-insensitive, including name variants)
    target_files = [
        "SKILL.md", "skill.md", "SKILLS.md", "skills.md",
        "Skill.md", "Skill.MD", "skill.MD", "SKILL.MD"
    ]
    
    meta_file: Optional[Path] = None
    try:
        # Use a generator to avoid materializing all paths in advance
        meta_file = next(
            (skill_dir / f for f in target_files if (skill_dir / f).exists() and (skill_dir / f).is_file()),
            None
        )
    except PermissionError as e:
        logger.error(f"Permission denied accessing directory {skill_dir}: {e}")
        return _create_default_skill(skill_id, skill_dir, [])
    except OSError as e:
        logger.error(f"System error accessing directory {skill_dir}: {e}")
        return _create_default_skill(skill_id, skill_dir, [])
    
    # 4. Parse YAML frontmatter
    meta: dict[str, Any] = {}
    
    if meta_file is not None:
        try:
            # Check file size to avoid memory issues with very large files
            file_size = meta_file.stat().st_size
            if file_size > 1024 * 1024:  # 1 MB limit
                logger.warning(f"Metadata file is too large ({file_size} bytes): {meta_file}")
            else:
                # Try multiple encodings
                content = _read_file_with_encoding(meta_file)
                
                if content is not None:
                    # Extract YAML between --- delimiters using a more tolerant match
                    match = re.search(
                        r'^\s*---\s*[\r\n]+(.*?)[\r\n]+---\s*',
                        content,
                        re.DOTALL | re.MULTILINE
                    )
                    
                    if match:
                        yaml_text = match.group(1).strip()
                        if yaml_text:
                            try:
                                parsed_meta = yaml.safe_load(yaml_text)
                                # Strict type checking
                                if isinstance(parsed_meta, dict):
                                    meta = parsed_meta
                                elif parsed_meta is None:
                                    logger.debug(f"YAML in {meta_file.name} parsed as empty")
                                    meta = {}
                                else:
                                    logger.warning(
                                        f"YAML in {meta_file.name} is not a dictionary, "
                                        f"but {type(parsed_meta).__name__}; ignoring it"
                                    )
                                    meta = {}
                            except yaml.YAMLError as e:
                                logger.warning(f"YAML parsing error in {meta_file.name}: {e}")
                                meta = {}
                            except Exception as e:
                                logger.error(f"Unexpected error parsing YAML: {e}")
                                meta = {}
                    else:
                        logger.debug(f"No YAML frontmatter found in {meta_file.name}")
                        
        except PermissionError as e:
            logger.error(f"Permission denied reading file {meta_file}: {e}")
        except OSError as e:
            logger.error(f"System error reading file {meta_file}: {e}")
        except Exception as e:
            logger.exception(f"Unexpected metadata parsing error: {e}")
    
    # 5. Safely obtain the file list
    file_list: List[str] = []
    try:
        file_list = [
            f.name for f in skill_dir.iterdir() 
            if f.is_file() and not f.name.startswith('.') and not f.name.startswith('~')
        ]
        file_list.sort()
    except PermissionError as e:
        logger.error(f"Permission denied listing directory {skill_dir}: {e}")
    except OSError as e:
        logger.error(f"Error listing directory {skill_dir}: {e}")
    except Exception as e:
        logger.exception(f"Unexpected error obtaining the file list: {e}")
    
    # 6. Safely extract metadata fields
    return _build_skill_from_meta(skill_id, skill_dir, meta, file_list)


def _read_file_with_encoding(file_path: Path, max_size: int = 1024 * 1024) -> Optional[str]:
    """
    Try reading a file using multiple encodings.
    
    Args:
        file_path: File path
        max_size: Maximum bytes to read
    
    Returns:
        File content or None
    """
    encodings = ['utf-8', 'utf-8-sig', 'gbk', 'gb2312', 'latin-1', 'cp1252']
    
    for encoding in encodings:
        try:
            content = file_path.read_text(encoding=encoding, errors='strict')
            if encoding in ['latin-1', 'cp1252'] and '\ufffd' in content:
                continue
            return content
        except UnicodeDecodeError:
            continue
        except Exception as e:
            logger.debug(f"Read failed using {encoding}: {e}")
            continue
    
    try:
        return file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception as e:
        logger.error(f"All encoding attempts failed: {e}")
        return None


def _extract_nested_value(meta: dict, keys: List[str], default: Any) -> Any:
    """
    Safely extract a value from a nested dictionary.
    """
    for key in keys:
        if not isinstance(key, str):
            continue
        try:
            if key in meta:
                value = meta[key]
                if isinstance(value, str):
                    value = value.strip()
                if value is not None and value != "":
                    return value
        except Exception:
            continue
    
    for key in keys:
        if "." in key:
            parts = key.split(".")
            current = meta
            try:
                for part in parts:
                    if isinstance(current, dict) and part in current:
                        current = current[part]
                    else:
                        break
                else:
                    if current is not None and current != "":
                        return current
            except Exception:
                continue
    
    return default


def _sanitize_version(version: Any) -> str:
    if version is None:
        return "1.0.0"
    if isinstance(version, (int, float)):
        return str(version)
    if isinstance(version, str):
        version = version.strip()
        if re.match(r'^[\d]+(\.[\d]+)*([\-\+.]?[a-zA-Z0-9]+)*$', version):
            return version
        cleaned = re.sub(r'[^\d.\-+a-zA-Z]', '', version)
        if cleaned:
            return cleaned
    return "1.0.0"


def _sanitize_author(author: Any) -> str:
    if author is None:
        return "Local"
    if isinstance(author, str):
        author = author.strip()
        if author:
            return author[:100]
    if isinstance(author, (list, tuple)):
        if author and isinstance(author[0], str):
            return author[0].strip()[:100]
    return "Local"


def _build_skill_from_meta(
    skill_id: str, 
    skill_dir: Path, 
    meta: dict, 
    file_list: List[str]
) -> Skill:
    name = _extract_nested_value(meta, ["name", "title", "id"], skill_id)
    if not isinstance(name, str) or not name.strip():
        name = skill_id
    
    description = _extract_nested_value(
        meta, 
        ["description", "desc", "summary", "about"], 
        "Agent skill"
    )
    if not isinstance(description, str):
        description = str(description) if description is not None else "Agent skill"
    description = description[:500]
    
    version_raw = _extract_nested_value(meta, ["version", "ver"], "1.0.0")
    version = _sanitize_version(version_raw)
    
    author_raw = (
        meta.get("author") 
        or meta.get("authors")
        or meta.get("metadata", {}).get("author") 
        if isinstance(meta.get("metadata"), dict) 
        else None
    )
    author = _sanitize_author(author_raw)
    
    max_files = 8
    files = file_list[:max_files]
    
    return Skill(
        id=skill_id,
        name=name,
        description=description,
        version=version,
        author=author,
        files=files
    )


def _create_default_skill(
    skill_id: str, 
    skill_dir: Path, 
    file_list: List[str]
) -> Skill:
    return Skill(
        id=skill_id,
        name=skill_id,
        description="Agent skill (metadata parsing failed)",
        version="1.0.0",
        author="Local",
        files=file_list[:8]
    )

# ==================== Core installation logic ====================

def _install_skills_from_directory(source_dir: Path) -> List[str]:
    """
    Skill installer with recursive discovery:
    1. If source_dir contains SKILL.md, install it as a single skill.
    2. If a skills/ subdirectory exists, search it recursively first.
    3. Recursively scan subdirectories and install directories containing SKILL.md.
    """
    installed_ids = []
    target_files = ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]

    def is_skill_dir(d: Path):
        return any((d / f).exists() for f in target_files)

    # 1. Check whether source_dir is itself a skill
    if is_skill_dir(source_dir):
        skill_id = source_dir.name
        dest_path = Path(SKILLS_DIR) / skill_id
        robust_rmtree(dest_path)
        shutil.copytree(source_dir, dest_path)
        installed_ids.append(skill_id)
        return installed_ids

    # 2. Determine the root of the recursive search
    search_dir = source_dir
    skills_subdir = source_dir / "skills"
    if skills_subdir.exists() and skills_subdir.is_dir():
        search_dir = skills_subdir

    # 3. Collect skill directories recursively
    found_skill_dirs = []
    def find_skill_dirs(root: Path):
        if not root.is_dir():
            return
        if is_skill_dir(root):
            found_skill_dirs.append(root)
        else:
            # Scan subdirectories, excluding hidden directories
            try:
                for item in sorted(root.iterdir()):
                    if item.is_dir() and not item.name.startswith('.'):
                        find_skill_dirs(item)
            except PermissionError:
                logger.warning(f"Permission denied accessing directory: {root}")

    find_skill_dirs(search_dir)

    # 4. Install discovered skills and handle ID conflicts
    used_ids = set()
    for skill_dir in found_skill_dirs:
        # Prefer the directory name as the ID
        skill_id = skill_dir.name
        if skill_id in used_ids:
            # Create a unique ID using the path relative to search_dir
            try:
                rel_path = skill_dir.relative_to(search_dir)
                unique_id = "_".join(rel_path.parts)
                if unique_id in used_ids:
                    logger.warning(f"Unable to generate a unique ID for conflicting skill directory: {skill_dir}")
                    continue
                skill_id = unique_id
            except ValueError:
                logger.warning(f"Unable to calculate relative path; skipping directory: {skill_dir}")
                continue
        
        dest_path = Path(SKILLS_DIR) / skill_id
        robust_rmtree(dest_path)
        shutil.copytree(skill_dir, dest_path)
        installed_ids.append(skill_id)
        used_ids.add(skill_id)
    
    return installed_ids

async def _process_github_install(url: str) -> Dict[str, Any]:
    """
    Handle GitHub installation: parse, download and install discovered skills.
    Return a dictionary containing status, installed IDs or error information.
    """
    temp_dir = Path(tempfile.mkdtemp())
    try:
        zip_url, branch, subpath = parse_github_url(url)
        zip_path = temp_dir / "repo.zip"
        
        # 1. Download
        await download_zip(zip_url, zip_path)
        
        # 2. Extract
        extract_dir = temp_dir / "extracted"
        shutil.unpack_archive(zip_path, extract_dir)
        
        # 3. Locate the content root (GitHub ZIPs usually contain a top-level repo-main directory)
        repo_root = next(extract_dir.iterdir())
        
        # 4. Enter subpath if specified
        target_source = repo_root
        if subpath:
            potential_path = repo_root.joinpath(*subpath.split('/'))
            if potential_path.exists():
                target_source = potential_path
        
        # 5. Invoke the shared recursive installer
        ids = _install_skills_from_directory(target_source)
        
        if not ids:
            return {
                "success": False,
                "error": "No valid Agent Skill structure found (missing SKILL.md)",
                "installed_ids": []
            }
        
        return {
            "success": True,
            "installed_ids": ids,
            "message": f"Installed {len(ids)} skills: {', '.join(ids)}"
        }

    except ValueError as e:
        return {"success": False, "error": f"URL parsing failed: {str(e)}", "installed_ids": []}
    except Exception as e:
        return {"success": False, "error": f"Installation error: {str(e)}", "installed_ids": []}
    finally:
        robust_rmtree(temp_dir)

# ==================== API routes ====================

@router.get("/list", response_model=SkillsResponse)
async def list_skills():
    """List all installed global skills."""
    if not os.path.exists(SKILLS_DIR):
        os.makedirs(SKILLS_DIR, exist_ok=True)
        return SkillsResponse(skills=[])
    
    skills_list = []
    base = Path(SKILLS_DIR)
    if base.exists():
        for item in sorted(base.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                skills_list.append(get_skill_metadata(item, item.name))
    return SkillsResponse(skills=skills_list)

@router.get("/{skill_id}/content")
async def get_skill_content(skill_id: str):
    """Frontend preview: read the complete SKILL.md file."""
    skill_dir = Path(SKILLS_DIR) / skill_id
    if not skill_dir.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    
    target_files = ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]
    for filename in target_files:
        p = skill_dir / filename
        if p.exists():
            return {"content": p.read_text(encoding="utf-8")}
                
    raise HTTPException(status_code=404, detail="Metadata file not found (SKILL.md)")

@router.post("/install-from-github", response_model=InstallResponse)
async def install_skill_github(req: GitHubSkillInstallRequest):
    """
    Install a skill from GitHub synchronously and return the result.
    Supports a specific path or an entire repository.
    """
    try:
        result = await _process_github_install(req.url)
        
        if result["success"]:
            return InstallResponse(
                status="success",
                message=result["message"],
                installed_ids=result["installed_ids"]
            )
        else:
            raise HTTPException(
                status_code=400, 
                detail=result["error"]
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/upload-zip", response_model=InstallResponse)
async def upload_skill_zip(file: UploadFile = File(...)):
    """Upload a local ZIP containing a single skill or a multi-skill repository."""
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported")

    with tempfile.TemporaryDirectory() as td:
        temp_path = Path(td)
        zip_file = temp_path / "upload.zip"
        with open(zip_file, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        extract_dir = temp_path / "extracted"
        shutil.unpack_archive(zip_file, extract_dir)
        
        # Handle an optional enclosing directory
        items = [i for i in extract_dir.iterdir() if not i.name.startswith('.')]
        source = items[0] if len(items) == 1 and items[0].is_dir() else extract_dir

        installed_ids = _install_skills_from_directory(source)
        
    if not installed_ids:
        raise HTTPException(status_code=400, detail="No valid Agent Skill structure found (missing SKILL.md)")
        
    return InstallResponse(
        status="success",
        message=f"Installed {len(installed_ids)} skills",
        installed_ids=installed_ids
    )

@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """Remove a skill from global storage."""
    target = Path(SKILLS_DIR) / skill_id
    if not target.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    
    robust_rmtree(target)
    return {"status": "success", "message": f"Skill {skill_id} removed"}

@router.get("/project-status")
async def get_project_skills_status(path: str):
    """List enabled skills for a specified project with their metadata."""
    if not path or not os.path.exists(path):
        return {"installed_ids": [], "project_skills": []}
    
    project_skills_dir = Path(path) / ".agents" / "skills"
    if not project_skills_dir.exists():
        return {"installed_ids": [], "project_skills": []}
    
    installed_ids = []
    project_skills = []
    
    for item in project_skills_dir.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            installed_ids.append(item.name)
            skill_meta = get_skill_metadata(item, item.name)
            project_skills.append(skill_meta)
            
    return {"installed_ids": installed_ids, "project_skills": project_skills}

@router.post("/sync")
async def sync_skill_to_project(req: SkillSyncRequest):
    """Synchronize skills between global and project directories."""
    if not req.project_path or not os.path.exists(req.project_path):
        raise HTTPException(status_code=400, detail="Invalid project path")

    global_skill_path = Path(SKILLS_DIR) / req.skill_id
    project_skills_dir = Path(req.project_path) / ".agents" / "skills"
    target_path = project_skills_dir / req.skill_id

    if req.action == "install":
        if not global_skill_path.exists():
            raise HTTPException(status_code=404, detail="Global skill not found; install it first")
        project_skills_dir.mkdir(parents=True, exist_ok=True)
        robust_rmtree(target_path)
        shutil.copytree(global_skill_path, target_path)
        return {"status": "success", "message": f"Skill {req.skill_id} synchronized to project"}

    elif req.action == "remove":
        if target_path.exists():
            robust_rmtree(target_path)
        return {"status": "success", "message": f"Skill {req.skill_id} removed from project"}
    
    elif req.action == "sync_to_global":
        if not target_path.exists():
            raise HTTPException(status_code=404, detail="Project skill not found; cannot synchronize to global storage")
        Path(SKILLS_DIR).mkdir(parents=True, exist_ok=True)
        robust_rmtree(global_skill_path)
        shutil.copytree(target_path, global_skill_path)
        return {"status": "success", "message": f"Skill {req.skill_id} synchronized to global storage"}
    
    raise HTTPException(status_code=400, detail="Invalid action; supported actions are 'install', 'remove', and 'sync_to_global'")

@router.get("/get_path")
async def get_skills_path():
    """Get the absolute path to the skill storage directory."""
    try:
        abs_path = os.path.abspath(SKILLS_DIR)
        if not os.path.exists(abs_path):
            os.makedirs(abs_path, exist_ok=True)
        return {"path": abs_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== Health check ====================

@router.get("/health")
async def health_check():
    """Service health check."""
    return {"status": "ok", "skills_dir": SKILLS_DIR, "exists": os.path.exists(SKILLS_DIR)}