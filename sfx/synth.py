"""
Pure-Python 3 stdlib procedural UI sound synthesizer (`sfx/synth.py`).

Synthesizes frame-accurate UI sound cues (`click`, `type`/`typing`, `pop`,
`whoosh`, `chime`, `pad`/`riser`) from a `timeline.json` beat contract and
masters 16-bit 44.1kHz PCM WAV output to `-14.0 LUFS` using only standard
library modules (`wave`, `math`, `struct`, `json`, `array`).
"""

from __future__ import annotations

import array
import json
import math
import random
import struct
import wave
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple, Union

DEFAULT_SAMPLE_RATE = 44100
DEFAULT_TARGET_LUFS = -14.0


def _db_to_linear(db: float) -> float:
    return math.pow(10.0, float(db) / 20.0)


def _clamp(value: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _synth_click(sample_rate: int, duration_ms: float = 22.0, seed: int = 1) -> List[float]:
    n = max(16, int(round((duration_ms / 1000.0) * sample_rate)))
    rng = random.Random(seed)
    out: List[float] = []
    phase = 0.0
    for i in range(n):
        t = i / sample_rate
        progress = i / max(1, n - 1)
        freq = 1850.0 * math.pow(420.0 / 1850.0, progress)
        phase += (2.0 * math.pi * freq) / sample_rate
        env = math.exp(-t * 190.0)
        transient = (rng.uniform(-1.0, 1.0) * 0.35) * math.exp(-t * 420.0)
        sample = (math.sin(phase) * 0.8 + transient) * env
        out.append(sample)
    return out


def _synth_typing(sample_rate: int, duration_ms: float = 16.0, seed: int = 2) -> List[float]:
    n = max(16, int(round((duration_ms / 1000.0) * sample_rate)))
    rng = random.Random(seed)
    pitch_scale = 1.0 + rng.uniform(-0.08, 0.08)
    out: List[float] = []
    phase = 0.0
    for i in range(n):
        t = i / sample_rate
        freq = (2400.0 - 1500.0 * (i / max(1, n - 1))) * pitch_scale
        phase += (2.0 * math.pi * freq) / sample_rate
        env = math.exp(-t * 240.0)
        noise = rng.uniform(-1.0, 1.0) * math.exp(-t * 500.0) * 0.45
        out.append((math.sin(phase) * 0.65 + noise) * env)
    return out


def _synth_pop(sample_rate: int, duration_ms: float = 55.0, seed: int = 3) -> List[float]:
    n = max(32, int(round((duration_ms / 1000.0) * sample_rate)))
    out: List[float] = []
    phase = 0.0
    for i in range(n):
        t = i / sample_rate
        progress = i / max(1, n - 1)
        # Rapid upward chirp from 210Hz to 690Hz with soft attack and exponential decay
        freq = 210.0 + (690.0 - 210.0) * math.pow(progress, 0.55)
        phase += (2.0 * math.pi * freq) / sample_rate
        attack = min(1.0, i / max(1.0, 0.003 * sample_rate))
        decay = math.exp(-t * 68.0)
        harmonic = 0.22 * math.sin(2.0 * phase)
        out.append((math.sin(phase) + harmonic) * attack * decay * 0.85)
    return out


def _synth_whoosh(sample_rate: int, duration_ms: float = 240.0, seed: int = 4) -> List[float]:
    n = max(64, int(round((duration_ms / 1000.0) * sample_rate)))
    rng = random.Random(seed)
    out: List[float] = []
    # State-variable 2-pole resonator for sweeping band-pass filtered noise
    low = 0.0
    band = 0.0
    tone_phase = 0.0
    for i in range(n):
        progress = i / max(1, n - 1)
        # Hann window envelope peaking at midpoint
        env = math.sin(math.pi * progress) ** 1.6
        cutoff_hz = 280.0 + 1950.0 * math.sin(math.pi * progress)
        f = 2.0 * math.sin(math.pi * min(0.45, cutoff_hz / sample_rate))
        q = 0.45
        white = rng.uniform(-1.0, 1.0)
        low = low + f * band
        high = white - low - q * band
        band = f * high + band
        tone_freq = 140.0 + 180.0 * math.sin(math.pi * progress)
        tone_phase += (2.0 * math.pi * tone_freq) / sample_rate
        sub = math.sin(tone_phase) * 0.25
        out.append((band * 0.85 + sub) * env)
    return out


def _synth_chime(sample_rate: int, duration_ms: float = 620.0, seed: int = 5) -> List[float]:
    n = max(64, int(round((duration_ms / 1000.0) * sample_rate)))
    freqs = (523.25, 659.25, 783.99, 1046.50)  # C5, E5, G5, C6 major triad + octave
    weights = (0.40, 0.30, 0.20, 0.15)
    out: List[float] = []
    for i in range(n):
        t = i / sample_rate
        attack = min(1.0, i / max(1.0, 0.006 * sample_rate))
        val = 0.0
        for idx, f in enumerate(freqs):
            # Subtle arpeggio micro-stagger (12ms per partial)
            local_t = max(0.0, t - idx * 0.012)
            if local_t <= 0.0:
                continue
            decay = math.exp(-local_t * (5.2 + idx * 1.1))
            fm = 0.35 * math.sin(2.0 * math.pi * (f * 2.0) * local_t) * math.exp(-local_t * 18.0)
            val += weights[idx] * math.sin(2.0 * math.pi * f * local_t + fm) * decay
        out.append(val * attack)
    return out


def _synth_pad(sample_rate: int, duration_ms: float = 1200.0, seed: int = 6) -> List[float]:
    n = max(128, int(round((duration_ms / 1000.0) * sample_rate)))
    freqs = (110.0, 164.81, 220.0, 277.18, 329.63)  # Warm A2 major9/fifth voicing
    detunes = (-0.4, 0.3, -0.2, 0.5, -0.3)
    out: List[float] = []
    for i in range(n):
        t = i / sample_rate
        progress = i / max(1, n - 1)
        # Smooth cosine fade-in and fade-out
        if progress < 0.2:
            env = 0.5 * (1.0 - math.cos(math.pi * (progress / 0.2)))
        elif progress > 0.75:
            env = 0.5 * (1.0 + math.cos(math.pi * ((progress - 0.75) / 0.25)))
        else:
            env = 1.0
        riser_mult = 1.0 + 0.04 * (progress ** 2)
        val = 0.0
        for f, d in zip(freqs, detunes):
            val += 0.20 * math.sin(2.0 * math.pi * (f + d) * riser_mult * t)
        out.append(val * env)
    return out


def synthesize_cue(
    cue_type: str,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    duration_ms: float | None = None,
    gain_db: float = 0.0,
    seed: int = 1,
) -> List[float]:
    """Synthesize a single procedural UI sound cue as mono float samples in [-1, 1]."""
    kind = (cue_type or "click").strip().lower()
    if kind in ("click", "tap", "press", "button"):
        samples = _synth_click(sample_rate, duration_ms or 22.0, seed=seed)
    elif kind in ("type", "typing", "key", "tick", "token"):
        samples = _synth_typing(sample_rate, duration_ms or 16.0, seed=seed)
    elif kind in ("pop", "bubble", "badge", "spring", "spring_pop"):
        samples = _synth_pop(sample_rate, duration_ms or 55.0, seed=seed)
    elif kind in ("whoosh", "swipe", "slide", "transition", "whip"):
        samples = _synth_whoosh(sample_rate, duration_ms or 240.0, seed=seed)
    elif kind in ("chime", "success", "ding", "confirm", "ping", "burst"):
        samples = _synth_chime(sample_rate, duration_ms or 620.0, seed=seed)
    elif kind in ("pad", "riser", "ambient", "bed", "drone", "pulse"):
        samples = _synth_pad(sample_rate, duration_ms or 1200.0, seed=seed)
    else:
        samples = _synth_pop(sample_rate, duration_ms or 50.0, seed=seed)

    gain = _db_to_linear(gain_db)
    return [s * gain for s in samples]


def normalize_timeline_cues(timeline: Union[Mapping[str, Any], Sequence[Any]]) -> Tuple[float, float, List[Dict[str, Any]]]:
    """
    Extract `(fps, duration_seconds, cues)` from a flexible `timeline.json` structure.
    Supports `beats[]`, `cues[]`, `events[]`, or raw arrays of timestamps/frames.
    """
    if isinstance(timeline, Sequence) and not isinstance(timeline, (str, bytes)):
        fps = 60.0
        raw_items = list(timeline)
        explicit_duration = 0.0
    elif isinstance(timeline, Mapping):
        fps = float(timeline.get("fps") or 60.0)
        if fps <= 0:
            fps = 60.0
        explicit_duration = float(
            timeline.get("durationSeconds")
            or timeline.get("duration_seconds")
            or timeline.get("duration")
            or (float(timeline["totalFrames"]) / fps if "totalFrames" in timeline else 0.0)
            or 0.0
        )
        raw_items = list(
            timeline.get("cues")
            or timeline.get("beats")
            or timeline.get("events")
            or timeline.get("times")
            or timeline.get("frames")
            or []
        )
    else:
        fps = 60.0
        raw_items = []
        explicit_duration = 0.0

    cues: List[Dict[str, Any]] = []
    max_time = explicit_duration

    for idx, item in enumerate(raw_items):
        if isinstance(item, (int, float)):
            val = float(item)
            time_sec = val / fps if (isinstance(item, int) and val >= 2.0) else val
            cues.append(
                {
                    "timeSeconds": max(0.0, time_sec),
                    "type": "pop" if idx == 0 else "click",
                    "gainDb": -4.5,
                    "durationMs": None,
                    "pan": 0.0,
                }
            )
            max_time = max(max_time, time_sec + 0.5)
            continue

        if not isinstance(item, Mapping):
            continue

        sfx_cfg = item.get("sfx") if isinstance(item.get("sfx"), Mapping) else {}
        merged: Dict[str, Any] = {**item, **sfx_cfg}

        if "timeSeconds" in merged or "time_seconds" in merged:
            time_sec = float(merged.get("timeSeconds") or merged.get("time_seconds") or 0.0)
        elif "timeMs" in merged or "time_ms" in merged:
            time_sec = float(merged.get("timeMs") or merged.get("time_ms") or 0.0) / 1000.0
        elif "time" in merged or "timestamp" in merged or "seconds" in merged:
            time_sec = float(merged.get("time") or merged.get("timestamp") or merged.get("seconds") or 0.0)
        elif "frameStart" in merged or "frame_start" in merged or "frame" in merged:
            frame_val = float(merged.get("frameStart") or merged.get("frame_start") or merged.get("frame") or 0.0)
            time_sec = frame_val / fps
        else:
            time_sec = idx * 0.5

        move_hint = str(merged.get("move") or merged.get("role") or "").lower()
        default_type = "pop"
        if "click" in move_hint or "cursor" in move_hint:
            default_type = "click"
        elif "type" in move_hint or "token" in move_hint:
            default_type = "typing"
        elif "whoosh" in move_hint or "slide" in move_hint or "tilt" in move_hint:
            default_type = "whoosh"
        elif "success" in move_hint or "burst" in move_hint or "confirm" in move_hint:
            default_type = "chime"

        cue_type = str(merged.get("type") or merged.get("cue") or merged.get("kind") or default_type)
        gain_db = float(merged.get("gainDb") if merged.get("gainDb") is not None else merged.get("gain_db", -4.0))
        duration_ms_raw = merged.get("durationMs") or merged.get("duration_ms")
        duration_ms = float(duration_ms_raw) if duration_ms_raw is not None else None
        pan = _clamp(float(merged.get("pan", 0.0)), -1.0, 1.0)

        cues.append(
            {
                "timeSeconds": max(0.0, time_sec),
                "type": cue_type,
                "gainDb": gain_db,
                "durationMs": duration_ms,
                "pan": pan,
            }
        )
        max_time = max(max_time, time_sec + ((duration_ms or 300.0) / 1000.0) + 0.25)

    duration_seconds = max(0.5, explicit_duration if explicit_duration > 0 else max_time)
    return fps, duration_seconds, cues


def compute_integrated_lufs(samples: Sequence[float], sample_rate: int = DEFAULT_SAMPLE_RATE) -> float:
    """
    Compute gated integrated loudness (LUFS approximation per ITU-R BS.1770).
    Uses 100ms blocks and -70 LUFS absolute gating so silent regions between UI
    clicks do not artificially depress the measured loudness of active cues.
    """
    if not samples:
        return -70.0
    block_size = max(1, int(round(0.100 * sample_rate)))
    block_energies: List[float] = []
    for start in range(0, len(samples), block_size):
        chunk = samples[start : start + block_size]
        if not chunk:
            continue
        mean_sq = sum(s * s for s in chunk) / len(chunk)
        if mean_sq > 1e-10:
            lufs_block = -0.691 + 10.0 * math.log10(mean_sq)
            if lufs_block > -70.0:
                block_energies.append(mean_sq)

    if not block_energies:
        mean_sq_all = sum(s * s for s in samples) / len(samples)
        if mean_sq_all <= 1e-12:
            return -70.0
        return -0.691 + 10.0 * math.log10(mean_sq_all)

    avg_energy = sum(block_energies) / len(block_energies)
    # Relative gate at -10 LU below ungated active mean
    rel_gate_linear = avg_energy * math.pow(10.0, -10.0 / 10.0)
    gated = [e for e in block_energies if e >= rel_gate_linear]
    final_energy = sum(gated) / len(gated) if gated else avg_energy
    return -0.691 + 10.0 * math.log10(max(1e-12, final_energy))


def master_to_lufs(
    left: List[float],
    right: List[float],
    target_lufs: float = DEFAULT_TARGET_LUFS,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
) -> Tuple[List[float], List[float], float]:
    """Normalize stereo float buffers to `target_lufs` (-14.0 LUFS) with -1.0 dBFS soft-knee limiting."""
    n = min(len(left), len(right))
    if n == 0:
        return left, right, -70.0
    mono_power = [math.sqrt(0.5 * (left[i] * left[i] + right[i] * right[i])) for i in range(n)]
    current_lufs = compute_integrated_lufs(mono_power, sample_rate=sample_rate)
    if current_lufs <= -69.5:
        return left, right, current_lufs

    out_l = list(left[:n])
    out_r = list(right[:n])
    measured_after = current_lufs
    ceiling = _db_to_linear(-1.0)  # -1.0 dBFS true-peak ceiling (~0.89125)

    for _ in range(3):
        delta_db = target_lufs - measured_after
        if abs(delta_db) < 0.05:
            break
        gain = _db_to_linear(max(-36.0, min(30.0, delta_db)))
        for i in range(n):
            sl = out_l[i] * gain
            sr = out_r[i] * gain
            out_l[i] = ceiling * math.tanh(sl / ceiling)
            out_r[i] = ceiling * math.tanh(sr / ceiling)
        mastered_mono = [math.sqrt(0.5 * (out_l[i] * out_l[i] + out_r[i] * out_r[i])) for i in range(n)]
        measured_after = compute_integrated_lufs(mastered_mono, sample_rate=sample_rate)

    return out_l, out_r, measured_after


def synthesize_timeline(
    timeline: Union[Mapping[str, Any], Sequence[Any]],
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    target_lufs: float = DEFAULT_TARGET_LUFS,
) -> Dict[str, Any]:
    """Synthesize and master a complete `timeline.json` specification into stereo 16-bit PCM."""
    fps, duration_seconds, cues = normalize_timeline_cues(timeline)
    total_samples = max(1, int(round(duration_seconds * sample_rate)))
    left = [0.0] * total_samples
    right = [0.0] * total_samples

    # Add a subtle warm ambient bed (-28 dB) if no explicit pad cue is present so the track has cohesive glue
    has_pad = any(str(c.get("type", "")).lower() in ("pad", "riser", "ambient", "bed") for c in cues)
    if not has_pad and cues:
        bed = synthesize_cue("pad", sample_rate=sample_rate, duration_ms=duration_seconds * 1000.0, gain_db=-26.0, seed=99)
        for i in range(min(total_samples, len(bed))):
            left[i] += bed[i]
            right[i] += bed[i]

    for idx, cue in enumerate(cues):
        start_idx = max(0, int(round(float(cue["timeSeconds"]) * sample_rate)))
        samples = synthesize_cue(
            cue_type=str(cue.get("type", "click")),
            sample_rate=sample_rate,
            duration_ms=cue.get("durationMs"),
            gain_db=float(cue.get("gainDb", -4.0)),
            seed=idx + 1,
        )
        pan = _clamp(float(cue.get("pan", 0.0)), -1.0, 1.0)
        angle = (pan + 1.0) * (math.pi / 4.0)
        gain_l = math.cos(angle)
        gain_r = math.sin(angle)
        for j, s in enumerate(samples):
            pos = start_idx + j
            if pos >= total_samples:
                break
            left[pos] += s * gain_l
            right[pos] += s * gain_r

    master_l, master_r, measured_lufs = master_to_lufs(left, right, target_lufs=target_lufs, sample_rate=sample_rate)

    pcm = array.array("h")
    for sl, sr in zip(master_l, master_r):
        pcm.append(int(round(_clamp(sl, -1.0, 1.0) * 32767.0)))
        pcm.append(int(round(_clamp(sr, -1.0, 1.0) * 32767.0)))

    return {
        "fps": fps,
        "sampleRate": sample_rate,
        "channels": 2,
        "durationSeconds": round(duration_seconds, 4),
        "targetLufs": target_lufs,
        "measuredLufs": round(measured_lufs, 2),
        "cueCount": len(cues),
        "cues": cues,
        "pcm": pcm,
    }


def render_timeline_to_wav(
    timeline_or_path: Union[str, Path, Mapping[str, Any], Sequence[Any]],
    out_path: Union[str, Path],
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    target_lufs: float = DEFAULT_TARGET_LUFS,
) -> Dict[str, Any]:
    """Load a `timeline.json` path or dict, synthesize all cues, and write a 16-bit stereo WAV file."""
    if isinstance(timeline_or_path, (str, Path)):
        timeline_data = json.loads(Path(timeline_or_path).read_text(encoding="utf-8-sig"))
    else:
        timeline_data = timeline_or_path

    rendered = synthesize_timeline(timeline_data, sample_rate=sample_rate, target_lufs=target_lufs)
    dest = Path(out_path).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)

    pcm: array.array = rendered["pcm"]
    with wave.open(str(dest), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())

    return {
        "ok": True,
        "outPath": str(dest),
        "sampleRate": rendered["sampleRate"],
        "channels": rendered["channels"],
        "durationSeconds": rendered["durationSeconds"],
        "targetLufs": rendered["targetLufs"],
        "measuredLufs": rendered["measuredLufs"],
        "cueCount": rendered["cueCount"],
    }
