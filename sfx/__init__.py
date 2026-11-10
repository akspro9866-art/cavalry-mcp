"""Pure-Python 3 stdlib procedural UI sound-design synthesizer (-14 LUFS mastered WAV)."""

from .synth import (
    DEFAULT_SAMPLE_RATE,
    DEFAULT_TARGET_LUFS,
    compute_integrated_lufs,
    master_to_lufs,
    normalize_timeline_cues,
    render_timeline_to_wav,
    synthesize_cue,
    synthesize_timeline,
)

__all__ = [
    "DEFAULT_SAMPLE_RATE",
    "DEFAULT_TARGET_LUFS",
    "compute_integrated_lufs",
    "master_to_lufs",
    "normalize_timeline_cues",
    "render_timeline_to_wav",
    "synthesize_cue",
    "synthesize_timeline",
]
