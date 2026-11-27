import asyncio
import os
import json
import uuid
from pathlib import Path
import httpx
import aiofiles
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

# Default application model storage directory
# Use DEFAULT_ASR_DIR
from py.get_setting import DEFAULT_ASR_DIR 

router = APIRouter(prefix="/sherpa-model")

# --- Model configuration ---
MODEL_NAME = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue"
# Required Sherpa runtime files
REQUIRED_FILES = ["model.int8.onnx", "tokens.txt"] 

MODELS = {
    "huggingface": {
        "url": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/resolve/main/model.int8.onnx?download=true",
        "tokens_url": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/resolve/main/tokens.txt?download=true",
        "files_to_download": [
            {"filename": "model.int8.onnx", "url_key": "url", "progress_key": "model"},
            {"filename": "tokens.txt", "url_key": "tokens_url", "progress_key": "tokens"},
        ]
    }
}

# ---------- Utility functions ----------
def get_model_dir() -> Path:
    """Get the full local path of the Sherpa model."""
    return Path(DEFAULT_ASR_DIR) / MODEL_NAME

def model_exists() -> bool:
    """Check whether all required model files exist."""
    d = get_model_dir()
    # Check that every REQUIRED_FILES entry exists in the directory
    return all((d / f).is_file() for f in REQUIRED_FILES)

async def download_file(url: str, dest: Path, progress_id: str):
    """
    Download a file asynchronously and track progress using DEFAULT_ASR_DIR.
    Use aiofiles for asynchronous file writes.
    """
    tmp = dest.with_suffix(".downloading")
    progress_file_path = Path(DEFAULT_ASR_DIR) / f"{progress_id}.json"
    
    # Create the progress file at the start using asynchronous writes
    async with aiofiles.open(progress_file_path, mode='w') as p_file:
        await p_file.write(json.dumps({"done": 0, "total": 0}))

    try:
        async with httpx.AsyncClient(timeout=None, follow_redirects=True) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status() # Check the HTTP status code
                total = int(resp.headers.get("content-length", 0))
                done = 0
                async with aiofiles.open(tmp, "wb") as f:
                    async for chunk in resp.aiter_bytes(1024 * 64):
                        await f.write(chunk)
                        done += len(chunk)
                        # Update the progress file asynchronously
                        async with aiofiles.open(progress_file_path, mode='w') as p_file:
                            await p_file.write(
                                json.dumps({"done": done, "total": total, "filename": dest.name})
                            )
        
        # Rename the temporary file to its destination using asyncio.to_thread for Path.rename
        await asyncio.to_thread(tmp.rename, dest)

        # Write the complete state asynchronously after download
        async with aiofiles.open(progress_file_path, mode='w') as p_file:
            await p_file.write(
                json.dumps({"done": done, "total": done, "filename": dest.name, "complete": True})
            )
    except Exception as e:
        # Record errors asynchronously if the download fails
        async with aiofiles.open(progress_file_path, mode='w') as p_file:
            await p_file.write(
                json.dumps({"error": str(e), "filename": dest.name, "failed": True})
            )
    finally:
        # Retain the progress file after the task completes until it is removed
        pass 

# ---------- API endpoints ----------

@router.get("/status")
def status():
    """Check whether the Sherpa model files exist."""
    return {"exists": model_exists(), "model": MODEL_NAME, "required_files": REQUIRED_FILES}

@router.delete("/remove")
def remove():
    """Remove the local Sherpa model directory."""
    import shutil
    d = get_model_dir()
    if d.exists():
        shutil.rmtree(d)
    # Remove associated progress files using the MODEL_NAME prefix
    for f in Path(DEFAULT_ASR_DIR).glob(f"{MODEL_NAME}_*.json"):
        f.unlink(missing_ok=True)
    return {"ok": True}

