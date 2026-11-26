import asyncio
import json
import os
import time
from bs4 import BeautifulSoup
import requests
from py.get_setting import load_settings
from py.load_files import check_robots_txt

async def DDGsearch(query):
    from langchain_community.tools import DuckDuckGoSearchResults
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['duckduckgo_max_results'] or 10
        try:
            dds = DuckDuckGoSearchResults(num_results=max_results,output_format="json")
            results = dds.invoke(query)
            return results
        except Exception as e:
            print(f"An error occurred: {e}")
            return ""

    try:
        # 使用默认executor在单独线程中执行同步操作
        return await asyncio.get_event_loop().run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Event loop error: {e}")
        return ""
    
duckduckgo_tool = {
    "type": "function",
    "function": {
        "name": "DDGsearch",
        "description": f"Search public web information through DuckDuckGo.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords separated by spaces.",
                },
            },
            "required": ["query"],
        },
    },
}

async def searxng(query,categories="general"):
    settings = await load_settings()
    def sync_search(query):
        max_results = settings['webSearch']['searxng_max_results'] or 10
        api_url = settings['webSearch']['searxng_url'] or "http://127.0.0.1:8080"
        engines = settings['webSearch']['searxng_engines'] or None
        is_select = settings['webSearch']['searxng_is_select'] or False
        headers = {"User-Agent": "Mozilla/5.0"}
        params = {
            "q": query, 
            "categories": categories,
            "count": max_results
        }
        if engines and is_select:
            params["engines"] = engines

        try:
            response = requests.get(api_url + "/search", headers=headers, params=params)
            html_content = response.text

            soup = BeautifulSoup(html_content, 'html.parser')
            results = []

            for result in soup.find_all('article', class_='result'):
                title = result.find('h3').get_text() if result.find('h3') else 'No title'
                
                # 修复：使用正确的选择器
                link_elem = result.find('a', class_='url_header')
                if not link_elem:
                    # 备用方案：从h3内的链接获取
                    h3 = result.find('h3')
                    link_elem = h3.find('a') if h3 else None
                
                link = link_elem['href'] if link_elem and link_elem.get('href') else 'No link'
                
                snippet = result.find('p', class_='content').get_text() if result.find('p', class_='content') else 'No snippet'
                
                results.append({
                    'title': title,
                    'link': link,
                    'snippet': snippet
                })

            return json.dumps(results, indent=2, ensure_ascii=False)
            
        except Exception as e:
            print(f"Search error: {e}")
            return f"Search error: {e}"

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search, query)
    except Exception as e:
        print(f"Async error: {e}")
        return f"Async error: {e}"

searxng_tool = {
    "type": "function",
    "function": {
        "name": "searxng",
        "description": "Search public information using the open-source SearXNG metasearch engine.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search terms; natural-language and multiple-keyword queries supported.",
                },
                "categories": {
                    "type": "string",
                    "description": "Choose a category matching the user's request: general (default), news, images, videos, it (programming and technology), or science (scientific literature).",
                    "enum": ["general", "news", "images", "videos", "it", "science"],
                    "default": "general"
                },
            },
            "required": ["query"],
        },
    },
}

async def Tavily_search(query):
    from tavily import TavilyClient
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['tavily_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('tavily_api_key', "")
            client = TavilyClient(api_key)
            response = client.search(
                query=query,
                max_results=max_results
            )
            return json.dumps(response, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Tavily search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""

tavily_tool = {
    "type": "function",
    "function": {
        "name": "Tavily_search",
        "description": "Search the public web through Tavily, including recent information and research.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or natural-language search query",
                }
            },
            "required": ["query"],
        },
    },
}
from langchain_google_community import GoogleSearchAPIWrapper

async def Google_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['google_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('google_api_key', "")
            google_cse_id = settings['webSearch'].get('google_cse_id', "")
            client = GoogleSearchAPIWrapper(google_api_key=api_key,google_cse_id=google_cse_id)
            response = client.results(query=query,num_results=max_results)
            return json.dumps(response, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Google search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""


google_tool = {
    "type": "function",
    "function": {
        "name": "Google_search",
        "description": "Search the web through Google's search API.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or natural-language search query",
                }
            },
            "required": ["query"],
        }
    }
}

