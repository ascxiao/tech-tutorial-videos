import React, { useEffect, useState } from "react";
import { useDelayRender } from "remotion";
import { createHighlighter } from "shiki";
import { LineTiming } from "../types";

interface CodeBlockProps {
  codeSnippet: string;
  language: string;
  currentFrame: number;
  durationInFrames: number;
  lineTimings?: LineTiming[];
  videoSetup?: "standard" | "before_after";
  beforeCodeSnippet?: string;
  beforeDurationMs?: number;
  lineIntervalMs?: number;
  challengeText?: string;
  outroText?: string;
}

interface ShikiToken {
  content: string;
  foreground?: string;
  fontStyle?: number;
}

// Slice highlighted token arrays to simulate a smooth left-to-right typing effect
const sliceTokensByCharCount = (tokens: ShikiToken[], charLimit: number): ShikiToken[] => {
  let count = 0;
  const sliced: ShikiToken[] = [];
  for (const token of tokens) {
    if (count >= charLimit) break;
    const remaining = charLimit - count;
    if (token.content.length <= remaining) {
      sliced.push(token);
      count += token.content.length;
    } else {
      sliced.push({
        ...token,
        content: token.content.substring(0, remaining),
      });
      count += remaining;
    }
  }
  return sliced;
};

// Helper mapping languages to standard filenames
const getFileName = (lang: string) => {
  switch (lang.toLowerCase()) {
    case "typescript": return "index.ts";
    case "javascript": return "index.js";
    case "python": return "main.py";
    case "html": return "index.html";
    case "css": return "style.css";
    case "rust": return "main.rs";
    case "go": return "main.go";
    case "cpp": return "main.cpp";
    case "c": return "main.c";
    case "java": return "Main.java";
    case "bash":
    case "shell": return "script.sh";
    default: return `index.${lang}`;
  }
};

