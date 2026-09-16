import React from "react";
import { Composition } from "remotion";
import catalog from "./catalog.json";
import songData from "./song-data.json";
import { SingcatVideo } from "./SingcatVideo";

const fps = 30;

const durationInFrames = (song) => {
  const speed = Math.max(0.01, (song.global?.speed ?? song.playbackSpeed ?? 100) / 100);
  return Math.max(1, Math.ceil((song.duration || 1) / speed * fps));
};

const composition = (id, name, song) => (
  <Composition
    id={id}
    component={SingcatVideo}
    durationInFrames={durationInFrames(song)}
    fps={fps}
    width={1280}
    height={720}
    defaultProps={{ song }}
    calculateMetadata={() => ({ props: { song }, displayName: name })}
  />
);

export const RemotionRoot = () => (
  <>
    {composition("SingcatVideo", catalog[0]?.name || "SingcatVideo", songData)}
    {catalog.map((item) => composition(item.id, item.name, item.song))}
  </>
);