from langchain_community.tools import BraveSearch

async def Brave_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['brave_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('brave_api_key', "")
            client = BraveSearch.from_api_key(api_key=api_key, search_kwargs={"count": max_results})
            response = client.run(query)
            return response
        except Exception as e:
            print(f"Brave search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""
    
brave_tool = {
    "type": "function",
    "function": {
        "name": "Brave_search",
        "description": "Search the web through Brave Search.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or natural-language search query",
                }
            },
            "required": ["query"],
        },
    }
}

from langchain_exa import ExaSearchResults
async def Exa_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['exa_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('exa_api_key', "")
            client = ExaSearchResults(exa_api_key=api_key)
            response = client._run(
                query=query,
                num_results=max_results,
            )
            # 判断repose的类型
            if type(response) == list or type(response) == dict:
                return json.dumps(response, indent=2, ensure_ascii=False)
            elif type(response) == str:
                return response
        except Exception as e:
            print(f"Exa search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""

exa_tool = {
    "type": "function", 
    "function": {
        "name": "Exa_search",
        "description": "Search the web through Exa Search.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or natural-language search query",
                }
            },
            "required": ["query"],
            }
    }
}

from langchain_community.utilities import GoogleSerperAPIWrapper

async def Serper_search(query):
    settings = await load_settings()
    def sync_search():
        max_results = settings['webSearch']['serper_max_results'] or 10
        try:
            api_key = settings['webSearch'].get('serper_api_key', "")
            client = GoogleSerperAPIWrapper(serper_api_key=api_key,k=max_results)
            response = client.results(query)
            return json.dumps(response, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Serper search error: {e}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return ""
    
serper_tool = {
    "type": "function",
    "function": {
        "name": "Serper_search",
        "description": "Search the web through Serper.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or natural-language search query",
                }
            },
            "required": ["query"],
        },
    }
}

async def jina_crawler(original_url):
    settings = await load_settings()
    jina_api_key = settings['webSearch'].get('jina_api_key', "")
    if os.environ.get("IS_STEAM_BUILD", "0") == "1" and not jina_api_key.strip():
        return "Jina API key not configured. Enter it in settings."
    def sync_crawler():
        detail_url = "https://r.jina.ai/"
        url = f"{detail_url}{original_url}"
        try:
            jina_api_key = settings['webSearch'].get('jina_api_key', "")
            if jina_api_key:
                headers = {
                    'Authorization': f'Bearer {jina_api_key}',
                }
                response = requests.get(url, headers=headers)
            else:
                response = requests.get(url)
            if response.status_code == 200:
                return response.text
            else:
                return f"Failed to retrieve {original_url}: HTTP {response.status_code}"
        except requests.RequestException as e:
            return f"Failed to retrieve {original_url}: {str(e)}"

    try:
        if not await check_robots_txt(original_url):
            raise PermissionError(f"Access denied: target site forbids crawling")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_crawler)
    except Exception as e:
        print(f"Async execution error: {e}")
        return str(e)

jina_crawler_tool = {
    "type": "function",
    "function": {
        "name": "jina_crawler",
        "description": "Read the specified public webpage via Jina AI. The user or a search engine may supply the URL. Never pass localhost or private-network URLs to this external reader.",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "Original URL to retrieve.",
                },
            },
            "required": ["original_url"],
        },
    },
}

class Crawl4AiTester:
    def __init__(self, base_url: str = "http://localhost:11235"):
        self.base_url = base_url

    def submit_and_wait(self, request_data: dict,headers: dict = None, timeout: int = 300) -> dict:
        # Submit crawl job
        response = requests.post(f"{self.base_url}/crawl", json=request_data,headers=headers)
        task_id = response.json()["task_id"]
        print(f"Task ID: {task_id}")

        # Poll for result
        start_time = time.time()
        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"Task {task_id} timeout")

            result = requests.get(f"{self.base_url}/task/{task_id}",headers=headers)
            status = result.json()

            if status["status"] == "completed":
                return status

            time.sleep(2)