export const CodeBlock: React.FC<CodeBlockProps> = ({
  codeSnippet,
  language,
  currentFrame,
  videoSetup = "standard",
  beforeCodeSnippet = "",
  beforeDurationMs = 3000,
  lineIntervalMs,
  challengeText = "How will you debug this?",
  outroText = "Follow for more quick challenges!",
}) => {
  const [tokens, setTokens] = useState<ShikiToken[][]>([]);
  const [beforeTokens, setBeforeTokens] = useState<ShikiToken[][]>([]);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading Shiki syntax highlighter..."));

  useEffect(() => {
    let active = true;
    async function initShiki() {
      try {
        const highlighter = await createHighlighter({
          themes: ["dracula"],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          langs: [language as any],
        });
        
        if (active) {
          const res = highlighter.codeToTokens(codeSnippet, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            lang: language as any,
            theme: "dracula",
          });
          setTokens(res.tokens);

          if (beforeCodeSnippet) {
            const beforeRes = highlighter.codeToTokens(beforeCodeSnippet, {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              lang: language as any,
              theme: "dracula",
            });
            setBeforeTokens(beforeRes.tokens);
          }
          continueRender(handle);
        }
      } catch (err) {
        console.error("Shiki initialization failed:", err);
        if (active) {
          continueRender(handle);
        }
      }
    }
    initShiki();
    return () => {
      active = false;
    };
  }, [codeSnippet, beforeCodeSnippet, language, handle, continueRender]);

  if (tokens.length === 0 || (videoSetup === "before_after" && beforeCodeSnippet && beforeTokens.length === 0)) {
    return (
      <div className="w-full h-[1056px] bg-[#1E293B] border-4 border-[#334155] p-10 flex items-center justify-center box-border">
        <span className="text-[#94A3B8] font-mono tracking-widest text-xl animate-pulse">
          INITIALIZING CODE ENGINE...
        </span>
      </div>
    );
  }

  // Timings and interval configuration
  const totalLines = tokens.length;
  const introFrames = videoSetup === "before_after" ? Math.floor((beforeDurationMs * 30) / 1000) : 0;
  
  // Calculate the maximum lines between before and after snippets to ensure no line is ever cut off
  const maxLines = videoSetup === "before_after" && beforeTokens.length > 0
    ? Math.max(tokens.length, beforeTokens.length)
    : tokens.length;
    
  const linesToRender = Array.from({ length: maxLines }, (_, idx) => idx);

  // Highlight period of 1 second (30 frames) for bugged lines before they change
  const highlightPeriodFrames = 30;
  const changeStartFrame = introFrames + highlightPeriodFrames;

  // Identify bugged line indices to skip okay lines during line-by-line reveal
  const modifiedLineIndices = videoSetup === "before_after"
    ? linesToRender.filter((idx) => {
        const originalLine = beforeTokens[idx] || [];
        const fixedLine = tokens[idx] || [];
        const originalText = originalLine.map(t => t.content).join("");
        const fixedText = fixedLine.map(t => t.content).join("");
        return originalText !== fixedText;
      })
    : [];

  // Calculate reveal frames based on custom lineIntervalMs speed or natural default
  const getLineRevealFrame = (lineIdx: number) => {
    const interval = lineIntervalMs ? Math.floor((lineIntervalMs * 30) / 1000) : 30;
    return introFrames + lineIdx * interval;
  };

  const intervalFrames = lineIntervalMs ? Math.floor((lineIntervalMs * 30) / 1000) : 30;

  // Calculate the exact frame when the keyboard typing animation finishes for all lines
  let codeRevealDoneFrame = 0;
  if (videoSetup === "before_after") {
    if (modifiedLineIndices.length > 0) {
      let maxDoneFrame = 0;
      modifiedLineIndices.forEach((idx, listIdx) => {
        const revealFrame = changeStartFrame + listIdx * intervalFrames;
        const lineLength = tokens[idx]?.map(t => t.content).join("").length || 0;
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
    // In standard mode, calculate sequentially
    let maxDoneFrame = 0;
    for (let idx = 0; idx < totalLines; idx++) {
      const revealFrame = getLineRevealFrame(idx);
      const lineLength = tokens[idx]?.map(t => t.content).join("").length || 0;
      const doneFrame = revealFrame + Math.ceil(lineLength / 3);
      if (doneFrame > maxDoneFrame) {
        maxDoneFrame = doneFrame;
      }
    }
    codeRevealDoneFrame = maxDoneFrame;
  }

  // The Outro CTA appears exactly 2 seconds (60 frames) after the reveal finishes
  const narrationDoneFrame = codeRevealDoneFrame + 60;

  // Dynamic Success state for standard videos: turning all lines green when all are revealed
  const standardSuccessFrame = codeRevealDoneFrame + 15; // 0.5s pause after standard typing finishes
  const isSuccess = videoSetup !== "before_after" && currentFrame >= standardSuccessFrame;

  // Determine standard timing states
  const lineStates = Array.from({ length: totalLines }, (_, idx) => {
    const revealFrame = getLineRevealFrame(idx);
    const nextRevealFrame = getLineRevealFrame(idx + 1);

    const isRevealed = currentFrame >= revealFrame;
    const isActive = currentFrame >= revealFrame && currentFrame < nextRevealFrame;

    return { isRevealed, isActive };
  });

  // Calculate the effective rendered lines to perform dynamic layout scaling
  const effectiveLineCount = videoSetup === "before_after"
    ? linesToRender.reduce((count, idx) => {
        const originalLine = beforeTokens[idx] || [];
        const fixedLine = tokens[idx] || [];
        const originalText = originalLine.map(t => t.content).join("");
        const fixedText = fixedLine.map(t => t.content).join("");
        const isLineModified = originalText !== fixedText;
        return count + (isLineModified ? 2 : 1);
      }, 0)
    : totalLines;

  // Auto-Responsive Code Line Sizing mapping rules
  let fontSize = "text-2xl";
  let linePadding = "py-2.5 px-4";
  let lineGap = "gap-2.5";
  let numPr = "pr-6";
  let numW = "w-10";

  if (effectiveLineCount <= 6) {
    fontSize = "text-4xl";
    linePadding = "py-4 px-6";
    lineGap = "gap-4";
    numPr = "pr-8";
    numW = "w-14";
  } else if (effectiveLineCount <= 9) {
    fontSize = "text-3xl";
    linePadding = "py-3 px-5";
    lineGap = "gap-3";
    numPr = "pr-7";
    numW = "w-12";
  } else if (effectiveLineCount <= 12) {
    fontSize = "text-2xl";
    linePadding = "py-2.5 px-4";
    lineGap = "gap-2.5";
    numPr = "pr-6";
    numW = "w-10";
  } else if (effectiveLineCount <= 16) {
    fontSize = "text-xl";
    linePadding = "py-1.5 px-3.5";
    lineGap = "gap-2";
    numPr = "pr-5";
    numW = "w-8";
  } else {
    fontSize = "text-base";
    linePadding = "py-1 px-2";
    lineGap = "gap-1.5";
    numPr = "pr-4";
    numW = "w-6";
  }

  // Spot the bug countdown timer math
  const remainingSeconds = Math.max(1, Math.ceil((introFrames - currentFrame) / 30));

  // Zoom effect removed as per user preference

  // Countdown Position & Scale Morphing Transition Logic
  // Centered for 1 second (30 frames) then smoothly slides/scales to top-right header corner (frame 30 -> 50)
  const animStart = 30;
  const animDuration = 20;
  let morphProgress = 0;
  if (currentFrame >= animStart) {
    morphProgress = Math.min(1, (currentFrame - animStart) / animDuration);
  }
  
  // Smooth Ease-In-Out Cubic Curve
  const ease = morphProgress < 0.5 
    ? 4 * morphProgress * morphProgress * morphProgress 
    : 1 - Math.pow(-2 * morphProgress + 2, 3) / 2;

  // Interpolate overlay backdrop blur and background opacity to reveal code behind
  const bgOpacity = 0.45 * (1 - ease);
  const blurAmount = 2 * (1 - ease);

  // Interpolate Countdown Circle style properties (Center vs Top-Right Header)
  // Perfectly horizontally centered using translate3d(-50%, 0, 0)
  const circleTop = 380 - ease * (380 - 16);
  const circleLeft = `calc(${50 + ease * 42}%)`;
  const circleSize = 176 - ease * (176 - 64);
  const circleBorder = 8 - ease * (8 - 4);
  const circleTextSize = ease > 0.85 ? "text-2xl" : ease > 0.5 ? "text-4xl" : "text-8xl";

  // Challenge Question Text: Stays centered and fades out in place (1.0 -> 0.0)
  const bannerOpacity = 1 - ease;

  return (
    <div className="w-full h-[1056px] bg-[#050B08] border-4 border-emerald-950/60 p-10 flex flex-col justify-start overflow-hidden box-border relative">
      
      {/* Spot the Bug Countdown Overlay - Dynamic backdrop tint and blur fade-out */}
      {videoSetup === "before_after" && currentFrame < introFrames && (
        <div 
          style={{
            backgroundColor: `rgba(11, 15, 25, ${bgOpacity})`,
            backdropFilter: `blur(${blurAmount}px)`,
            WebkitBackdropFilter: `blur(${blurAmount}px)`,
          }}
          className="absolute inset-0 z-20 select-none transition-all duration-100"
        >
          {/* Animated Countdown Circle - Morphs from center to header right */}
          <div 
            style={{
              top: `${circleTop}px`,
              left: circleLeft,
              transform: "translate3d(-50%, 0, 0)",
              width: `${circleSize}px`,
              height: `${circleSize}px`,
              borderWidth: `${circleBorder}px`,
            }}
            className="absolute rounded-full border-emerald-400 bg-[#050B08]/90 flex items-center justify-center animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-75"
          >
            <span className={`text-white font-black font-mono ${circleTextSize} transition-all duration-100`}>
              {remainingSeconds}
            </span>
            {ease < 0.85 && (
              <div 
                className="absolute inset-[-8px] rounded-full border-8 border-transparent border-t-emerald-400 animate-spin" 
                style={{ 
                  animationDuration: "3s",
                  borderWidth: `${circleBorder}px`
                }} 
              />
            )}
          </div>

          {/* Centered Challenge Text Banner - Fades out in place (Does not move or transform) */}
          <div 
            style={{
              top: "590px",
              left: "50%",
              transform: "translate3d(-50%, 0, 0)",
              opacity: bannerOpacity,
              pointerEvents: bannerOpacity > 0.1 ? "auto" : "none",
            }}
            className="absolute bg-[#0D2418] text-emerald-400 px-7 py-3.5 rounded-lg border-4 border-emerald-500 shadow-[0_6px_0px_#059669] shrink-0 transition-all duration-75"
          >
            <h3 className="text-2xl font-black tracking-wider uppercase font-sans text-center leading-none whitespace-nowrap">
              {challengeText}
            </h3>
          </div>
        </div>
      )}

      {/* Code Header Bar */}
      <div className="flex items-center gap-2 mb-8 select-none shrink-0">
        <span className="w-4 h-4 rounded-full bg-[#EF4444]" />
        <span className="w-4 h-4 rounded-full bg-[#F59E0B]" />
        <span className="w-4 h-4 rounded-full bg-[#10B981]" />
        <span className="ml-4 text-sm font-mono text-[#64748B] tracking-wider uppercase">
          {getFileName(language)} — Code Canvas
        </span>
      </div>

      {/* Code Snippet Rendering Container - Applies responsive fonts */}
      <div 
        className={`font-mono ${fontSize} leading-relaxed flex flex-col ${lineGap} overflow-y-auto flex-1`}
      >
        
        {/* Standard Video Layout */}
        {videoSetup !== "before_after" && tokens.map((line, idx) => {
          const { isRevealed, isActive } = lineStates[idx];
          if (!isRevealed) return null;

          const revealFrame = getLineRevealFrame(idx);
          const elapsed = currentFrame - revealFrame;
          const lineText = line.map(t => t.content).join("");
          const totalLineLength = lineText.length;
          const isTyping = elapsed >= 0 && elapsed * 3 < totalLineLength;
          const typedTokens = sliceTokensByCharCount(line, Math.max(0, elapsed * 3));

          return (
            <div
              key={idx}
              className={`flex items-start ${linePadding} rounded transition-all duration-300 border-l-4 ${
                isSuccess
                  ? "bg-[#10B981]/10 border-[#10B981] text-[#D1FAE5]"
                  : isActive
                  ? "bg-[#0B1A14] border-emerald-500 text-[#FFFFFF]"
                  : "border-transparent opacity-35 text-[#94A3B8]"
              }`}
            >
              <span className={`${numW} text-right ${numPr} select-none font-bold font-mono ${fontSize} ${
                isSuccess
                  ? "text-[#10B981]"
                  : isActive
                  ? "text-[#34D399]"
                  : "text-[#475569]"
              }`}>
                {idx + 1}
              </span>
              <div className="flex-1 flex flex-wrap">
                {typedTokens.length === 0 ? (
                  <span className="inline-block w-1">&nbsp;</span>
                ) : (
                  typedTokens.map((token, tokenIdx) => {
                    const style: React.CSSProperties = {
                      color: isSuccess ? undefined : token.foreground || undefined,
                      fontStyle: token.fontStyle === 1 ? "italic" : token.fontStyle === 2 ? "bold" : undefined,
                    };
                    return (
                      <span key={tokenIdx} style={style} className="whitespace-pre">
                        {token.content}
                      </span>
                    );
                  })
                )}
                {isTyping && (
                  <span className="animate-pulse text-emerald-400 font-bold">|</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Before & After Diff Morph Layout - Mapped over linesToRender to guarantee no lines are ever cut off */}
        {videoSetup === "before_after" && linesToRender.map((idx) => {
          const originalLine = beforeTokens[idx] || [];
          const fixedLine = tokens[idx] || [];

          const originalText = originalLine.map(t => t.content).join("");
          const fixedText = fixedLine.map(t => t.content).join("");

          const isLineModified = originalText !== fixedText;

          // 1. Unchanged Line: Renders statically in its final clean slate state from the beginning
          if (!isLineModified) {
            return (
              <div
                key={idx}
                className={`flex items-start ${linePadding} rounded border-l-4 border-transparent text-[#94A3B8]`}
              >
                <span className={`${numW} text-right ${numPr} select-none font-bold font-mono ${fontSize} text-[#475569]`}>
                  {idx + 1}
                </span>
                <div className="flex-1 flex flex-wrap opacity-80">
                  {fixedLine.length === 0 ? (
                    <span className="inline-block w-1">&nbsp;</span>
                  ) : (
                    fixedLine.map((token, tokenIdx) => {
                      const style: React.CSSProperties = {
                        color: token.foreground || undefined,
                        fontStyle: token.fontStyle === 1 ? "italic" : token.fontStyle === 2 ? "bold" : undefined,
                      };
                      return (
                        <span key={tokenIdx} style={style} className="whitespace-pre">
                          {token.content}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          }

          // 2. Modified Line: Handles countdown, preview, highlight, and reveal stages
          const intervalFrames = lineIntervalMs ? Math.floor((lineIntervalMs * 30) / 1000) : 30;
          const buggedIndex = modifiedLineIndices.indexOf(idx);
          const revealFrame = changeStartFrame + buggedIndex * intervalFrames;
          const isFixedRevealed = currentFrame >= revealFrame;

          // COUNTDOWN & BEFORE PREVIEW (NO HIGHLIGHTS): Render original buggy code as plain standard styling
          if (currentFrame < introFrames) {
            return (
              <div
                key={idx}
                className={`flex items-start ${linePadding} rounded border-l-4 border-transparent text-[#94A3B8]`}
              >
                <span className={`${numW} text-right ${numPr} select-none font-bold font-mono ${fontSize} text-[#475569]`}>
                  {idx + 1}
                </span>
                <div className="flex-1 flex flex-wrap opacity-80">
                  {originalLine.length === 0 ? (
                    <span className="inline-block w-1">&nbsp;</span>
                  ) : (
                    originalLine.map((token, tokenIdx) => {
                      const style: React.CSSProperties = {
                        color: token.foreground || undefined,
                        fontStyle: token.fontStyle === 1 ? "italic" : token.fontStyle === 2 ? "bold" : undefined,
                      };
                      return (
                        <span key={tokenIdx} style={style} className="whitespace-pre">
                          {token.content}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          }

          // AFTER PART: Handles red highlights and morph reveals line-by-line
          return (
            <div key={idx} className="flex flex-col gap-1.5 w-full">
              {/* Buggy / Before State: Red line (Only rendered if original text is not empty) */}
              {originalText.trim() !== "" && (
                <div
                  className={`flex items-start ${linePadding} rounded border-l-4 border-[#EF4444] transition-all duration-200 ${
                    !isFixedRevealed
                      ? "bg-[#EF4444]/15 text-[#FF8A8A]"
                      : "bg-[#EF4444]/5 opacity-15 line-through text-[#64748B]"
                  }`}
                >
                  <span className={`${numW} text-right ${numPr} select-none font-bold font-mono ${fontSize} text-[#EF4444]`}>
                    -
                  </span>
                  <div className="flex-1 flex flex-wrap">
                    {originalLine.length === 0 ? (
                      <span className="inline-block w-1">&nbsp;</span>
                    ) : (
                      originalLine.map((token, tokenIdx) => {
                        const style: React.CSSProperties = {
                          color: !isFixedRevealed ? token.foreground || undefined : "#64748B",
                          fontStyle: token.fontStyle === 1 ? "italic" : token.fontStyle === 2 ? "bold" : undefined,
                        };
                        return (
                          <span key={tokenIdx} style={style} className="whitespace-pre">
                            {token.content}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Fixed / After State: Green line (Only rendered if fixed text is not empty, and transition is triggered) */}
              {isFixedRevealed && fixedText.trim() !== "" && (() => {
                const elapsed = currentFrame - revealFrame;
                const fixedTextLength = fixedLine.map(t => t.content).join("").length;
                const isFixedTyping = elapsed >= 0 && elapsed * 3 < fixedTextLength;
                const typedFixedTokens = sliceTokensByCharCount(fixedLine, Math.max(0, elapsed * 3));

                return (
                  <div
                    className={`flex items-start ${linePadding} rounded border-l-4 border-[#10B981] bg-[#10B981]/15 text-[#D1FAE5] transition-all duration-300`}
                  >
                    <span className={`${numW} text-right ${numPr} select-none font-bold font-mono ${fontSize} text-[#10B981]`}>
                      +
                    </span>
                    <div className="flex-1 flex flex-wrap">
                      {typedFixedTokens.length === 0 ? (
                        <span className="inline-block w-1">&nbsp;</span>
                      ) : (
                        typedFixedTokens.map((token, tokenIdx) => {
                          const style: React.CSSProperties = {
                            color: token.foreground || undefined,
                            fontStyle: token.fontStyle === 2 ? "bold" : token.fontStyle === 1 ? "italic" : undefined,
                          };
                          return (
                            <span key={tokenIdx} style={style} className="whitespace-pre">
                              {token.content}
                            </span>
                          );
                        })
                      )}
                      {isFixedTyping && (
                        <span className="animate-pulse text-[#10B981] font-bold">|</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}

      </div>

      {currentFrame >= narrationDoneFrame && (
        <div className="absolute inset-0 z-30 bg-[#050B08]/75 backdrop-blur-[6px] flex items-center justify-center p-10 select-none transition-all duration-300">
          <div className="bg-[#050B08]/95 border-4 border-emerald-500 px-10 py-8 rounded-xl shadow-[0_0_40px_rgba(16,185,129,0.25)] flex flex-col items-center justify-center text-center max-w-[90%] transition-all duration-300 animate-fade-in">
            <p className="text-xl font-bold font-mono text-emerald-400 tracking-wide animate-pulse">
              {outroText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
