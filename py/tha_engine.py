"""
THA4 ONNX Engine for Super Agent Party
Server-side rendering: ONNX model inference -> JPEG frames -> WebSocket streaming
"""
import asyncio
import json
import logging
import math
import os
import sys
import threading
import time
import uuid
import numpy as np
import onnxruntime as ort
import simplejpeg
from pathlib import Path
from typing import Optional, Dict, Tuple

logger = logging.getLogger(__name__)

# ------------------------------------------------------------
# 1. Color space conversion
# ------------------------------------------------------------
def _linear_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * (x ** (1.0 / 2.4)) - 0.055)


# ------------------------------------------------------------
# 2. Emotion -> 45-dimensional pose parameter map
# ------------------------------------------------------------
EMOTION_POSE_MAP: Dict[str, np.ndarray] = {}

def _make_pose(indices: list, scale: float = 1.0) -> np.ndarray:
    arr = np.zeros(45, dtype=np.float32)
    for i in indices:
        arr[i] = scale
    return arr

EMOTION_POSE_MAP["happy"] = _make_pose(
    [8, 9, 14, 15, 34, 35],  # eyebrow_happy(L/R) + eye_happy_wink(L/R) + mouth_raised_corner(L/R)
    1.0
)
EMOTION_POSE_MAP["sad"] = _make_pose(
    [0, 1, 6, 7, 32, 33],  # eyebrow_troubled(L/R) + eyebrow_raised(L/R) + mouth_lowered_corner(L/R)
    0.8
)
EMOTION_POSE_MAP["angry"] = _make_pose(
    [2, 3, 4, 5, 20, 21],  # eyebrow_angry(L/R) + eyebrow_lowered(L/R) + eye_unimpressed(L/R)
    0.9
)
EMOTION_POSE_MAP["surprised"] = _make_pose(
    [6, 7, 16, 17, 26, 30],  # eyebrow_raised(L/R) + eye_surprised(L/R) + mouth_aaa + mouth_ooo
    0.7
)
EMOTION_POSE_MAP["relaxed"] = _make_pose(
    [18, 19],  # eye_relaxed(L/R) — close eyes
    1.0
)

# Clear neutral pose
EMOTION_POSE_MAP["neutral"] = np.zeros(45, dtype=np.float32)


# ------------------------------------------------------------
# 2a. Fine-grained facial controls (LLM can control individual features alongside emotion presets)
# ------------------------------------------------------------
# Format: semantic name -> (dimension indices, gain)
# Gains are empirically calibrated: some parameters are sensitive even at low values (eye_happy 0.4 is visibly crescent-shaped).
# Gains map the LLM's intuitive 0–1 range to visually appropriate values.
_FACE_CONTROL_INDICES: Dict[str, tuple] = {
    # Eyebrows (left/right pairs)
    "eyebrow_troubled": ([0, 1], 1.0),    # Troubled eyebrows (sadness or concern)
    "eyebrow_angry":    ([2, 3], 1.0),    # Angry eyebrows
    "eyebrow_lowered":  ([4, 5], 1.0),    # Lowered eyebrows
    "eyebrow_raised":   ([6, 7], 1.0),    # Raised eyebrows
    "eyebrow_happy":    ([8, 9], 1.0),    # Happy eyebrows
    "eyebrow_serious":  ([10, 11], 1.0),  # Serious eyebrows
    # Eyes
    "eye_wink":         ([12, 13], 1.0),  # Close both eyes
    "wink_left":        ([12], 1.0),      # Close left eye
    "wink_right":       ([13], 1.0),      # Close right eye
    "eye_happy":        ([14, 15], 0.55), # Smiling eyes: sensitive at 0.4, so reduce gain
    "eye_surprised":    ([16, 17], 1.0),  # Wide eyes (surprise)
    "eye_relaxed":      ([18, 19], 1.0),  # Relaxed closed eyes
    "eye_unimpressed":  ([20, 21], 1.0),  # Unimpressed half-open eyes
    "eye_lower_eyelid": ([22, 23], 1.0),  # Raised lower eyelid (squinting smile)
    "iris_small":       ([24, 25], 1.0),  # Smaller pupils (fright)
    # Mouth
    "mouth_open":       ([26], 0.7),      # Open mouth aaa: reduce gain to avoid exaggeration
    "mouth_grin":       ([27], 1.0),      # Grin iii (teeth exposed, small visual change)
    "mouth_eee":        ([29], 1.0),      # Spread mouth eee
    "mouth_ooo":        ([30], 1.0),      # Pursed mouth ooo
    "mouth_frown":      ([32, 33], 1.0),  # Lower mouth corners
    "mouth_smile":      ([34, 35], 1.0),  # Raise mouth corners
    "mouth_smirk":      ([36], 1.0),      # Smirk
}
FACE_CONTROL_MAP: Dict[str, np.ndarray] = {
    name: _make_pose(indices, gain) for name, (indices, gain) in _FACE_CONTROL_INDICES.items()
}

