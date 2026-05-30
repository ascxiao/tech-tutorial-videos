import React from "react";
import { Audio, useCurrentFrame, useVideoConfig, Sequence } from "remotion";
import { Header } from "./Header";
import { CodeBlock } from "./CodeBlock";
import { Subtitles } from "./Subtitles";
import { TutorialData } from "../types";
import { resolveAssetUrl } from "../utils";

// Memoized AudioTracks component to completely isolate HTML5 audio tags from per-frame useCurrentFrame() updates
const AudioTracks: React.FC<{
  audioFile: string;
  backgroundMusic?: string;
  bgmVolume?: number;
  introFrames: number;
  videoSetup?: string;
  pipelineRevision?: number;
}> = React.memo(({ audioFile, backgroundMusic, bgmVolume = 0.35, introFrames, videoSetup, pipelineRevision }) => {
  return (
    <>
      {videoSetup === "before_after" ? (
        <Sequence from={introFrames} key={`voiceover-seq-${audioFile}-${pipelineRevision}`}>
          <Audio src={resolveAssetUrl(audioFile, pipelineRevision)} pauseWhenBuffering key={`voiceover-audio-delayed-${audioFile}-${pipelineRevision}`} />
        </Sequence>
      ) : (
        <Audio src={resolveAssetUrl(audioFile, pipelineRevision)} pauseWhenBuffering key={`voiceover-audio-standard-${audioFile}-${pipelineRevision}`} />
      )}

      {backgroundMusic && (
        <Audio src={resolveAssetUrl(backgroundMusic, pipelineRevision)} volume={bgmVolume} pauseWhenBuffering key={`bgm-audio-${backgroundMusic}-${pipelineRevision}`} />
      )}
    </>
  );
});

export const PureVerticalVideo: React.FC<TutorialData> = ({
  id,
  seriesTitle,
  audioFile,
  captionFile,
  codeSnippet,
  language,
  lineTimings,
  backgroundMusic,
  videoSetup,
  beforeCodeSnippet,
  beforeDurationMs = 3000,
  lineIntervalMs,
  channelName,
  challengeText,
  outroText,
  bgmVolume,
  pipelineRevision,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Calculate when the intro countdown ends in frames
  const introFrames = videoSetup === "before_after"
    ? Math.floor((beforeDurationMs * 30) / 1000)
    : 0;

  return (
    <div className="w-[1080px] h-[1920px] bg-[#0B0F19] flex flex-col justify-start items-stretch overflow-hidden box-border relative select-none">
      {/* 1. Header Zone: Top 15% (288px) */}
      <Header seriesTitle={seriesTitle} id={id} channelName={channelName} />

      {/* 2. Code Canvas: Central 55% (1056px) */}
      <CodeBlock
        codeSnippet={codeSnippet}
        language={language}
        currentFrame={frame}
        durationInFrames={durationInFrames}
        lineTimings={lineTimings}
        videoSetup={videoSetup}
        beforeCodeSnippet={beforeCodeSnippet}
        beforeDurationMs={beforeDurationMs}
        lineIntervalMs={lineIntervalMs}
        challengeText={challengeText}
        outroText={outroText}
        captionFile={captionFile}
      />

      {/* 3. Caption Subtitle Zone: Bottom 30% (576px) */}
      {videoSetup === "before_after" && frame < introFrames ? (
        <div className="w-full h-[576px] flex flex-col justify-center items-center p-12 bg-[#050B08] border-t-4 border-emerald-950/70 box-border select-none relative">
          <span className="absolute top-4 left-6 text-xs font-mono text-emerald-600/60 tracking-widest uppercase">
            Live Caption Engine
          </span>
          <span className="text-emerald-600/80 font-mono tracking-widest text-lg font-bold animate-pulse uppercase">
            Analyzing bugged code...
          </span>
        </div>
      ) : (
        <Subtitles
          captionFile={captionFile}
          currentFrame={videoSetup === "before_after" ? frame - introFrames : frame}
          fps={fps}
          pipelineRevision={pipelineRevision}
        />
      )}

      {/* Static, isolated audio tracks with strict remount keying */}
      <AudioTracks
        key={`audio-tracks-${backgroundMusic}-${pipelineRevision}`}
        audioFile={audioFile}
        backgroundMusic={backgroundMusic}
        bgmVolume={bgmVolume}
        introFrames={introFrames}
        videoSetup={videoSetup}
        pipelineRevision={pipelineRevision}
      />
    </div>
  );
};
