import os
import sys
import asyncio
from pathlib import Path
from io import BytesIO
from py.get_setting import DEFAULT_ASR_DIR

# ---------- Placeholders and globals ----------
_recognizer = None
_last_model_name = None

# ---------- Lazy-loading helpers ----------
def _detect_device() -> str:
    """
    Select the appropriate device:
    - macOS (darwin) uses the dedicated backend 'coreml'
    - Windows and other systems use 'cpu' for compatibility
    """
    if sys.platform == "darwin":
        return "coreml"
    return "cpu"

# Keep the _get_recognizer function name and default argument
def _get_recognizer(model_name: str = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue"):
    """Initialize or retrieve the recognizer, lazily importing heavy dependencies."""
    global _recognizer, _last_model_name
    
    # Reuse the loaded recognizer if the model has not changed
    if _recognizer is not None and model_name == _last_model_name:
        return _recognizer

    # --- Defer importing heavy dependencies ---
    try:
        import sherpa_onnx
    except ImportError as e:
        print("sherpa_onnx is not installed:", e)
        return None
    
    model_dir = Path(DEFAULT_ASR_DIR) / model_name
    model_path = model_dir / "model.int8.onnx"
    tokens_path = model_dir / "tokens.txt"

    # Check for model files; return None rather than raising and crashing the application
    if not model_path.is_file() or not tokens_path.is_file():
        # Log or print here instead of raising ValueError, which would break server.py startup
        print(f"Sherpa model files are not downloaded; ASR is unavailable. Path: {model_dir}")
        return None

    device = _detect_device()
    print(f"Loading Sherpa-ONNX model [{model_name}] on device [{device}]...")

    try:
        recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=str(model_path),
            tokens=str(tokens_path),
            num_threads=4,
            provider=device,
            use_itn=True,
            debug=False,
        )
        _recognizer = recognizer
        _last_model_name = model_name
        return _recognizer
    except Exception as e:
        # Fall back to CPU if CoreML initialization fails on macOS
        if device == "coreml":
            print(f"Warning: macOS backend [{device}] initialization failed ({e}); retrying on [cpu]...")
            try:
                recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                    model=str(model_path),
                    tokens=str(tokens_path),
                    num_threads=4,
                    provider="cpu",
                    use_itn=True,
                    debug=False,
                )
                _recognizer = recognizer
                _last_model_name = model_name
                return _recognizer
            except Exception as cpu_err:
                print(f"CPU fallback also failed: {cpu_err}")
                return None
        else:
            print(f"Error loading Sherpa model: {e}")
            return None

# ---------- Core synchronous logic (runs in a thread pool) ----------
def _process_audio_sync(recognizer, audio_bytes: bytes) -> str:
    """
    Synchronous CPU-intensive audio decoding and neural inference.
    """
    import soundfile as sf
    import numpy as np

    with BytesIO(audio_bytes) as audio_file:
        audio, sample_rate = sf.read(audio_file, dtype="float32", always_2d=True)
        audio = audio[:, 0]  # Select the first channel for mono audio
        
        stream = recognizer.create_stream()
        stream.accept_waveform(sample_rate, audio)
        recognizer.decode_stream(stream)
        return stream.result.text

# ---------- Public asynchronous interface ----------
async def sherpa_recognize(audio_bytes: bytes, model_name: str = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue"):
    """
    Asynchronous wrapper: offload inference to a thread pool.
    """
    try:
        recognizer = _get_recognizer(model_name)
        if recognizer is None:
            raise RuntimeError("ASR model is not ready (missing files or initialization failure)")
        
        text = await asyncio.to_thread(_process_audio_sync, recognizer, audio_bytes)
        return text
    except Exception as e:
        raise RuntimeError(f"Sherpa ASR processing failed: {e}")