async def Crawl4Ai_search(original_url):
    settings = await load_settings()
    def sync_search():
        try:
            tester = Crawl4AiTester()
            api_key = settings['webSearch'].get('Crawl4Ai_api_key', "test_api_code")
            headers = {"Authorization": f"Bearer {api_key}"} if api_key else None
            request = {
                "urls": original_url,
                "priority": 10
            }
            result = tester.submit_and_wait(request, headers=headers)
            return result['result']['markdown']
        except Exception as e:
            return f"Failed to retrieve {original_url}: {str(e)}"

    try:
        if not await check_robots_txt(original_url):
            raise PermissionError(f"Access denied: target site forbids crawling")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Async execution error: {e}")
        return str(e)

Crawl4Ai_tool = {
    "type": "function",
    "function": {
        "name": "Crawl4Ai_search",
        "description": "Read a webpage through Crawl4AI and return Markdown.",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "Target URL to retrieve.",
                }
            },
            "required": ["original_url"],
        },
    },
}

from typing import Optional, Dict, Any

# ============== 2. Firecrawl ==============

class FirecrawlClient:
    """
    Firecrawl API 客户端
    支持官方API和自部署实例
    """
    
    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Content-Type': 'application/json',
        }
        if api_key:
            self.headers['Authorization'] = f'Bearer {api_key}'
    
    def _get_api_path(self, endpoint: str) -> str:
        """根据基础URL自动判断API版本路径"""
        if '/v2/' in self.base_url:
            # 官方API v2
            return f"{self.base_url}/{endpoint}"
        elif '/v1/' in self.base_url:
            # 自部署通常是v1
            return f"{self.base_url}/{endpoint}"
        else:
            # 默认追加路径
            return f"{self.base_url}/{endpoint}"
    
    def scrape(self, url: str, formats: list = None, **kwargs) -> Dict[str, Any]:
        """
        单页面抓取 (Scrape)
        """
        formats = formats or ["markdown"]
        endpoint = self._get_api_path("scrape")
        
        payload = {
            "url": url,
            "formats": formats,
            **kwargs
        }
        
        response = requests.post(
            endpoint,
            headers=self.headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json()
    
    def crawl(self, url: str, limit: int = 10, **kwargs) -> str:
        """
        整站爬取 (Crawl) - 异步作业，需要轮询
        """
        # 提交爬取任务
        submit_endpoint = self._get_api_path("crawl")
        payload = {
            "url": url,
            "limit": limit,
            **kwargs
        }
        
        submit_resp = requests.post(
            submit_endpoint,
            headers=self.headers,
            json=payload,
            timeout=30
        )
        submit_resp.raise_for_status()
        job_data = submit_resp.json()
        
        if not job_data.get("success"):
            raise Exception(f"Failed to submit crawl job: {job_data}")
        
        job_id = job_data.get("id")
        check_url = job_data.get("url") or f"{self.base_url}/crawl/{job_id}"
        
        # 轮询等待完成
        max_wait = 300  # 5分钟超时
        interval = 2
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            status_resp = requests.get(
                check_url,
                headers=self.headers,
                timeout=30
            )
            status_resp.raise_for_status()
            status_data = status_resp.json()
            
            if status_data.get("status") == "completed":
                return status_data
            elif status_data.get("status") == "failed":
                raise Exception(f"Crawl job failed: {status_data.get('error', 'Unknown error')}")
            
            time.sleep(interval)
        
        raise TimeoutError(f"Crawl job {job_id} timeout after {max_wait}s")
    
    def search(self, query: str, limit: int = 5, scrape_options: dict = None) -> Dict[str, Any]:
        """
        搜索 (Search)
        """
        endpoint = self._get_api_path("search")
        
        payload = {
            "query": query,
            "limit": limit
        }
        if scrape_options:
            payload["scrapeOptions"] = scrape_options
        
        response = requests.post(
            endpoint,
            headers=self.headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json()
    
    def map(self, url: str, search: str = None) -> Dict[str, Any]:
        """
        网站地图 (Map)
        """
        endpoint = self._get_api_path("map")
        
        payload = {"url": url}
        if search:
            payload["search"] = search
        
        response = requests.post(
            endpoint,
            headers=self.headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        return response.json()


async def firecrawl_search(original_url: str, query: str = None) -> str:
    """
    Firecrawl 主函数
    支持多种模式：scrape(单页), crawl(整站), search(搜索), map(地图)
    """
    settings = await load_settings()
    
    def sync_crawler():
        try:
            # 获取配置
            base_url = settings['webSearch'].get('firecrawl_url', 'https://api.firecrawl.dev/v2')
            api_key = settings['webSearch'].get('firecrawl_api_key', '')
            mode = settings['webSearch'].get('firecrawl_mode', 'scrape')
            
            # 初始化客户端
            client = FirecrawlClient(base_url, api_key)
            
            # 根据模式执行不同操作
            if mode == 'scrape':
                # 单页抓取
                result = client.scrape(
                    original_url,
                    formats=["markdown", "html"],
                    onlyMainContent=True  # 只获取主要内容
                )
                
                if result.get("success") and result.get("data"):
                    data = result["data"]
                    markdown = data.get("markdown", "")
                    metadata = data.get("metadata", {})
                    title = metadata.get("title", "Untitled page")
                    
                    return f"# {title}\n\n{markdown}"
                else:
                    return f"Firecrawl scraping failed: {result.get('error', 'Unknown error')}"
            
            elif mode == 'crawl':
                # 整站爬取
                result = client.crawl(
                    original_url,
                    limit=10,  # 限制页面数避免过长
                    scrapeOptions={
                        "formats": ["markdown"],
                        "onlyMainContent": True
                    }
                )
                
                if result.get("status") == "completed":
                    pages = result.get("data", [])
                    total = result.get("total", 0)
                    
                    content_parts = [f"# Crawl results\n\nRetrieved {total} pages:\n"]
                    
                    for i, page in enumerate(pages[:5], 1):  # 最多显示5页
                        md = page.get("markdown", "")
                        meta = page.get("metadata", {})
                        title = meta.get("title", f"Page {i}")
                        url = meta.get("sourceURL", original_url)
                        
                        content_parts.append(f"\n## {title}\n{md[:2000]}...\n[Source]({url})")
                    
                    return "\n".join(content_parts)
                else:
                    return f"Firecrawl crawling failed: {result.get('error', 'Unknown error')}"
            
            elif mode == 'search':
                # 搜索模式 - 当传入的是查询词而非URL时
                search_query = query or original_url  # 如果没有单独提供query，将URL作为查询词
                result = client.search(
                    search_query,
                    limit=5,
                    scrape_options={"formats": ["markdown"]}
                )
                
                if result.get("success") and result.get("data"):
                    items = result["data"]
                    content_parts = [f"# Search results: {search_query}\n"]
                    
                    for i, item in enumerate(items, 1):
                        title = item.get("title", "Untitled")
                        url = item.get("url", "")
                        desc = item.get("description", "")
                        markdown = item.get("markdown", "")
                        
                        content_parts.append(f"\n## {i}. {title}\n{desc}\n")
                        if markdown:
                            content_parts.append(f"{markdown[:1500]}...")
                        content_parts.append(f"[Source]({url})")
                    
                    return "\n".join(content_parts)
                else:
                    return f"Firecrawl search failed: {result.get('error', 'Unknown error')}"
            
            elif mode == 'map':
                # 网站地图模式
                result = client.map(original_url)
                
                if result.get("success") and result.get("links"):
                    links = result["links"]
                    content_parts = [f"# Sitemap: {original_url}\n\nFound {len(links)} links:\n"]
                    
                    for link in links[:20]:  # 限制显示数量
                        title = link.get("title", "Untitled")
                        url = link.get("url", "")
                        desc = link.get("description", "")
                        content_parts.append(f"- [{title}]({url}) - {desc}")
                    
                    return "\n".join(content_parts)
                else:
                    return f"Firecrawl sitemap generation failed: {result.get('error', 'Unknown error')}"
            
            else:
                return f"Unknown Firecrawl mode: {mode}"
                
        except requests.RequestException as e:
            return f"Firecrawl request failed: {str(e)}"
        except Exception as e:
            return f"Firecrawl processing failed: {str(e)}"

    try:
        # Firecrawl自部署版本通常不需要检查robots.txt（由服务内部处理）
        # 但官方API版本建议保留检查
        settings = await load_settings()
        base_url = settings['webSearch'].get('firecrawl_url', '')
        
        # 如果是官方API，检查robots.txt
        if 'api.firecrawl.dev' in base_url:
            if not await check_robots_txt(original_url):
                raise PermissionError(f"Access denied: target site forbids crawling")
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_crawler)
    except Exception as e:
        print(f"Async execution error: {e}")
        return str(e)


firecrawl_tool = {
    "type": "function",
    "function": {
        "name": "firecrawl_search",
        "description": "Retrieve webpages via Firecrawl, including scraping, crawling, search and sitemap modes. Supports JavaScript-rendered pages and returns structured Markdown.",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "URL to process or search query in search mode.",
                },
                "query": {
                    "type": "string",
                    "description": "Optional search-mode query. Defaults to original_url.",
                }
            },
            "required": ["original_url"],
        },
    },
}

