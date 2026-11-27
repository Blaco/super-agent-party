import json
import os
import re
import sys
from urllib.parse import urlparse
import aiohttp
from io import BytesIO
import asyncio
from urllib.parse import urlparse
from py.get_setting  import get_host,get_port,BLOCKLIST
import zipfile
# Platform detection
IS_WINDOWS = sys.platform == 'win32'
IS_MAC = sys.platform == 'darwin'

# Dynamic file-type configuration
BASE_OFFICE_EXTS = ['doc', 'docx', 'pptx', 'xls', 'xlsx', 'pdf', 'rtf', 'odt', 'epub']
PLATFORM_SPECIFIC_EXTS = {
    'win32': ['ppt'],
    'darwin': ['pages', 'numbers', 'key']
}

FILE_FILTERS = [
    { 
        'name': 'Office documents', 
        'extensions': BASE_OFFICE_EXTS + PLATFORM_SPECIFIC_EXTS.get(sys.platform, [])
    },
    { 
        'name': 'Programming and development', 
        'extensions': [
            'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
            'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss',
            'less', 'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml',
            'yaml', 'sql', 'sh'
        ]
    },
    {
        'name': 'Data and configuration',
        'extensions': ['csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml']
    }
]

office_extensions = {ext for group in FILE_FILTERS if group['name'] == 'Office documents' for ext in group['extensions']}

import socket
import ipaddress
from urllib.robotparser import RobotFileParser
from urllib.parse import urljoin

USER_AGENT = "Mozilla/5.0 (compatible; MyOpenSourceBot/1.0)"
ROBOTS_CACHE = {} # Cache robots.txt to avoid repeated requests

