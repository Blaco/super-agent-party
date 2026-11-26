# py/moss_tts.py
import asyncio
import io
import wave
import uuid
import threading
import logging
from pathlib import Path
from py.get_setting import DEFAULT_TTS_DIR, TOOL_TEMP_DIR

_moss_runtime = None
_runtime_lock = threading.Lock()

# Match the root directory defined in the manager
MOSS_DIR_NAME = "MOSS-TTS"

def _get_moss_runtime():
    """Lazy-load heavy numpy/scipy/onnxruntime dependencies on the first generation request."""
    global _moss_runtime
    if _moss_runtime is not None:
        return _moss_runtime
    
    with _runtime_lock:
        # Double-check to prevent concurrent model loads
        if _moss_runtime is not None:
            return _moss_runtime

        try:
            import numpy as np
            import scipy.signal
            from py.moss.tts_runtime import TTSRuntime
        except ImportError as e:
            print(f"MOSS TTS dependencies missing; install numpy/scipy/onnxruntime/sentencepiece/soundfile: {e}")
            return None

        # Pass the parent directory to TTSRuntime, which resolves MANIFEST_CANDIDATE_RELATIVE_PATHS internally
        model_dir = Path(DEFAULT_TTS_DIR) / MOSS_DIR_NAME
        if not (model_dir / "MOSS-TTS-Nano-100M-ONNX").exists():
            print("MOSS TTS model not found; download it through the SDK first.")
            return None

        print(f"Loading MOSS TTS model [{model_dir}]...")
        try:
            _moss_runtime = TTSRuntime(
                model_dir=str(model_dir),
                thread_count=4,  # Limit CPU usage
            )
            # Warm up the model to reduce initial inference delay
            print("Warming up the model...")
            _moss_runtime.warmup()
            print("MOSS TTS model loaded")
            return _moss_runtime
        except Exception as e:
            print(f"Failed to load MOSS TTS: {e}")
            return None


def _validate_audio_quality(waveform, min_energy=0.0001, max_peak=1.0):
    """
    Check generated audio quality.
    
    Parameters:
        waveform: numpy array shaped (samples, channels) or (samples,)
        min_energy: minimum mean energy; below this threshold audio is treated as silent
        max_peak: maximum peak; above this threshold audio is considered clipped
    
    Returns:
        bool: whether audio passed the quality check
        str: failure reason (empty string on success)
    """
    import numpy as np
    
    if waveform is None:
        return False, "Waveform is None"
    
    if waveform.size == 0:
        return False, "Waveform is empty"
    
    # Check for all-NaN or infinite values
    if np.any(np.isnan(waveform)) or np.any(np.isinf(waveform)):
        return False, "Waveform contains NaN or Inf values"
    
    # Calculate mean-square energy
    energy = np.mean(waveform ** 2)
    if energy < min_energy:
        return False, f"Audio energy too low: {energy:.6f} < {min_energy}"
    
    # Check clipping
    max_val = np.max(np.abs(waveform))
    if max_val > max_peak:
        return False, f"Audio clipping detected: peak={max_val:.3f} > {max_peak}"
    
    # Check the proportion of abnormal samples
    zero_ratio = np.sum(np.abs(waveform) < 1e-8) / waveform.size
    if zero_ratio > 0.5:
        return False, f"Too many near-zero samples: {zero_ratio:.2%}"
    
    return True, ""


def _validate_generated_frames(frames, audio_codebook_size):
    """
    Check whether generated audio frames are valid.
    
    Parameters:
        frames: list[list[int]], generated audio token sequence
        audio_codebook_size: int, codebook size
    
    Returns:
        bool: whether frames are valid
        str: reason for invalid frames
    """
    if not frames:
        return False, "No frames generated"
    
    for frame_idx, frame in enumerate(frames):
        if not frame:
            return False, f"Empty frame at index {frame_idx}"
        
        for token_idx, token in enumerate(frame):
            if token < 0 or token >= audio_codebook_size:
                return False, f"Invalid token {token} at frame {frame_idx}, position {token_idx} (valid range: 0-{audio_codebook_size-1})"
    
    return True, ""