from bs4 import BeautifulSoup
import re

async def simple_fetch(url):
    """
    改进的网页抓取工具，返回结构化的清洗后内容
    支持抓取内网和外网页面
    """
    def sync_fetch():
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 200:
                return response.text
            else:
                return None, f"Failed to retrieve {url}: HTTP {response.status_code}"
        except requests.RequestException as e:
            return None, f"Failed to retrieve {url}: {str(e)}"
    
    def clean_and_extract(html_content):
        """提取并清洗HTML内容，返回结构化数据"""
        if not html_content:
            return None
        
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 移除不需要的标签
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']):
            tag.decompose()
        
        structured_content = {
            'title': '',
            'sections': []
        }
        
        # 提取页面标题
        title_tag = soup.find('title')
        if title_tag:
            structured_content['title'] = title_tag.get_text().strip()
        
        # 提取主要内容区域（优先查找main, article, 或id/class包含content的div）
        main_content = soup.find('main') or soup.find('article') or \
                      soup.find('div', {'id': re.compile(r'content|main', re.I)}) or \
                      soup.find('div', {'class': re.compile(r'content|main|article', re.I)}) or \
                      soup.body or soup
        
        # 提取所有标题和段落
        for element in main_content.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']):
            text = element.get_text(separator=' ', strip=True)
            
            # 清洗文本：移除多余空白
            text = re.sub(r'\s+', ' ', text).strip()
            
            # 过滤掉过短的内容（可能是噪音）
            if len(text) < 3:
                continue
            
            if element.name.startswith('h'):
                # 标题
                level = int(element.name[1])
                structured_content['sections'].append({
                    'type': 'heading',
                    'level': level,
                    'content': text
                })
            else:
                # 段落
                structured_content['sections'].append({
                    'type': 'paragraph',
                    'content': text
                })
        
        return structured_content
    
    try:
        # 检查 robots.txt 合规性
        if not await check_robots_txt(url):
            return {
                'error': 'PermissionError',
                'message': 'Access denied: target site forbids crawling'
            }
        
        loop = asyncio.get_event_loop()
        html_content = await loop.run_in_executor(None, sync_fetch)
        
        if isinstance(html_content, tuple):
            # 返回的是错误信息
            return {
                'error': 'FetchError',
                'message': html_content[1]
            }
        
        # 清洗并提取结构化内容
        structured_data = clean_and_extract(html_content)
        
        if not structured_data or not structured_data['sections']:
            return {
                'error': 'ParseError',
                'message': 'Unable to extract useful content from the page'
            }
        
        return structured_data
        
    except Exception as e:
        return {
            'error': 'UnexpectedError',
            'message': str(e)
        }