# Mutually exclusive groups: normalize weighted totals exceeding 1 for consistent poses
# (The mouth cannot be aaa and ooo simultaneously; total eye closure cannot exceed fully closed.)
_EXCLUSIVE_GROUPS = [
    [26, 27, 28, 29, 30, 31],  # Mouth shapes aaa/iii/uuu/eee/ooo/delta
    [12, 14, 18],              # Left eye closure: wink / happy_wink / relaxed
    [13, 15, 19],              # Right eye closure
]


def compose_emotion_pose(weights: Dict[str, float]) -> np.ndarray:
    """Blend weighted expressions and fine-grained controls, e.g. {"happy": 0.2, "eyebrow_troubled": 0.6}.

    1. Look up emotion presets (EMOTION_POSE_MAP), then fine controls (FACE_CONTROL_MAP).
    2. Sum weighted parameters and clip each to [0,1].
    3. Normalize mutually exclusive groups with totals above 1 to produce a consistent expression.
    """
    # Return a single full-weight preset unchanged (consistent with set_emotion).
    # Presets are calibrated combinations (e.g. surprised has mouth_aaa=0.7 + mouth_ooo=0.7,
    # totaling 1.4); normalize only free combinations, not the presets themselves.
    if len(weights) == 1:
        (name, w), = weights.items()
        base = EMOTION_POSE_MAP.get(name)
        if base is not None and float(w) >= 1.0:
            return base.copy()

    pose = np.zeros(45, dtype=np.float32)
    for name, w in weights.items():
        base = EMOTION_POSE_MAP.get(name)
        if base is None:
            base = FACE_CONTROL_MAP.get(name)
        if base is None:
            continue
        w = max(0.0, min(1.0, float(w)))
        pose += base * w
    pose = np.clip(pose, 0.0, 1.0)
    for group in _EXCLUSIVE_GROUPS:
        total = float(pose[group].sum())
        if total > 1.0:
            pose[group] /= total
    return pose


# ------------------------------------------------------------
# 2b. Motion -> 45-dimensional parameter map (one-shot animations over the base pose)
# ------------------------------------------------------------
#   type "oscillate": sinusoidal oscillation
#   type "hold":      hold at target value, then return
THA_MOTIONS: Dict[str, dict] = {
    "nod": {
        "params": {39: 0.55},       # head_x nod
        "type": "oscillate",
        "duration": 1.4,
        "frequency": 2.8,
    },
    "shakeHead": {
        "params": {40: 0.5},        # head_y shake
        "type": "oscillate",
        "duration": 1.0,
        "frequency": 3.5,
    },
    "tiltHead": {
        "params": {41: 0.55},       # neck_z tilt
        "type": "oscillate",
        "duration": 1.2,
        "frequency": 2.2,
    },
    "bow": {
        "params": {43: 0.6},        # body_z lean forward (bow)
        "type": "hold",
        "duration": 1.5,
    },
    "sway": {
        "params": {42: 0.45},       # body_y sway
        "type": "oscillate",
        "duration": 1.5,
        "frequency": 2.0,
    },
    "lookAround": {
        "params": {38: 0.7, 37: 0.4},  # Eye roll and slight head raise
        "type": "oscillate",
        "duration": 2.0,
        "frequency": 1.5,
    },
}


