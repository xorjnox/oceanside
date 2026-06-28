#!/usr/bin/env python3
"""
VoiceSync merge tool.
Usage: python merge.py --session ~/Podcasts/episode-12/

Reads session.json, finds WAVs in raw/, aligns them using beep cross-correlation,
writes aligned WAVs to output/aligned/, generates a Reaper project and merge report.
"""

import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import scipy.signal
import scipy.io.wavfile


# ── Beep detection ─────────────────────────────────────────────────────────────

def generate_beep_template(freq_hz: float, duration_sec: float, sample_rate: int) -> np.ndarray:
    t = np.linspace(0, duration_sec, int(duration_sec * sample_rate), endpoint=False)
    fade = int(0.005 * sample_rate)
    env = np.ones_like(t)
    env[:fade] = np.linspace(0, 1, fade)
    env[-fade:] = np.linspace(1, 0, fade)
    return (0.8 * env * np.sin(2 * math.pi * freq_hz * t)).astype(np.float32)


def find_beep_positions(audio: np.ndarray, template: np.ndarray, sample_rate: int, min_gap_sec: float = 30.0) -> list[int]:
    """Return sample indices of detected beeps via normalized cross-correlation."""
    corr = scipy.signal.correlate(audio, template, mode="full", method="fft")
    corr = corr[len(template) - 1:]  # align to start of audio

    # Normalize
    corr /= (np.std(audio) * np.std(template) * len(template) + 1e-9)

    threshold = corr.mean() + 4.0 * corr.std()
    min_gap = int(min_gap_sec * sample_rate)

    peaks = []
    i = 0
    while i < len(corr):
        if corr[i] > threshold:
            # Find peak in this region
            end = min(i + min_gap, len(corr))
            peak_idx = i + int(np.argmax(corr[i:end]))
            peaks.append(peak_idx)
            i = peak_idx + min_gap
        else:
            i += 1

    return peaks


# ── Alignment ─────────────────────────────────────────────────────────────────

