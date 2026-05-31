import React, { useEffect, useState } from "react";
import { useDelayRender } from "remotion";
import { WordCaption } from "../types";
import { resolveAssetUrl } from "../utils";

interface SubtitlesProps {
  captionFile: string;
  currentFrame: number;
  fps: number;
  pipelineRevision?: number;
}

export const Subtitles: React.FC<SubtitlesProps> = ({
  captionFile,
  currentFrame,
  fps,
  pipelineRevision,
}) => {
  const [captions, setCaptions] = useState<WordCaption[]>([]);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading subtitles..."));

  useEffect(() => {
    let active = true;
    async function loadCaptions() {
      try {
        const response = await fetch(resolveAssetUrl(captionFile, pipelineRevision));
        const data = await response.json();
        if (active) {
          setCaptions(data);
          continueRender(handle);
        }
      } catch (err) {
        console.error("Failed to load caption file:", err);
        if (active) {
          continueRender(handle);
        }
      }
    }
    loadCaptions();
    return () => {
      active = false;
    };
  }, [captionFile, handle, continueRender, pipelineRevision]);

  if (captions.length === 0) {
    return (
      <div className="w-full h-[576px] flex items-center justify-center p-10 bg-[#0B0F19] box-border">
        <span className="text-[#475569] font-mono tracking-widest text-lg animate-pulse uppercase">
          Waiting for transcript...
        </span>
      </div>
    );
  }

  const currentTime = currentFrame / fps;

  // Find the index of the word that is currently active, or was most recently active (gap-free)
  let activeWordIdx = 0;
  for (let i = 0; i < captions.length; i++) {
    if (currentTime >= captions[i].start) {
      activeWordIdx = i;
    } else {
      break;
    }
  }

  // Segment captions into stable pages of 4 words each
  const wordsPerPage = 4;
  const activePageIdx = Math.floor(activeWordIdx / wordsPerPage);
  const startIdx = activePageIdx * wordsPerPage;
  const visibleWords = captions.slice(startIdx, startIdx + wordsPerPage);

  return (
    <div className="w-full h-[576px] flex flex-col justify-center items-center p-12 bg-[#050B08] border-t-4 border-emerald-950/70 box-border select-none relative">
      {/* Subtitle Zone Boundary Decorator */}
      <span className="absolute top-4 left-6 text-xs font-mono text-emerald-600/60 tracking-widest uppercase">
        Live Caption Engine
      </span>

      {/* Kinetic Typography container */}
      <div className="flex flex-wrap gap-x-5 gap-y-6 justify-center items-center max-w-[90%] text-center">
        {visibleWords.map((wordObj, idx) => {
          const globalIdx = startIdx + idx;
          const isActive = globalIdx === activeWordIdx;

          return (
            <span
              key={globalIdx}
              className={`text-4xl tracking-wide transition-[transform,color,opacity] duration-100 transform will-change-[transform,opacity] ${
                isActive
                  ? "scale-110 text-[#34D399] font-black opacity-100"
                  : "text-white opacity-30 font-medium scale-100"
              }`}
            >
              {wordObj.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
