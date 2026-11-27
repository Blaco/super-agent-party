from __future__ import annotations

import logging
import time
import wave
from pathlib import Path
from typing import Any, Callable

import numpy as np
import onnxruntime as ort
import sentencepiece as spm
import soundfile as sf

from py.moss.ort_cpu_runtime import (
    OrtCpuRuntime,
    _normalize_sample_mode,
    _resolve_stream_decode_frame_budget,
    SAMPLE_MODE_FIXED,
    SAMPLE_MODE_GREEDY,
)


APP_DIR = Path(__file__).resolve().parent
REPO_ROOT = APP_DIR

DEFAULT_MODEL_DIR = REPO_ROOT / "models"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "generated_audio"
DEFAULT_OUTPUT_PATH = DEFAULT_OUTPUT_DIR / "infer_output.wav"
DEFAULT_VOICE_CLONE_INTER_CHUNK_PAUSE_SHORT_SECONDS = 0.40
DEFAULT_VOICE_CLONE_INTER_CHUNK_PAUSE_LONG_SECONDS = 0.24
SENTENCE_END_PUNCTUATION = set(".!?。！？；;")
CLAUSE_SPLIT_PUNCTUATION = set(",，、；;：:")
CLOSING_PUNCTUATION = set('"\'”’)]}）】》」』')

from py.moss.tts_robust_normalizer_single_script import normalize_tts_text


def _contains_cjk(text: str) -> bool:
    for character in str(text or ""):
        if (
            "\u4e00" <= character <= "\u9fff"
            or "\u3400" <= character <= "\u4dbf"
            or "\u3040" <= character <= "\u30ff"
            or "\uac00" <= character <= "\ud7af"
        ):
            return True
    return False


def _prepare_text_for_sentence_chunking(text: str) -> str:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        raise ValueError("Text prompt cannot be empty.")
    normalized_text = normalized_text.replace("\r", " ").replace("\n", " ")
    while "  " in normalized_text:
        normalized_text = normalized_text.replace("  ", " ")
    if _contains_cjk(normalized_text):
        if normalized_text[-1] not in SENTENCE_END_PUNCTUATION:
            normalized_text += "。"
        return normalized_text
    if normalized_text[:1].islower():
        normalized_text = normalized_text[:1].upper() + normalized_text[1:]
    if normalized_text[-1].isalnum():
        normalized_text += "."
    if len([item for item in normalized_text.split() if item]) < 5:
        normalized_text = f"        {normalized_text}"
    return normalized_text


def _split_text_by_punctuation(text: str, punctuation: set[str]) -> list[str]:
    sentences: list[str] = []
    current_chars: list[str] = []
    index = 0
    normalized_text = str(text or "")
    while index < len(normalized_text):
        character = normalized_text[index]
        current_chars.append(character)
        if character in punctuation:
            lookahead = index + 1
            while lookahead < len(normalized_text) and normalized_text[lookahead] in CLOSING_PUNCTUATION:
                current_chars.append(normalized_text[lookahead])
                lookahead += 1
            sentence = "".join(current_chars).strip()
            if sentence:
                sentences.append(sentence)
            current_chars.clear()
            while lookahead < len(normalized_text) and normalized_text[lookahead].isspace():
                lookahead += 1
            index = lookahead
            continue
        index += 1
    tail = "".join(current_chars).strip()
    if tail:
        sentences.append(tail)
    return sentences


def _join_sentence_parts(left: str, right: str) -> str:
    if not left:
        return right
    if not right:
        return left
    if _contains_cjk(left) or _contains_cjk(right):
        return left + right
    return f"{left} {right}"


def _merge_audio_channels(channel_arrays: list[np.ndarray]) -> np.ndarray:
    if not channel_arrays:
        return np.zeros((0, 1), dtype=np.float32)
    if len(channel_arrays) == 1:
        return np.asarray(channel_arrays[0], dtype=np.float32).reshape(-1, 1)
    min_length = min(int(channel.shape[0]) for channel in channel_arrays)
    trimmed = [np.asarray(channel[:min_length], dtype=np.float32) for channel in channel_arrays]
    return np.stack(trimmed, axis=1)


