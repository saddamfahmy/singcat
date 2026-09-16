const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;
const assetsPath = path.join(__dirname, "publick", "assets");
const audioPath = path.join(assetsPath, "audio");
const execFileAsync = promisify(execFile);

app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "publick")));

app.post("/api/midi-config", async (req, res, next) => {
  try {
    const { filename, config } = req.body || {};
    if (typeof filename !== "string" || !filename.trim() || !config || typeof config !== "object") {
      return res.status(400).json({ error: "filename and config are required" });
    }

    const baseName = path.basename(filename).replace(/\.(mid|midi)$/i, "");
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_") || "midi";
    const outputPath = path.join(assetsPath, `${safeName}.json`);
    const midiAudioPath = path.join(audioPath, safeName);
    await fs.mkdir(assetsPath, { recursive: true });
    await fs.rm(midiAudioPath, { recursive: true, force: true });
    await fs.mkdir(midiAudioPath, { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const usesSoundfont = (config.tracks || []).some((track) => (
      track.enabled !== false && (track.soundfont || track.playback?.soundfont)
    ));
    if (!usesSoundfont) {
      await execFileAsync(
        process.execPath,
        [path.join(__dirname, "scripts", "generate-midi-audio.js"), outputPath, midiAudioPath, safeName],
        { cwd: __dirname }
      );
    }

    const audio = {
      wav: `audio/${safeName}/${safeName}.wav`,
      mp3: `audio/${safeName}/${safeName}.mp3`,
      sampleRate: 44100,
      bitrate: 320
    };
    await fs.writeFile(
      outputPath,
      `${JSON.stringify({ ...config, audio }, null, 2)}\n`,
      "utf8"
    );

    res.json({
      saved: true,
      file: path.basename(outputPath),
      audio
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/midi-audio",
  express.raw({ type: ["audio/webm", "audio/ogg", "audio/wav"], limit: "250mb" }),
  async (req, res, next) => {
    const temporaryPath = path.join(audioPath, "incoming-audio.webm");
    try {
      const filename = typeof req.query.filename === "string" ? req.query.filename : "";
      const baseName = path.basename(filename).replace(/\.(mid|midi)$/i, "");
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_") || "midi";
      const midiAudioPath = path.join(audioPath, safeName);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Audio data is required" });
      }

      await fs.mkdir(midiAudioPath, { recursive: true });
      await fs.writeFile(temporaryPath, req.body);
      const wavPath = path.join(midiAudioPath, `${safeName}.wav`);
      const mp3Path = path.join(midiAudioPath, `${safeName}.mp3`);
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", temporaryPath,
        "-ar", "44100",
        "-ac", "2",
        "-c:a", "pcm_s16le",
        wavPath
      ]);
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", wavPath,
        "-codec:a", "libmp3lame",
        "-b:a", "320k",
        "-ar", "44100",
        "-ac", "2",
        mp3Path
      ]);
      await fs.rm(temporaryPath, { force: true });
      const configPath = path.join(assetsPath, `${safeName}.json`);
      if (await fs.stat(configPath).then(() => true).catch(() => false)) {
        const config = JSON.parse(await fs.readFile(configPath, "utf8"));
        config.audio = {
          wav: `audio/${safeName}/${safeName}.wav`,
          mp3: `audio/${safeName}/${safeName}.mp3`,
          sampleRate: 44100,
          bitrate: 320,
          source: "browser-soundfont"
        };
        await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      }

      res.json({
        saved: true,
        audio: {
          wav: `audio/${safeName}/${safeName}.wav`,
          mp3: `audio/${safeName}/${safeName}.mp3`,
          sampleRate: 44100,
          bitrate: 320,
          source: "browser-soundfont"
        }
      });
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      next(error);
    }
  }
);

app.get("/api/status", (req, res) => {
  res.json({
    name: "Singcat",
    status: "online",
    clients: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

io.on("connection", (socket) => {
  socket.emit("server:welcome", {
    message: "Connected to Singcat server",
    timestamp: new Date().toISOString()
  });

  socket.on("client:ping", () => {
    socket.emit("server:pong", {
      timestamp: new Date().toISOString()
    });
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(port, () => {
  console.log(`Singcat server running at http://localhost:${port}`);
});
