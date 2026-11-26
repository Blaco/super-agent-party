import asyncio
from datetime import datetime
import json
from zoneinfo import ZoneInfo  # Python standard library
import aiohttp
import requests
from tzlocal import get_localzone
from py.get_setting import load_settings
import wikipediaapi
import arxiv
from typing import Dict, List, Optional
# Get the local timezone (tzinfo)
local_timezone = get_localzone()  # Returns a tzinfo object

async def time(timezone: str = None):
    # Use the local timezone if none is supplied
    tz = ZoneInfo(timezone) if timezone else local_timezone
    
    # Get the current time with timezone information
    now = datetime.now(tz=tz)
    
    # Format the output
    time_message = f"Current time: {now.strftime('%Y-%m-%d %H:%M:%S')}, timezone: {tz}"
    return time_message

time_tool = {
    "type": "function",
    "function": {
        "name": "time",
        "description": f"Get the current time, including timezone information.",
        "parameters": {
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": "IANA timezone, such as America/New_York. Defaults to the local timezone.",
                },
            },
            "required": [],
        },
    },
}

async def _get_lat_lon(city: str) -> Dict[str, float]:
    """Return latitude, longitude and timezone (e.g. America/New_York)."""
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": city, "count": 1, "language": "en"}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise RuntimeError("Geocoding request failed")
            data = await resp.json()
    if not data.get("results"):
        raise RuntimeError(f"City not found: {city}")
    r = data["results"][0]
    return {
        "latitude": r["latitude"],
        "longitude": r["longitude"],
        "timezone": r.get("timezone") or "auto",
    }


async def _call_open_meteo(lat: float, lon: float, timezone: str, forecast: bool, days: int):
    """Return a forecast when forecast=True, otherwise current conditions."""
    if forecast:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,weathercode",
            "timezone": timezone,
            "forecast_days": days,
        }
    else:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "current_weather": "true",
            "timezone": timezone,
        }

    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise RuntimeError("Weather API request failed")
            return await resp.json()


_WCODE_MAP = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Light snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    95: "Thunderstorm",
    96: "Thunderstorm with light hail",
    99: "Thunderstorm with heavy hail",
}


def _desc(code: int) -> str:
    return _WCODE_MAP.get(code, "Unknown")


async def get_weather(city: str, forecast: bool = False, days: int = 1) -> str:
    """
    Get current weather or a forecast for a city using Open-Meteo.
    """
    try:
        # 4.1 Coordinates
        geo = await _get_lat_lon(city)

        # 4.2 Weather data
        data = await _call_open_meteo(
            geo["latitude"], geo["longitude"], geo["timezone"], forecast, days
        )

        # 4.3 Format the output, retaining the existing report structure
        if forecast:
            daily = data["daily"]
            result = [
                f"{days}-day weather forecast for {city}:",
                "Overview: Based on Open-Meteo global models",
                "Severe-weather alerts: not provided by this forecast",
                "Daily forecast:",
            ]
            for i in range(days):
                date = daily["time"][i]
                tmax = daily["temperature_2m_max"][i]
                tmin = daily["temperature_2m_min"][i]
                code = daily["weathercode"][i]
                result.append(
                    f"- {date}: Daytime {tmax}°C/{_desc(code)}, nighttime {tmin}°C/{_desc(code)}"
                )
            return "\n".join(result)

        else:
            cw = data["current_weather"]
            return (
                f"Current weather for {city}:\n"
                f"Temperature: {cw['temperature']}°C\n"
                f"Conditions: {_desc(cw['weathercode'])}\n"
                f"Relative humidity: not available\n"
                f"Wind speed: {cw['windspeed']} km/h"
            )

    except Exception as e:
        return f"Failed to retrieve weather: {str(e)}"
    
weather_tool = {
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather or a forecast for a city.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, such as London or New York.",
                },
                "forecast": {
                    "type": "boolean",
                    "description": "Whether to request a forecast (false returns current conditions).",
                    "default": False
                },
                "days": {
                    "type": "integer",
                    "description": "Number of forecast days, from 1 to 7.",
                    "default": 1,
                    "minimum": 1,
                    "maximum": 7
                },
            },
            "required": ["city"],
        },
    },
}

