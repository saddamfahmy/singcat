const fs = require("node:fs");
const path = require("node:path");
const { Midi } = require("@tonejs/midi");

const inputPath = path.join(
  __dirname,
  "..",
  "publick",
  "assets",
  "Pinkfong-Babyshark-Anonymous-20190203093900-nonstop2k.com.mid"
);
const outputPath = path.join(
  __dirname,
  "..",
  "publick",
  "assets",
  "Pinkfong-Babyshark.json"
);

const midi = new Midi(fs.readFileSync(inputPath));

const song = {
  name: "Pinkfong Baby Shark",
  source: path.basename(inputPath),
  duration: midi.duration,
  ppq: midi.header.ppq,
  tempos: midi.header.tempos,
  timeSignatures: midi.header.timeSignatures,
  globalVolume: 100,
  playbackSpeed: 100,
  globalPitch: 0,
  tracks: midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    channel: track.channel,
    instrument: track.instrument,
    playback: {
      engine: "oscillator",
      soundfont: null,
      volume: 100
    },
    notes: track.notes.map((note) => ({
      midi: note.midi,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity
    }))
  }))
};

fs.writeFileSync(outputPath, `${JSON.stringify(song, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
