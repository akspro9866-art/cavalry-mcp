"""CLI entry point for `python -m sfx --timeline timeline.json --out out.wav`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .synth import DEFAULT_SAMPLE_RATE, DEFAULT_TARGET_LUFS, render_timeline_to_wav


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="sfx",
        description="Synthesize procedural SaaS UI sound effects from timeline.json to a -14 LUFS WAV file.",
    )
    parser.add_argument(
        "--timeline",
        "-t",
        "--input",
        "-i",
        dest="timeline",
        required=True,
        help="Path to timeline.json (or inline JSON string).",
    )
    parser.add_argument(
        "--out",
        "-o",
        "--output",
        dest="out",
        required=True,
        help="Output WAV file path.",
    )
    parser.add_argument(
        "--target-lufs",
        "--lufs",
        dest="target_lufs",
        type=float,
        default=DEFAULT_TARGET_LUFS,
        help="Target integrated loudness in LUFS (default: -14.0).",
    )
    parser.add_argument(
        "--sample-rate",
        dest="sample_rate",
        type=int,
        default=DEFAULT_SAMPLE_RATE,
        help="WAV sample rate in Hz (default: 44100).",
    )
    args = parser.parse_args(argv)

    raw_timeline = args.timeline.strip()
    if raw_timeline.startswith("{") or raw_timeline.startswith("["):
        timeline_source = json.loads(raw_timeline)
    else:
        timeline_source = Path(raw_timeline)

    result = render_timeline_to_wav(
        timeline_source,
        args.out,
        sample_rate=args.sample_rate,
        target_lufs=args.target_lufs,
    )
    sys.stdout.write(json.dumps(result) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