# OpenAI function 定义
simple_fetch_tool = {
    "type": "function",
    "function": {
        "name": "simple_fetch",
        "description": "Retrieve the specified URL; public and private-network addresses are subject to access controls.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to retrieve.",
                },
            },
            "required": ["url"],
        },
    },
}

async def markdown_new(original_url):
    """
    通过 markdown.new 服务将网页转换为 Markdown 格式
    """
    
    def sync_crawler():
        # 拼接 markdown.new 的服务地址
        detail_url = "https://markdown.new/"
        url = f"{detail_url}{original_url}"
        
        try:
            # 添加一个基础的 User-Agent 防屏蔽
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            # 发起请求
            response = requests.get(url, headers=headers, timeout=60)
            
            if response.status_code == 200:
                # markdown.new 默认直接返回纯文本的 markdown 内容
                return response.text
            else:
                return f"Failed to retrieve {original_url}: HTTP {response.status_code}"
                
        except requests.RequestException as e:
            return f"Failed to retrieve {original_url}: {str(e)}"

    try:
        # 检查 robots.txt 合规性（保持与你原有逻辑一致）
        if not await check_robots_txt(original_url):
            raise PermissionError(f"Access denied: target site forbids crawling")
            
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_crawler)
    except Exception as e:
        print(f"Async execution error in markdown_new: {e}")
        return str(e)
    