def align_files(ref_beeps: list[int], other_beeps: list[int], audio: np.ndarray, sample_rate: int) -> tuple[np.ndarray, dict]:
    """Compute offset and optionally correct clock drift; return padded audio + report."""
    if not ref_beeps or not other_beeps:
        print("  WARNING: insufficient beeps for alignment, using zero offset", file=sys.stderr)
        return audio, {"offset_samples": 0, "drift_ppm": 0, "method": "none", "beeps_used": 0}

    # Pair up by index (shortest wins)
    n = min(len(ref_beeps), len(other_beeps))
    if n < len(ref_beeps) or n < len(other_beeps):
        print(f"  WARNING: beep count mismatch (ref={len(ref_beeps)}, other={len(other_beeps)}); using first {n}", file=sys.stderr)

    ref_pts = np.array(ref_beeps[:n])
    oth_pts = np.array(other_beeps[:n])
    offsets = ref_pts - oth_pts

    mean_offset = int(np.mean(offsets))
    max_drift = int(np.max(np.abs(offsets - mean_offset)))

    if n == 1 or max_drift < 50:
        # Constant offset: just pad
        method = "pad"
        if mean_offset > 0:
            # other file starts late → pad front
            aligned = np.concatenate([np.zeros(mean_offset, dtype=audio.dtype), audio])
        elif mean_offset < 0:
            # other file starts early → trim front
            aligned = audio[abs(mean_offset):]
        else:
            aligned = audio
        drift_ppm = 0
    else:
        # Linear drift: fit a line to offsets vs time position
        method = "resample"
        times = ref_pts.astype(float)
        coeffs = np.polyfit(times, offsets.astype(float), 1)
        drift_rate = coeffs[0]  # samples/sample = ratio
        correction_ratio = 1.0 + drift_rate
        drift_ppm = int(drift_rate * 1_000_000)
        print(f"  Clock drift detected: {drift_ppm} ppm, resampling…")

        # resample_poly needs integer ratio — approximate with large integers
        # Use ratio p/q ≈ correction_ratio
        p = round(correction_ratio * 1000)
        q = 1000
        import math as _math
        g = _math.gcd(p, q)
        aligned = scipy.signal.resample_poly(audio, p // g, q // g).astype(np.float32)

        # After resampling, apply constant offset
        if mean_offset > 0:
            aligned = np.concatenate([np.zeros(mean_offset, dtype=aligned.dtype), aligned])
        elif mean_offset < 0:
            aligned = aligned[abs(mean_offset):]

    return aligned, {
        "offset_samples": mean_offset,
        "offset_ms": mean_offset / sample_rate * 1000,
        "drift_ppm": drift_ppm,
        "method": method,
        "beeps_used": n,
        "beep_positions_ref": ref_pts.tolist(),
        "beep_positions_other": oth_pts.tolist(),
    }


# ── Reaper project generation ──────────────────────────────────────────────────

REAPER_TRACK_TEMPLATE = """\
  <TRACK
    NAME "{name}"
    MUTE 0
    SOLO 0
    <ITEM
      POSITION 0
      LENGTH {length:.6f}
      <SOURCE WAVE
        FILE "aligned/{filename}"
      >
    >
  >
"""

def generate_reaper_project(session_name: str, tracks: list[dict], sample_rate: int, output_path: Path):
    total_len = max(t["length_sec"] for t in tracks) if tracks else 0
    track_blocks = "".join(
        REAPER_TRACK_TEMPLATE.format(
            name=t["name"],
            length=t["length_sec"],
            filename=t["filename"],
        )
        for t in tracks
    )
    rpp = f'<REAPER_PROJECT 0.1 "7.0"\n  SAMPLERATE {sample_rate} 0 0\n{track_blocks}>\n'
    output_path.write_text(rpp)
    print(f"Reaper project: {output_path}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="VoiceSync merge tool")
    parser.add_argument("--session", required=True, help="Path to session directory")
    parser.add_argument("--mixdown", action="store_true", help="Produce mixdown.wav via ffmpeg")
    args = parser.parse_args()

    session_dir = Path(args.session).expanduser().resolve()
    session_json = session_dir / "session.json"

    if not session_json.exists():
        print(f"ERROR: {session_json} not found", file=sys.stderr)
        sys.exit(1)

    with open(session_json) as f:
        session = json.load(f)

    cfg = session["config"]
    sample_rate: int = cfg["sample_rate"]
    beep_freq: float = cfg["beep_freq_hz"]
    beep_dur: float = cfg["beep_duration_sec"]

    raw_dir = session_dir / "raw"
    out_dir = session_dir / "output" / "aligned"
    out_dir.mkdir(parents=True, exist_ok=True)

    wav_files = sorted(raw_dir.glob("*.wav"))
    if not wav_files:
        print(f"ERROR: no WAV files in {raw_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(wav_files)} WAV files")
    template = generate_beep_template(beep_freq, beep_dur, sample_rate)

    # Load and detect beeps in all files
    audios: dict[str, np.ndarray] = {}
    beep_positions: dict[str, list[int]] = {}

    for wav_path in wav_files:
        print(f"Processing {wav_path.name}…")
        sr, data = scipy.io.wavfile.read(wav_path)
        if sr != sample_rate:
            print(f"  WARNING: {wav_path.name} has sample rate {sr}, expected {sample_rate}")
        if data.dtype == np.int16:
            audio = data.astype(np.float32) / 32768.0
        elif data.dtype == np.float32:
            audio = data
        else:
            audio = data.astype(np.float32)
        if audio.ndim > 1:
            audio = audio[:, 0]  # take left channel if stereo
        audios[wav_path.stem] = audio
        beeps = find_beep_positions(audio, template, sample_rate)
        beep_positions[wav_path.stem] = beeps
        print(f"  {len(beeps)} beep(s) detected")

    # Pick reference (first file, or look for host's file)
    stems = list(audios.keys())
    host_name = None
    if "participants" in session:
        for p in session["participants"]:
            if p.get("role") == "host":
                safe = "".join(c if c.isalnum() else "_" for c in p["name"])
                if safe in stems:
                    host_name = safe
                    break
    ref_stem = host_name or stems[0]
    print(f"\nReference track: {ref_stem}")
    ref_beeps = beep_positions[ref_stem]

    # Align all files to reference
    aligned: dict[str, np.ndarray] = {ref_stem: audios[ref_stem]}
    reports: dict[str, dict] = {ref_stem: {"method": "reference", "offset_samples": 0, "drift_ppm": 0}}

    for stem in stems:
        if stem == ref_stem:
            continue
        print(f"\nAligning {stem}…")
        al, report = align_files(ref_beeps, beep_positions[stem], audios[stem], sample_rate)
        aligned[stem] = al
        reports[stem] = report
        print(f"  offset={report['offset_ms']:.1f}ms  drift={report['drift_ppm']}ppm  method={report['method']}")

    # Pad all to same length
    max_len = max(len(a) for a in aligned.values())
    tracks_meta = []
    for stem, audio in aligned.items():
        if len(audio) < max_len:
            audio = np.concatenate([audio, np.zeros(max_len - len(audio), dtype=audio.dtype)])
        # Convert back to int16 for WAV
        pcm = np.clip(audio * 32767, -32768, 32767).astype(np.int16)
        out_path = out_dir / f"{stem}.wav"
        scipy.io.wavfile.write(out_path, sample_rate, pcm)
        print(f"Wrote {out_path}")
        tracks_meta.append({
            "name": stem,
            "filename": f"{stem}.wav",
            "length_sec": max_len / sample_rate,
        })

    # Reaper project
    rpp_path = session_dir / "output" / "session.rpp"
    generate_reaper_project(session.get("session_name", "Session"), tracks_meta, sample_rate, rpp_path)

    # Merge report
    report_path = session_dir / "output" / "merge_report.json"
    report = {
        "session_id": session.get("session_id"),
        "sample_rate": sample_rate,
        "reference_track": ref_stem,
        "tracks": {stem: {"beeps_detected": beep_positions[stem], **reports[stem]} for stem in stems},
    }
    report_path.write_text(json.dumps(report, indent=2))
    print(f"\nMerge report: {report_path}")

    # Optional mixdown
    if args.mixdown:
        inputs = []
        for stem in stems:
            inputs += ["-i", str(out_dir / f"{stem}.wav")]
        mixdown_path = session_dir / "output" / "mixdown.wav"
        result = subprocess.run(
            ["ffmpeg", "-y"] + inputs + [
                "-filter_complex", f"amix=inputs={len(stems)}:duration=longest",
                str(mixdown_path),
            ],
            capture_output=True,
        )
        if result.returncode == 0:
            print(f"Mixdown: {mixdown_path}")
        else:
            print("ffmpeg mixdown failed (ffmpeg not installed?)", file=sys.stderr)

    print("\nDone.")


if __name__ == "__main__":
    main()