# ------------------------------------------------------------
# 3. THAPoseGenerator — idle animation and emotion/mouth blending
# ------------------------------------------------------------
class THAPoseGenerator:
    def __init__(self):
        self.t = 0.0
        self.last = time.perf_counter()
        self._pbr = np.random.random() * math.pi * 2
        self._phx = np.random.random() * math.pi * 2
        self._phy = np.random.random() * math.pi * 2
        self._bsb = 0.7 + np.random.random() * 0.3
        self.next_blink = 2.0 + np.random.random() * 4.0
        self.blink_state = 0
        self.blink_timer = 0.0
        self.blink_dur = 0.06
        self.blink_hold = 0.08
        self.mx = 0.0
        self.my = 0.0
        self._mouse_x = 0.0
        self._mouse_y = 0.0

        # Emotion blending
        self._emotion_pose = np.zeros(45, dtype=np.float32)
        self._emotion_target = np.zeros(45, dtype=np.float32)
        self._emotion_smooth = 4.0

        # Mouth shape
        self._mouth_amplitude = 0.0
        self._mouth_target = 0.0
        # Use 120.0 to minimize backend smoothing delay.
        # Preserve the frontend's high-frequency 8 Hz mouth amplitude modulation.
        self._mouth_smooth = 120.0

        # Motions (one-shot animations)
        self._motion_name = None
        self._motion_timer = 0.0
        self._motion_data = {}

    def _rb(self):
        return 2.0 + np.random.random() * 4.0

    def set_emotion(self, emotion_name: str):
        """Set an emotion, transitioning smoothly to its pose."""
        self._emotion_target = EMOTION_POSE_MAP.get(emotion_name, EMOTION_POSE_MAP["neutral"]).copy()
        if emotion_name == "neutral":
            self._emotion_pose = self._emotion_target.copy()

    def set_emotion_mix(self, weights: Dict[str, float]):
        """Set a weighted expression blend, e.g. {"happy": 0.2, "surprised": 0.4}, with a smooth transition."""
        self._emotion_target = compose_emotion_pose(weights)

    def set_mouth(self, amplitude: float):
        """Set mouth amplitude from 0.0 to 1.0."""
        self._mouth_target = max(0.0, min(1.0, float(amplitude)))

    def set_mouse(self, x: float, y: float):
        """Set the mouse position."""
        self._mouse_x = float(x)
        self._mouse_y = float(y)

    def set_motion(self, motion_name: str):
        """Trigger a one-shot motion."""
        if motion_name in THA_MOTIONS:
            self._motion_name = motion_name
            self._motion_timer = 0.0
            self._motion_data = THA_MOTIONS[motion_name]

    def clear_motion(self):
        """Stop the current motion immediately."""
        self._motion_name = None

    def step(self) -> np.ndarray:
        now = time.perf_counter()
        dt = now - self.last
        self.last = now
        self.t += dt

        # Smooth emotion
        alpha = min(dt * self._emotion_smooth, 1.0)
        self._emotion_pose += (self._emotion_target - self._emotion_pose) * alpha

        # Smooth mouth amplitude
        alpha_m = min(dt * self._mouth_smooth, 1.0)
        self._mouth_amplitude += (self._mouth_target - self._mouth_amplitude) * alpha_m

        p = np.zeros(45, dtype=np.float32)

        # breathing (idx 44)
        p[44] = 0.8 * abs(math.sin(self.t * self._bsb + self._pbr))

        # head idle
        idle_hx = 0.32 * math.sin(self.t * 1.1 + self._phx)  # Larger head sway
        idle_hy = 0.22 * math.sin(self.t * 1.3 + self._phy)  # Larger nod
        idle_nk = 0.14 * math.sin(self.t * 0.55)             # Larger head tilt
        idle_ix = 0.18 * math.sin(self.t * 0.45 + self._phy) # More responsive horizontal eye movement
        idle_iy = 0.12 * math.sin(self.t * 0.55 + self._phx) # Larger vertical eye movement

        # smooth mouse
        self.mx += (self._mouse_x - self.mx) * min(dt * 8.0, 1.0)
        self.my += (self._mouse_y - self.my) * min(dt * 8.0, 1.0)
        mx, my = self.mx, self.my

        # body follows mouse
        p[42] = -mx * 0.75           # body_y twist follows horizontal mouse movement
        p[43] = 0.0                  # body_z stays fixed to avoid Z-axis rotation
        p[39] = idle_hx - my * 1.10  # head_x follows vertical mouse movement
        p[40] = idle_hy - mx * 0.90  # head_y follows horizontal mouse movement
        p[41] = idle_nk
        p[37] = idle_ix - my * 0.85  # eye follows vertical mouse movement
        p[38] = idle_iy - mx * 0.95  # eye follows horizontal mouse movement

        # Blinking — pause while eyes are closed
        # Closure channels: eye_wink(12/13), eye_happy_wink(14/15), eye_relaxed(18/19).
        # Pause automatic blinking if either eye exceeds the closure threshold to avoid jitter.
        closure_left = float(self._emotion_target[[12, 14, 18]].sum())
        closure_right = float(self._emotion_target[[13, 15, 19]].sum())
        eyes_closed_by_emotion = max(closure_left, closure_right) > 0.3
        if not eyes_closed_by_emotion:
            self.blink_timer += dt
            if self.blink_state == 0:
                if self.blink_timer >= self.next_blink:
                    self.blink_state = 1
                    self.blink_timer = 0.0
                    self.next_blink = self._rb()
            elif self.blink_state == 1:
                v = min(self.blink_timer / self.blink_dur, 1.0)
                p[18] = p[19] = v
                if v >= 1.0:
                    self.blink_state = 2
                    self.blink_timer = 0.0
            elif self.blink_state == 2:
                p[18] = p[19] = 1.0
                if self.blink_timer >= self.blink_hold:
                    self.blink_state = 3
                    self.blink_timer = 0.0
            elif self.blink_state == 3:
                v = 1.0 - min(self.blink_timer / self.blink_dur, 1.0)
                p[18] = p[19] = v
                if v <= 0.0:
                    self.blink_state = 0
                    self.blink_timer = 0.0
        else:
            self.blink_state = 0
            self.blink_timer = 0.0
        p[26] = 0.0

        # Blend emotion pose
        p += self._emotion_pose

        # Blend mouth shape
        p += self._mouth_amplitude * _get_mouth_pose()

        # Blend motion (one-shot animation overlay)
        if self._motion_name:
            self._motion_timer += dt
            dur = self._motion_data.get("duration", 1.5)
            progress = min(self._motion_timer / dur, 1.0)
            mtype = self._motion_data.get("type", "oscillate")
            freq = self._motion_data.get("frequency", 2.0)

            if mtype == "oscillate":
                # Sinusoidal oscillation with fade-in/fade-out envelope
                envelope = math.sin(progress * math.pi)
                wave = math.sin(self._motion_timer * freq * 2.0 * math.pi)
                motion_val = envelope * wave
            else:  # hold
                # Ease in -> hold -> ease out
                if progress < 0.2:
                    motion_val = progress / 0.2
                elif progress < 0.7:
                    motion_val = 1.0
                else:
                    motion_val = 1.0 - (progress - 0.7) / 0.3

            for idx, scale in self._motion_data.get("params", {}).items():
                p[idx] += motion_val * scale

            if progress >= 1.0:
                self._motion_name = None

        return p