def _concat_waveforms(waveforms: list[np.ndarray]) -> np.ndarray:
    if not waveforms:
        return np.zeros((0, 1), dtype=np.float32)
    non_empty = [waveform for waveform in waveforms if waveform.size > 0]
    if not non_empty:
        channel_count = int(waveforms[0].shape[1]) if waveforms[0].ndim == 2 and waveforms[0].shape[1] > 0 else 1
        return np.zeros((0, channel_count), dtype=np.float32)
    return np.concatenate(non_empty, axis=0)


def _write_waveform_to_wav(path: str | Path, waveform: np.ndarray, sample_rate: int) -> Path:
    output_path = Path(path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    audio = np.asarray(waveform, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio.reshape(-1, 1)
    clipped = np.clip(audio, -1.0, 1.0)
    pcm16 = np.round(clipped * 32767.0).astype(np.int16)
    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(int(pcm16.shape[1]))
        wav_file.setsampwidth(2)
        wav_file.setframerate(int(sample_rate))
        wav_file.writeframes(pcm16.tobytes())
    return output_path


class TTSRuntime(OrtCpuRuntime):
    def __init__(
        self,
        model_dir: str | Path | None = None,
        *,
        thread_count: int = 4,
        max_new_frames: int | None = None,
        do_sample: bool | None = None,
        sample_mode: str | None = None,
        output_dir: str | Path = DEFAULT_OUTPUT_DIR,
    ) -> None:
        if model_dir is None:
            model_dir = DEFAULT_MODEL_DIR
        super().__init__(
            model_dir=model_dir,
            thread_count=thread_count,
            max_new_frames=max_new_frames,
            do_sample=do_sample,
            sample_mode=sample_mode,
        )
        self.output_dir = Path(output_dir).expanduser().resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        tokenizer_relative_path = str(self.manifest["model_files"].get("tokenizer_model", "tokenizer.model"))
        tokenizer_path = self.resolve_manifest_relative_path(tokenizer_relative_path)
        self.sp_model = spm.SentencePieceProcessor(model_file=str(tokenizer_path))

    def encode_text(self, text: str) -> list[int]:
        return [int(token_id) for token_id in self.sp_model.encode(str(text or ""), out_type=int)]

    def count_text_tokens(self, text: str) -> int:
        return len(self.encode_text(text))

    def prepare_synthesis_text(self, *, text: str, voice: str = "") -> dict[str, Any]:
        raw_text = str(text or "")
        final_text = normalize_tts_text(raw_text)
        return {
            "text": final_text,
            "normalized_text": final_text,
            "normalization_method": "robust",
            "text_normalization_enabled": True,
        }

    def split_text_by_token_budget(self, text: str, max_tokens: int) -> list[str]:
        remaining_text = str(text or "").strip()
        if not remaining_text:
            return []
        pieces: list[str] = []
        preferred_boundary_chars = set(CLAUSE_SPLIT_PUNCTUATION) | set(SENTENCE_END_PUNCTUATION) | {" "}
        while remaining_text:
            if self.count_text_tokens(remaining_text) <= max_tokens:
                pieces.append(remaining_text)
                break
            low = 1
            high = len(remaining_text)
            best_prefix_length = 1
            while low <= high:
                middle = (low + high) // 2
                candidate = remaining_text[:middle].strip()
                if not candidate:
                    low = middle + 1
                    continue
                if self.count_text_tokens(candidate) <= max_tokens:
                    best_prefix_length = middle
                    low = middle + 1
                else:
                    high = middle - 1
            cut_index = best_prefix_length
            prefix = remaining_text[:best_prefix_length]
            preferred_index = -1
            scan_min = max(-1, len(prefix) - 25)
            for scan_index in range(len(prefix) - 1, scan_min, -1):
                if prefix[scan_index] in preferred_boundary_chars:
                    preferred_index = scan_index + 1
                    break
            if preferred_index > 0:
                cut_index = preferred_index
            piece = remaining_text[:cut_index].strip()
            if not piece:
                piece = remaining_text[:best_prefix_length].strip()
                cut_index = best_prefix_length
            pieces.append(piece)
            remaining_text = remaining_text[cut_index:].strip()
        return pieces

    def split_voice_clone_text(self, text: str, max_tokens: int = 75) -> list[str]:
        normalized_text = str(text or "").strip()
        if not normalized_text:
            return []
        safe_max_tokens = max(1, int(max_tokens))
        prepared_text = _prepare_text_for_sentence_chunking(normalized_text)
        sentence_candidates = _split_text_by_punctuation(prepared_text, SENTENCE_END_PUNCTUATION) or [prepared_text.strip()]
        sentence_slices: list[tuple[int, str]] = []
        for sentence_text in sentence_candidates:
            normalized_sentence = sentence_text.strip()
            if not normalized_sentence:
                continue
            sentence_token_count = self.count_text_tokens(normalized_sentence)
            if sentence_token_count <= safe_max_tokens:
                sentence_slices.append((sentence_token_count, normalized_sentence))
                continue
            clause_candidates = _split_text_by_punctuation(normalized_sentence, CLAUSE_SPLIT_PUNCTUATION)
            if len(clause_candidates) <= 1:
                clause_candidates = [normalized_sentence]
            for clause_text in clause_candidates:
                normalized_clause = clause_text.strip()
                if not normalized_clause:
                    continue
                clause_token_count = self.count_text_tokens(normalized_clause)
                if clause_token_count <= safe_max_tokens:
                    sentence_slices.append((clause_token_count, normalized_clause))
                    continue
                for piece in self.split_text_by_token_budget(normalized_clause, safe_max_tokens):
                    normalized_piece = piece.strip()
                    if normalized_piece:
                        sentence_slices.append((self.count_text_tokens(normalized_piece), normalized_piece))
        chunks: list[str] = []
        current_chunk = ""
        current_chunk_token_count = 0
        for sentence_token_count, sentence_text in sentence_slices:
            if not current_chunk:
                current_chunk = sentence_text
                current_chunk_token_count = sentence_token_count
                continue
            if current_chunk_token_count + sentence_token_count > safe_max_tokens:
                chunks.append(current_chunk.strip())
                current_chunk = sentence_text
                current_chunk_token_count = sentence_token_count
            else:
                current_chunk = _join_sentence_parts(current_chunk, sentence_text)
                current_chunk_token_count = self.count_text_tokens(current_chunk)
        if current_chunk:
            chunks.append(current_chunk.strip())
        return chunks if len(chunks) > 1 else [normalized_text]

    def estimate_voice_clone_inter_chunk_pause_seconds(self, text_chunk: str) -> float:
        word_count = len([item for item in str(text_chunk or "").strip().split() if item])
        return (
            DEFAULT_VOICE_CLONE_INTER_CHUNK_PAUSE_SHORT_SECONDS
            if word_count <= 4
            else DEFAULT_VOICE_CLONE_INTER_CHUNK_PAUSE_LONG_SECONDS
        )

    def _load_reference_audio(self, reference_audio_path: str | Path) -> np.ndarray:
        """
        Load and preprocess reference audio:
        1. Trim leading and trailing silence. 2. Normalize peak level. 3. Trim intelligently. 4. Resample and convert channels.
        """
        import numpy as np
        from pathlib import Path
        import soundfile as sf
        import logging

        # 1. Read audio file
        abs_path = str(Path(reference_audio_path).expanduser().resolve())
        
        if not Path(abs_path).exists():
            raise FileNotFoundError(f"Reference audio file not found: {abs_path}")
        
        try:
            waveform, sample_rate = sf.read(abs_path, always_2d=True)
        except Exception as e:
            raise ValueError(f"Unable to read audio file {abs_path}: {e}")
        
        waveform = waveform.astype(np.float32)
        
        # Check audio validity
        if waveform.size == 0:
            raise ValueError(f"Audio file is empty: {abs_path}")
        
        # 2. Improved silence trimming to reduce interference from noise or silence at the boundaries
        def trim_silence(wav, threshold_percentile=5, min_duration_seconds=0.1):
            """
            Trim silence using a percentile threshold rather than a fixed threshold.
            
            Parameters:
                wav: shape (samples, channels)
                threshold_percentile: Frames below this energy percentile are considered silent.
                min_duration_seconds: Minimum audio duration.
            """
            if wav.shape[0] == 0:
                return wav
            
            # Calculate mean energy for each frame
            energy = np.mean(np.abs(wav), axis=1)
            
            # Use the percentile as an adaptive threshold
            threshold = np.percentile(energy[energy > 0] if np.any(energy > 0) else energy, threshold_percentile)
            threshold = max(threshold, 0.001)  # Absolute minimum
            
            # Locate regions above the energy threshold
            mask = energy > threshold
            
            if not np.any(mask):
                # All frames are silent; return the original audio
                logging.warning("The entire audio was classified as silence; retaining original audio")
                return wav
            
            # Find the start and end positions
            start_idx = np.where(mask)[0][0]
            end_idx = np.where(mask)[0][-1] + 1
            
            # Enforce the minimum duration
            min_samples = int(sample_rate * min_duration_seconds)
            if end_idx - start_idx < min_samples:
                center = (start_idx + end_idx) // 2
                half_min = min_samples // 2
                start_idx = max(0, center - half_min)
                end_idx = min(wav.shape[0], center + half_min)
            
            # Add a small 10 ms buffer to avoid cutting useful signals
            buffer_samples = int(sample_rate * 0.01)
            start_idx = max(0, start_idx - buffer_samples)
            end_idx = min(wav.shape[0], end_idx + buffer_samples)
            
            return wav[start_idx:end_idx, :]

        waveform = trim_silence(waveform)

        # 3. Peak normalization
        # Normalize the reference level to reduce instability from very quiet audio
        peak = np.max(np.abs(waveform))
        if peak < 1e-5:
            logging.warning("Reference audio energy is very low; voice extraction quality may suffer")
            # Skip normalization to avoid amplifying noise
        else:
            waveform = (waveform / peak) * 0.9

        # 4. Intelligently truncate the reference audio
        # MOSS typically needs 3-5 seconds of reference audio; overly long references may degrade generation.
        max_duration = 5.0
        max_samples = int(sample_rate * max_duration)
        
        if waveform.shape[0] > max_samples:
            # Find a low-energy region near the target cutoff for a natural boundary
            search_window = int(sample_rate * 0.5)  # 0.5-second search window
            search_start = max_samples - search_window
            search_end = min(max_samples + search_window, waveform.shape[0])
            
            # Find the lowest-energy frame in the search window
            search_energy = np.mean(np.abs(waveform[search_start:search_end, :]), axis=1)
            if len(search_energy) > 0:
                # Smooth energy with a sliding window
                smooth_size = int(sample_rate * 0.05)  # 50 ms smoothing window
                if smooth_size > 1 and len(search_energy) > smooth_size:
                    kernel = np.ones(smooth_size) / smooth_size
                    search_energy = np.convolve(search_energy, kernel, mode='same')
                
                # Use the lowest-energy position as the cutoff
                min_energy_idx = search_start + np.argmin(search_energy)
                
                # Use a hard cutoff if the minimum-energy position is more than one second from the target
                if abs(min_energy_idx - max_samples) < sample_rate:
                    waveform = waveform[:min_energy_idx, :]
                else:
                    waveform = waveform[:max_samples, :]
            else:
                waveform = waveform[:max_samples, :]

        # Transpose to (channels, samples)
        waveform = waveform.T

        # 5. Resampling
        target_sample_rate = int(self.codec_meta["codec_config"]["sample_rate"])
        target_channels = int(self.codec_meta["codec_config"]["channels"])
        
        if sample_rate != target_sample_rate:
            try:
                from scipy import signal
                num_samples = int(waveform.shape[1] * target_sample_rate / sample_rate)
                
                # Check whether the resampling ratio is reasonable
                ratio = target_sample_rate / sample_rate
                if ratio < 0.5 or ratio > 2.0:
                    logging.warning(f"Large resampling ratio: {ratio:.2f}; audio quality may degrade")
                
                resampled = []
                for channel in waveform:
                    # Use SciPy for high-quality resampling
                    resampled_channel = signal.resample(channel, num_samples)
                    resampled.append(resampled_channel)
                waveform = np.array(resampled, dtype=np.float32)
                
            except ImportError:
                logging.error("scipy not available, skipping resampling. This may cause pitch issues.")
                # Fall back to NumPy interpolation if SciPy is unavailable
                try:
                    num_samples = int(waveform.shape[1] * target_sample_rate / sample_rate)
                    resampled = []
                    for channel in waveform:
                        x_old = np.linspace(0, 1, waveform.shape[1])
                        x_new = np.linspace(0, 1, num_samples)
                        resampled_channel = np.interp(x_new, x_old, channel)
                        resampled.append(resampled_channel)
                    waveform = np.array(resampled, dtype=np.float32)
                except Exception as e:
                    logging.error(f"Fallback resampling also failed: {e}")
                    # Last resort: leave audio unresampled; subsequent processing may fail
            except Exception as e:
                logging.error(f"Resampling failed: {e}")
                raise RuntimeError(f"Audio resampling failed: {e}")
        
        # 6. Channel conversion
        current_channels = waveform.shape[0]
        if current_channels == target_channels:
            pass
        elif current_channels == 1 and target_channels > 1:
            # Convert mono to multiple channels
            waveform = np.tile(waveform, (target_channels, 1))
        elif current_channels > 1 and target_channels == 1:
            # Convert multiple channels to mono by averaging
            waveform = np.mean(waveform, axis=0, keepdims=True)
        else:
            raise ValueError(f"Unsupported channel conversion: {current_channels} -> {target_channels}")
        
        # Final validation
        if waveform.size == 0:
            raise RuntimeError("Audio is empty after preprocessing")
        
        if np.any(np.isnan(waveform)) or np.any(np.isinf(waveform)):
            raise RuntimeError("Audio contains invalid values after preprocessing")
        
        # Return the ONNX-compatible shape [1, channels, samples]
        return waveform[np.newaxis, ...].astype(np.float32)

    def encode_reference_audio(self, reference_audio_path: str | Path) -> list[list[int]]:
        abs_path = str(Path(reference_audio_path).expanduser().resolve())
        
        # ================== Optimization 2: in-memory cache ==================
        # Return a previous encoding directly to avoid redundant computation
        if not hasattr(self, '_audio_codes_cache'):
            self._audio_codes_cache = {}
        
        # Use path and modification time as the cache key to re-encode modified files
        cache_key = abs_path
        try:
            file_mtime = Path(abs_path).stat().st_mtime
            cache_key = f"{abs_path}_{file_mtime}"
        except Exception:
            pass
            
        if cache_key in self._audio_codes_cache:
            return self._audio_codes_cache[cache_key]
        # ============================================================

        try:
            waveform = self._load_reference_audio(reference_audio_path)
        except Exception as e:
            raise RuntimeError(f"Failed to load reference audio: {e}")
        
        waveform_length = int(waveform.shape[-1])
        
        if waveform_length == 0:
            raise RuntimeError("Preprocessed audio has zero length")
        
        try:
            outputs = self.sessions["codec_encode"].run(
                None,
                {
                    "waveform": waveform,
                    "input_lengths": np.asarray([waveform_length], dtype=np.int32),
                },
            )
        except Exception as e:
            raise RuntimeError(f"Audio encoding failed: {e}")
        
        output_names = [output.name for output in self.sessions["codec_encode"].get_outputs()]
        named_outputs = dict(zip(output_names, outputs, strict=True))
        audio_codes = np.asarray(named_outputs["audio_codes"], dtype=np.int32)
        audio_code_lengths = np.asarray(named_outputs["audio_code_lengths"], dtype=np.int32)
        code_length = int(audio_code_lengths.reshape(-1)[0])
        
        if code_length == 0:
            raise RuntimeError("Encoding produced zero frames")
        
        num_quantizers = int(self.codec_meta["codec_config"]["num_quantizers"])
        
        prompt_audio_codes: list[list[int]] = []
        for frame_index in range(code_length):
            frame_tokens = []
            for quantizer_index in range(num_quantizers):
                token = int(audio_codes[0, frame_index, quantizer_index])
                frame_tokens.append(token)
            prompt_audio_codes.append(frame_tokens)
        
        # Validate encoding results
        audio_codebook_size = int(self.tts_meta["model_config"]["audio_codebook_sizes"][0])
        for frame_idx, frame in enumerate(prompt_audio_codes):
            for token_idx, token in enumerate(frame):
                if token < 0 or token >= audio_codebook_size:
                    raise RuntimeError(f"Encoding produced an invalid token: frame={frame_idx}, token={token_idx}, value={token}")
        
        # ================== Store in cache ==================
        # Limit cache size to prevent unbounded memory growth
        max_cache_size = 10
        if len(self._audio_codes_cache) >= max_cache_size:
            # Remove the oldest cached entry
            oldest_key = next(iter(self._audio_codes_cache))
            del self._audio_codes_cache[oldest_key]
        
        self._audio_codes_cache[cache_key] = prompt_audio_codes
        
        return prompt_audio_codes

    def resolve_prompt_audio_codes(
        self,
        *,
        voice: str | None,
        prompt_audio_path: str | Path | None,
    ) -> list[list[int]]:
        if prompt_audio_path:
            return self.encode_reference_audio(prompt_audio_path)
        resolved_voice = str(voice or self.list_builtin_voices()[0]["voice"])
        voice_row = next((item for item in self.list_builtin_voices() if item["voice"] == resolved_voice), None)
        if voice_row is None:
            raise ValueError(f"Built-in voice not found: {resolved_voice}")
        return list(voice_row["prompt_audio_codes"])

    def decode_full_audio_safe(self, generated_frames: list[list[int]]) -> np.ndarray:
        if not generated_frames:
            raise ValueError("No frames to decode")
        
        # Validate frames
        audio_codebook_size = int(self.tts_meta["model_config"]["audio_codebook_sizes"][0])
        num_quantizers = int(self.codec_meta["codec_config"]["num_quantizers"])
        
        for frame_idx, frame in enumerate(generated_frames):
            if len(frame) != num_quantizers:
                raise ValueError(f"Frame {frame_idx} has wrong number of tokens: {len(frame)} != {num_quantizers}")
            for token_idx, token in enumerate(frame):
                if token < 0 or token >= audio_codebook_size:
                    raise ValueError(f"Invalid token {token} at frame {frame_idx}, position {token_idx}")
        
        # Attempt normal decoding
        try:
            channel_arrays, _audio_length = self.decode_full_audio(generated_frames)
            
            if not channel_arrays or all(arr.size == 0 for arr in channel_arrays):
                raise ValueError("Full decode produced empty audio")
            
            waveform = _merge_audio_channels(channel_arrays)
            
            # Quality check
            if np.any(np.isnan(waveform)) or np.any(np.isinf(waveform)):
                raise ValueError("Full decode produced invalid values")
            
            return waveform
            
        except Exception as exc:
            logging.warning("full codec decode failed, falling back to incremental decode: %s", exc)
            
            # Reset streaming decoder state
            self.codec_streaming_session.reset()
            
            merged_by_channel: list[list[np.ndarray]] = [
                [] for _ in range(int(self.codec_meta["codec_config"]["channels"]))
            ]
            
            try:
                # Incremental decoding in batches of eight frames
                chunk_size = 8
                for start_index in range(0, len(generated_frames), chunk_size):
                    frame_chunk = generated_frames[start_index : start_index + chunk_size]
                    
                    try:
                        decoded = self.codec_streaming_session.run_frames(frame_chunk)
                    except Exception as chunk_exc:
                        logging.error(f"Incremental decode failed at chunk {start_index}: {chunk_exc}")
                        # Attempt to reset and continue
                        self.codec_streaming_session.reset()
                        continue
                    
                    if decoded is None:
                        continue
                    
                    audio, audio_length = decoded
                    
                    if audio_length <= 0:
                        continue
                    
                    # Validate decoded output
                    if np.any(np.isnan(audio)) or np.any(np.isinf(audio)):
                        logging.warning(f"Chunk {start_index} produced invalid values, skipping")
                        continue
                    
                    for channel_index, channel in enumerate(audio[0, :, :audio_length]):
                        channel_data = np.asarray(channel, dtype=np.float32)
                        merged_by_channel[channel_index].append(channel_data)
                
                # Merge all channels
                channel_arrays = [
                    np.concatenate(chunks) if chunks else np.zeros((0,), dtype=np.float32) 
                    for chunks in merged_by_channel
                ]
                
                waveform = _merge_audio_channels(channel_arrays)
                
                if waveform.size == 0:
                    raise RuntimeError("Incremental decode produced empty audio")
                
                # Log fallback information
                logging.info(f"Incremental decode succeeded with {len(waveform)} samples")
                
                return waveform
                
            except Exception as fallback_exc:
                logging.error(f"Incremental decode also failed: {fallback_exc}")
                raise RuntimeError(f"Both full and incremental decode failed: {exc} | {fallback_exc}")
                
            finally:
                # Ensure decoder state is reset
                self.codec_streaming_session.reset()

    def synthesize_single_chunk(
        self,
        *,
        text: str,
        prompt_audio_codes: list[list[int]],
        streaming: bool,
    ) -> dict[str, Any]:
        text_token_ids = self.encode_text(text)
        request_rows = self.build_voice_clone_request_rows(prompt_audio_codes, text_token_ids)
        if not streaming:
            generated_frames = self.generate_audio_frames(request_rows)
            waveform = self.decode_full_audio_safe(generated_frames)
            return {
                "text": text,
                "text_token_ids": text_token_ids,
                "generated_frames": generated_frames,
                "waveform": waveform,
            }

        pending_decode_frames: list[list[int]] = []
        emitted_chunks: list[np.ndarray] = []
        emitted_samples_total = 0
        first_audio_emitted_at_perf: float | None = None
        self.codec_streaming_session.reset()

        def decode_pending_frames(force: bool) -> None:
            nonlocal emitted_samples_total, first_audio_emitted_at_perf
            pending_count = len(pending_decode_frames)
            if pending_count <= 0:
                return
            sample_rate = int(self.codec_meta["codec_config"]["sample_rate"])
            decode_budget = _resolve_stream_decode_frame_budget(
                emitted_samples_total,
                sample_rate,
                first_audio_emitted_at_perf,
            )
            if not force and pending_count < max(1, decode_budget):
                return
            frame_budget = pending_count if force else min(pending_count, max(1, decode_budget))
            frame_chunk = pending_decode_frames[:frame_budget]
            del pending_decode_frames[:frame_budget]
            decoded = self.codec_streaming_session.run_frames(frame_chunk)
            if decoded is None:
                return
            audio, audio_length = decoded
            if audio_length <= 0:
                return
            if first_audio_emitted_at_perf is None:
                first_audio_emitted_at_perf = time.perf_counter()
            emitted_samples_total += audio_length
            emitted_chunks.append(_merge_audio_channels([audio[0, channel_index, :audio_length] for channel_index in range(audio.shape[1])]))

        def on_frame(_generated_frames: list[list[int]], _step_index: int, frame: list[int]) -> None:
            pending_decode_frames.append(list(frame))
            decode_pending_frames(False)

        try:
            generated_frames = self.generate_audio_frames(request_rows, on_frame=on_frame)
            decode_pending_frames(True)
        finally:
            self.codec_streaming_session.reset()
        waveform = _concat_waveforms(emitted_chunks)
        return {
            "text": text,
            "text_token_ids": text_token_ids,
            "generated_frames": generated_frames,
            "waveform": waveform,
        }

    def synthesize(
        self,
        *,
        text: str,
        voice: str | None = None,
        prompt_audio_path: str | Path | None = None,
        output_audio_path: str | Path | None = None,
        sample_mode: str | None = None,
        do_sample: bool = True,
        streaming: bool = False,
        max_new_frames: int | None = None,
        voice_clone_max_text_tokens: int = 75,
        seed: int | None = None,
    ) -> dict[str, Any]:
        if max_new_frames is not None:
            self.manifest["generation_defaults"]["max_new_frames"] = int(max_new_frames)
        normalized_sample_mode = _normalize_sample_mode(sample_mode, do_sample)
        self.manifest["generation_defaults"]["sample_mode"] = normalized_sample_mode
        self.manifest["generation_defaults"]["do_sample"] = normalized_sample_mode != SAMPLE_MODE_GREEDY
        if seed is not None:
            self.rng = np.random.default_rng(int(seed))
        prepared_texts = self.prepare_synthesis_text(text=text, voice=str(voice or ""))
        prepared_text = str(prepared_texts["text"])
        prompt_audio_codes = self.resolve_prompt_audio_codes(voice=voice, prompt_audio_path=prompt_audio_path)
        text_chunks = self.split_voice_clone_text(prepared_text, max_tokens=int(voice_clone_max_text_tokens))
        all_waveforms: list[np.ndarray] = []
        all_generated_frames: list[list[int]] = []
        sample_rate = int(self.codec_meta["codec_config"]["sample_rate"])
        channels = int(self.codec_meta["codec_config"]["channels"])
        chunk_results: list[dict[str, Any]] = []
        for chunk_index, chunk_text in enumerate(text_chunks):
            chunk_result = self.synthesize_single_chunk(
                text=chunk_text,
                prompt_audio_codes=prompt_audio_codes,
                streaming=bool(streaming),
            )
            chunk_results.append(chunk_result)
            all_waveforms.append(np.asarray(chunk_result["waveform"], dtype=np.float32))
            all_generated_frames.extend(chunk_result["generated_frames"])
            if chunk_index < len(text_chunks) - 1:
                pause_seconds = self.estimate_voice_clone_inter_chunk_pause_seconds(chunk_text)
                pause_samples = max(0, int(round(sample_rate * pause_seconds)))
                if pause_samples > 0:
                    all_waveforms.append(np.zeros((pause_samples, channels), dtype=np.float32))
        waveform = _concat_waveforms(all_waveforms)
        resolved_output_audio_path = (
            Path(output_audio_path).expanduser().resolve()
            if output_audio_path
            else (self.output_dir / DEFAULT_OUTPUT_PATH.name).resolve()
        )
        audio_path = _write_waveform_to_wav(resolved_output_audio_path, waveform, sample_rate)
        return {
            "audio_path": str(audio_path),
            "waveform": waveform,
            "sample_rate": sample_rate,
            "audio_token_ids": np.asarray(all_generated_frames, dtype=np.int32),
            "text_chunks": text_chunks,
            "prepared_texts": prepared_texts,
            "sample_mode": normalized_sample_mode,
            "do_sample": normalized_sample_mode != SAMPLE_MODE_GREEDY,
            "streaming": bool(streaming),
            "chunk_results": chunk_results,
        }
