const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const [configPath, outputDir, baseName] = process.argv.slice(2);
if (!configPath || !outputDir || !baseName) {
  throw new Error("Usage: node scripts/generate-midi-audio.js <config> <output-dir> <base-name>");
}

const sampleRate = 44100;
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const speed = Math.max(0.01, (config.global?.speed ?? config.playbackSpeed ?? 100) / 100);
const pitch = Number(config.global?.pitch ?? config.globalPitch ?? 0);
const duration = Math.max(0, Number(config.duration) / speed);
const samples = Math.ceil(duration * sampleRate);
const audio = new Float32Array(samples);

const soundfontFor = (track) => track.soundfont ?? track.playback?.soundfont ?? null;
const hashString = (value) => [...value].reduce(
  (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
  7
);
const waveformFor = (track) => {
  const soundfont = soundfontFor(track);
  if (soundfont) return ["triangle", "sawtooth", "square"][hashString(soundfont) % 3];
  const family = String(track.instrument?.family || "").toLowerCase();
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
  return (1 - 4 * Math.abs(Math.round(phase) - phase))
    + Math.sin(phase * Math.PI * 4) * Math.min(0.25, frequency / 4000);
};

for (const track of config.tracks || []) {
  if (track.enabled === false) continue;
  const volume = Math.max(0, Number(track.volume ?? track.playback?.volume ?? 100)) / 100;
  const waveform = Number(track.channel) === 9 ? "noise" : waveformFor(track);
  for (const note of track.notes || []) {
    const start = Math.max(0, Number(note.time) / speed);
    const end = Math.min(duration, (Number(note.time) + Number(note.duration)) / speed);
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.ceil(end * sampleRate);
    const frequency = 440 * 2 ** ((Number(note.midi) + pitch - 69) / 12);
    const amplitude = Math.min(1, Math.max(0.02, Number(note.velocity) || 0.5))
      * volume * 0.13;
    const attack = Math.max(1, Math.floor(0.01 * sampleRate));
    const release = Math.max(1, Math.floor(0.05 * sampleRate));

    for (let sample = startSample; sample < endSample && sample < samples; sample += 1) {
      const elapsed = sample - startSample;
      const remaining = endSample - sample;
      const envelope = Math.min(1, elapsed / attack, remaining / release);
      const phase = (sample / sampleRate * frequency) % 1;
      audio[sample] += oscillator(phase, waveform, frequency, sample)
        * amplitude * Math.max(0, envelope);
    }
  }
}

const wavPath = path.join(outputDir, `${baseName}.wav`);
const mp3Path = path.join(outputDir, `${baseName}.mp3`);
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
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(wavPath, Buffer.concat([header, pcm]));

const ffmpeg = spawnSync("ffmpeg", [
  "-hide_banner",
  "-loglevel", "error",
  "-y",
  "-i", wavPath,
  "-codec:a", "libmp3lame",
  "-b:a", "320k",
  "-ar", String(sampleRate),
  "-ac", "2",
  mp3Path
], { stdio: "inherit" });
if (ffmpeg.error) throw ffmpeg.error;
if (ffmpeg.status !== 0) throw new Error("FFmpeg failed to encode the MIDI audio.");

console.log(`Audio generated: ${path.relative(process.cwd(), mp3Path)}`);
