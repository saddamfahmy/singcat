import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

const characterFrameCount = 80;
const characterFps = 30;
const padFrame = (value) => String(10000 + value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildCharacterEvents = (track) => {
  const events = [];
  for (const note of track.notes || []) {
    const start = Number(note.time);
    const end = start + Math.max(0, Number(note.duration));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    events.push({ time: start, delta: 1 });
    events.push({ time: end, delta: -1 });
  }
  return events.sort((left, right) => left.time - right.time);
};

const advanceCharacter = (state, seconds, active, characterFps) => {
  const frameRate = characterFps;
  let remaining = Math.max(0, seconds);
  while (remaining > 0.000001) {
    if (active && state.mode === "forward") {
      const distance = 70 - state.frame;
      const duration = distance / frameRate;
      if (duration >= remaining || distance <= 0) {
        state.frame = clamp(state.frame + remaining * frameRate, 1, 70);
        if (state.frame >= 70) {
          state.frame = 71;
          state.mode = "loop-forward";
        }
        return;
      }
      state.frame = 70;
      state.mode = "loop-forward";
      remaining -= duration;
      continue;
    }

    if (active && state.mode === "loop-forward") {
      const duration = (80 - state.frame) / frameRate;
      if (duration >= remaining) {
        state.frame += remaining * frameRate;
        return;
      }
      state.frame = 80;
      state.mode = "loop-backward";
      remaining -= duration;
      continue;
    }

    if (active && state.mode === "loop-backward") {
      const duration = (state.frame - 71) / frameRate;
      if (duration >= remaining) {
        state.frame -= remaining * frameRate;
        return;
      }
      state.frame = 71;
      state.mode = "loop-forward";
      remaining -= duration;
      continue;
    }

    if (!active && state.mode !== "rest") {
      const duration = (state.frame - 1) / frameRate;
      if (duration >= remaining) {
        state.frame = Math.max(1, state.frame - remaining * frameRate);
        return;
      }
      state.frame = 1;
      state.mode = "rest";
      return;
    }

    return;
  }
};

const getCharacterFrame = (track, sourceTime, characterFps) => {
  const events = buildCharacterEvents(track);
  let currentTime = 0;
  let activeNotes = 0;
  const state = { frame: 1, mode: "rest" };

  for (let index = 0; index < events.length;) {
    const eventTime = events[index].time;
    if (eventTime > sourceTime) break;
    advanceCharacter(state, eventTime - currentTime, activeNotes > 0, characterFps);
    currentTime = eventTime;

    let delta = 0;
    while (index < events.length && events[index].time === eventTime) {
      delta += events[index].delta;
      index += 1;
    }
    const wasActive = activeNotes > 0;
    activeNotes = Math.max(0, activeNotes + delta);
    const isActive = activeNotes > 0;
    if (!wasActive && isActive) {
      state.frame = 1;
      state.mode = "forward";
    } else if (wasActive && !isActive) {
      state.mode = state.frame > 1 ? "reverse" : "rest";
    }
  }

  advanceCharacter(state, Math.max(0, sourceTime - currentTime), activeNotes > 0, characterFps);
  return Math.round(clamp(state.frame, 1, characterFrameCount));
};

const trackColor = (index) => `hsl(${(index * 67) % 360} 75% 75%)`;

export const SingcatVideo = ({ song }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const playbackSpeed = Math.max(0.01, (song.global?.speed ?? song.playbackSpeed ?? 100) / 100);
  const elapsed = frame / fps;
  const sourceTime = elapsed * playbackSpeed;
  const audioVolume = Math.max(0, Math.min(1, (song.global?.volume ?? song.globalVolume ?? 100) / 100));
  const audioSource = song.audio?.selected
    || song.audio?.wav
    || song.audio?.mp3
    || "assets/generated/singcat-remotion.wav";
  if (song.audio?.source === "browser-soundfont" && !song.audio?.selected) {
    throw new Error("Saved browser SoundFont audio is missing from the Remotion asset path.");
  }
  const visibleTracks = (song.tracks || []).filter((track) => track.enabled !== false);
  const columns = Math.max(1, Math.ceil(Math.sqrt(visibleTracks.length)));
  const rows = Math.max(1, Math.ceil(visibleTracks.length / columns));

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        background: "radial-gradient(circle at 50% 30%, #334155 0%, #0f172a 55%, #020617 100%)",
        justifyContent: "center",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          height: "82%",
          padding: 24,
          width: "92%"
        }}
      >
        {visibleTracks.map((track, index) => {
          const characterFrame = getCharacterFrame(track, sourceTime, characterFps);
          return (
            <div
              key={`${track.channel}-${track.index ?? index}`}
              style={{
                alignItems: "center",
                border: `2px solid ${trackColor(index)}`,
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minHeight: 0,
                overflow: "hidden",
                position: "relative"
              }}
            >
              <Img
                src={staticFile(`assets/char/char1/char${padFrame(characterFrame)}.png`)}
                style={{
                  height: "78%",
                  objectFit: "contain"
                }}
              />
              <div
                style={{
                  bottom: 8,
                  color: trackColor(index),
                  fontFamily: "Arial, sans-serif",
                  fontSize: 16,
                  position: "absolute"
                }}
              >
                Ch {Number(track.channel) + 1}: {track.instrument?.name || track.name || `Track ${index + 1}`}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          bottom: 28,
          color: "#e5e7eb",
          fontFamily: "Arial, sans-serif",
          fontSize: 24,
          left: 32,
          position: "absolute",
          right: 32,
          textAlign: "center",
          textShadow: "0 2px 8px #000"
        }}
      >
        {song.source || "Singcat MIDI"}
      </div>
      <Audio src={staticFile(audioSource)} volume={audioVolume} />
    </AbsoluteFill>
  );
};