_MOUTH_POSE = None
def _get_mouth_pose() -> np.ndarray:
    """Mouth pose template, initialized lazily."""
    global _MOUTH_POSE
    if _MOUTH_POSE is None:
        _MOUTH_POSE = np.zeros(45, dtype=np.float32)
        for i in [26]:
            _MOUTH_POSE[i] = 1.0
    return _MOUTH_POSE.copy()


# ------------------------------------------------------------
# 4. THAEngine — ONNX model loading and rendering
# ------------------------------------------------------------
class THAEngine:
    def __init__(self, model_path: str):
        self.session: Optional[ort.InferenceSession] = None
        self._loaded = False
        self.model_path = model_path
        self._lock = threading.Lock()

        # Preallocate constants to avoid repeated allocation and garbage collection
        self.green_bg = np.array([0.0, 255.0, 0.0], dtype=np.float32).reshape(3, 1, 1)
        # Cache output format to skip np.min() on each frame
        self._out_is_uint8: Optional[bool] = None
        self._out_range_neg: Optional[bool] = None
        self._inv255: float = 1.0 / 255.0

    def load(self):
        """Load the ONNX model."""
        if self._loaded:
            return
            
        available_providers = ort.get_available_providers()
        
        provider_options = [
            ("TensorrtExecutionProvider", {
                "trt_fp16_enable": True,
                "trt_engine_cache_enable": True,
                "device_id": 0,
            }),
            ("CUDAExecutionProvider", {
                "arena_extend_strategy": "kSameAsRequested",
                "cudnn_conv_algo_search": "DEFAULT",
                "do_copy_in_default_stream": True,
                "gpu_mem_limit": 2 * 1024 * 1024 * 1024,
            }),
            ("ROCMExecutionProvider", {
                "arena_extend_strategy": "kSameAsRequested",
                "gpu_mem_limit": 2 * 1024 * 1024 * 1024,
            }),
            ("DmlExecutionProvider", {}),
            ("CoreMLExecutionProvider", {}),
            ("CPUExecutionProvider", {}),
        ]
        
        providers = []
        for p_name, p_opts in provider_options:
            if p_name in available_providers:
                providers.append((p_name, p_opts) if p_opts else p_name)
        
        if not providers:
            providers = ["CPUExecutionProvider"]
        
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_opts.enable_mem_pattern = True
        sess_opts.enable_cpu_mem_arena = True
        
        try:
            self.session = ort.InferenceSession(self.model_path, sess_opts, providers=providers)
        except Exception as e:
            logger.warning(f"[THA] Hardware acceleration failed; trying CPU fallback: {e}")
            self.session = ort.InferenceSession(self.model_path, sess_opts, providers=["CPUExecutionProvider"])
            
        active_provider = self.session.get_providers()[0]

        print(f"\n🚀 [THA] ===============================================")
        print(f"🚀 [THA] Frontend load requested; 2D engine initialized!")
        print(f"🚀 [THA] Model file: {os.path.basename(self.model_path)}")
        print(f"🚀 [THA] Active execution provider: \033[1;32m{active_provider}\033[0m")
        print(f"🚀 [THA] ===============================================\n")

        self._loaded = True

    def render(self, pose: np.ndarray, quality: int = 50) -> bytes:
        """Render one frame and return JPEG bytes.

        Args:
            pose: 45-dimensional pose parameters
            quality: JPEG quality (1-100); higher values give the frontend upscaler cleaner input
        """
        if not self._loaded:
            self.load()

        p = pose.reshape(1, 45).astype(np.float32)
        with self._lock:
            out = self.session.run(None, {"pose": p})[0]
            img_data = out[0].copy()  # (C, 512, 512) GHW; copy prevents concurrent run() from overwriting the buffer

        C = img_data.shape[0]
        _clip = np.clip  # Local reference to reduce attribute lookup

        if C == 4:
            # ── RGBA model: composite against green screen ──
            rgb = img_data[:3, :, :]
            alpha = img_data[3, :, :]

            if self._out_is_uint8 is None:
                self._out_is_uint8 = (img_data.dtype == np.uint8)
                if not self._out_is_uint8:
                    self._out_range_neg = (np.min(rgb) < -0.1)

            if self._out_is_uint8:
                alpha_f = alpha.astype(np.float32)[np.newaxis, :, :] * self._inv255
                result = rgb.astype(np.float32) * alpha_f \
                         + self.green_bg * (1.0 - alpha_f)
                result = _clip(result, 0, 255).astype(np.uint8)
            else:
                if self._out_range_neg:
                    rgb = (rgb + 1.0) * 127.5
                    alpha = (alpha + 1.0) * 0.5
                else:
                    rgb = rgb * 255.0
                alpha = alpha[np.newaxis, :, :]
                result = rgb * alpha + self.green_bg * (1.0 - alpha)
                result = _clip(result, 0, 255).astype(np.uint8)

        elif C == 3:
            # ── Three-channel green-screen model (default for model.onnx) ──
            if self._out_is_uint8 is None:
                self._out_is_uint8 = (img_data.dtype == np.uint8)
                if not self._out_is_uint8:
                    self._out_range_neg = (np.min(img_data) < -0.1)

            if self._out_is_uint8:
                result = img_data
            else:
                if self._out_range_neg:
                    result = _clip((img_data + 1.0) * 127.5, 0, 255).astype(np.uint8)
                else:
                    result = _clip(img_data * 255.0, 0, 255).astype(np.uint8)

        else:
            raise RuntimeError(f"Unsupported channel count: {C}")

        rgb_out = np.ascontiguousarray(result.transpose(1, 2, 0))
        return simplejpeg.encode_jpeg(rgb_out, quality=quality, colorspace='RGB', colorsubsampling='422')

    @property
    def loaded(self) -> bool:
        return self._loaded


