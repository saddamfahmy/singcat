import React, { useMemo } from "react";
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
const characterTriggerFrame = 70;
const characterPhaseOneEnd = 50;
const characterPhaseTwoStart = 51;
const characterPhaseOneDuration = 10;
const characterLoopStart = 71;
const characterLoopEnd = 80;
const characterLoopLength = 16;
const characterFps = 30;
const padFrame = (value) => String(10000 + value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pitchName = (pitch) => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
};

const buildCharacterIntervals = (notes) => {
  const events = [];
  for (const note of notes) {
    const start = Number(note.time);
    const end = start + Math.max(0, Number(note.duration));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    events.push({ time: start, delta: 1 });
    events.push({ time: end, delta: -1 });
  }
  events.sort((left, right) => left.time - right.time || right.delta - left.delta);

  const intervals = [];
  let activeNotes = 0;
  let activeStart = null;
  for (const event of events) {
    const wasActive = activeNotes > 0;
    activeNotes = Math.max(0, activeNotes + event.delta);
    const isActive = activeNotes > 0;

    if (!wasActive && isActive) {
      activeStart = event.time;
    } else if (wasActive && !isActive && activeStart !== null) {
      intervals.push({ start: activeStart, end: event.time });
      activeStart = null;
    }
  }
  return intervals;
};

const buildPitchCharacters = (tracks) => {
  const notesByPitch = new Map();
  for (const track of tracks) {
    for (const note of track.notes || []) {
      const pitch = Number(note.midi);
      if (!Number.isFinite(pitch)) continue;
      const notes = notesByPitch.get(pitch) || [];
      notes.push(note);
      notesByPitch.set(pitch, notes);
    }
  }
  return [...notesByPitch.entries()]
    .sort(([left], [right]) => right - left)
    .map(([pitch, notes]) => ({
      pitch,
      intervals: buildCharacterIntervals(notes).map((interval) => ({
        ...interval,
        startFrame: interval.start * characterFps,
        endFrame: interval.end * characterFps
      }))
    }));
};

const getCharacterFrame = (intervals, sourceTime, characterFps) => {
  const sourceFrame = sourceTime * characterFps;
  const getActiveFrame = (interval) => {
    const duration = Math.max(1 / characterFps, interval.endFrame - interval.startFrame);
    const elapsed = clamp(sourceFrame - interval.startFrame, 0, duration);
    const firstPhaseDuration = Math.min(characterPhaseOneDuration, duration);
    const secondPhaseDuration = duration - firstPhaseDuration;
    const secondPhaseElapsed = Math.max(0, elapsed - firstPhaseDuration);
    const normalFrameCount = characterTriggerFrame - characterPhaseTwoStart;

    if (elapsed < firstPhaseDuration) {
      const progress = elapsed / Math.max(1 / characterFps, firstPhaseDuration);
      return 1 + (characterPhaseOneEnd - 1) * clamp(progress, 0, 1);
    }

    if (secondPhaseElapsed < normalFrameCount) {
      return characterPhaseTwoStart + secondPhaseElapsed;
    }

    const remainingDuration = secondPhaseDuration - normalFrameCount;
    if (remainingDuration < characterLoopLength) {
      return characterTriggerFrame;
    }

    const loopPosition = (secondPhaseElapsed - normalFrameCount) % characterLoopLength;
    const halfLoopLength = characterLoopLength / 2;
    return loopPosition < halfLoopLength
      ? characterLoopStart + (characterLoopEnd - characterLoopStart) * (loopPosition / halfLoopLength)
      : characterLoopEnd - (characterLoopEnd - characterLoopStart)
        * ((loopPosition - halfLoopLength) / halfLoopLength);
  };
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (sourceFrame >= interval.startFrame && sourceFrame < interval.endFrame) {
      return Math.round(getActiveFrame(interval));
    }

    if (sourceFrame < interval.startFrame) {
      const previous = intervals[index - 1];
      if (!previous) return 1;
      const reverseElapsed = sourceFrame - previous.endFrame;
      return Math.round(clamp(
        characterTriggerFrame - reverseElapsed,
        1,
        characterFrameCount
      ));
    }
  }

  const lastInterval = intervals[intervals.length - 1];
  if (!lastInterval) return 1;
  const reverseElapsed = sourceFrame - lastInterval.endFrame;
  return Math.round(clamp(
    characterTriggerFrame - reverseElapsed,
    1,
    characterFrameCount
  ));
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
  const visibleTracks = useMemo(
    () => (song.tracks || []).filter((track) => track.enabled !== false),
    [song.tracks]
  );
  const pitchCharacters = useMemo(
    () => buildPitchCharacters(visibleTracks),
    [visibleTracks]
  );
  const rows = Math.min(10, Math.max(1, pitchCharacters.length));
  const columns = Math.min(5, Math.max(1, Math.ceil(pitchCharacters.length / rows)));

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
          gridAutoFlow: "column",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          height: "82%",
          padding: 24,
          width: "92%"
        }}
      >
        {pitchCharacters.map(({ pitch, intervals }, index) => {
          const characterFrame = getCharacterFrame(
            intervals,
            sourceTime,
            characterFps
          );
          return (
            <div
              key={`pitch-${pitch}`}
              style={{
                alignItems: "center",
                border: `2px solid ${trackColor(index)}`,
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minHeight: 0,
                maxWidth: "10vw",
                overflow: "hidden",
                position: "relative"
              }}
            >
              <Img
                src={staticFile(`assets/char/char1/char${padFrame(characterFrame)}.png`)}
                style={{
                  height: "78%",
                  maxWidth: "10vw",
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
              {pitchName(pitch)} · MIDI {pitch}
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
