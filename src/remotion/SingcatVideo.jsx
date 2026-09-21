import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  random,
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
const characterLeadFrames = 5;

const padFrame = (value) => String(10000 + value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildCharacterIntervals = (notes) => {
  const events = [];
  for (const note of notes) {
    const start = Number(note.time);
    const end = start + Math.max(0, Number(note.duration));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      continue;
    events.push({ time: start, delta: 1 });
    events.push({ time: end, delta: -1 });
  }
  events.sort(
    (left, right) => left.time - right.time || right.delta - left.delta,
  );

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
        endFrame: interval.end * characterFps,
      })),
    }));
};

const getCharacterFrame = (intervals, sourceTime, characterFps) => {
  const sourceFrame = sourceTime * characterFps;
  const getActiveFrame = (interval) => {
    const duration = Math.max(
      1 / characterFps,
      interval.endFrame - interval.startFrame,
    );
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

    const loopPosition =
      (secondPhaseElapsed - normalFrameCount) % characterLoopLength;
    const halfLoopLength = characterLoopLength / 2;
    return loopPosition < halfLoopLength
      ? characterLoopStart +
          (characterLoopEnd - characterLoopStart) *
            (loopPosition / halfLoopLength)
      : characterLoopEnd -
          (characterLoopEnd - characterLoopStart) *
            ((loopPosition - halfLoopLength) / halfLoopLength);
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
      return Math.round(
        clamp(characterTriggerFrame - reverseElapsed, 1, characterFrameCount),
      );
    }
  }

  const lastInterval = intervals[intervals.length - 1];
  if (!lastInterval) return 1;
  const reverseElapsed = sourceFrame - lastInterval.endFrame;
  return Math.round(
    clamp(characterTriggerFrame - reverseElapsed, 1, characterFrameCount),
  );
};

const cheerfulColors = [
  [1, 0.36, 0.36],
  [1, 0.72, 0.2],
  [1, 0.95, 0.2],
  [0.35, 0.85, 0.35],
  [0.2, 0.75, 1],
  [0.35, 0.45, 1],
  [0.75, 0.35, 1],
  [1, 0.35, 0.75],
];

const characterColorIndex = (index) => {
  const randomValue = Math.sin((index + 1) * 91.173 + 17.531) * 43758.5453;
  return Math.floor(
    (randomValue - Math.floor(randomValue)) * cheerfulColors.length,
  );
};
const characterFilterId = (index) =>
  `character-color-${characterColorIndex(index)}`;

const brightBackgrounds = [
  ["#ffffff", "#e0f2fe", "#bae6fd"],
  ["#fff7ed", "#fed7aa", "#fdba74"],
  ["#fefce8", "#fef08a", "#fde047"],
  ["#f0fdf4", "#bbf7d0", "#86efac"],
  ["#fdf4ff", "#f5d0fe", "#e9d5ff"],
  ["#fff1f2", "#fecdd3", "#fda4af"],
];

const backgroundIndexFor = (song) => {
  const source = String(song?.source || "singcat-midi");
  const hash = [...source].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
  return hash % brightBackgrounds.length;
};