markdown_new_tool = {
    "type": "function",
    "function": {
        "name": "markdown_new",
        "description": "Convert a publicly accessible webpage to Markdown using markdown.new. Never pass local or private-network addresses.",
        "parameters": {
            "type": "object",
            "properties": {
                "original_url": {
                    "type": "string",
                    "description": "Complete URL beginning with http or https.",
                },
            },
            "required": ["original_url"],
        },
    },
}

# ========== You.com Search ==========

async def youcom_search(query):
    """
    You.com 搜索，支持免费层级（MCP，100次/天）和付费层级（REST API，消耗 API Key 额度）。
    通过 webSearch.youcom_tier 设置切换：'free'（默认）或 'api_key'。
    """
    settings = await load_settings()
    tier = settings['webSearch'].get('youcom_tier', 'free')

    if tier == 'free':
        return await _youcom_search_free(query)
    else:
        return await _youcom_search_api(query)


async def _youcom_search_free(query):
    """
    免费层级：通过 You.com MCP 端点请求，无需 API Key，每天 100 次额度。
    端点: https://api.you.com/mcp?profile=free
    MCP Streamable HTTP 协议：先 initialize 获取 Session ID，再 tools/call 调用 you-search。
    """
    settings = await load_settings()
    max_results = settings['webSearch'].get('youcom_max_results', 10)
    base_url = "https://api.you.com/mcp?profile=free"

    # 读取用户代理设置
    proxy_url = settings.get('systemSettings', {}).get('proxy', '')
    proxies = None
    if proxy_url:
        proxies = {"http": proxy_url, "https": proxy_url}

    def sync_mcp():
        try:
            # Step 1: Initialize MCP session
            # 必须同时 Accept application/json 和 text/event-stream（MCP Streamable HTTP 规范）
            init_resp = requests.post(
                base_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "super-agent-party", "version": "1.0.0"}
                    }
                },
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream"
                },
                proxies=proxies,
                timeout=15
            )
            if init_resp.status_code != 200:
                return f"You.com MCP initialization failed (HTTP {init_resp.status_code}): {init_resp.text[:300]}"

            session_id = init_resp.headers.get("Mcp-Session-Id", "")

            # Step 2: Call you-search
            req_headers = {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            }
            if session_id:
                req_headers["Mcp-Session-Id"] = session_id

            search_resp = requests.post(
                base_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {
                        "name": "you-search",
                        "arguments": {
                            "query": query,
                            "count": max_results
                        }
                    }
                },
                headers=req_headers,
                proxies=proxies,
                timeout=30
            )

            if search_resp.status_code == 429:
                return "You.com free search quota exhausted. Select the API-key tier and enter a key in settings to continue."

            if search_resp.status_code != 200:
                return f"You.com MCP search failed (HTTP {search_resp.status_code}): {search_resp.text[:300]}"

            result_data = search_resp.json()

            # 解析 structuredContent（优先）或 content text
            structured = result_data.get("result", {}).get("structuredContent", {}).get("results", {})
            if structured:
                formatted_results = []
                web_results = structured.get("web", [])
                for item in web_results:
                    formatted_results.append({
                        'title': item.get('title', 'Untitled'),
                        'link': item.get('url', ''),
                        'displayUrl': item.get('url', ''),
                        'snippet': item.get('description', '') or (item.get('snippets', [''])[0] if item.get('snippets') else 'No summary available'),
                        'siteName': item.get('title', 'Unknown source'),
                    })
                return json.dumps(formatted_results, indent=2, ensure_ascii=False)

            # 回退：从 content text 中提取
            content = result_data.get("result", {}).get("content", [])
            text_parts = []
            for item in content:
                if item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
            if text_parts:
                return "\n\n".join(text_parts)

            return "No results found."

        except Exception as e:
            return f"You.com MCP search error: {str(e)}"

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_mcp)
    except Exception as e:
        print(f"Asynchronous operation failed: {e}")
        return ""


