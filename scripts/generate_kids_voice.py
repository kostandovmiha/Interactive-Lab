#!/usr/bin/env python3
"""Generate Ukrainian toddler-friendly voice clips for Kids Playground.

Voice: RomanStasyshyn/uk_UA-tetiana-high (Apache-2.0).
Generated audio is committed, NOT the 114 MB Piper model.
Requires: piper-tts, ffmpeg, ffprobe, Python 3.11.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "kids-games" / "audio"
MODEL_BASE = "https://huggingface.co/RomanStasyshyn/uk_UA-tetiana-high/resolve/main/"
PHRASES = {
    "hello": "Привіт! Давай лопати кульки!",
    "free": "Торкнися будь-якої кульки.",
    "red": "Знайди червону кульку.",
    "yellow": "Знайди жовту кульку.",
    "blue": "Знайди синю кульку.",
    "green": "Знайди зелену кульку.",
    "retry-red": "Шукай червону кульку.",
    "retry-yellow": "Шукай жовту кульку.",
    "retry-blue": "Шукай синю кульку.",
    "retry-green": "Шукай зелену кульку.",
    "great": "Молодець!",
    "wonderful": "Чудово!",
    "super": "Супер!",
    "hooray": "Ура!",
    "yes": "Так! Молодець!",
    "again": "Давай ще!",
    "excellent": "Прекрасно!",
    "good-job": "Ти молодець!",
}


def run(cmd: list[str], *, input_text: str | None = None) -> None:
    print("+", " ".join(cmd[:8]), flush=True)
    subprocess.run(cmd, input=input_text, text=True, check=True, timeout=600)


def get_model_file(name: str, dest: Path) -> None:
    req = urllib.request.Request(MODEL_BASE + name + "?download=true",
                                 headers={"User-Agent": "KidsPlayground-TTS-builder/1.0"})
    with urllib.request.urlopen(req, timeout=180) as response, dest.open("wb") as target:
        while True:
            chunk = response.read(2 * 1024 * 1024)
            if not chunk:
                break
            target.write(chunk)
    print(name, dest.stat().st_size, "bytes")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kids-uk-tts-") as td:
        work = Path(td)
        model = work / "tetiana.onnx"
        config = work / "tetiana.onnx.json"
        get_model_file("tetiana.onnx", model)
        get_model_file("tetiana.onnx.json", config)
        assert model.stat().st_size > 40_000_000, "Unexpectedly small voice model"
        assert json.loads(config.read_text(encoding="utf-8"))["espeak"]["voice"] == "uk"
        raw = work / "wav"
        raw.mkdir()

        # One Piper process for all clips: avoids reloading the model repeatedly.
        jobs = "\n".join(json.dumps({
            "text": phrase, "output_file": str(raw / (name + ".wav"))
        }, ensure_ascii=False) for name, phrase in PHRASES.items()) + "\n"
        run(["piper", "--model", str(model), "--json-input"], input_text=jobs)

        for name in PHRASES:
            wav = raw / (name + ".wav")
            if not wav.exists() or wav.stat().st_size < 500:
                raise RuntimeError("Missing or empty TTS output: " + name)
            target = OUT / (name + ".ogg")
            # Small, compatible offline Opus files for desktop Chrome and Android Chrome.
            run(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                 "-i", str(wav),
                 "-af", "loudnorm=I=-18:LRA=7:TP=-2",
                 "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "40k",
                 str(target)])
            duration = float(subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_entries",
                 "format=duration", "-of", "default=nw=1:nk=1", str(target)],
                text=True, timeout=20
            ).strip())
            if not .2 <= duration <= 12:
                raise RuntimeError(f"Unexpected duration {duration:.2f}s: {name}")
            print(f"{name:14} {duration:4.2f}s {target.stat().st_size:8} bytes")

    (OUT / "phrases.json").write_text(
        json.dumps({
            "language": "uk-UA",
            "voice": "Tetiana",
            "source": "https://huggingface.co/RomanStasyshyn/uk_UA-tetiana-high",
            "modelLicense": "Apache-2.0",
            "files": {key: {"text": val, "src": f"./audio/{key}.ogg"}
                      for key, val in PHRASES.items()},
        }, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(PHRASES)} audio clips", flush=True)


if __name__ == "__main__":
    main()