def _process_tts_sync(text: str, voice: str, speed: float, prompt_audio_path: str) -> bytes:
    """Run synchronous inference and return WAV bytes."""
    import numpy as np
    import scipy.signal
    import logging
    
    runtime = _get_moss_runtime()
    if not runtime:
        raise RuntimeError("MOSS TTS model is not ready (not downloaded or failed to load)")
    
    # Reset streaming decoder state before each inference to prevent state carryover
    if hasattr(runtime, 'codec_streaming_session'):
        runtime.codec_streaming_session.reset()
    
    # Optionally clear encoding cache to ensure fresh encoding
    if hasattr(runtime, '_audio_codes_cache') and not prompt_audio_path:
        # Keep the cache for built-in voices to improve performance
        pass
    elif hasattr(runtime, '_audio_codes_cache'):
        # Clear here if needed for custom reference audio
        pass

    # TTSRuntime writes a WAV by default; use a temporary path and delete the file afterward
    temp_wav_path = Path(TOOL_TEMP_DIR) / f"moss_temp_{uuid.uuid4().hex}.wav"

    try:
        # Run inference
        result = runtime.synthesize(
            text=text,
            voice=voice,
            prompt_audio_path=prompt_audio_path if prompt_audio_path else None,
            output_audio_path=str(temp_wav_path),
            sample_mode="fixed", 
            do_sample=True,
        )
        
        original_sr = result["sample_rate"]
        waveform = result["waveform"]

        import numpy as np
        max_val = np.max(np.abs(waveform))
        if max_val > 1.0:
            # Leave headroom at 0.95 to avoid clipping in later processing
            waveform = (waveform / max_val) * 0.95
            logging.info(f"Audio peak {max_val:.3f} normalized to 0.95 to avoid clipping.")

        # Validate audio quality
        is_valid, quality_msg = _validate_audio_quality(waveform)
        if not is_valid:
            logging.warning(f"Generated audio quality issue: {quality_msg}")
            # Let the client decide whether to accept the result rather than raising immediately
        
        # Validate frame quality
        if "audio_token_ids" in result:
            audio_codebook_size = int(runtime.tts_meta["model_config"]["audio_codebook_sizes"][0])
            frames_valid, frames_msg = _validate_generated_frames(
                result["audio_token_ids"].tolist() if hasattr(result["audio_token_ids"], 'tolist') else result["audio_token_ids"],
                audio_codebook_size
            )
            if not frames_valid:
                logging.warning(f"Generated frames quality issue: {frames_msg}")

        # Adjust speaking speed
        if abs(speed - 1.0) >= 0.01:
            try:
                if waveform.ndim == 2:
                    adjusted = []
                    for channel in waveform.T:
                        channel_adjusted = scipy.signal.resample(channel, int(len(channel) / speed))
                        adjusted.append(channel_adjusted)
                    waveform = np.stack(adjusted, axis=1).astype(np.float32)
                else:
                    waveform = scipy.signal.resample(waveform, int(len(waveform) / speed)).astype(np.float32)
                sample_rate = int(original_sr * speed)
            except Exception as e:
                logging.error(f"Speed adjustment failed: {e}, using original speed")
                sample_rate = original_sr
        else:
            sample_rate = original_sr

        # Convert to WAV bytes for the frontend StreamingResponse
        audio = np.asarray(waveform, dtype=np.float32)
        if audio.ndim == 1:
            audio = audio.reshape(-1, 1)

        clipped = np.clip(audio, -1.0, 1.0)
        pcm16 = np.round(clipped * 32767.0).astype(np.int16)

        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(int(pcm16.shape[1]))
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm16.tobytes())

        return wav_io.getvalue()
        
    except Exception as e:
        # Clean up state on exception
        if hasattr(runtime, 'codec_streaming_session'):
            runtime.codec_streaming_session.reset()
        logging.error(f"TTS generation failed: {e}")
        raise RuntimeError(f"Speech generation failed: {str(e)}")
        
    finally:
        # Remove the temporary WAV immediately after generation
        if temp_wav_path.exists():
            try:
                temp_wav_path.unlink(missing_ok=True)
            except Exception as e:
                logging.warning(f"Failed to delete temp file {temp_wav_path}: {e}")


async def moss_generate_audio(text: str, voice: str = "Junhao", speed: float = 1.0, prompt_audio_path: str = "") -> bytes:
    """Asynchronous wrapper: run heavy inference in a thread pool."""
    # Validate arguments
    if not text or not text.strip():
        raise ValueError("Text must not be empty")
    
    if speed <= 0 or speed > 3.0:
        raise ValueError(f"Invalid speaking speed: {speed}; expected 0.1-3.0")
    
    try:
        wav_bytes = await asyncio.to_thread(
            _process_tts_sync, text, voice, speed, prompt_audio_path
        )
        
        if not wav_bytes:
            raise RuntimeError("Generated audio is empty")
        
        return wav_bytes
        
    except asyncio.CancelledError:
        # Try to release resources when the task is cancelled
        logging.warning("TTS generation was cancelled")
        if _moss_runtime and hasattr(_moss_runtime, 'codec_streaming_session'):
            _moss_runtime.codec_streaming_session.reset()
        raise
        
    except Exception as e:
        logging.error(f"moss_generate_audio failed: {e}")
        raise