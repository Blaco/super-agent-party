import base64
import logging
import os
import random
import re
import tempfile
import time

import requests
from py.get_setting import UPLOAD_FILES_DIR, load_settings


async def upload_image_host(url):
    settings = await load_settings()
    # Check whether image hosting is enabled
    if not settings["BotConfig"]["imgHost_enabled"]:
        return url
    
    # Handle local file uploads
    if 'uploaded_files' in url:
        file_name = url.split("/")[-1]
        file_path = os.path.join(UPLOAD_FILES_DIR, file_name)
        return await _upload_file(settings, file_path)
    
    # Handle external URL uploads
    try:
        # Download the image to a temporary file
        response = requests.get(url, stream=True, timeout=10)
        if response.status_code != 200:
            logging.error(f"Image download failed: HTTP {response.status_code} - {url}")
            return url
        
        # Get the content type and extension
        content_type = response.headers.get('Content-Type', '')
        ext_map = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg',
        }
        ext = ext_map.get(content_type.split(';')[0], '.bin')
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(
            suffix=ext, 
            dir=UPLOAD_FILES_DIR,
            delete=False
        ) as tmp_file:
            for chunk in response.iter_content(chunk_size=8192):
                tmp_file.write(chunk)
            file_path = tmp_file.name
        
        logging.info(f"Downloaded external image to temporary file: {file_path}")
        return await _upload_file(settings, file_path)
    
    except Exception as e:
        logging.error(f"External image processing error: {str(e)}")
        return url

async def _upload_file(settings, file_path):
    """Internal helper that performs the upload."""
    # Ensure the file exists
    if not os.path.exists(file_path):
        logging.error(f"File not found: {file_path}")
        return f"File not found: {file_path}"
    
    file_name = os.path.basename(file_path)
    is_temp_file = 'tmp' in file_path  # Identify a temporary file
    
    try:

        # EasyImage hosting
        if settings["BotConfig"]["imgHost"] == "easyImage2":
            EI2_url = settings["BotConfig"]["EI2_base_url"]
            EI2_token = settings["BotConfig"]["EI2_api_key"]
            
            with open(file_path, "rb") as f:
                files = {"image": (file_name, f)}
                data = {"token": EI2_token}
                response = requests.post(EI2_url, data=data, files=files)
            
            if response.status_code == 200:
                return response.json().get("url")
            else:
                logging.error(f"EasyImage upload failed: {response.status_code}")
                return f"EasyImage upload failed: {response.status_code}"

        # Unknown image host type
        else:
            logging.warning(f"Unknown image host type: {settings['BotConfig']['imgHost']}")
            return f"Unknown image host type: {settings['BotConfig']['imgHost']}"
    
    except Exception as e:
        logging.error(f"Image hosting upload error: {str(e)}")
        return f"Image hosting upload error: {str(e)}"
    
    finally:
        # Clean up temporary files
        if is_temp_file and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logging.info(f"Removed temporary file: {file_path}")
            except Exception as e:
                logging.error(f"Failed to remove temporary file: {str(e)}")