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
const characterLeadFrames = 5;
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
const cheerfulColors = [
  [1, 0.36, 0.36],
  [1, 0.72, 0.2],
  [1, 0.95, 0.2],
  [0.35, 0.85, 0.35],
  [0.2, 0.75, 1],
  [0.35, 0.45, 1],
  [0.75, 0.35, 1],
  [1, 0.35, 0.75]
];
const characterColorIndex = (index) => {
  const randomValue = Math.sin((index + 1) * 91.173 + 17.531) * 43758.5453;
  return Math.floor((randomValue - Math.floor(randomValue)) * cheerfulColors.length);
};
const characterFilterId = (index) => `character-color-${characterColorIndex(index)}`;
const brightBackgrounds = [
  ["#ffffff", "#e0f2fe", "#bae6fd"],
  ["#fff7ed", "#fed7aa", "#fdba74"],
  ["#fefce8", "#fef08a", "#fde047"],
  ["#f0fdf4", "#bbf7d0", "#86efac"],
  ["#fdf4ff", "#f5d0fe", "#e9d5ff"],
  ["#fff1f2", "#fecdd3", "#fda4af"]
];
const backgroundIndexFor = (song) => {
  const source = String(song?.source || "singcat-midi");
  const hash = [...source].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    7
  );
  return hash % brightBackgrounds.length;
};

export const SingcatVideo = ({ song }) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const backgroundIndex = backgroundIndexFor(song);
  const playbackSpeed = Math.max(0.01, (song.global?.speed ?? song.playbackSpeed ?? 100) / 100);
  const elapsed = frame / fps;
  const sourceTime = elapsed * playbackSpeed;
  const characterSourceTime = sourceTime + characterLeadFrames / characterFps;
  const audioVolume = Math.max(0, Math.min(1, (song.global?.volume ?? song.globalVolume ?? 100) / 100));
  const audioSource = song.audio?.selected
    || song.audio?.wav
    || song.audio?.mp3
    || "assets/generated/singcat-remotion.wav";
  
  if (
    song.audio?.source === "browser-soundfont"
    && !song.audio?.selected
    && song.audio?.fallback !== "synthetic"
  ) {
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
  
  const formation = useMemo(() => {
    // Tetap memakai logika max 5 baris horizontal
    const rowCount = Math.min(5, Math.max(1, pitchCharacters.length));
    const maximumPerRow = Math.max(
      1,
      Math.ceil((pitchCharacters.length + Math.floor((rowCount - 1) / 2)) / rowCount)
    );
    
    // TAHAP 1: Buat cetakan baris tanpa mengisi karakter, maksimalkan baris terbawah (rowIndex 0)
    const layoutRowsShape = [];
    let allocatedSlots = 0;
    for (
      let rowIndex = 0;
      rowIndex < rowCount && allocatedSlots < pitchCharacters.length;
      rowIndex += 1
    ) {
      const rowCapacity = rowIndex % 2 === 0
        ? maximumPerRow
        : Math.max(1, maximumPerRow - 1);
      const row = [];
      while (row.length < rowCapacity && allocatedSlots < pitchCharacters.length) {
        row.push(null); // Sisipkan slot kosong
        allocatedSlots += 1;
      }
      layoutRowsShape.push(row);
    }

    // TAHAP 2: Hitung titik visual koordinat (X, Y) tiap slot agar bisa diurutkan secara vertikal
    const slots = [];
    layoutRowsShape.forEach((row, rowIndex) => {
      const rowCapacity = row.length;
      row.forEach((_, colIndex) => {
        // xPos mewakili posisi visual absolut slot tersebut pada layar dari kiri ke kanan
        const xPos = colIndex + (maximumPerRow - rowCapacity) / 2;
        slots.push({ rowIndex, colIndex, xPos });
      });
    });

    // TAHAP 3: Urutkan slot secara Horizontal (kiri ke kanan), 
    // jika di posisi X yang sama, utamakan yang paling bawah (bawah ke atas)
    slots.sort((a, b) => a.xPos - b.xPos || a.rowIndex - b.rowIndex);

    // TAHAP 4: Mapping Karakter Nada secara berurutan ke slot
    const layoutRows = layoutRowsShape.map(row => [...row]); // Copy array struktur
    slots.forEach((slot, index) => {
      // Karena 'pitchCharacters' diurutkan dari nada tinggi -> nada rendah,
      // Nada terendah (paling kiri) ada di index paling belakang (length - 1).
      const characterIndex = pitchCharacters.length - 1 - index;
      layoutRows[slot.rowIndex][slot.colIndex] = characterIndex;
    });

    return { layoutRows, rowCount };
  }, [pitchCharacters]);

  const { layoutRows, rowCount } = formation;
  const widestRow = Math.max(1, ...layoutRows.map((row) => row.length));
  
  // ----------------------------------------------------------------------
  // KALKULASI PRESISI BOUNDING BOX (TIDAK ADA YANG DIUBAH DI SINI)
  // ----------------------------------------------------------------------
  const characterAspectRatio = 2407 / 3591;
  const rowVerticalStep = 0.65;
  const shadowExtraHeight = 0.08;

  const widthMultiplier = widestRow * characterAspectRatio;
  const heightMultiplier = 1 + (rowCount - 1) * rowVerticalStep + shadowExtraHeight;

  const maxFormationWidth = width * 0.90;
  const maxFormationHeight = height * 0.80;

  const maxH_by_width = maxFormationWidth / Math.max(0.001, widthMultiplier);
  const maxH_by_height = maxFormationHeight / Math.max(0.001, heightMultiplier);

  const characterImageHeight = Math.min(maxH_by_width, maxH_by_height);
  const characterCellWidth = characterImageHeight * characterAspectRatio;

  const formationWidth = widestRow * characterCellWidth;
  const formationHeight = characterImageHeight * heightMultiplier;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        background: `radial-gradient(circle at 50% 24%, ${brightBackgrounds[backgroundIndex][0]} 0%, ${brightBackgrounds[backgroundIndex][1]} 52%, ${brightBackgrounds[backgroundIndex][2]} 100%)`,
        overflow: "hidden"
      }}
    >
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
                  0.2126 * red, 0.7152 * red, 0.0722 * red, 0, 0,
                  0.2126 * green, 0.7152 * green, 0.0722 * green, 0, 0,
                  0.2126 * blue, 0.7152 * blue, 0.0722 * blue, 0, 0,
                  0, 0, 0, 1, 0
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

      <div
        style={{
          position: "absolute",
          bottom: "8%",
          left: "50%",
          transform: "translateX(-50%)",
          width: `${formationWidth}px`,
          height: `${formationHeight}px`,
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
              zIndex: rowCount - rowIndex
            }}
          >
            {/* Pada perulangan ini, nilai index di dalam row sekarang secara langsung mewakili urutan karakternya (characterIndex) */}
            {row.map((characterIndex) => {
              const { pitch, intervals } = pitchCharacters[characterIndex];
              const characterFrame = getCharacterFrame(
                intervals,
                characterSourceTime,
                characterFps
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
                      zIndex: 0
                    }}
                  />
                  
                  <Img
                    src={staticFile(`assets/char/char1/char${padFrame(characterFrame)}.png`)}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      width: "100%",
                      height: "100%",
                      filter: `url(#${characterFilterId(characterIndex)})`,
                      objectFit: "contain",
                      scale: "1.05",
                      zIndex: 1
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      
      <Audio src={staticFile(audioSource)} volume={audioVolume} />
    </AbsoluteFill>
  );
};