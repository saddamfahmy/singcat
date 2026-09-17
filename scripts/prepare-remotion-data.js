const fs = require("node:fs");
const path = require("node:path");

const defaultJsonPath = path.join(
  __dirname,
  "..",
  "publick",
  "assets",
  "Pinkfong-Babyshark.json"
);
const fallbackJsonPath = path.join(
  __dirname,
  "..",
  "publick",
  "assets",
  "Pinkfong-Babyshark-Anonymous-20190203093900-nonstop2k.com.json"
);
const argument = process.argv.slice(2).find((value) => value.startsWith("--json="));
const requestedPath = argument ? argument.slice("--json=".length) : defaultJsonPath;
const requestedJsonPath = path.isAbsolute(requestedPath)
  ? requestedPath
  : path.resolve(process.cwd(), requestedPath);
const jsonPath = requestedPath === defaultJsonPath && !fs.existsSync(defaultJsonPath)
  ? fallbackJsonPath
  : requestedJsonPath;
const outputPath = path.join(__dirname, "..", "src", "remotion", "song-data.json");
const catalogPath = path.join(__dirname, "..", "src", "remotion", "catalog.json");
const assetsPath = path.join(__dirname, "..", "publick", "assets");
const allowSyntheticAudioFallback = process.env.SINGCAT_ALLOW_SYNTHETIC_AUDIO === "1";

if (!fs.existsSync(jsonPath)) {
  throw new Error(`JSON MIDI tidak ditemukan: ${jsonPath}`);
}

const normalizeData = (filePath, { allowMissingAudio = false } = {}) => {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  if (!Number.isFinite(data.duration) || !Array.isArray(data.tracks)) {
    throw new Error(`JSON MIDI harus memiliki duration dan tracks: ${filePath}`);
  }

  if (data.audio) {
    const audioCandidates = [data.audio.wav, data.audio.mp3]
      .filter((value) => typeof value === "string" && value.trim());
    const availableAudio = audioCandidates.find((value) => (
      fs.existsSync(path.join(assetsPath, value.replace(/\//g, path.sep)))
    ));
    if (availableAudio) {
      data.audio = {
        ...data.audio,
        wav: data.audio.wav?.replace(/\\/g, "/"),
        mp3: data.audio.mp3?.replace(/\\/g, "/"),
        selected: `assets/${availableAudio.replace(/\\/g, "/")}`
      };
    } else if (allowMissingAudio || allowSyntheticAudioFallback) {
      data.audio = {
        available: false,
        fallback: "synthetic"
      };
    } else {
      throw new Error(
        `Audio tersimpan tidak ditemukan untuk ${filePath}: ${audioCandidates.join(", ")}`
      );
    }
  }
  return data;
};

const data = normalizeData(jsonPath, { allowMissingAudio: allowSyntheticAudioFallback });
const jsonFiles = fs.readdirSync(assetsPath)
  .filter((file) => file.toLowerCase().endsWith(".json"))
  .map((file) => path.join(assetsPath, file))
  .sort((left, right) => left.localeCompare(right));
const catalog = jsonFiles.map((filePath, index) => {
  const song = filePath === jsonPath
    ? data
    : normalizeData(filePath, { allowMissingAudio: true });
  const fileName = path.basename(filePath, ".json");
  const slug = fileName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || `song-${index + 1}`;
  return {
    id: `SingcatVideo-${slug}`,
    name: fileName,
    song
  };
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Remotion data: ${path.relative(process.cwd(), jsonPath)}`);
console.log(`Remotion compositions: ${catalog.length}`);