async def get_location_coordinates(city: str) -> str:
    """
    Get a city's coordinates using Open-Meteo Geocoding.
    Return a formatted location report.
    """
    try:
        # 1. Request Open-Meteo geocoding
        url = "https://geocoding-api.open-meteo.com/v1/search"
        params = {"name": city, "count": 1, "language": "en"}

        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as resp:
                if resp.status != 200:
                    return f"Failed to retrieve location information: HTTP {resp.status}"
                data = await resp.json()

        if not data.get("results"):
            return f"No location information found for {city}"

        r = data["results"][0]

        # 2. Format the location report
        return (
            f"Location information for {city}:\n"
            f"Name: {r.get('name', 'Unknown')} ({r.get('name', 'Unknown')})\n"
            f"Country: {r.get('country', 'Unknown')}\n"
            f"Administrative region: {r.get('admin1', 'Unknown')}\n"
            f"Coordinates: {r.get('latitude', 'Unknown')}, {r.get('longitude', 'Unknown')}\n"
            f"Timezone: {r.get('timezone', 'Unknown')}"
        )

    except Exception as e:
        return f"Failed to retrieve location information: {str(e)}"

location_tool = {
    "type": "function",
    "function": {
        "name": "get_location_coordinates",
        "description": "Get a city's coordinates and location information.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, such as London or New York.",
                },
            },
            "required": ["city"],
        },
    },
}

async def get_weather_by_city(city: str,lang:str="en",product:str="astro") -> str:
    """
    Get 7Timer weather data (JSON and image URL) for a city.
    
    :param city: City name (e.g. London or New York)
    :return: Formatted string containing JSON data and an image URL
    """
    try:
        # 1. Get the city's coordinates
        location_info = await get_location_coordinates(city)
        
        # Parse coordinates from the location report ("Coordinates: latitude, longitude")
        if "Coordinates:" not in location_info:
            return f"Could not retrieve coordinates for {city}"
        
        # Extract the latitude and longitude
        geo_part = location_info.split("Coordinates:")[1].split("\n")[0].strip()
        lat, lon = map(float, geo_part.split(","))
        
        # 2. Retrieve weather data from the 7Timer API
        base_url = "http://www.7timer.info/bin/astro.php"
        
        # Build the image URL
        img_params = {
            "lon": lon,
            "lat": lat,
            "ac": 0,
            "lang": lang,
            "unit": "metric",
            "tzshift": 0,
        }
        img_url = f"{base_url}?{'&'.join([f'{k}={v}' for k, v in img_params.items()])}"
        
        # Retrieve JSON data
        data_params = {
            "lon": lon,
            "lat": lat,
            "ac": 0,
            "product": product,
            "lang": "en",
            "unit": "metric",
            "output": "json",
            "tzshift": 0,
        }
        data_response = requests.get(base_url, params=data_params)
        data_response.raise_for_status()
        weather_data = data_response.json()
        
        # 3. Return the formatted result
        return f"{json.dumps(weather_data, ensure_ascii=False)}\n![image]({img_url})"
    
    except Exception as e:
        return f"Failed to retrieve weather data: {str(e)}"


timer_weather_tool = {
    "type": "function",
    "function": {
        "name": "get_weather_by_city",
        "description": "Get detailed 7Timer weather data (JSON and a forecast chart) for a city. Present the chart URL as ![image](image_url).",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, such as London or New York.",
                },
                "lang": {
                    "type": "string",
                    "description": "Chart language code, default en.",
                    "default": "en",
                },
                "product": {
                    "type": "string",
                    "description": "Product type: astro (default) provides a 72-hour forecast at three-hour intervals; civil provides a seven-day forecast with 2-4 time points per day.",
                    "enum": ["astro", "civil"]
                }
            },
            "required": ["city"],
        },
    },
}



async def get_wikipedia_summary_and_sections(
    topic: str, 
    language: str = "en"
) -> str:
    """
    Get a Wikipedia topic summary and the titles of all its sections as a string.
    
    :param topic: Topic to look up
    :param language: Language code, defaults to en (English)
    :param user_agent: Custom user agent
    :return: Summary and section list, or an error if the page does not exist
    """
    wiki_wiki = wikipediaapi.Wikipedia(
        language=language,
        extract_format=wikipediaapi.ExtractFormat.WIKI,
        user_agent="super-agent-party"
    )
    
    page = wiki_wiki.page(topic)
    
    if not page.exists():
        return f"No Wikipedia page found for '{topic}' (language: {language})"
    
    result = {
        "title": page.title,
        "summary": page.summary,
        "URL": page.fullurl,
        "sections": [section.title for section in page.sections]
    }
    
    return json.dumps(result, ensure_ascii=False, indent=2)