# ------------------------------------------------------------
# 4b. CoreMLTHAEngine — Apple Silicon CoreML rendering
# ------------------------------------------------------------
class CoreMLTHAEngine:
    """Apple Silicon CoreML .mlpackage rendering engine with baked textures and a single pose input."""

    def __init__(self, model_path: str):
        self.model = None
        self._loaded = False
        self.model_path = model_path
        self._out_key = None
        self._lock = threading.Lock()
        self.green_bg = np.array([0.0, 255.0, 0.0], dtype=np.float32).reshape(3, 1, 1)

    def load(self):
        if self._loaded:
            return
        try:
            from coremltools.models import MLModel
        except ImportError:
            raise RuntimeError("coremltools not installed. Run: pip install coremltools")

        self.model = MLModel(self.model_path)
        self._out_key = [k for k in self.model.get_spec().description.output if k.name != "pose"]
        if self._out_key:
            self._out_key = self._out_key[0].name
        else:
            self._out_key = None

        print(f"\n🍎 [THA] ===============================================")
        print(f"🍎 [THA] Apple Silicon CoreML engine initialized!")
        print(f"🍎 [THA] Model: {os.path.basename(self.model_path)}")
        print(f"🍎 [THA] Format: baked .mlpackage (single pose input, Neural Engine)")
        print(f"🍎 [THA] ===============================================\n")
        self._loaded = True

    def render(self, pose: np.ndarray, quality: int = 50) -> bytes:
        if not self._loaded:
            self.load()

        p = pose.reshape(1, 45).astype(np.float32)
        with self._lock:
            result = self.model.predict({"pose": p})

        if self._out_key:
            blended = result[self._out_key]
        else:
            blended = [v for k, v in result.items() if k != "pose"][0]

        img_data = blended[0]
        C = img_data.shape[0]
        _clip = np.clip

        if C == 4:
            rgb = img_data[:3, :, :]
            alpha = img_data[3, :, :]
            rgb = (rgb + 1.0) * 0.5
            alpha = (alpha + 1.0) * 0.5
            safe_a = np.where(alpha > 1e-6, alpha, 1.0)
            rgb = rgb / safe_a[np.newaxis, :, :]
            rgb = _linear_to_srgb(_clip(rgb, 0, 1))
            alpha_a = alpha[np.newaxis, :, :]
            result = (rgb * 255.0) * alpha_a + self.green_bg * (1.0 - alpha_a)
            result = _clip(result, 0, 255).astype(np.uint8)
        elif C == 3:
            result = img_data if img_data.dtype == np.uint8 else _clip((img_data + 1.0) * 127.5, 0, 255).astype(np.uint8)
        else:
            raise RuntimeError(f"Unsupported channel count: {C}")

        rgb_out = np.ascontiguousarray(result.transpose(1, 2, 0))
        return simplejpeg.encode_jpeg(rgb_out, quality=quality, colorspace='RGB', colorsubsampling='422')

    @property
    def loaded(self) -> bool:
        return self._loaded


