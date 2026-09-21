import React from "react";
import { Composition } from "remotion";
import catalog from "./catalog.json";
import { SingcatVideo } from "./SingcatVideo";

const fps = 30;
export const INTRO_FRAMES = 180; // 6 Detik (3s Judul + 3s Hitung Mundur)
export const OUTRO_FRAMES = 210; // 7 Detik (4s Tepuk Tangan + 3s Jeda Akhir)

const calculateTotalDuration = (song) => {
  const speed = Math.max(
    0.01,
    (song.global?.speed ?? song.playbackSpeed ?? 100) / 100,
  );
  const songFrames = Math.max(
    1,
    Math.ceil(((song.duration || 1) / speed) * fps),
  );
  return INTRO_FRAMES + songFrames + OUTRO_FRAMES;
};

export const RemotionRoot = () => {
  return (
    <>
      {catalog.map((item, index) => {
        const compId = item.id || `SingcatVideo-${index}`;
        const songTitle = item.name || item.song?.title || "Singcat Music";

        return (
          <Composition
            key={compId}
            id={compId}
            component={SingcatVideo}
            durationInFrames={calculateTotalDuration(item.song)}
            fps={fps}
            width={3840}
            height={2160}
            defaultProps={{ song: item.song, title: songTitle }}
            calculateMetadata={() => ({
              props: { song: item.song, title: songTitle },
              displayName: songTitle,
            })}
          />
        );
      })}
    </>
  );
};
