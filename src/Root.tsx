import React from "react";
import { Composition, staticFile } from "remotion";
import { z } from "zod";
import { zTextarea } from "@remotion/zod-types";
import { PureVerticalVideo } from "./components/PureVerticalVideo";
import { TutorialData, calculateAnimationDuration, WordCaption } from "./types";
import "./index.css";

// Import dynamic video configurations from public warehouse
import tutorialsData from "../public/data/tutorials.json";

// Safe asset resolver to strip leading "public/", "/public/", or slashes from JSON paths
const cleanPath = (path: string): string => {
  let cleaned = path;
  if (cleaned.startsWith("/public/")) {
    cleaned = cleaned.substring(8);
  } else if (cleaned.startsWith("public/")) {
    cleaned = cleaned.substring(7);
  }
  
  if (cleaned.startsWith("/")) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
};

// Define strict visual controls and schemas for Remotion Studio's sidebar
const tutorialSchema = z.object({
  id: z.string().describe("Unique video identifier (e.g. 001)"),
  seriesTitle: z.string().describe("Main category / series header title"),
  audioFile: z.string().describe("Path to your voiceover file relative to public/"),
  captionFile: z.string().describe("Path to your word caption timestamps relative to public/"),
  backgroundMusic: z.string().optional().describe("Path to your background track (optional)"),
  codeSnippet: zTextarea().describe("Paste or type your multi-line code here"),
  language: z.string().describe("Syntax highlighting language (e.g. typescript, python)"),
  videoSetup: z.enum(["standard", "before_after"]).optional().describe("Choose video template setup style"),
  beforeCodeSnippet: zTextarea().optional().describe("Buggy code snippet (for Before & After setup)"),
  beforeDurationMs: z.number().optional().describe("Custom intro delay showing buggy code (ms)"),
  lineIntervalMs: z.number().optional().describe("Custom automatic line reveal duration (ms)"),
  channelName: z.string().optional().describe("Your brand name displayed on top-right badge"),
  challengeText: z.string().optional().describe("Challenge/Spot the bug question text"),
  narrationText: z.string().optional().describe("Narrative script spoken in audio track"),
  outroText: z.string().optional().describe("Outro call to action text"),
  voiceName: z.string().optional().describe("Neural Voice select (e.g. en-US-GuyNeural)"),
  bgmVolume: z.number().optional().describe("Background music volume level (0.0 to 1.0)"),
});

export const RemotionRoot: React.FC = () => {
  const tutorials = tutorialsData as TutorialData[];

  return (
    <>
      {/* Dynamic Video Tutorial Compositions (Mapped from JSON Database with visual sidebar controls!) */}
      {tutorials.map((tutorial) => {
        // Prepare safe, fully resolved props
        const resolvedProps: TutorialData = {
          ...tutorial,
          audioFile: cleanPath(tutorial.audioFile),
          captionFile: cleanPath(tutorial.captionFile),
          backgroundMusic: tutorial.backgroundMusic ? cleanPath(tutorial.backgroundMusic) : undefined,
          bgmVolume: tutorial.bgmVolume !== undefined ? tutorial.bgmVolume : 0.35,
        };

        return (
          <Composition
            key={tutorial.id}
            id={`tutorial-${tutorial.id}`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component={PureVerticalVideo as any}
            fps={30}
            width={1080}
            height={1920}
            schema={tutorialSchema}
            defaultProps={resolvedProps}
            calculateMetadata={async ({ props }) => {
              try {
                let captions: WordCaption[] = [];
                if (props.captionFile) {
                  try {
                    if (typeof window !== "undefined" && typeof window.fetch === "function") {
                      const res = await window.fetch(staticFile(props.captionFile));
                      captions = await res.json();
                    } else {
                      const fs = eval("require")("fs");
                      const path = eval("require")("path");
                      const fullPath = path.join(process.cwd(), "public", props.captionFile);
                      if (fs.existsSync(fullPath)) {
                        captions = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
                      }
                    }
                  } catch (e) {
                    console.warn("Could not dynamically load captions in calculateMetadata:", e);
                  }
                }

                const computedFrames = calculateAnimationDuration({
                  videoSetup: props.videoSetup,
                  codeSnippet: props.codeSnippet,
                  beforeCodeSnippet: props.beforeCodeSnippet,
                  beforeDurationMs: props.beforeDurationMs,
                  lineIntervalMs: props.lineIntervalMs,
                  captions,
                });
                
                return {
                  durationInFrames: computedFrames,
                  props,
                };
              } catch (err) {
                console.error("Failed to dynamically calculate composition duration:", err);
                return {
                  durationInFrames: 900, // 30s default fallback
                  props,
                };
              }
            }}
          />
        );
      })}
    </>
  );
};
