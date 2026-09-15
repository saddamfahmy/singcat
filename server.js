const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs/promises");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;
const assetsPath = path.join(__dirname, "publick", "assets");

app.use(express.json());
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
    await fs.mkdir(assetsPath, { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    res.json({
      saved: true,
      file: path.basename(outputPath)
    });
  } catch (error) {
    next(error);
  }
});

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
