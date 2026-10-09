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
    "orange": "Знайди помаранчеву кульку.",
    "purple": "Знайди фіолетову кульку.",
    "pink": "Знайди рожеву кульку.",
    "turquoise": "Знайди бірюзову кульку.",
    "brown": "Знайди коричневу кульку.",
    "retry-red": "Шукай червону кульку.",
    "retry-yellow": "Шукай жовту кульку.",
    "retry-blue": "Шукай синю кульку.",
    "retry-green": "Шукай зелену кульку.",
    "retry-orange": "Шукай помаранчеву кульку.",
    "retry-purple": "Шукай фіолетову кульку.",
    "retry-pink": "Шукай рожеву кульку.",
    "retry-turquoise": "Шукай бірюзову кульку.",
    "retry-brown": "Шукай коричневу кульку.",
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
    pending = {name: phrase for name, phrase in PHRASES.items()
               if not (OUT / (name + ".ogg")).exists()}
    print(f"Missing clips: {len(pending)}; expected clips: {len(PHRASES)}", flush=True)
    # Preserve existing 18 WAV-derived recordings. Only generate missing colors.
    if pending:
        build_missing(pending)
    for name in PHRASES:
        if not (OUT / (name + ".ogg")).exists():
            raise RuntimeError("Missing clip after generation: " + name)
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
    print(f"Validated {len(PHRASES)} audio clips", flush=True)


def build_missing(pending: dict[str, str]) -> None:
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

        # Piper CLI v1.8 accepts one output_file at a time (no --json-input).
        # Short phrases keep the memory and synthesis cost low.
        for name, phrase in pending.items():
            wav = raw / (name + ".wav")
            run(["piper", "--model", str(model), "--output-file", str(wav)],
                input_text=phrase + "\n")
            if not wav.exists() or wav.stat().st_size < 500:
                raise RuntimeError("Missing or empty TTS output: " + name)

        for name in pending:
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



if __name__ == "__main__":
    main()
