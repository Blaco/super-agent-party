import base64
import os
import re

import requests
from py.get_setting import load_settings,get_host,get_port,UPLOAD_FILES_DIR
from openai import AsyncClient
import uuid

from py.llm_tool import get_image_base64, get_image_media_type
async def pollinations_image(prompt: str, width=512, height=512, model="flux"):
    settings = await load_settings()
    
    # Check if the provided values are default ones, if so, override them with settings
    if width == 512:
        width = settings["text2imgSettings"]["pollinations_width"]
    if height == 512:
        height = settings["text2imgSettings"]["pollinations_height"]
    if model == "flux":
        model = settings["text2imgSettings"]["pollinations_model"]
    
    # Convert prompt into a URL-compatible format
    prompt = prompt.replace(" ", "%20")
    url = f"https://image.pollinations.ai/prompt/{prompt}?width={width}&height={height}&model={model}&nologo=true&enhance=true&private=true&safe=true"
    res_data = requests.get(url).content
    image_id = str(uuid.uuid4())
    # Save the image in UPLOAD_FILES_DIR using image_id as the filename and return the local path
    with open(f"{UPLOAD_FILES_DIR}/{image_id}.png", "wb") as f:
        f.write(res_data)
    return f"![image]({url})"

pollinations_image_tool = {
    "type": "function",
    "function": {
        "name": "pollinations_image",
        "description": "Generate an image using an English prompt and return its Markdown image link. Send the original Markdown directly to the user so the image is visible.\nUse Markdown image syntax for the URL, for example:\n\n![Image name](image URL)\n\nPlace the image Markdown on a separate line.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "English image generation prompt, for example: A red fox in a snowy forest. Include descriptive details for better results.",
                },
                "width": {
                    "type": "number",
                    "description": "Image width",
                    "default":512
                },
                "height": {
                    "type": "number",
                    "description": "Image height",
                    "default": 512
                },
                "model": {
                    "type": "string",
                    "description": "Model to use",
                    "default": "flux",
                    "enum": ["flux", "turbo"],
                }
            },
            "required": ["prompt"],
        },
    },
}

async def openai_image(prompt: str, size="auto"):
    settings = await load_settings()

    # Check if the provided values are default ones, if so, override them with settings
    if size == "auto":
        size = settings["text2imgSettings"]["size"]

    model = settings["text2imgSettings"]["model"]

    base_url = settings["text2imgSettings"]["base_url"]
    api_key = settings["text2imgSettings"]["api_key"]
    try:
        client = AsyncClient(api_key=api_key,base_url=base_url)
    
        response = await client.images.generate(prompt=prompt, size=size, model=model)
    except Exception as e:
        print(e)
        return f"ERROR: {e}"
    
    res_url = response.data[0].url
    res = f"![image]({res_url})"
    print(res)
    if res_url is None:
        res = response.data[0].b64_json
        HOST = get_host()
        if HOST == '0.0.0.0':
            HOST = '127.0.0.1'
        PORT = get_port()
        image_id = str(uuid.uuid4())
        # Save the image in UPLOAD_FILES_DIR using image_id as the filename and return the local path
        with open(f"{UPLOAD_FILES_DIR}/{image_id}.png", "wb") as f:
            f.write(base64.b64decode(res))
        res = f"![image](http://{HOST}:{PORT}/uploaded_files/{image_id}.png)"
    else:
        res_data = requests.get(res_url).content
        image_id = str(uuid.uuid4())
        # Save the image in UPLOAD_FILES_DIR using image_id as the filename and return the local path
        with open(f"{UPLOAD_FILES_DIR}/{image_id}.png", "wb") as f:
            f.write(res_data)
    return res
        
openai_image_tool = {
    "type": "function",
    "function": {
        "name": "openai_image",
        "description": "Generate an image using an English prompt and return its Markdown image link. Send the original Markdown directly to the user so the image is visible.\nUse Markdown image syntax for the URL, for example:\n\n![Image name](image URL)\n\nPlace the image Markdown on a separate line.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "English image generation prompt, for example: A red fox in a snowy forest. Include descriptive details for better results.",
                },
                "size": {
                    "type": "string",
                    "description": "Image size, defaults to auto",
                    "default": "auto", 
                    "enum": ["auto","1024x1024", "1536x1024", "1024x1536", "256x256", "512x512", "1792x1024", "1024x1792"],
                }
            },
            "required": ["prompt"],
        },
    },
}

