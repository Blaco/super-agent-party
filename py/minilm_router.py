import os
import sys
import threading
import time
import asyncio
from typing import List, Union, Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from py.get_setting import DEFAULT_EBD_DIR

# ----------------- Lazy import placeholders -----------------
ort = None
AutoTokenizer = None
np = None

def _lazy_load_deps():
    """Load heavyweight libraries only when the model is needed, inside the worker thread or function."""
    global ort, AutoTokenizer, np
    if ort is None:
        import onnxruntime as ort
    if AutoTokenizer is None:
        from transformers import AutoTokenizer
    if np is None:
        import numpy as np

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
MODEL_PATH = os.path.join(DEFAULT_EBD_DIR, MODEL_NAME)

# ---------- MiniLM ONNX Predictor ----------
class MiniLMOnnxPredictor:
    def __init__(self, model_dir: str, use_gpu: bool = True):
        """
        :param use_gpu: Whether to attempt GPU hardware acceleration. Defaults to True.
                       When enabled, select an appropriate provider for the operating system and hardware, with fallback.
        """
        _lazy_load_deps()  # Ensure dependencies are loaded
        self.model_dir = model_dir
        self.is_loaded = False
        
        if not self._check_files_exist():
            return
            
        try:
            # Detect whether the unknown-token marker is [UNK] or <unk>
            self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
            
            # --- Locate model files ---
            model_path_o4 = os.path.join(model_dir, "model_O4.onnx")
            model_path_std = os.path.join(model_dir, "model.onnx")
            target_model = model_path_o4 if os.path.exists(model_path_o4) else model_path_std
            
            if not os.path.exists(target_model):
                raise FileNotFoundError(f"Model file not found: {target_model}")

            # --- Prioritized execution providers for different platforms and GPUs ---
            priority_providers = []

            if use_gpu:
                available_providers = ort.get_available_providers()
                print(f"[ONNX] Registered providers in runtime: {available_providers}")

                # 1. Windows: DirectML supports NVIDIA, AMD and Intel GPUs
                if sys.platform == "win32":
                    if "DmlExecutionProvider" in available_providers:
                        priority_providers.append("DmlExecutionProvider")

                # 2. macOS: CoreML supports Apple Silicon NPU/GPU acceleration
                elif sys.platform == "darwin":
                    if "CoreMLExecutionProvider" in available_providers:
                        priority_providers.append("CoreMLExecutionProvider")

                # 3. NVIDIA CUDA acceleration when installed and compatible on Linux or Windows
                if "CUDAExecutionProvider" in available_providers:
                    priority_providers.append("CUDAExecutionProvider")

            # 4. CPU fallback
            priority_providers.append("CPUExecutionProvider")

            # --- Attempt providers individually to isolate failures from missing native libraries ---
            self.session = None
            loaded_provider = None

            for provider in priority_providers:
                try:
                    # Try one accelerator with CPU fallback
                    test_providers = [provider]
                    if provider != "CPUExecutionProvider":
                        test_providers.append("CPUExecutionProvider")

                    # Attempt to initialize InferenceSession
                    session = ort.InferenceSession(target_model, providers=test_providers)
                    
                    # Confirm the requested provider is actually enabled
                    active_providers = session.get_providers()
                    if provider in active_providers:
                        self.session = session
                        loaded_provider = provider
                        break
                except Exception as ex:
                    print(f"[ONNX] Provider '{provider}' initialization failed: {ex}. Trying fallback...")

            # Use CPU if all preceding acceleration attempts fail
            if self.session is None:
                print("[ONNX] All hardware accelerators failed. Falling back to CPUExecutionProvider...")
                self.session = ort.InferenceSession(target_model, providers=["CPUExecutionProvider"])
                loaded_provider = "CPUExecutionProvider"

            self.input_names = [i.name for i in self.session.get_inputs()]
            print(f"MiniLM ONNX Predictor successfully loaded from: {target_model}")
            print(f"Active Execution Provider: {loaded_provider}")
            self.is_loaded = True

        except Exception as e:
            print(f"Error loading MiniLM ONNX Predictor: {e}")
            import traceback
            traceback.print_exc()
            self.is_loaded = False

    def _check_files_exist(self) -> bool:
        onnx_ok = os.path.exists(os.path.join(self.model_dir, "model_O4.onnx")) or \
                  os.path.exists(os.path.join(self.model_dir, "model.onnx"))
        tok_ok  = os.path.exists(os.path.join(self.model_dir, "tokenizer.json")) or \
                  os.path.exists(os.path.join(self.model_dir, "vocab.txt"))
        return onnx_ok and tok_ok

    def mean_pooling(self, model_output, attention_mask):
        token_embeddings = model_output
        mask = np.expand_dims(attention_mask, -1).astype(float)
        mask = np.broadcast_to(mask, token_embeddings.shape)
        return np.sum(token_embeddings * mask, axis=1) / np.clip(mask.sum(axis=1), a_min=1e-9, a_max=None)

    def normalize(self, v):
        norm = np.linalg.norm(v, axis=1, keepdims=True)
        return v / np.clip(norm, a_min=1e-9, a_max=None)

    def predict(self, sentences: List[str]):
        if not self.is_loaded:
            raise RuntimeError("Model not loaded.")
        
        inputs = self.tokenizer(sentences, padding=True, truncation=True, max_length=512, return_tensors="np")
        
        ort_inputs = {
            "input_ids": inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64)
        }
        
        if "token_type_ids" in self.input_names:
            tti = inputs.get("token_type_ids")
            ort_inputs["token_type_ids"] = (tti.astype(np.int64) if tti is not None else
                                            np.zeros_like(inputs["input_ids"], dtype=np.int64))
        
        outputs = self.session.run(None, ort_inputs)
        embeddings = self.mean_pooling(outputs[0], inputs["attention_mask"])
        return self.normalize(embeddings).astype(np.float32)

