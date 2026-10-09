#!/usr/bin/env python3
"""Generate 1–5 ElevenLabs Ukrainian sample clips for Interactive Lab.

Requires ELEVENLABS_API_KEY GitHub Actions secret.
Read comma-separated voice ids from VOICE_IDS environment variable.
The API key is NEVER written to public files or logs.
Only a short phrase per voice is generated, minimizing credit usage.
"""
from __future__ import annotations
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "voice-lab" / "samples"
PHRASE = "Привіт! Давай лопати кульки! Знайди червону кульку. Ура, молодець!"
MODEL = "eleven_multilingual_v2"
URL = "https://api.elevenlabs.io/v1"

def request(url: str, key: str, payload: dict | None = None) -> bytes:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "xi-api-key": key,
            "Accept": "audio/mpeg" if data else "application/json",
            "Content-Type": "application/json",
            "User-Agent": "InteractiveLab-VoiceSampler/1.0",
        },
        method="POST" if data else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.read()
    except urllib.error.HTTPError as exc:
        # No response body: some providers may echo request headers or sensitive data.
        raise RuntimeError(f"ElevenLabs API returned HTTP {exc.code}. "
                           "Check plan, voice accessibility, available credits and API key.") from None

def main() -> None:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise SystemExit("Missing secret ELEVENLABS_API_KEY. Set it in repository Actions secrets.")
    raw = os.environ.get("VOICE_IDS", "")
    ids = [s.strip() for s in re.split(r"[,;\s]+", raw) if s.strip()]
    if not 1 <= len(ids) <= 5:
        raise SystemExit("Enter between 1 and 5 comma-separated voice IDs.")
    if any(not re.fullmatch(r"[A-Za-z0-9]{8,64}", value) for value in ids):
        raise SystemExit("One or more voice IDs are malformed.")
    if len(set(ids)) != len(ids):
        raise SystemExit("Voice IDs must be unique.")

    SAMPLES.mkdir(parents=True, exist_ok=True)
    entries = []
    for i, voice_id in enumerate(ids, start=1):
        name = f"Голос {i}"
        try:
            metadata = json.loads(request(f"{URL}/voices/{voice_id}", key))
            name = str(metadata.get("name") or name)[:60]
        except (RuntimeError, ValueError):
            pass  # TTS request will surface the real failure reason.
        url = f"{URL}/text-to-speech/{voice_id}?output_format=mp3_44100_128"
        print(f"Generating voice {i}/{len(ids)} ({name})...")
        data = request(url, key, {
            "text": PHRASE,
            "model_id": MODEL,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        })
        if len(data) < 1024 or data[:1] == b"{":
            raise RuntimeError("Unexpected response from ElevenLabs for voice " + str(i))
        filename = f"voice-{i}.mp3"
        (SAMPLES / filename).write_bytes(data)
        entries.append({"name": name, "voice_id": voice_id, "file": filename})
        print(f"Generated voice {i}, {len(data)} bytes")
    # Don't retain stale comparison clips from an earlier run.
    for file in SAMPLES.glob("voice-*.mp3"):
        if file.name not in {entry["file"] for entry in entries}:
            file.unlink()

    (SAMPLES / "manifest.json").write_text(
        json.dumps({
            "source": "ElevenLabs",
            "model": MODEL,
            "sample_text": PHRASE,
            "voice_attribution": "elevenlabs.io",
            "voices": entries,
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Published", len(entries), "voice samples. API key was not stored.")

if __name__ == "__main__":
    main()
