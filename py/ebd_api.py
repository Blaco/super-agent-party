from typing import Optional
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl

from py.load_files import sanitize_url

router = APIRouter(prefix="/api", tags=["extra"])

class EmbeddingDimsRequest(BaseModel):
    api_key: str
    base_url: Optional[HttpUrl] = None   # Use the official endpoint when omitted: https://api.openai.com/v1
    model: str

class EmbeddingDimsResponse(BaseModel):
    dims: int

@router.post("/embedding_dims", response_model=EmbeddingDimsResponse)
async def get_embedding_dims(req: EmbeddingDimsRequest):
    """
    Call the embedding endpoint with a sample sentence and return the vector length.
    Supports the official OpenAI API and compatible proxies.
    """
    url = sanitize_url(
        input_url=req.base_url, 
        default_base="https://api.openai.com/v1", 
        endpoint="/embeddings"
    )

    payload = {"model": req.model, "input": "test"}
    headers = {"Authorization": f"Bearer {req.api_key}"}

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
        except Exception as e:
            raise HTTPException(502, detail=f"Embedding request failed: {e}")

    if r.status_code != 200:
        raise HTTPException(
            status_code=r.status_code,
            detail=f"Upstream error: {r.text}"
        )

    try:
        vec = r.json()["data"][0]["embedding"]
    except (KeyError, IndexError):
        raise HTTPException(502, detail="Invalid upstream response: could not parse embedding")

    return EmbeddingDimsResponse(dims=len(vec))