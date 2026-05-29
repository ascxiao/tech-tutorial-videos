import React, { useEffect, useState } from "react";
import { useDelayRender, staticFile } from "remotion";
import { WordCaption } from "../types";

interface SubtitlesProps {
  captionFile: string;
  currentFrame: number;
  fps: number;
}

export const Subtitles: React.FC<SubtitlesProps> = ({
  captionFile,
  currentFrame,
  fps,
}) => {
  const [captions, setCaptions] = useState<WordCaption[]>([]);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading subtitles..."));

  useEffect(() => {
    let active = true;
    async function loadCaptions() {
      try {
        // staticFile resolves paths in the public directory
        const response = await fetch(staticFile(captionFile));
        const data = await response.json();
        if (active) {
          const processed = data.map((w: WordCaption) => ({
            ...w,
            end: Math.max(w.start, w.end - 0.002),
          }));
          setCaptions(processed);
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
  }, [captionFile, handle, continueRender]);

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

  // Find index of currently active word
  let activeWordIdx = captions.findIndex(
    (word) => currentTime >= word.start && currentTime <= word.end
  );

  // Fallback: If no word is currently active (e.g. silences), find the closest word to keep context on-screen
  if (activeWordIdx === -1) {
    const upcomingIdx = captions.findIndex((word) => word.start > currentTime);
    if (upcomingIdx !== -1) {
      activeWordIdx = Math.max(0, upcomingIdx - 1);
    } else {
      activeWordIdx = captions.length - 1;
    }
  }

  // Slice a rolling window of 6 words (e.g. 2 before and 3 after) to avoid cluttering vertical layout
  const WINDOW_BEFORE = 2;
  const WINDOW_AFTER = 3;
  const startIdx = Math.max(0, activeWordIdx - WINDOW_BEFORE);
  const endIdx = Math.min(captions.length, activeWordIdx + WINDOW_AFTER + 1);
  const visibleWords = captions.slice(startIdx, endIdx);

  return (
    <div className="w-full h-[576px] flex flex-col justify-center items-center p-12 bg-[#050B08] border-t-4 border-emerald-950/70 box-border select-none relative">
      {/* Subtitle Zone Boundary Decorator */}
      <span className="absolute top-4 left-6 text-xs font-mono text-emerald-600/60 tracking-widest uppercase">
        Live Caption Engine
      </span>

      {/* Kinetic Typography container */}
      <div className="flex flex-wrap gap-x-5 gap-y-6 justify-center items-center max-w-[90%] text-center">
        {visibleWords.map((wordObj, idx) => {
          const absoluteIdx = startIdx + idx;
          const isActive = absoluteIdx === activeWordIdx;

          return (
            <span
              key={absoluteIdx}
              className={`text-4xl transition-all duration-150 transform tracking-wide ${
                isActive
                  ? "scale-115 text-[#34D399] font-black border-b-4 border-[#34D399] pb-1 px-1 shadow-[0_4px_12px_rgba(52,211,153,0.15)]"
                  : "text-white opacity-30 font-medium"
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