const CountdownNumber = ({ number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.5 },
  });

  const opacity = interpolate(frame, [0, 5, 22, 30], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Audio src={staticFile("assets/pop.wav")} />
      <div
        style={{
          fontSize: "280px",
          fontWeight: "900",
          color: "#ffffff",
          textShadow:
            "0 10px 30px rgba(0,0,0,0.3), 0 0 50px rgba(255,255,255,0.8)",
          fontFamily: "sans-serif",
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        {number}
      </div>
    </AbsoluteFill>
  );
};

export const SingcatVideo = ({ song, title }) => {
  const globalFrame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();

  const INTRO_FRAMES = 180; // Intro 6 Detik (3s Judul + 3s Hitung Mundur)

  const backgroundIndex = backgroundIndexFor(song);
  const playbackSpeed = Math.max(
    0.01,
    (song.global?.speed ?? song.playbackSpeed ?? 100) / 100,
  );
  const audioVolume = Math.max(
    0,
    Math.min(1, (song.global?.volume ?? song.globalVolume ?? 100) / 100),
  );
  const audioSource =
    song.audio?.selected ||
    song.audio?.wav ||
    song.audio?.mp3 ||
    "assets/generated/singcat-remotion.wav";

  const displayTitle = title || song?.name || song?.title || "Singcat Video";

  const songFrames = Math.max(
    1,
    Math.ceil(((song.duration || 1) / playbackSpeed) * fps),
  );
  const applauseStartFrame = INTRO_FRAMES + songFrames;

  const visibleTracks = useMemo(
    () => (song.tracks || []).filter((track) => track.enabled !== false),
    [song.tracks],
  );

  // --- MENCARI BAGIAN REFF (NOT PALING RAPAT) UNTUK AUDIO PREVIEW ---
  const previewDurationInSeconds = 6;
  const previewStartTime = useMemo(() => {
    let allNotes = [];
    visibleTracks.forEach((track) => {
      if (track.notes) {
        allNotes.push(...track.notes);
      }
    });

    if (allNotes.length === 0) return 0;

    allNotes.sort((a, b) => Number(a.time) - Number(b.time));
    const songEnd = Number(allNotes[allNotes.length - 1].time) || 0;

    let maxDensity = 0;
    let bestStartTime = 0;

    for (
      let t = 0;
      t <= Math.max(0, songEnd - previewDurationInSeconds);
      t += 1
    ) {
      let density = 0;
      for (const note of allNotes) {
        const noteTime = Number(note.time);
        if (noteTime >= t && noteTime < t + previewDurationInSeconds) {
          density++;
        }
        if (noteTime >= t + previewDurationInSeconds) break;
      }
      if (density > maxDensity) {
        maxDensity = density;
        bestStartTime = t;
      }
    }

    return bestStartTime;
  }, [visibleTracks]);

  const previewVolume = interpolate(
    globalFrame,
    [0, 30, 75, 90],
    [0, audioVolume, audioVolume, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const pitchCharacters = useMemo(
    () => buildPitchCharacters(visibleTracks),
    [visibleTracks],
  );

  const formation = useMemo(() => {
    const rowCount = Math.min(5, Math.max(1, pitchCharacters.length));
    const maximumPerRow = Math.max(
      1,
      Math.ceil(
        (pitchCharacters.length + Math.floor((rowCount - 1) / 2)) / rowCount,
      ),
    );

    const layoutRowsShape = [];
    let allocatedSlots = 0;
    for (
      let rowIndex = 0;
      rowIndex < rowCount && allocatedSlots < pitchCharacters.length;
      rowIndex += 1
    ) {
      const rowCapacity =
        rowIndex % 2 === 0 ? maximumPerRow : Math.max(1, maximumPerRow - 1);
      const row = [];
      while (
        row.length < rowCapacity &&
        allocatedSlots < pitchCharacters.length
      ) {
        row.push(null);
        allocatedSlots += 1;
      }
      layoutRowsShape.push(row);
    }

    const slots = [];
    layoutRowsShape.forEach((row, rowIndex) => {
      const rowCapacity = row.length;
      row.forEach((_, colIndex) => {
        const xPos = colIndex + (maximumPerRow - rowCapacity) / 2;
        slots.push({ rowIndex, colIndex, xPos });
      });
    });

    slots.sort((a, b) => a.xPos - b.xPos || a.rowIndex - b.rowIndex);

    const layoutRows = layoutRowsShape.map((row) => [...row]);
    slots.forEach((slot, index) => {
      const characterIndex = pitchCharacters.length - 1 - index;
      layoutRows[slot.rowIndex][slot.colIndex] = characterIndex;
    });

    return { layoutRows, rowCount };
  }, [pitchCharacters]);

  const { layoutRows, rowCount } = formation;
  const widestRow = Math.max(1, ...layoutRows.map((row) => row.length));

  const characterAspectRatio = 2407 / 3591;
  const rowVerticalStep = 0.65;
  const shadowExtraHeight = 0.08;

  const widthMultiplier = widestRow * characterAspectRatio;
  const heightMultiplier =
    1 + (rowCount - 1) * rowVerticalStep + shadowExtraHeight;

  const maxFormationWidth = width * 0.9;
  const maxFormationHeight = height * 0.8;

  const maxH_by_width = maxFormationWidth / Math.max(0.001, widthMultiplier);
  const maxH_by_height = maxFormationHeight / Math.max(0.001, heightMultiplier);

  const characterImageHeight = Math.min(maxH_by_width, maxH_by_height);
  const characterCellWidth = characterImageHeight * characterAspectRatio;

  const formationWidth = widestRow * characterCellWidth;
  const formationHeight = characterImageHeight * heightMultiplier;

  const bgBlur = interpolate(globalFrame, [150, 180], [25, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bgBrightness = interpolate(globalFrame, [150, 180], [0.65, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleOpacity = interpolate(globalFrame, [0, 15, 75, 90], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleScale = interpolate(globalFrame, [0, 90], [0.95, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleColor = useMemo(() => {
    const kidColors = [
      "#FF3366",
      "#00C3FF",
      "#FFD700",
      "#39FF14",
      "#FF6600",
      "#9D00FF",
    ];
    const randIndex = Math.floor(random(displayTitle) * kidColors.length);
    return kidColors[randIndex];
  }, [displayTitle]);

  const performanceFrame = Math.max(0, globalFrame - INTRO_FRAMES);
  const elapsed = performanceFrame / fps;
  const sourceTime = elapsed * playbackSpeed;
  const characterSourceTime = sourceTime + characterLeadFrames / characterFps;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        background: `radial-gradient(circle at 50% 24%, ${brightBackgrounds[backgroundIndex][0]} 0%, ${brightBackgrounds[backgroundIndex][1]} 52%, ${brightBackgrounds[backgroundIndex][2]} 100%)`,
        overflow: "hidden",
      }}
    >
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Luckiest+Guy&display=swap');`}
      </style>

      <svg height="0" width="0" style={{ position: "absolute" }}>
        <defs>
          {cheerfulColors.map(([red, green, blue], index) => (
            <filter
              key={characterFilterId(index)}
              id={characterFilterId(index)}
              colorInterpolationFilters="sRGB"
            >
              <feColorMatrix
                type="matrix"
                values={[
                  0.2126 * red,
                  0.7152 * red,
                  0.0722 * red,
                  0,
                  0,
                  0.2126 * green,
                  0.7152 * green,
                  0.0722 * green,
                  0,
                  0,
                  0.2126 * blue,
                  0.7152 * blue,
                  0.0722 * blue,
                  0,
                  0,
                  0,
                  0,
                  0,
                  1,
                  0,
                ].join(" ")}
                result="coloredCharacter"
              />
              <feGaussianBlur
                in="SourceAlpha"
                stdDeviation="10"
                result="characterEdgeBlur"
              />
              <feOffset
                in="characterEdgeBlur"
                dx="-6"
                dy="-8"
                result="characterShadowOffset"
              />
              <feComposite
                in="characterShadowOffset"
                in2="SourceAlpha"
                operator="in"
                result="characterInnerShadowShape"
              />
              <feFlood
                floodColor="#ffffff"
                floodOpacity="0.12"
                result="characterInnerShadowColor"
              />
              <feComposite
                in="characterInnerShadowColor"
                in2="characterInnerShadowShape"
                operator="in"
                result="characterInnerShadow"
              />
              <feBlend
                in="coloredCharacter"
                in2="characterInnerShadow"
                mode="screen"
                result="coloredCharacterWithShadow"
              />
            </filter>
          ))}
        </defs>
      </svg>

      {/* --- PANGGUNG UTAMA KARAKTER --- */}
      <div
        style={{
          position: "absolute",
          bottom: "8%",
          left: "50%",
          transform: "translateX(-50%)",
          width: `${formationWidth}px`,
          height: `${formationHeight}px`,
          filter: `blur(${bgBlur}px) brightness(${bgBrightness})`,
        }}
      >
        {layoutRows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            style={{
              position: "absolute",
              bottom: `${(rowIndex * rowVerticalStep + shadowExtraHeight) * characterImageHeight}px`,
              left: 0,
              width: "100%",
              display: "flex",
              justifyContent: "center",
              gap: 0,
              zIndex: rowCount - rowIndex,
            }}
          >
            {row.map((characterIndex) => {
              const { pitch, intervals } = pitchCharacters[characterIndex];
              const characterFrame = getCharacterFrame(
                intervals,
                characterSourceTime,
                characterFps,
              );
              const shadowProgress = clamp((characterFrame - 1) / 49, 0, 1);
              const shadowScale = 1 - shadowProgress * 0.45;

              return (
                <div
                  key={`pitch-${pitch}`}
                  style={{
                    position: "relative",
                    width: `${characterCellWidth}px`,
                    height: `${characterImageHeight}px`,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      bottom: `-${characterImageHeight * shadowExtraHeight}px`,
                      width: `${characterCellWidth * 0.9}px`,
                      height: `${characterCellWidth * 0.22}px`,
                      background: "rgba(71, 85, 105, 0.3)",
                      borderRadius: "50%",
                      opacity: 0.75,
                      transform: `scale(${shadowScale})`,
                      transformOrigin: "center center",
                      zIndex: 0,
                    }}
                  />

                  <Img
                    src={staticFile(
                      `assets/char/char1/char${padFrame(characterFrame)}.png`,
                    )}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      width: "100%",
                      height: "100%",
                      filter: `url(#${characterFilterId(characterIndex)})`,
                      objectFit: "contain",
                      scale: "1.05",
                      zIndex: 1,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* --- OVERLAY JUDUL (0s - 3s / Frame 0 - 90) --- */}
      <Sequence from={0} durationInFrames={90}>
        <AbsoluteFill
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <div
            style={{
              fontFamily: "'Luckiest Guy', cursive",
              fontSize: "12vw",
              lineHeight: "1.1",
              color: titleColor,
              textAlign: "center",
              padding: "0 5vw",
              width: "100%",
              opacity: titleOpacity,
              transform: `scale(${titleScale})`,
              WebkitTextStroke: "50px #FFFFFF",
              paintOrder: "stroke fill",
              textShadow: `
                0 15px 25px rgba(0, 0, 0, 0.21),
                0 30px 60px rgba(0, 0, 0, 0.11)
              `,
              letterSpacing: "0.4vw",
              wordWrap: "break-word",
            }}
          >
            {displayTitle}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* --- OVERLAY HITUNG MUNDUR (3s - 6s / Frame 90 - 180) --- */}
      <Sequence from={90} durationInFrames={30}>
        <CountdownNumber number="3" />
      </Sequence>

      <Sequence from={120} durationInFrames={30}>
        <CountdownNumber number="2" />
      </Sequence>

      <Sequence from={150} durationInFrames={30}>
        <CountdownNumber number="1" />
      </Sequence>

      {/* --- AUDIO PREVIEW (REFF) SAAT INTRO --- */}
      <Sequence from={0} durationInFrames={90}>
        <Sequence from={-Math.round(previewStartTime * fps)}>
          <Audio src={staticFile(audioSource)} volume={previewVolume} />
        </Sequence>
      </Sequence>

      {/* --- AUDIO LAGU UTAMA --- */}
      <Sequence from={INTRO_FRAMES} durationInFrames={songFrames}>
        <Audio src={staticFile(audioSource)} volume={audioVolume} />
      </Sequence>

      {/* --- AUDIO TEPUK TANGAN DI AKHIR (4 Detik) --- */}
      <Sequence from={applauseStartFrame} durationInFrames={120}>
        <Audio src={staticFile("assets/aplaouse.mp3")} />
      </Sequence>
    </AbsoluteFill>
  );
};