# ---------- Model pool management ----------
class MiniLMPool:
    def __init__(self, model_dir: str, use_gpu: bool = True):
        self.model_dir = model_dir
        self.use_gpu = use_gpu
        self._predictor: Optional[MiniLMOnnxPredictor] = None
        self._lock = threading.Lock()

    def get(self) -> MiniLMOnnxPredictor:
        if self._predictor and self._predictor.is_loaded:
            return self._predictor
        with self._lock:
            if self._predictor and self._predictor.is_loaded:
                return self._predictor
            
            # Use adaptive hardware acceleration
            predictor = MiniLMOnnxPredictor(self.model_dir, self.use_gpu)
            if not predictor.is_loaded:
                raise RuntimeError("Model failed to load")
            self._predictor = predictor
            return self._predictor

    def reload(self):
        with self._lock:
            self._predictor = None

# Enable use_gpu=True by default.
# The provider detection and fallback logic attempts CPU execution when compatible GPU acceleration is unavailable.
minilm_pool = MiniLMPool(MODEL_PATH, use_gpu=True)

# ---------- FastAPI Router ----------
router = APIRouter(prefix="/minilm", tags=["MiniLM Embeddings"])

class EmbeddingRequest(BaseModel):
    input: Union[str, List[str]]
    model: str = MODEL_NAME

class EmbeddingData(BaseModel):
    object: str = "embedding"
    embedding: List[float]
    index: int

class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[EmbeddingData]
    model: str
    usage: Dict[str, Any]

async def get_minilm_predictor():
    try:
        return await asyncio.to_thread(minilm_pool.get)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model unavailable: {e}")

@router.post("/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(request: EmbeddingRequest,
                            predictor: MiniLMOnnxPredictor = Depends(get_minilm_predictor)):
    start = time.time()
    texts = [request.input] if isinstance(request.input, str) else request.input
    
    try:
        num_tokens = sum(len(predictor.tokenizer.tokenize(t)) for t in texts)
    except Exception:
        num_tokens = sum(len(t) for t in texts) // 4
        
    try:
        embs = await asyncio.to_thread(predictor.predict, texts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
        
    data = [EmbeddingData(embedding=emb.tolist(), index=i) for i, emb in enumerate(embs)]
    return EmbeddingResponse(
        object="list",
        model=request.model,
        data=data,
        usage={
            "prompt_tokens": num_tokens,
            "total_tokens": num_tokens,
            "inference_time_ms": int((time.time() - start) * 1000)
        }
    )

@router.post("/reload")
async def reload_model():
    minilm_pool.reload()
    return {"msg": "reload triggered"}