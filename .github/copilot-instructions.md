# Copilot instructions for singcat

## Project overview

This repository is a small Express + Socket.IO app that serves a browser-based MIDI player. The app is intentionally lightweight: there is no framework build pipeline, and the front end lives in a single HTML file rather than a separate app structure.

- `server.js`: HTTP server, static file serving, `/api/status`, `/api/midi-config`, and Socket.IO connection handling.
- `publick/index.html`: the full client UI and playback logic. It handles MIDI upload, per-track toggles, volume/pitch/speed controls, and local audio synthesis.
- `publick/assets/`: generated JSON animation configs and bundled SoundFont files used by the browser.
- `scripts/convert-midi-to-json.js`: script that converts a source MIDI file into the JSON shape consumed by the browser.

## Commands

Use the repo scripts defined in `package.json`:

- Start the server: `npm start`
- Start in watch mode: `npm run dev`
- Regenerate the bundled MIDI JSON sample: `npm run midi:convert`
- Prepare the JSON used by Remotion: `npm run remotion:prepare` (or `npm run remotion:prepare -- --json=publick/assets/your-file.json`)
- Open the Remotion preview: `npm run remotion:studio` (Remotion uses `http://localhost:3001`; the index app uses `http://localhost:3000`)
- Render an MP4: `npm run remotion:render`
- Use a JSON created by the index page: `npm run remotion:render -- --json=publick/assets/your-file.json`

Quick validation:

- Syntax check the server entry point: `node --check server.js`
- Smoke-test the API after starting the server: `curl http://localhost:3000/api/status`
- Run the browser smoke test: `npm run test:e2e`

This repo now includes a minimal Playwright smoke test for the main MIDI player page. There is no lint script configured at this time.

## Remotion video pipeline

The Remotion composition is in `src/remotion/`. It uses the 80-frame character sequence from `publick/assets/char/char1/` at 30 FPS while the composition also runs at 30 FPS. Each track has its own character state: a new note starts at frame 1, frames 1-70 advance, frames 71-80 ping-pong while notes remain active, and playback reverses to frame 1 when the track becomes idle. A new note during the reverse phase resets the character to frame 1 and starts the forward phase again. The selected MIDI animation JSON is copied to the ignored `src/remotion/song-data.json` by `scripts/prepare-remotion-data.js`.

Remotion audio is generated as a WAV file by `scripts/generate-remotion-audio.js`. It follows enabled tracks, note timing, note velocity, MIDI channel, instrument family/program, per-track volume, global speed, and global pitch from the JSON. Saved browser SoundFont audio is mandatory when the JSON has `audio.source: "browser-soundfont"`: preparation resolves the WAV first, then MP3, and fails instead of silently falling back if both are missing. Only configs without saved browser audio use the generated synthesizer fallback.

Remotion preparation scans JSON files directly under `publick/assets/` and creates one Studio composition per JSON name. The composition IDs are generated as `SingcatVideo-<json-name>`, while `SingcatVideo` remains an alias for the first catalog entry. Run `npm run remotion:prepare` before opening Studio to refresh the list after saving a new JSON.

Saving animation JSON through `POST /api/midi-config` also clears and recreates `publick/assets/audio/<midi-name>/`, generates a WAV and an FFmpeg-encoded 320 kbps MP3 there for oscillator-only configs, and adds their relative paths under the JSON `audio` field. When a track selects a SoundFont, `index.html` records the actual `spessasynth_lib` output through `MediaStreamDestination` and uploads it to `POST /api/midi-audio`; FFmpeg then writes the WAV/MP3 files in the same folder. Remotion's preparation step verifies those paths under `publick/`, selects the saved WAV first (then MP3), and skips synthetic audio generation when the saved audio exists.

## Architecture and behavior

The app's big-picture flow is:

1. The Express server serves the browser app from `publick/` and exposes a small JSON API.
2. The browser loads a MIDI or generated animation JSON file, parses it with `@tonejs/midi`, and renders track controls.
3. Playback is handled in-browser with either simple oscillators or the `spessasynth_lib` SoundFont pipeline.
4. The user can save the current arrangement to JSON via `POST /api/midi-config`, which writes a file into `publick/assets/`.
5. The app persists per-song settings in `localStorage` under the key `singcat-midi-rules` so repeated loads retain track volumes, soundfont choices, tempo, and pitch adjustments.

Important repo-specific details:

- The directory is named `publick` (with a `k`), not `public`; keep that convention unless there is a deliberate rename.
- The generated JSON follows a schema with fields like `source`, `duration`, `global`, `tracks`, and per-note objects (`midi`, `time`, `duration`, `velocity`). Keep this shape stable when editing loader or saver logic.
- When saving a MIDI config, the filename is sanitized before being written to disk; preserve that safety behavior.
- The default bundled sample is `publick/assets/Pinkfong-Babyshark.json`, generated from the MIDI file in the same folder.

## Conventions to preserve

- Keep the app lightweight and dependency-minimal; do not introduce a framework or a build step unless the project explicitly moves in that direction.
- Favor small, direct edits in `server.js` and `publick/index.html` over creating a new app structure.
- If you add a new API field or change the JSON contract, update both the writer and reader side together.
- Preserve the repo's existing naming and asset conventions, especially `publick/assets` and the `singcat-midi-rules` localStorage key.
- When adding new audio behavior, keep it compatible with the current browser-only playback model and the existing SoundFont/oscillator fallback logic.

## Working notes for future Copilot sessions

- The repository is mostly a client-side prototype rather than a large backend service; start with the browser script if the issue is UI or playback behavior.
- The server is not heavily modularized; most changes will likely touch a small number of files rather than a deep folder structure.
- If you need to reproduce or refresh sample data, use `npm run midi:convert` before validating audio-related changes.