@router.get("/download/{source}")
async def download(source: str):
    """Download Sherpa model and tokenizer files asynchronously from the selected source and stream progress."""
    if source not in MODELS:
        allowed_sources = list(MODELS.keys())
        raise HTTPException(status_code=400, detail=f"Bad source: only {', '.join(allowed_sources)} is supported.")
    if model_exists():
        raise HTTPException(status_code=400, detail="Model already exists.")

    model_subdir = get_model_dir()
    model_subdir.mkdir(parents=True, exist_ok=True)
    
    # Use a shared ID to track all download tasks
    master_progress_id = f"{MODEL_NAME}_{uuid.uuid4().hex}"
    
    # Create all download tasks
    tasks = []
    file_map = {} # Map files to their progress records in the generator
    
    for item in MODELS[source]["files_to_download"]:
        filename = item["filename"]
        # Use item["url_key"] to retrieve the URL from MODELS[source]
        url = MODELS[source][item["url_key"]]
        progress_key = item["progress_key"]
        
        # Assign a unique ID to each download task
        task_id = f"{master_progress_id}_{progress_key}" 
        dest_path = model_subdir / filename
        
        tasks.append(
            asyncio.create_task(
                download_file(url, dest_path, task_id)
            )
        )
        # Initialize file_map to track status
        file_map[progress_key] = {"id": task_id, "filename": filename, "done": 0, "total": 0, "complete": False, "failed": False}


    async def event_generator():
        # Monitor progress for all files
        num_files = len(file_map)
        completed_files = 0
        
        # Remove download progress files after the tasks finish
        def cleanup_progress_files():
            for key in file_map:
                try:
                    file_id = file_map[key].get('id')
                    if file_id:
                        progress_file = Path(DEFAULT_ASR_DIR) / f"{file_id}.json"
                        progress_file.unlink(missing_ok=True)
                except Exception as e:
                    # Retrieve error information safely in case the exception's __str__ raises an error
                    try:
                        error_msg = str(e)
                    except:
                        error_msg = f"Error type: {type(e).__name__}"
                    
                    filename = file_map[key].get('filename', 'unknown')
                    print(f"Cleanup error for {filename}: {error_msg}")

        try:
            while completed_files < num_files:
                await asyncio.sleep(0.5)
                current_progress = {"status": "downloading", "files": []}
                completed_files = 0
                is_failed = False
                
                # Read the progress file for each download
                for key in file_map:
                    file_info = file_map[key]
                    progress_file_path = Path(DEFAULT_ASR_DIR) / f"{file_info['id']}.json"
                    
                    try:
                        # Read the progress file through asyncio.to_thread to avoid blocking the event loop
                        file_content = await asyncio.to_thread(progress_file_path.read_text)
                        data = json.loads(file_content)
                        
                        file_info.update({
                            "done": data.get("done", 0),
                            "total": data.get("total", 0),
                            "complete": data.get("complete", False),
                            "failed": data.get("failed", False),
                            "error": data.get("error", None)
                        })
                        
                        if file_info["complete"]:
                            completed_files += 1
                        if file_info["failed"]:
                            is_failed = True
                        
                    except FileNotFoundError:
                        # The task may have started before its progress file was created
                        pass
                    except json.JSONDecodeError:
                        # The progress file may be undergoing a write; skip this read
                        pass
                    except Exception as e:
                        # Catch other thread-pool or filesystem errors
                        print(f"Unexpected file read error for {file_info['filename']}: {e}")
                        
                    current_progress["files"].append({
                        "filename": file_info["filename"],
                        "done": file_info["done"],
                        "total": file_info["total"],
                        "complete": file_info["complete"],
                        "failed": file_info["failed"],
                        "error": file_info["error"]
                    })
                
                # Stream the current progress
                yield f"data: {json.dumps(current_progress)}\n\n"

                if is_failed:
                    current_progress["status"] = "failed"
                    yield f"data: {json.dumps(current_progress)}\n\n"
                    break # Exit the loop

                if completed_files == num_files:
                    current_progress["status"] = "complete"
                    yield f"data: {json.dumps(current_progress)}\n\n"
                    break # Exit the loop
                    
            # Final cleanup
            cleanup_progress_files()
            yield "data: close\n\n"

        except Exception as e:
            print(f"Streaming error: {e}")
            cleanup_progress_files()


    return StreamingResponse(event_generator(), media_type="text/event-stream")