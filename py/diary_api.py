from fastapi import APIRouter, Body, HTTPException, Query
from typing import Dict, Any, Optional
from py.diary_system import (
    load_diary_data, save_diary_data, delete_diary_entry,
    list_diary_books, query_diary_entries, DEFAULT_BOOK_ID,
)

# Data routes for the diary system
router = APIRouter(prefix="/api/diary", tags=["Diary System"])


@router.get("/books")
async def list_diary_books_api():
    """List all diary books (one per character, plus the default fallback book)."""
    try:
        return {"books": await list_diary_books()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read diary book list: {str(e)}")


@router.get("/get_data")
async def get_diary_data_api(book_id: str = Query(DEFAULT_BOOK_ID)):
    """Get all entries in a diary book, returning {"characterId":..., "characterName":..., "entries":[...]}."""
    try:
        return await load_diary_data(book_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read diary data: {str(e)}")


@router.post("/save_data")
async def save_diary_data_api(payload: Dict[str, Any] = Body(...)):
    """Save an entire diary book. Request: {"book_id": "xxx", "entries": [...]} (omit book_id for the default book)."""
    try:
        book_id = payload.get("book_id", DEFAULT_BOOK_ID) or DEFAULT_BOOK_ID
        await save_diary_data(payload, book_id)
        return {"status": "success", "message": "Diary data saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save diary data: {str(e)}")


@router.post("/delete")
async def delete_diary_entry_api(payload: Dict[str, Any] = Body(...)):
    """Delete a diary entry. Request: {"id": "xxx", "book_id": "xxx"}."""
    entry_id = payload.get("id")
    if not entry_id:
        raise HTTPException(status_code=400, detail="Missing diary entry ID")
    book_id = payload.get("book_id", DEFAULT_BOOK_ID) or DEFAULT_BOOK_ID
    try:
        ok = await delete_diary_entry(entry_id, book_id)
        return {"status": "success" if ok else "not_found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete diary entry: {str(e)}")


@router.get("/query")
async def query_diary_api(
    query: Optional[str] = Query(""),
    book_id: Optional[str] = Query(DEFAULT_BOOK_ID),
    start_time: Optional[str] = Query(""),
    end_time: Optional[str] = Query(""),
    max_results: Optional[int] = Query(5),
    entry_type: Optional[str] = Query(""),
):
    """Query diary entries using the supplied filters."""
    try:
        results = await query_diary_entries(
            query=query or "", book_id=book_id or DEFAULT_BOOK_ID,
            start_time=start_time or "", end_time=end_time or "",
            max_results=max_results, entry_type=entry_type or "",
        )
        return {"entries": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query diary entries: {str(e)}")