wikipedia_summary_tool = {
    "type": "function",
    "function": {
        "name": "get_wikipedia_summary_and_sections",
        "description": "Get the summary and all section titles for a Wikipedia topic.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Topic to look up.",
                },
                "language": {
                    "type": "string",
                    "description": "Wikipedia language code, such as en (English).",
                    "default": "en"
                },
            },
            "required": ["topic"],
        },
    },
}

async def get_wikipedia_section_content(
    topic: str, 
    section_title: str, 
    language: str = "en"
) -> str:
    """
    Get detailed content from a specific section of a Wikipedia topic as a string.
    
    :param topic: Topic to look up
    :param section_title: Section title
    :param language: Language code, defaults to en (English)
    :param user_agent: Custom user agent
    :return: Section content, or an error if the page or section does not exist
    """
    wiki_wiki = wikipediaapi.Wikipedia(
        language=language,
        extract_format=wikipediaapi.ExtractFormat.WIKI,
        user_agent="super-agent-party"
    )
    
    page = wiki_wiki.page(topic)
    
    if not page.exists():
        return f"No Wikipedia page found for '{topic}' (language: {language})"
    
    for section in page.sections:
        if section.title == section_title:
            result = {
                "topic": page.title,
                "section_title": section.title,
                "content": section.text,
                "URL": page.fullurl
            }
            return json.dumps(result, ensure_ascii=False, indent=2)
    
    return f"No section titled '{section_title}' found in '{topic}'"

wikipedia_section_tool = {
    "type": "function",
    "function": {
        "name": "get_wikipedia_section_content",
        "description": "Get detailed content from a section of a Wikipedia topic. First call get_wikipedia_summary_and_sections to retrieve the section titles.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "description": "Topic to look up.",
                },
                "section_title": {
                    "type": "string",
                    "description": "Title of the section to retrieve.",
                },
                "language": {
                    "type": "string",
                    "description": "Wikipedia language code, such as en (English).",
                    "default": "en"
                }
            },
            "required": ["topic", "section_title"],
        },
    },
}



async def search_arxiv_papers(
    query: str,
    max_results: int = 5,
    sort_by: str = "relevance",
    sort_order: str = "descending",
    return_fields: Optional[List[str]] = None
) -> str:
    """
    Search arXiv papers and return structured results.
    
    :param query: Search keywords or query
    :param max_results: Maximum number of results (default 5)
    :param sort_by: Sort criterion ("relevance", "submittedDate", "lastUpdatedDate")
    :param sort_order: Sort direction ("ascending" or "descending")
    :param return_fields: List of fields to return
    :return: Search results in JSON format
    """
    # Set default result fields
    default_fields = [
        "title", "authors", "summary", "published", 
        "pdf_url", "doi", "primary_category"
    ]
    return_fields = return_fields or default_fields
    
    # Wrap synchronous operations for asynchronous use
    def sync_search():
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion(sort_by),
            sort_order=arxiv.SortOrder(sort_order)
        )
        return list(search.results())
    
    results = []
    try:
        # Run synchronous operations in a thread pool
        papers = await asyncio.to_thread(sync_search)
        
        for result in papers:
            paper_info = {
                "title": result.title,
                "authors": [author.name for author in result.authors],
                "summary": result.summary,
                "published": str(result.published),
                "pdf_url": result.pdf_url,
                "doi": result.doi or "",
                "primary_category": result.primary_category,
                "entry_id": result.entry_id
            }
            # Filter fields
            filtered = {k: v for k, v in paper_info.items() if k in return_fields}
            results.append(filtered)
            
        if not results:
            return json.dumps({"error": f"No papers found for '{query}'"}, ensure_ascii=False)
            
        return json.dumps({
            "query": query,
            "count": len(results),
            "results": results
        }, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": f"Search failed: {str(e)}"}, ensure_ascii=False)

arxiv_tool = {
    "type": "function",
    "function": {
        "name": "search_arxiv_papers",
        "description": "Search the arXiv academic paper database for titles, authors, abstracts, PDF links and other information.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "English keywords or a query, e.g. 'quantum machine learning' or 'ti:transformer AND cat:cs.CL'.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Number of results to return (1-100).",
                    "default": 5
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["relevance", "submittedDate", "lastUpdatedDate"],
                    "description": "Sort criterion.",
                    "default": "relevance"
                },
                "sort_order": {
                    "type": "string",
                    "enum": ["ascending", "descending"],
                    "description": "Sort direction.",
                    "default": "descending"
                },
                "return_fields": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Fields to return, e.g. ['title','authors','pdf_url'].",
                }
            },
            "required": ["query"],
        },
    },
}