def is_private_ip(hostname):
    """Check for private or internal IP addresses, allowing proxy Fake-IP addresses."""
    if not hostname:
        return False
    
    try:
        # Resolve the hostname to IP addresses
        addr_info = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        
        # Standard Fake-IP range used by proxy software (198.18.0.0/15)
        fake_ip_net = ipaddress.ip_network('198.18.0.0/15')

        for item in addr_info:
            ip_str = item[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            
            # 1. Allow addresses in the proxy Fake-IP range
            if ip_obj in fake_ip_net:
                return False 
            
            # 2. Check ordinary private and loopback addresses (10.x, 172.16.x, 192.168.x, 127.x)
            if ip_obj.is_private or ip_obj.is_loopback:
                return True
                
    except Exception as e:
        # If resolution fails (such as DNS failure), leave the failure to the subsequent aiohttp request
        return False
        
    return False

def get_domain(url: str) -> str:
    return urlparse(url).netloc.lower()

async def check_robots_txt(url):
    """Check robots.txt compliance asynchronously."""
    domain = get_domain(url)

    # Check the blocklist first
    if domain in BLOCKLIST:
        return False

    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    if base_url in ROBOTS_CACHE:
        return ROBOTS_CACHE[base_url].can_fetch(USER_AGENT, url)
    
    robots_url = urljoin(base_url, "/robots.txt")
    rp = RobotFileParser()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(robots_url, timeout=5) as resp:
                if resp.status == 200:
                    text_data = await resp.text()
                    rp.parse(text_data.splitlines())
                else:
                    rp.allow_all = True
    except:
        rp.allow_all = True # Allow access by default if robots.txt cannot be retrieved
        
    ROBOTS_CACHE[base_url] = rp
    return rp.can_fetch(USER_AGENT, url)

def sanitize_url(input_url: str, default_base: str = "", endpoint: str = "",force_netloc: str = "") -> str:
    """
    General URL validation and reconstruction function
    1. Parse the URL and validate its scheme explicitly
    2. Reconstruct the URL to address SSRF taint warnings
    3. Allow internal IP addresses for compatibility with Ollama and local services
    """
    # Handle empty values
    raw_url = str(input_url or default_base).rstrip("/")
    
    # 1. Parse the URL
    parsed = urlparse(raw_url)
    
    # 2. Validate the scheme (intended to require HTTP or HTTPS)
    if not parsed.scheme or not parsed.scheme.startswith("http"):
        raise HTTPException(status_code=400, detail="Only HTTP or HTTPS URLs are supported")
    
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL hostname or IP address")
    if force_netloc:
        parsed = parsed._replace(netloc=force_netloc)

    # 3. Reconstruct the URL from parsed components
    # Assemble only the parsed components instead of using the original input string directly
    safe_base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    
    # Ensure the endpoint has the correct format
    clean_endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    final_url = f"{safe_base_url.rstrip('/')}{clean_endpoint}"

    # Log access to internal IP addresses without blocking it
    if is_private_ip(parsed.hostname):
        logger.info(f"Open-source Logic: Accessing internal service -> {final_url}")

    return final_url


async def handle_url(url):
    """Handle internal uploads and external web requests separately."""
    parsed_url = urlparse(url)
    ext = os.path.splitext(parsed_url.path)[1].lstrip('.').lower()

    # --- 1. Internal uploaded-file handling ---
    if 'uploaded_files' in parsed_url.path or 'tool_temp' in parsed_url.path:
        HOST = '127.0.0.1'
        PORT = get_port()
        
        # Use sanitize_url to replace the host and port
        target_url = sanitize_url(url,force_netloc=f"{HOST}:{PORT}")
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(target_url, timeout=10) as response:
                    response.raise_for_status()
                    return await response.read(), ext
            except Exception as e:
                raise RuntimeError(f"Failed to read internal file: {e}")

    # --- 2. External public URL retrieval ---
    else:
        # A. SSRF check (existing logic)
        if is_private_ip(parsed_url.hostname):
            raise PermissionError(f"Access denied: internal network addresses are not allowed ({parsed_url.hostname})")

        # B. robots.txt check
        if not await check_robots_txt(url):
            raise PermissionError(f"Access denied: robots.txt prohibits retrieval")

        # C. Reconstruct a new safe_url using sanitize_url
        # This separates the reconstructed value from the original input for static analysis
        safe_url = sanitize_url(url)

        # D. Perform the external request
        async with aiohttp.ClientSession() as session:
            headers = {'User-Agent': USER_AGENT}
            try:
                # Pass the reconstructed URL to the request
                async with session.get(safe_url, headers=headers, timeout=30) as response:
                    response.raise_for_status()
                    content = await response.read()
                    return content, ext
            except Exception as e:
                raise RuntimeError(f"Failed to download external URL: {e}")
                               
async def handle_local_file(file_path):
    """Handle local files asynchronously."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    loop = asyncio.get_event_loop()
    content = await loop.run_in_executor(None, _read_file, file_path)
    ext = os.path.splitext(file_path)[1].lstrip('.').lower()
    return content, ext

def _read_file(file_path):
    """Read file contents synchronously."""
    with open(file_path, 'rb') as f:
        return f.read()

async def get_content(input_str):
    """Retrieve file contents and extension."""
    if input_str.startswith(('http://', 'https://')):
        return await handle_url(input_str)
    else:
        return await handle_local_file(input_str)

def decode_text(content_bytes):
    """Decode text, including byte-order marks."""
    encodings = ['utf-8-sig', 'utf-16', 'gbk', 'iso-8859-1', 'latin-1']
    for enc in encodings:
        try:
            return content_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return content_bytes.decode('utf-8', errors='replace')

async def handle_office_document(content, ext):
    """Process office documents asynchronously with platform detection."""
    handler = {
        'pdf': handle_pdf,
        'docx': handle_docx,
        'xlsx': handle_excel,
        'xls': handle_excel,
        'rtf': handle_rtf,
        'odt': handle_odt,
        'pptx': handle_pptx,
        'epub': handle_epub,  # EPUB support
    }
    
    # Windows-specific formats
    if IS_WINDOWS:
        handler['ppt'] = handle_ppt
        handler['doc'] = handle_doc
    
    handler_func = handler.get(ext)
    
    if handler_func:
        return await handler_func(content)
    
    # macOS iWork formats
    if IS_MAC and ext in ['pages', 'numbers', 'key']:
        raise NotImplementedError(f"Automatic parsing of iWork files is not supported. Export to a common format first.")
    
    raise NotImplementedError(f"Processing {ext.upper()} files is not supported")

# EPUB handling
async def handle_epub(content):
    """Process EPUB files asynchronously."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_epub, content)

import posixpath  # Path handling for EPUB archives

def _process_epub(content):
    """Process EPUB content synchronously and return a JSON chapter structure."""
    try:
        import xml.etree.ElementTree as ET
        chapters = []
        processed_files = set()  # Track files already processed

        with BytesIO(content) as epub_file:
            with zipfile.ZipFile(epub_file, 'r') as epub_zip:
                # Parse the container file to obtain the OPF path
                container_data = epub_zip.read('META-INF/container.xml')
                container_root = ET.fromstring(container_data)
                opf_path_element = container_root.find('.//{*}rootfile')
                if opf_path_element is None:
                    raise ValueError("OPF file path not found")
                opf_path = opf_path_element.get('full-path')

                # Parse the OPF file
                opf_data = epub_zip.read(opf_path)
                opf_root = ET.fromstring(opf_data)
                opf_namespace = {'opf': 'http://www.idpf.org/2007/opf'}
                
                # Get the spine order (chapter reading order)
                spine = opf_root.find('.//opf:spine', opf_namespace)
                if spine is None:
                    raise ValueError("Spine element not found")
                itemrefs = [item.get('idref') for item in spine.findall('opf:itemref', opf_namespace)]
                
                # Build the manifest mapping (ID to file path)
                manifest = {}
                for item in opf_root.findall('.//opf:item', opf_namespace):
                    item_id = item.get('id')
                    href = item.get('href')
                    if item_id and href:
                        # Normalize paths with posixpath
                        manifest[item_id] = posixpath.normpath(href)
                
                # Directory containing the OPF file
                opf_dir = posixpath.dirname(opf_path)
                
                # Process chapters in spine order
                for item_id in itemrefs:
                    if item_id not in manifest:
                        continue
                    
                    # Join paths with posixpath
                    rel_path = manifest[item_id]
                    abs_path = posixpath.join(opf_dir, rel_path) if opf_dir else rel_path
                    abs_path = posixpath.normpath(abs_path)

                    # Find the actual filename to handle case differences
                    actual_path = None
                    for name in epub_zip.namelist():
                        if name.replace('\\', '/').lower() == abs_path.lower().replace('\\', '/'):
                            actual_path = name
                            break
                    
                    # Skip files already processed
                    if actual_path in processed_files:
                        continue
                    
                    if actual_path and actual_path in epub_zip.namelist():
                        with epub_zip.open(actual_path) as chapter_file:
                            html_data = chapter_file.read()
                            chapter_title, chapter_text = _parse_epub_chapter(html_data)
                            chapter_content = f"{chapter_title}\n\n{chapter_text}" if chapter_title else chapter_text
                            if chapter_content.strip():
                                chapters.append(chapter_content)
                            processed_files.add(actual_path)  # Mark as processed
        
        return json.dumps({"chapters": chapters}, ensure_ascii=False)
    
    except Exception as e:
        raise RuntimeError(f"EPUB parsing failed: {str(e)}")



def _parse_epub_chapter(html_data):
    """Parse a chapter and return its title and body text."""
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(html_data)
        ns = {'xhtml': 'http://www.w3.org/1999/xhtml'}
        
        # 1. Extract the title
        title = ""
        for level in range(1, 7):
            title_elem = root.find(f'.//xhtml:h{level}', ns)
            if title_elem is not None and title_elem.text:
                title = title_elem.text.strip()
                found_level = level  # Record the heading level found
                break
        else:
            found_level = 0  # No heading found
        
        # 2. Extract the body text with precise scope
        body_text = []
        
        # Approach 1: Extract the entire body (preferred)
        body_elem = root.find('.//xhtml:body', ns)
        if body_elem is not None:
            # Extract all text, including child elements
            full_text = ''.join(body_elem.itertext()).strip()
            if full_text:
                body_text.append(full_text)
        
        # 3. Filter the title if it appears in the body
        final_text = []
        for text in body_text:
            # Remove the title line if present
            cleaned = text.replace(title, '', 1).strip()
            final_text.append(cleaned if cleaned else text)
        
        return title, '\n'.join(final_text).strip()

    except ET.ParseError:
        # Fallback: regular expression processing
        html_str = html_data.decode('utf-8', errors='replace')
        title_match = re.search(r'<h[1-6][^>]*>(.*?)</h[1-6]>', html_str, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else ""
        
        # Extract the body content
        body_match = re.search(r'<body[^>]*>(.*?)</body>', html_str, re.DOTALL | re.IGNORECASE)
        body_content = body_match.group(1) if body_match else html_str
        
        # Remove all tags
        text = re.sub(r'<[^>]+>', '', body_content).strip()
        return title, text


def _extract_text_from_xml_element(element):
    """Recursively extract text from an XML element."""
    text_parts = []
    
    # Add the element text
    if element.text and element.text.strip():
        text_parts.append(element.text.strip())
    
    # Recursively process child elements
    for child in element:
        text_parts.append(_extract_text_from_xml_element(child))
    
    # Add the element's trailing text
    if element.tail and element.tail.strip():
        text_parts.append(element.tail.strip())
    
    return ' '.join(text_parts)


async def handle_odt(content):
    """Process ODT files asynchronously."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_odt, content)

def _process_odt(content):
    """Process ODT content synchronously."""
    from odf.teletype import extractText
    
    try:
        from odf import text
        from odf.opendocument import load
        doc = load(BytesIO(content))
        text_content = []
        for para in doc.getElementsByType(text.P):
            text_content.append(extractText(para))
        for table in doc.getElementsByType(text.Table):
            for row in table.getElementsByType(text.TableRow):
                row_data = []
                for cell in row.getElementsByType(text.TableCell):
                    row_data.append(extractText(cell))
                text_content.append("\t".join(row_data))
        return '\n'.join(text_content)
    except Exception as e:
        raise RuntimeError(f"ODT parsing failed: {str(e)}")

async def handle_pdf(content):
    """Process PDF files asynchronously with error handling."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_pdf, content)

def _process_pdf(content):
    """Process PDF content synchronously."""
    text = []
    try:
        from pypdf import PdfReader
        with BytesIO(content) as pdf_file:
            reader = PdfReader(pdf_file)
            for page in reader.pages:
                page_text = page.extract_text() or ""  # Handle pages without text
                text.append(page_text)
    except Exception as e:
        raise RuntimeError(f"PDF parsing failed: {str(e)}")
    return '\n'.join(text)

async def handle_docx(content):
    """Process DOCX files asynchronously."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_docx, content)

def _process_docx(content):
    """Process DOCX content synchronously, including tables."""
    from docx import Document
    doc = Document(BytesIO(content))
    text = []
    for para in doc.paragraphs:
        text.append(para.text)
    for table in doc.tables:
        for row in table.rows:
            text.append('\t'.join(cell.text for cell in row.cells))
    return '\n'.join(text)

async def handle_excel(content):
    """Process Excel files asynchronously, optimized for large files."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_excel, content)

def _process_excel(content):
    """Process Excel content synchronously, supporting multiple sheets and XLSX/XLS."""
    text_content = []
    
    # 1. Try openpyxl first (for .xlsx and .xlsm)
    try:
        from openpyxl import load_workbook
        # data_only=True reads cached formula values rather than formulas
        wb = load_workbook(filename=BytesIO(content), read_only=True, data_only=True)
        
        for sheet in wb:
            # Add the sheet name as a separator
            sheet_data = [f"=== Sheet: {sheet.title} ==="]
            
            # Check whether the sheet is hidden (may be included or omitted as needed)
            if sheet.sheet_state == 'hidden':
                continue

            row_count = 0
            for row in sheet.iter_rows(values_only=True):
                # Skip entirely falsey rows
                if not any(row):
                    continue
                
                # Convert cell values to text, using an empty string for None
                row_text = '\t'.join(str(cell) if cell is not None else '' for cell in row)
                sheet_data.append(row_text)
                row_count += 1
            
            # Add the sheet only if it contains data rows
            if row_count > 0:
                text_content.append('\n'.join(sheet_data))
                
        return '\n\n'.join(text_content)

    except Exception as e_xlsx:
        # 2. If openpyxl fails (often for .xls files), try xlrd
        try:
            import xlrd
            # log: print(f"openpyxl parsing failed; trying xlrd: {e_xlsx}")
            
            # formatting_info=True can fail for some complex files; False is more robust
            wb = xlrd.open_workbook(file_contents=content, formatting_info=False)
            
            for sheet in wb.sheets():
                sheet_data = [f"=== Sheet: {sheet.name} ==="]
                
                if sheet.nrows == 0:
                    continue
                    
                for row_idx in range(sheet.nrows):
                    row = sheet.row_values(row_idx)
                    # xlrd may represent dates as floats; use xldate_as_tuple for precise date conversion if needed
                    row_text = '\t'.join(str(cell) for cell in row)
                    if row_text.strip():
                        sheet_data.append(row_text)
                
                text_content.append('\n'.join(sheet_data))
                
            return '\n\n'.join(text_content)
            
        except ImportError:
            raise RuntimeError(f"The file may be in XLS format, but xlrd is not installed. Install the project-compatible xlrd dependency (newer xlrd versions support XLS but not XLSX).")
        except Exception as e_xls:
            # If both libraries fail, raise a combined exception
            raise RuntimeError(f"Excel parsing failed. XLSX error: {e_xlsx}; XLS error: {e_xls}")

async def handle_rtf(content):
    """Process RTF files asynchronously."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_rtf, content)

def _process_rtf(content):
    """Process RTF content synchronously."""
    try:
        from striprtf.striprtf import rtf_to_text
        return rtf_to_text(content.decode('utf-8', errors='replace'))
    except Exception as e:
        raise RuntimeError(f"RTF parsing failed: {str(e)}")

async def handle_pptx(content):
    """Process PPTX files asynchronously with optimized content extraction."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_pptx, content)

def _process_pptx(content):
    """Process PPTX content synchronously."""
    try:
        from pptx import Presentation
        prs = Presentation(BytesIO(content))
        text = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    text.append(shape.text.strip())
                if shape.has_table:
                    for row in shape.table.rows:
                        row_data = [cell.text_frame.text.strip() for cell in row.cells]
                        text.append("\t".join(row_data))
        return '\n'.join(filter(None, text))
    except Exception as e:
        raise RuntimeError(f"PPTX parsing failed: {str(e)}")

async def handle_ppt(content):
    """Process PPT files (Windows only)."""
    if not IS_WINDOWS:
        raise NotImplementedError("PPT processing is supported only on Windows")
    
    try:
        import win32com.client
    except ImportError:
        raise RuntimeError("Install the pywin32 dependency: pip install pywin32")
    
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_ppt, content)

def _process_ppt(content):
    """Process PPT content synchronously using Windows COM."""
    import win32com.client
    import tempfile
    import pythoncom

    pythoncom.CoInitialize()
    try:
        with tempfile.NamedTemporaryFile(suffix='.ppt', delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        powerpoint = win32com.client.Dispatch("PowerPoint.Application")
        pres = powerpoint.Presentations.Open(tmp_path)
        text = []
        for slide in pres.Slides:
            for shape in slide.Shapes:
                if shape.HasTextFrame:
                    text.append(shape.TextFrame.TextRange.Text.strip())
        pres.Close()
        powerpoint.Quit()
        return '\n'.join(filter(None, text))
    except Exception as e:
        raise RuntimeError(f"PPT parsing failed: {str(e)}")
    finally:
        pythoncom.CoUninitialize()
        os.unlink(tmp_path)

# 2. Implement the handle_doc function
async def handle_doc(content):
    if not IS_WINDOWS:
        raise NotImplementedError("DOC processing is supported only on Windows")
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_doc, content)

def _process_doc(content):
    import win32com.client
    import tempfile
    import pythoncom
    
    pythoncom.CoInitialize()
    try:
        with tempfile.NamedTemporaryFile(suffix='.doc', delete=False) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
            
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        doc = word.Documents.Open(tmp_path)
        text = doc.Range().Text
        doc.Close()
        word.Quit()
        return text.strip()
    except Exception as e:
        raise RuntimeError(f"DOC parsing failed: {str(e)}")
    finally:
        pythoncom.CoUninitialize()
        if 'tmp_path' in locals():
            os.unlink(tmp_path)

async def get_file_content(file_url):
    """Retrieve file content asynchronously with encoding error handling."""
    try:
        content, ext = await get_content(file_url)
        if ext in office_extensions:
            return await handle_office_document(content, ext)
        return decode_text(content)
    except Exception as e:
        return f"File parsing error: {str(e)}"

async def get_files_content(files_path_list):
    """Retrieve and combine file contents asynchronously, isolating errors."""
    tasks = [get_file_content(fp) for fp in files_path_list]
    contents = await asyncio.gather(*tasks, return_exceptions=True)
    results = []
    for fp, content in zip(files_path_list, contents):
        if isinstance(content, Exception):
            results.append(f"Failed to parse file {fp}: {str(content)}")
        else:
            results.append(f"File {fp} contents:\n{content}")
    return "\n\n".join(results)

async def get_files_json(files_list):
    """Retrieve file contents asynchronously as JSON, isolating errors.
    Input:
    files_list: [{'path': 'path/to/file', 'name': 'file_name'}]
    """
    tasks = [get_file_content(files["path"]) for files in files_list]
    contents = await asyncio.gather(*tasks, return_exceptions=True)
    results = []
    for files, content in zip(files_list, contents):
        results.append({"file_path": files["path"],"file_name": files["name"], "content": str(content)})
    return results

ALLOWED_EXTENSIONS = [
  # Office documents
    'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'pages', 
    'numbers', 'key', 'rtf', 'odt', 'epub',
  
  # Programming and development
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
  'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss', 'less',
  'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml', 'yaml', 
  'sql', 'sh',
  
  # Data and configuration
  'csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml'
]

ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

file_tool = {
    "type": "function",
    "function": {
        "name": "get_file_content",
        "description": f"Retrieve content from a file URL, either public or internal. Internal file URLs are limited to uploaded files and cached tool results. Use a tool result URL to retrieve its cached content. Supported formats: {', '.join(ALLOWED_EXTENSIONS)}",
        "parameters": {
            "type": "object",
            "properties": {
                "file_url": {
                    "type": "string",
                    "description": "File URL or cached tool result URL",
                }
            },
            "required": ["file_url"],
        },
    },
}

image_tool = {
    "type": "function",
    "function": {
        "name": "get_image_content",
        "description": f"Retrieve content from an image URL, either public or an internal uploaded image URL. Supported formats: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}",
        "parameters": {
            "type": "object",
            "properties": {
                "image_url": {
                    "type": "string",
                    "description": "Image URL",
                }
            },
            "required": ["image_url"],
        },
    },
}

from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