# ------------------------------------------------------------
# 5. THAModelManager — Model file management
# ------------------------------------------------------------
class THAModelManager:
    def __init__(self, default_dir: str, user_upload_dir: str):
        self.default_dir = default_dir
        self.user_upload_dir = user_upload_dir

    def scan_default_models(self, base_url: str = "") -> list:
        return self._scan_models(self.default_dir, "default", base_url)

    def scan_user_models(self, base_url: str = "") -> list:
        return self._scan_models(self.user_upload_dir, "user", base_url)

    def _scan_models(self, directory: str, model_type: str, base_url: str = "") -> list:
        models = []
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            return models

        is_mac = (sys.platform == 'darwin')

        for entry in os.listdir(directory):
            entry_path = os.path.join(directory, entry)
            if os.path.isdir(entry_path):
                model_path = None
                if is_mac:
                    mlp_path = os.path.join(entry_path, "model.mlpackage")
                    if os.path.isdir(mlp_path):
                        model_path = mlp_path
                if model_path is None:
                    onnx_path = os.path.join(entry_path, "model.onnx")
                    if os.path.exists(onnx_path):
                        model_path = onnx_path
                if model_path:
                    models.append({
                        "id": entry,
                        "name": entry,
                        "modelPath": model_path,
                        "type": model_type
                    })
        models.sort(key=lambda x: x["name"])
        return models

    def install_onnx(self, onnx_data: bytes, display_name: str) -> Tuple[bool, str, dict]:
        """Install a user-uploaded ONNX model in user_upload_dir/{display_name}/."""
        safe_name = display_name.strip().replace(" ", "_")
        if not safe_name:
            safe_name = f"model_{uuid.uuid4().hex[:8]}"

        target_dir = os.path.join(self.user_upload_dir, safe_name)
        abs_target = os.path.abspath(target_dir)
        abs_user_dir = os.path.abspath(self.user_upload_dir)
        if not abs_target.startswith(abs_user_dir + os.sep) and abs_target != abs_user_dir:
            return False, "Invalid model directory path", {}

        if os.path.exists(target_dir):
            import shutil
            shutil.rmtree(target_dir)
        os.makedirs(target_dir, exist_ok=True)

        try:
            dest = os.path.join(target_dir, "model.onnx")
            with open(dest, "wb") as f:
                f.write(onnx_data)

            return True, "Installation successful", {
                "id": safe_name,
                "name": display_name,
                "type": "user"
            }
        except Exception as e:
            import shutil
            shutil.rmtree(target_dir)
            return False, f"Installation failed: {str(e)}", {}

    def install_mlpackage(self, zip_data: bytes, display_name: str) -> Tuple[bool, str, dict]:
        """Install a user-uploaded CoreML mlpackage ZIP."""
        import shutil, zipfile, io
        safe_name = display_name.strip().replace(" ", "_")
        if not safe_name:
            safe_name = f"model_{uuid.uuid4().hex[:8]}"

        target_dir = os.path.join(self.user_upload_dir, safe_name)
        abs_target = os.path.abspath(target_dir)
        abs_user_dir = os.path.abspath(self.user_upload_dir)
        if not abs_target.startswith(abs_user_dir + os.sep) and abs_target != abs_user_dir:
            return False, "Invalid model directory path", {}

        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
        os.makedirs(target_dir, exist_ok=True)

        try:
            with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
                zf.extractall(target_dir)

            # Normalize Windows-style backslash paths (macOS/Linux compatibility)
            for entry in os.listdir(target_dir):
                if '\\' not in entry:
                    continue
                src = os.path.join(target_dir, entry)
                normalized = entry.replace('\\', os.sep)
                if normalized.endswith(os.sep):
                    os.makedirs(os.path.join(target_dir, normalized.rstrip(os.sep)), exist_ok=True)
                    if os.path.exists(src):
                        os.remove(src)
                else:
                    dst = os.path.join(target_dir, normalized)
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    shutil.move(src, dst)

            # Find .mlpackage directory
            mlpkg_found = False
            for root, dirs, files in os.walk(target_dir):
                for d in dirs:
                    if d.endswith('.mlpackage'):
                        mlpkg_found = True
                        break
                if mlpkg_found:
                    break

            if not mlpkg_found:
                shutil.rmtree(target_dir)
                return False, "No .mlpackage directory found in the ZIP", {}

            return True, "Installation successful", {
                "id": safe_name,
                "name": display_name,
                "type": "user"
            }
        except zipfile.BadZipFile:
            shutil.rmtree(target_dir)
            return False, "Invalid ZIP file", {}
        except Exception as e:
            shutil.rmtree(target_dir)
            return False, f"Installation failed: {str(e)}", {}

    def delete_model(self, model_id: str) -> bool:
        target_dir = os.path.join(self.user_upload_dir, model_id)
        abs_target = os.path.abspath(target_dir)
        abs_user_dir = os.path.abspath(self.user_upload_dir)
        # Safety check: ensure the target is inside the user upload directory and is not the root
        if os.path.exists(target_dir) and os.path.isdir(target_dir) and (abs_target.startswith(abs_user_dir + os.sep) or abs_target == abs_user_dir + os.sep + model_id):
            # Additional check: require THA model files to avoid deleting unrelated directories
            onnx_path = os.path.join(target_dir, "model.onnx")
            mlpkg_paths = list(Path(target_dir).rglob("*.mlpackage"))
            if not os.path.exists(onnx_path) and not mlpkg_paths:
                return False
            import shutil
            shutil.rmtree(target_dir)
            return True
        return False


# ------------------------------------------------------------
# 6. Global engine cache
# ------------------------------------------------------------
_engine_cache: Dict[str, THAEngine] = {}


def get_engine(model_path: str):
    """Factory: detect format automatically (.mlpackage -> CoreML, .onnx -> ONNX)."""
    if model_path not in _engine_cache:
        if model_path.endswith('.mlpackage') or os.path.isdir(model_path):
            _engine_cache[model_path] = CoreMLTHAEngine(model_path)
        else:
            _engine_cache[model_path] = THAEngine(model_path)
    return _engine_cache[model_path]


def delete_engine_cache_item(model_path: str):
    if model_path in _engine_cache:
        del _engine_cache[model_path]


def clear_engine_cache():
    _engine_cache.clear()