def process_image_content(text):
    # Match Markdown image syntax ![]() using a regular expression
    pattern = r'!\[.*?\]\((.*?)\)'
    
    def replace_match(match):
        content = match.group(1)
        
        # Check whether the data is base64-encoded
        if content.startswith('data:image'):
            # Extract base64 data from the data:image/xxx;base64, payload format
            base64_data = content.split(',', 1)[1]
            HOST = get_host()
            if HOST == '0.0.0.0':
                HOST = '127.0.0.1'
            PORT = get_port()
            image_id = str(uuid.uuid4())
            
            # Ensure the upload directory exists
            os.makedirs(UPLOAD_FILES_DIR, exist_ok=True)
            
            # Save the image locally
            file_path = f"{UPLOAD_FILES_DIR}/{image_id}.png"
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(base64_data))
            
            # Return the new image link
            return f"![image](http://{HOST}:{PORT}/uploaded_files/{image_id}.png)"
        else:
            # Return the original content unchanged for ordinary URLs
            return match.group(0)
    
    # Replace matches using re.sub
    result = re.sub(pattern, replace_match, text)
    return result


# Helper: safely read object attributes or dictionary keys
def get_attr_or_key(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


# ==========================================
# 2. Conversational image generation with modalities support
# ==========================================
async def openai_chat_image(prompt: str, img_url_list: list = []):
    settings = await load_settings()

    model = settings["text2imgSettings"]["model"]
    content = ""
    base_url = settings["text2imgSettings"]["base_url"]
    api_key = settings["text2imgSettings"]["api_key"]
    try:
        client = AsyncClient(api_key=api_key, base_url=base_url)
        if img_url_list:
            content = []
            for img_url in img_url_list:
                if img_url.startswith("http"):
                    base64_image = await get_image_base64(img_url)
                    media_type = await get_image_media_type(img_url)
                    img_url = f"data:{media_type};base64,{base64_image}"
                content.append({"type": "image_url", "image_url": {"url": img_url}})
            content.append({"type": "text", "text": prompt})
        else:
            content = prompt

        # Try the modalities parameter first
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": content
                    }
                ],
                extra_body={"modalities": ["image", "text"]}
            )
        except Exception as e:
            err_msg = str(e).lower()
            # Fall back to a standard call if the model or older API does not support modalities
            if "modalities" in err_msg or "extra parameters" in err_msg or "unsupported" in err_msg or "400" in err_msg:
                response = await client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "user",
                            "content": content
                        }
                    ]
                )
            else:
                raise e

    except Exception as e:
        print(e)
        return f"ERROR: {e}"
    
    res = ""
    if response:
        choice = response.choices[0]
        message = choice.message
        
        # 1. Extract the base text content
        res_text = get_attr_or_key(message, 'content') or ""
        
        # 2. Handle native images generated through modalities and stored in the images array
        # Wrap the images in Markdown syntax and append them to the text
        images_field = get_attr_or_key(message, 'images')
        if images_field and isinstance(images_field, list):
            for img in images_field:
                img_type = get_attr_or_key(img, 'type')
                if img_type == 'image_url':
                    img_url_obj = get_attr_or_key(img, 'image_url')
                    if img_url_obj:
                        url_str = get_attr_or_key(img_url_obj, 'url')
                        if url_str:
                            # Append to the text for subsequent regular-expression processing
                            res_text += f"\n\n![image]({url_str})"

        # 3. Use process_image_content to save images locally and replace URLs
        res = process_image_content(res_text)
        
    return res
        
openai_chat_image_tool = {
    "type": "function",
    "function": {
        "name": "openai_chat_image",
        "description": "Generate or edit an image using an English prompt and return its Markdown image link. Send the original Markdown directly to the user so the image is visible.\nUse Markdown image syntax for the URL, for example:\n\n![Image name](image URL)\n\nPlace the image Markdown on a separate line.",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "English image generation or editing prompt, for example: `A red fox in a snowy forest` or `Change the sky to a clear blue`. Include descriptive details for better results.",
                },
                "img_url_list": {
                    "type": "array",
                    "description": "Optional image URLs for editing. Each list item must be an image URL, either a local uploaded image such as http://127.0.0.1:3456/1.jpg or a public image URL.",
                },
            },
            "required": ["prompt"],
        },
    },
}