async def _youcom_search_api(query):
    """
    付费层级：通过 You.com REST API 请求，需要 API Key。
    API文档: https://you.com/specs/openapi_search_v1.yaml
    """
    settings = await load_settings()

    # 读取用户代理设置
    proxy_url = settings.get('systemSettings', {}).get('proxy', '')
    proxies = None
    if proxy_url:
        proxies = {"http": proxy_url, "https": proxy_url}

    def sync_search():
        max_results = settings['webSearch'].get('youcom_max_results', 10)
        api_key = settings['webSearch'].get('youcom_api_key', "")

        if not api_key:
            return "You.com API key not configured. Enter YDC_API_KEY in settings."

        url = "https://ydc-index.io/v1/search"
        headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        }
        payload = json.dumps({
            "query": query,
            "count": max_results
        })

        try:
            response = requests.post(url, headers=headers, data=payload, proxies=proxies, timeout=30)
            if response.status_code == 200:
                result_data = response.json()

                formatted_results = []
                web_results = result_data.get('results', {}).get('web', [])

                for item in web_results:
                    formatted_item = {
                        'title': item.get('title', 'Untitled'),
                        'link': item.get('url', ''),
                        'displayUrl': item.get('url', ''),
                        'snippet': item.get('description') or (item.get('snippets', [''])[0] if item.get('snippets') else 'No summary available'),
                        'siteName': item.get('title', 'Unknown source'),
                    }
                    formatted_results.append(formatted_item)

                return json.dumps(formatted_results, indent=2, ensure_ascii=False)
            elif response.status_code == 401:
                return f"You.com API key invalid or expired; HTTP {response.status_code}"
            elif response.status_code == 403:
                return f"You.com API key missing required permissions; HTTP {response.status_code}"
            else:
                return f"Request failed; HTTP {response.status_code}; response: {response.text}"
        except Exception as e:
            print(f"You.com search error: {str(e)}")
            return ""

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_search)
    except Exception as e:
        print(f"Asynchronous operation failed: {e}")
        return ""


youcom_tool = {
    "type": "function",
    "function": {
        "name": "youcom_search",
        "description": "Search through You.com and return sources and summaries using its free or API-key tier, subject to provider usage limits.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keywords or natural-language search query.",
                },
            },
            "required": ["query"],
        },
    },
}