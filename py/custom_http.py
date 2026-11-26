import aiohttp
import json

# Safely parse JSON when headers are supplied as a string
def safe_json_loads(s):
    try:
        return json.loads(s)
    except (json.JSONDecodeError, TypeError):
        return {}

async def fetch_custom_http(method, url, headers=None, body=None):
    # Process headers
    if headers is None or headers == "":
        headers = {}
    elif isinstance(headers, str):
        print(f'headers: {headers}')
        headers = safe_json_loads(headers)

    # Handle Content-Type automatically, defaulting to application/json
    content_type = headers.get('Content-Type', 'application/json')

    # Prepare request parameters
    kwargs = {
        'headers': headers,
    }

    # Choose data or json according to Content-Type
    if content_type == 'application/json':
        kwargs['json'] = body
    else:
        kwargs['data'] = body

    try:
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, **kwargs) as response:
                print(f'Status: {response.status}')
                response_text = await response.text()
                print(f'Response: {response_text}')
                return response_text
    except Exception as e:
        print(f'Error: {e}')
        return f'Error: {e}'