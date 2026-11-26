import json
from py.diary_system import query_diary_entries, list_diary_books, DEFAULT_BOOK_ID

diary_query_tool = {
    "type": "function",
    "function": {
        "name": "query_diary",
        "description": (
            "Query diary entries to recall events from a specific time. "
            "Filter by time range, keyword, or entry type to return matching entries."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search keywords or a description against diary titles and content. Leave empty to filter without keywords."
                },
                "book_id": {
                    "type": "string",
                    "description": "Diary book ID (character ID). Leave empty to query the current character's diary."
                },
                "start_time": {
                    "type": "string",
                    "description": "Start time in ISO format, e.g. 2024-01-01T00:00:00. Omit for no lower time limit."
                },
                "end_time": {
                    "type": "string",
                    "description": "End time in ISO format, e.g. 2024-12-31T23:59:59. Omit for no upper time limit."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results, default 5.",
                    "default": 5
                },
                "entry_type": {
                    "type": "string",
                    "description": "Entry type filter: think (reflection), webSearch (web search), knowledge (knowledge base), imMessage (proactive message), browserControl (browser control), smartHome (smart home), chatSummary (chat summary). Leave empty for all types."
                }
            }
        }
    }
}

diary_books_tool = {
    "type": "function",
    "function": {
        "name": "list_diary_books",
        "description": "List available diary books (one per character plus the default fallback book).",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    }
}


async def handle_query_diary(query: str = "", book_id: str = DEFAULT_BOOK_ID,
                             start_time: str = "", end_time: str = "",
                             max_results: int = 5, entry_type: str = ""):
    try:
        results = await query_diary_entries(
            query=query or "", book_id=book_id or DEFAULT_BOOK_ID,
            start_time=start_time or "", end_time=end_time or "",
            max_results=max_results, entry_type=entry_type or "",
        )
        if not results:
            return "No matching diary entries found."
        out = []
        for e in results:
            t = e.get("title", "") or e.get("content", "")[:24]
            out.append({
                "id": e.get("id", ""),
                "time": e.get("time", ""),
                "type": e.get("type", ""),
                "title": e.get("title", ""),
                "content": e.get("content", ""),
            })
        return json.dumps(out, ensure_ascii=False, indent=2)
    except Exception as ex:
        return f"Error querying diary: {str(ex)}"


async def handle_list_diary_books():
    try:
        books = await list_diary_books()
        return json.dumps(books, ensure_ascii=False, indent=2)
    except Exception as ex:
        return f"Error listing diary books: {str(ex)}"
