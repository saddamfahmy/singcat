const fs = require("node:fs");
const path = require("node:path");

const sampleRate = 44100;
const outputPath = path.join(
  __dirname,
  "..",
  "publick",
  "assets",
  "generated",
  "singcat-remotion.wav"
);
const dataPath = path.join(__dirname, "..", "src", "remotion", "song-data.json");

if (!fs.existsSync(dataPath)) {
  throw new Error("Data Remotion belum ada. Jalankan npm run remotion:prepare terlebih dahulu.");
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
if (data.audio?.selected) {
  console.log("Saved audio found; skipping synthetic Remotion audio generation.");
  process.exit(0);
}
if (data.audio?.source === "browser-soundfont") {
  throw new Error("Browser SoundFont audio is referenced but was not resolved by preparation.");
}
const speed = Math.max(0.01, (data.global?.speed ?? data.playbackSpeed ?? 100) / 100);
const pitch = data.global?.pitch ?? data.globalPitch ?? 0;
const duration = Math.max(0, Number(data.duration) / speed);
const samples = Math.ceil(duration * sampleRate);
const audio = new Float32Array(samples);

const soundfontFor = (track) => track.soundfont ?? track.playback?.soundfont ?? null;

const hashString = (value) => [...value].reduce((hash, character) => (
  (hash * 31 + character.charCodeAt(0)) >>> 0
), 7);

const waveformFor = (track, soundfont) => {
  if (soundfont) {
    const soundfontWaveforms = ["triangle", "sawtooth", "square"];
    return soundfontWaveforms[hashString(soundfont) % soundfontWaveforms.length];
  }
  const family = track.instrument?.family || "";
  if (family.includes("organ") || family.includes("reed")) return "square";
  if (family.includes("strings") || family.includes("synth")) return "sawtooth";
  return "triangle";
};

const oscillator = (phase, waveform, frequency, sample) => {
  if (waveform === "noise") {
    const noise = Math.sin((sample + 1) * 12.9898) * 43758.5453;
    return (noise - Math.floor(noise)) * 2 - 1;
  }
  if (waveform === "square") return phase < 0.5 ? 1 : -1;
  if (waveform === "sawtooth") return phase * 2 - 1;
  // Add a quiet harmonic layer so the oscillator fallback has an instrument-like body.
  return (1 - 4 * Math.abs(Math.round(phase) - phase))
    + Math.sin(phase * Math.PI * 4) * Math.min(0.25, frequency / 4000);
};

for (const track of data.tracks) {
  if (track.enabled === false) continue;
  const soundfont = soundfontFor(track);
  if (soundfont && process.env.SINGCAT_NATIVE_SOUNDFONT === "1") continue;
  const volume = Math.max(0, Number(track.volume ?? track.playback?.volume ?? 100)) / 100;
  const waveform = track.channel === 9 ? "noise" : waveformFor(track, soundfont);
  for (const note of track.notes || []) {
    const start = Math.max(0, Number(note.time) / speed);
    const end = Math.min(duration, (Number(note.time) + Number(note.duration)) / speed);
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.ceil(end * sampleRate);
    const frequency = 440 * 2 ** ((Number(note.midi) + pitch - 69) / 12);
    const amplitude = Math.min(1, Math.max(0.02, Number(note.velocity) || 0.5))
      * volume
      * (soundfont ? 0.14 : 0.12);
    const attack = Math.max(1, Math.floor((soundfont ? 0.008 : 0.01) * sampleRate));
    const release = Math.max(1, Math.floor((soundfont ? 0.08 : 0.04) * sampleRate));

    for (let sample = startSample; sample < endSample && sample < samples; sample += 1) {
      const elapsed = sample - startSample;
      const remaining = endSample - sample;
      const envelope = Math.min(1, elapsed / attack, remaining / release);
      const phase = (sample / sampleRate * frequency) % 1;
      audio[sample] += oscillator(phase, waveform, frequency, sample) * amplitude * Math.max(0, envelope);
    }
  }
}

const pcm = Buffer.alloc(samples * 2);
for (let index = 0; index < samples; index += 1) {
  const value = Math.max(-1, Math.min(1, audio[index]));
  pcm.writeInt16LE(Math.round(value * 32767), index * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat([header, pcm]));
console.log(`Remotion audio: ${path.relative(process.cwd(), outputPath)}`);
