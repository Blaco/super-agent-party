from fastapi import APIRouter, Body, HTTPException
from typing import Dict, Any
from py.affection_system import load_affection_data, save_affection_data

# Data routes for the relationship system
router = APIRouter(prefix="/api/affection", tags=["Affection System"])

@router.get("/get_data")
async def get_affection_data_api():
    """
    Get relationship data for all users.
    Response format: {"Alex": {"love": 10, "Familiarity": 5}, "Sam": {"love": 2}}
    """
    try:
        data = await load_affection_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read relationship data: {str(e)}")

@router.post("/save_data")
async def save_affection_data_api(data: Dict[str, Any] = Body(...)):
    """
    Save all relationship data (overwrite existing data).
    Request format: {"Alex": {"love": 10, "Familiarity": 5}}
    """
    try:
        await save_affection_data(data)
        return {"status": "success", "message": "Relationship data saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save relationship data: {str(e)}")