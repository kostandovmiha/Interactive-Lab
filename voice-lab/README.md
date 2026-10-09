# Voice Lab — ElevenLabs voice comparison

**[Open Voice Lab](https://kostandovmiha.github.io/Interactive-Lab/voice-lab/)**

Voice Lab compares 1–5 Ukrainian voice samples using the same phrase:
> Привіт! Давай гратися з кульками! Знайди червону кульку. Ура! Молодець!

## Free route, without API setup

1. Go to [ElevenLabs Voices](https://elevenlabs.io/app/voice-library) and pick voices available to your account.
2. Copy the test phrase from Voice Lab and generate separate MP3 files with [Text to Speech](https://elevenlabs.io/app/speech-synthesis/text-to-speech).
3. In Voice Lab choose **Додати аудіо** for each candidate. Files stay in your browser via IndexedDB, not uploaded to the server.
4. Play, rate, rename and choose one favourite. You can also drag files onto the cards.

## Optional: automated samples using GitHub Actions

The workflow at .github/workflows/elevenlabs-voice-samples.yml can generate samples directly from ElevenLabs using their API. It needs a one-time secret setup.

1. Create a personal ElevenLabs API key in the ElevenLabs dashboard, with limited Text-to-Speech permissions and a low credit quota.
2. Add it as a GitHub Actions repository secret named **ELEVENLABS_API_KEY** under [Settings → Secrets and variables → Actions](https://github.com/kostandovmiha/Interactive-Lab/settings/secrets/actions). **Never paste keys into this chat, a commit, or the public Voice Lab.**
3. In [GitHub Actions — Generate ElevenLabs voice previews](https://github.com/kostandovmiha/Interactive-Lab/actions/workflows/elevenlabs-voice-samples.yml), press **Run workflow** and enter between one and five **comma-separated voice IDs**. In ElevenLabs **My Voices**, click the three dots on a voice and choose **Copy voice ID**.
4. GitHub Actions generates the comparison MP3 files and publishes the clips and manifest to voice-lab/samples/. The Voice Lab cards automatically load these shared clips.
5. The API key stays in GitHub Secrets and is not written to the public site. The generated voice ID and name **are public**, as are the audio samples.

**Important:** ElevenLabs Voice Library voices are **not available through API on Free**. The manual route above works for voices available through the website. The automated route only works for voices your ElevenLabs plan grants API access to. The script uses the eleven_multilingual_v2 model, which supports Ukrainian. Each automation run consumes ElevenLabs credits.

### Usage rights

On ElevenLabs Free, generated content is restricted to **noncommercial usage with ElevenLabs attribution** when publicly published. This Voice Lab includes ElevenLabs attribution in the title and footer. Check the service's current terms before sharing any generated content or moving a voice into public Kids Playground.

This Voice Lab is a **comparison tool**, not a direct ElevenLabs account connection. Until files are generated or added, the five audio slots are empty; empty slots do not contain synthesized speech.
