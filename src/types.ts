export interface WordCaption {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

export interface LineTiming {
  lineStart: number; // 1-indexed
  lineEnd: number;   // 1-indexed
  startFrame: number;
  endFrame: number;
}

export interface TutorialData {
  id: string;
  seriesTitle: string;
  audioFile: string;
  captionFile: string;
  codeSnippet: string;
  language: string;
  lineTimings?: LineTiming[];
  backgroundMusic?: string;
  videoSetup?: "standard" | "before_after";
  beforeCodeSnippet?: string;
  beforeDurationMs?: number;
  lineIntervalMs?: number;
  channelName?: string;
  challengeText?: string;
  narrationText?: string;
  outroText?: string;
  voiceName?: string;
  bgmVolume?: number;
}

export const calculateAnimationDuration = (params: {
  videoSetup?: "standard" | "before_after";
  codeSnippet: string;
  beforeCodeSnippet?: string;
  beforeDurationMs?: number;
  lineIntervalMs?: number;
  captions?: WordCaption[];
}): number => {
  const {
    videoSetup = "standard",
    codeSnippet,
    beforeCodeSnippet = "",
    beforeDurationMs = 3000,
    lineIntervalMs,
    captions = [],
  } = params;

  const rawLines = codeSnippet.split("\n");
  const rawBeforeLines = beforeCodeSnippet.split("\n");
  const totalLines = rawLines.length;
  
  const introFrames = videoSetup === "before_after" ? Math.floor((beforeDurationMs * 30) / 1000) : 0;
  const maxLines = videoSetup === "before_after" && rawBeforeLines.length > 0
    ? Math.max(rawLines.length, rawBeforeLines.length)
    : rawLines.length;

  const highlightPeriodFrames = 30;
  const changeStartFrame = introFrames + highlightPeriodFrames;
  const intervalFrames = lineIntervalMs ? Math.floor((lineIntervalMs * 30) / 1000) : 30;

  let codeRevealDoneFrame = 0;

  if (videoSetup === "before_after") {
    // Find modified lines
    const modifiedIndices: number[] = [];
    for (let i = 0; i < maxLines; i++) {
      const originalText = rawBeforeLines[i] || "";
      const fixedText = rawLines[i] || "";
      if (originalText !== fixedText) {
        modifiedIndices.push(i);
      }
    }

    if (modifiedIndices.length > 0) {
      let maxDoneFrame = 0;
      modifiedIndices.forEach((idx, listIdx) => {
        const revealFrame = changeStartFrame + listIdx * intervalFrames;
        const lineLength = rawLines[idx]?.length || 0;
        const doneFrame = revealFrame + Math.ceil(lineLength / 3);
        if (doneFrame > maxDoneFrame) {
          maxDoneFrame = doneFrame;
        }
      });
      codeRevealDoneFrame = maxDoneFrame;
    } else {
      codeRevealDoneFrame = changeStartFrame;
    }
  } else {
    // In standard mode, calculate reveal frames sequentially based on natural keyboard intervals
    let maxDoneFrame = 0;
    for (let idx = 0; idx < totalLines; idx++) {
      const revealFrame = introFrames + idx * intervalFrames;
      const lineLength = rawLines[idx]?.length || 0;
      const doneFrame = revealFrame + Math.ceil(lineLength / 3);
      if (doneFrame > maxDoneFrame) {
        maxDoneFrame = doneFrame;
      }
    }
    codeRevealDoneFrame = maxDoneFrame;
  }

  // Calculate audio narration duration in frames (delayed by introFrames in before_after mode)
  const audioDurationSec = captions.length > 0 ? captions[captions.length - 1].end : 0;
  const audioDurationFrames = Math.ceil(audioDurationSec * 30);
  const audioDoneFrame = introFrames + audioDurationFrames;

  // Outro CTA appears at least 2s (60 frames) after code typing ends, AND after narration ends
  const outroCtaStartFrame = Math.max(codeRevealDoneFrame + 60, audioDoneFrame);

  // Video runs for exactly 2 seconds (60 frames) after the Outro CTA starts
  const totalDuration = outroCtaStartFrame + 60;
  return Math.ceil(totalDuration);
};
