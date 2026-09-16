const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Midi } = require("@tonejs/midi");

const root = path.join(__dirname, "..");
const dataPath = path.join(root, "src", "remotion", "song-data.json");
const assetsPath = path.join(root, "publick", "assets");
const outputPath = path.join(assetsPath, "generated", "singcat-remotion.wav");
const tempPath = path.join(root, "out", "remotion-soundfont");
const sampleRate = 44100;

const commandExists = (command) => {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
    stdio: "ignore"
  });
  return result.status === 0;
};

if (!commandExists("fluidsynth")) {
  console.warn("FluidSynth not found; SoundFont tracks use the documented synthesizer fallback.");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const speed = Math.max(0.01, (data.global?.speed ?? data.playbackSpeed ?? 100) / 100);
const pitch = Number(data.global?.pitch ?? data.globalPitch ?? 0);
const soundfontTracks = data.tracks.filter((track) => (
  track.enabled !== false && (track.soundfont || track.playback?.soundfont)
));

if (soundfontTracks.length === 0) process.exit(0);

fs.rmSync(tempPath, { recursive: true, force: true });
fs.mkdirSync(tempPath, { recursive: true });

const renderedTracks = [];
for (const [index, track] of soundfontTracks.entries()) {
  const soundfont = track.soundfont || track.playback.soundfont;
  const soundfontPath = path.join(assetsPath, soundfont);
  if (!fs.existsSync(soundfontPath)) {
    throw new Error(`SoundFont file not found: ${soundfontPath}`);
  }

  const midi = new Midi();
  midi.header.setTempo(120);
  const midiTrack = midi.addTrack();
  midiTrack.channel = Number(track.channel ?? 0);
  midiTrack.instrument.number = Number(track.instrument?.number ?? 0);
  midiTrack.addCC({
    controller: 7,
    time: 0,
    value: Math.max(0, Math.min(127, Math.round(
      Number(track.volume ?? track.playback?.volume ?? 100) * 1.27
    )))
  });
  for (const note of track.notes || []) {
    midiTrack.addNote({
      midi: Math.max(0, Math.min(127, Number(note.midi) + pitch)),
      time: Number(note.time) / speed,
      duration: Number(note.duration) / speed,
      velocity: Math.max(0, Math.min(1, Number(note.velocity) || 0.5))
    });
  }

  const midiPath = path.join(tempPath, `track-${index}.mid`);
  const wavPath = path.join(tempPath, `track-${index}.wav`);
  fs.writeFileSync(midiPath, Buffer.from(midi.toArray()));
  const result = spawnSync("fluidsynth", [
    "-ni",
    "-F",
    wavPath,
    "-r",
    String(sampleRate),
    soundfontPath,
    midiPath
  ], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`FluidSynth failed for ${soundfont}`);
  }
  renderedTracks.push(wavPath);
}

const mixPath = path.join(tempPath, "mixed.wav");
const inputTracks = fs.existsSync(outputPath) ? [outputPath, ...renderedTracks] : renderedTracks;
const ffmpegInputs = inputTracks.flatMap((file) => ["-i", file]);
const filter = `${inputTracks.map((_, index) => `[${index}:a]`).join("")}amix=inputs=${inputTracks.length}:duration=longest:normalize=0`;
const mixResult = spawnSync("ffmpeg", [
  "-y",
  ...ffmpegInputs,
  "-filter_complex",
  filter,
  "-ar",
  String(sampleRate),
  "-ac",
  "1",
  mixPath
], { stdio: "inherit" });
if (mixResult.status !== 0) throw new Error("FFmpeg failed while mixing SoundFont tracks.");

fs.copyFileSync(mixPath, outputPath);
console.log(`Native SoundFont audio: ${path.relative(process.cwd(), outputPath)}`);
