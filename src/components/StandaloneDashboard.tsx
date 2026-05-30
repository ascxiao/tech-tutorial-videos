import React, { useState, useEffect, useCallback, useRef } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Code, Music, Volume2, Settings, PlayCircle, Terminal, Upload } from "lucide-react";
import { TutorialData, WordCaption, LineTiming, calculateAnimationDuration } from "../types";
import { PureVerticalVideo } from "./PureVerticalVideo";
import { resolveAssetUrl } from "../utils";

interface StandaloneDashboardProps {
  initialProps: TutorialData;
}

export const StandaloneDashboard: React.FC<StandaloneDashboardProps> = ({ initialProps }) => {
  // Creator Config States
  const [id, setId] = useState(initialProps.id);
  const [seriesTitle, setSeriesTitle] = useState(initialProps.seriesTitle);
  const [language, setLanguage] = useState(initialProps.language);
  const [codeSnippet, setCodeSnippet] = useState(initialProps.codeSnippet);
  
  const [videoSetup, setVideoSetup] = useState<"standard" | "before_after">(initialProps.videoSetup || "standard");
  const [beforeCodeSnippet, setBeforeCodeSnippet] = useState(initialProps.beforeCodeSnippet || "");
  const [beforeDurationMs, setBeforeDurationMs] = useState(initialProps.beforeDurationMs || 3000);
  const [lineIntervalMs, setLineIntervalMs] = useState(initialProps.lineIntervalMs || 2000);
  const [channelName, setChannelName] = useState(initialProps.channelName || "@TechQuickies");
  const [challengeText, setChallengeText] = useState(initialProps.challengeText || "How will you debug this?");
  const [outroText, setOutroText] = useState(initialProps.outroText || "Follow for more quick challenges!");
  const [voiceName, setVoiceName] = useState(initialProps.voiceName || "en-US-GuyNeural");
  const [activeCodeTab, setActiveCodeTab] = useState<"before" | "after">("before");
  const [pipelineRevision, setPipelineRevision] = useState(0);
  
  // Pipeline BGM list & selected track
  const [bgmList, setBgmList] = useState<string[]>([]);
  const [selectedBgm, setSelectedBgm] = useState(
    initialProps.backgroundMusic ? initialProps.backgroundMusic.split("/").pop() || "none" : "none"
  );
  const [bgmVolume, setBgmVolume] = useState(
    initialProps.bgmVolume !== undefined ? initialProps.bgmVolume : 0.35
  );
  const [pipelineProgress, setPipelineProgress] = useState({
    tts: "idle" as "idle" | "running" | "success" | "failed",
    whisper: "idle" as "idle" | "running" | "success" | "failed",
    sync: "idle" as "idle" | "running" | "success" | "failed",
  });
  
  const [narrationText, setNarrationText] = useState(initialProps.narrationText || "");
  const [captions, setCaptions] = useState<WordCaption[]>([]);
  const [lineTimings, setLineTimings] = useState<LineTiming[]>(initialProps.lineTimings || []);

  // API Status Logs
  const [logs, setLogs] = useState<string[]>(["[Creator System Ready]"]);
  const [status, setStatus] = useState<"idle" | "tts" | "whisper" | "save" | "render">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success">("idle");

  // Render Settings Modal & Multi-render States
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderResolution, setRenderResolution] = useState("1080x1920");
  const [renderFps, setRenderFps] = useState("30");
  const [renderCodec, setRenderCodec] = useState("h264");
  const [renders, setRenders] = useState<Record<string, {
    renderId: string;
    filename: string;
    progress: number;
    status: 'rendering' | 'success' | 'failed';
    error?: string;
  }>>({});
  // Player Ref & Playhead sync
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  
  // Dynamic duration calculation strictly matching composition duration calculations in Root.tsx
  const durationInFrames = calculateAnimationDuration({
    videoSetup,
    codeSnippet,
    beforeCodeSnippet,
    beforeDurationMs,
    lineIntervalMs,
    captions,
  });

  // Add a log entry helper
  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 1. Fetch available background music files
  const fetchBgmList = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3005/api/bgm");
      const data = await res.json();
      setBgmList(data);
      addLog(`Scanned ${data.length} background music tracks in library.`);
    } catch {
      addLog("Error: Backend Express API not reachable. Make sure you run 'npm run dev'!");
    }
  }, []);

  // Fetch bgm on mount
  useEffect(() => {
    fetchBgmList();
  }, [fetchBgmList]);

  // 2. Fetch current word captions if they exist
  useEffect(() => {
    async function fetchCaptions() {
      try {
        // Load dynamically from local Express static asset server with cache-busting!
        const res = await fetch(resolveAssetUrl(initialProps.captionFile, pipelineRevision));
        const data = await res.json();
        setCaptions(data);
        addLog(`Loaded ${data.length} word timestamps from database.`);
      } catch {
        // Safe silence if first run
      }
    }
    fetchCaptions();
  }, [initialProps.captionFile, pipelineRevision]);

  // 3. Synchronize horizontal timeline playhead with Player Ref events!
  useEffect(() => {
    const { current } = playerRef;
    if (!current) return;

    const onFrameUpdate = (e: CustomEvent<{ frame: number }>) => {
      setFrame(e.detail.frame);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current.addEventListener("frameupdate", onFrameUpdate as any);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      current.removeEventListener("frameupdate", onFrameUpdate as any);
    };
  }, [playerRef]);

  // 4. Parse narration text and group comments dynamically
  const parseCodeComments = useCallback(() => {
    const lines = codeSnippet.split("\n");
    const cleanedCodeLines: string[] = [];
    const speechSegments: { speech: string; lineStart: number; lineEnd: number }[] = [];
    
    let currentSpeech: string | null = null;
    let currentStartLine: number | null = null;
    
    lines.forEach((line) => {
      const match = line.match(/^\s*(?:\/\/#|#|\/\/)\s*\[sync:\s*(.*?)\s*\]\s*$/);
      if (match) {
        if (currentSpeech !== null && currentStartLine !== null) {
          speechSegments.push({
            speech: currentSpeech,
            lineStart: currentStartLine,
            lineEnd: cleanedCodeLines.length
          });
        }
        currentSpeech = match[1];
        currentStartLine = cleanedCodeLines.length + 1;
      } else {
        cleanedCodeLines.push(line);
      }
    });

    if (currentSpeech !== null && currentStartLine !== null) {
      speechSegments.push({
        speech: currentSpeech,
        lineStart: currentStartLine,
        lineEnd: cleanedCodeLines.length
      });
    }

    const cleanedCode = cleanedCodeLines.join("\n");
    const fullNarration = speechSegments.map(s => s.speech).join(" ");
    
    return { cleanedCode, speechSegments, fullNarration };
  }, [codeSnippet]);

  // Auto-extract narration text in real-time as user types code comments (acts as default value)
  useEffect(() => {
    const { fullNarration } = parseCodeComments();
    setNarrationText((prev) => prev || fullNarration);
  }, [parseCodeComments]);



  // D. Compile video to MP4 using Remotion headless renderer in local command-line
  const handleRenderVideo = () => {
    setShowRenderModal(true);
  };

  const handleStartRender = async () => {
    setStatus("render");
    addLog(`Initiating background headless Remotion rendering for tutorial-${id} (${renderResolution}, ${renderFps} FPS, ${renderCodec})...`);

    try {
      const res = await fetch("http://localhost:3005/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.success) {
        addLog(`[RENDER FAILED] ${data.error || "Failed to start render"}`);
        setStatus("idle");
        return;
      }

      const rId = data.renderId;
      const fn = data.filename;

      // Add to renders list
      setRenders(prev => ({
        ...prev,
        [rId]: {
          renderId: rId,
          filename: fn,
          progress: 0,
          status: 'rendering'
        }
      }));
      setStatus("idle");

      // Begin status polling for this specific renderId
      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`http://localhost:3005/api/render/status/${rId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setRenders(prev => {
              const current = prev[rId];
              if (!current) {
                clearInterval(interval);
                return prev;
              }
              return {
                ...prev,
                [rId]: {
                  ...current,
                  progress: statusData.progress,
                  status: statusData.status,
                  error: statusData.error
                }
              };
            });

            if (statusData.status === "success" || statusData.status === "failed") {
              if (statusData.status === "success") {
                addLog(`[SUCCESS] Pure vertical 9:16 video rendered: public/${fn}!`);
              } else {
                addLog(`[RENDER FAILED] ${statusData.error || "Rendering process exited with an error."}`);
              }
              clearInterval(interval);
            }
          } else {
            clearInterval(interval);
          }
        } catch (err) {
          console.error("Error polling render status:", err);
        }
      }, 800);

    } catch {
      addLog("Failed to contact Express render compiler service.");
      setStatus("idle");
    }
  };

  const handleOpenFolder = async (filename: string) => {
    try {
      addLog(`Opening directory highlighting ${filename}...`);
      const res = await fetch("http://localhost:3005/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        addLog("[SUCCESS] Opened output directory successfully.");
      } else {
        addLog("Failed to locate rendered file on disk.");
      }
    } catch {
      addLog("Error opening directory folder.");
    }
  };

  // Unified Auto-Produce Pipeline: TTS -> Whisper -> Sync & Save -> Manual Verification Hold
  const handleAutoProduceVideo = async () => {
    if (!narrationText.trim()) {
      addLog("Error: Narration text is empty. Cannot start auto-production.");
      return;
    }

    // Initialize progress nodes
    setPipelineProgress({
      tts: "running",
      whisper: "idle",
      sync: "idle",
    });

    // 1. Generate TTS
    setStatus("tts");
    addLog("[AUTO-PRODUCE] Step 1/3: Synthesizing neural voiceover...");
    try {
      const ttsRes = await fetch("http://localhost:3005/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: narrationText, id, voiceName }),
      });
      const ttsData = await ttsRes.json();
      if (!ttsData.success) {
        setPipelineProgress(prev => ({ ...prev, tts: "failed" }));
        addLog(`[AUTO-PRODUCE FAILED] TTS failed: ${ttsData.error}`);
        setStatus("idle");
        return;
      }
      setPipelineProgress(prev => ({ ...prev, tts: "success", whisper: "running" }));
      addLog("[AUTO-PRODUCE] TTS voiceover generation completed successfully.");
    } catch {
      setPipelineProgress(prev => ({ ...prev, tts: "failed" }));
      addLog("[AUTO-PRODUCE FAILED] Failed to contact local Express TTS service.");
      setStatus("idle");
      return;
    }

    // 2. Whisper Transcription
    setStatus("whisper");
    addLog("[AUTO-PRODUCE] Step 2/3: Transcribing speech with Whisper CPU...");
    let latestCaptions: WordCaption[] = [];
    try {
      const transcribeRes = await fetch("http://localhost:3005/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeData.success) {
        setPipelineProgress(prev => ({ ...prev, whisper: "failed" }));
        addLog(`[AUTO-PRODUCE FAILED] Transcription failed: ${transcribeData.error}`);
        setStatus("idle");
        return;
      }
      latestCaptions = transcribeData.captions;
      setCaptions(latestCaptions);
      setPipelineProgress(prev => ({ ...prev, whisper: "success", sync: "running" }));
      addLog(`[AUTO-PRODUCE] Whisper completed. Transcribed ${latestCaptions.length} words.`);
    } catch {
      setPipelineProgress(prev => ({ ...prev, whisper: "failed" }));
      addLog("[AUTO-PRODUCE FAILED] Failed to contact local Whisper transcription service.");
      setStatus("idle");
      return;
    }

    // 3. Align & Save Config
    setStatus("save");
    addLog("[AUTO-PRODUCE] Step 3/3: Aligning typing reveals with speech timestamps...");
    const { cleanedCode, speechSegments } = parseCodeComments();
    const alignedTimings: LineTiming[] = [];

    if (speechSegments.length > 0) {
      const puncRegex = new RegExp("[.,/#!$%^&*;:{}=\\-_`~()]", "g");
      let currentWordIdx = 0;
      speechSegments.forEach((seg) => {
        const segWords = seg.speech.toLowerCase().split(/\s+/);
        const segWordsCleaned = segWords.map(w => w.replace(puncRegex, "")).filter(Boolean);
        if (segWordsCleaned.length === 0) return;
        const startWordIdx = currentWordIdx;
        
        segWordsCleaned.forEach((w) => {
          let lookahead = 0;
          while ((currentWordIdx + lookahead) < latestCaptions.length) {
            const capW = latestCaptions[currentWordIdx + lookahead].word.toLowerCase().replace(puncRegex, "");
            if (capW === w || capW.includes(w) || w.includes(capW)) {
              currentWordIdx += lookahead + 1;
              break;
            }
            lookahead += 1;
          }
        });
        const endWordIdx = Math.min(latestCaptions.length - 1, currentWordIdx - 1);
        const startTime = latestCaptions[startWordIdx].start;
        const endTime = latestCaptions[endWordIdx].end;
        alignedTimings.push({
          lineStart: seg.lineStart,
          lineEnd: seg.lineEnd,
          startFrame: Math.floor(startTime * 30),
          endFrame: Math.floor(endTime * 30)
        });
      });
    } else {
      addLog("[AUTO-PRODUCE] No comments found. Distributing line reveals evenly across audio duration...");
      const totalLines = cleanedCode.split("\n").length;
      if (totalLines > 0 && latestCaptions.length > 0) {
        const totalDurationSec = latestCaptions[latestCaptions.length - 1].end;
        for (let i = 0; i < totalLines; i++) {
          const startTime = (i / totalLines) * totalDurationSec;
          const endTime = ((i + 1) / totalLines) * totalDurationSec;
          alignedTimings.push({
            lineStart: i + 1,
            lineEnd: i + 1,
            startFrame: Math.floor(startTime * 30),
            endFrame: Math.floor(endTime * 30)
          });
        }
      }
    }

    setLineTimings(alignedTimings);
    addLog(`[AUTO-PRODUCE] Aligned ${alignedTimings.length} code segments.`);

    const payload = {
      id,
      seriesTitle,
      audioFile: `/public/audio/${id}.mp3`,
      captionFile: `/public/data/${id}_captions.json`,
      backgroundMusic: selectedBgm !== "none" ? `/public/audio/${selectedBgm}` : undefined,
      codeSnippet: cleanedCode,
      language,
      lineTimings: alignedTimings,
      videoSetup,
      beforeCodeSnippet,
      beforeDurationMs,
      lineIntervalMs,
      channelName,
      challengeText,
      narrationText,
      outroText,
      voiceName,
      bgmVolume,
    };

    try {
      const saveRes = await fetch("http://localhost:3005/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saveData = await saveRes.json();
      if (!saveData.success) {
        setPipelineProgress(prev => ({ ...prev, sync: "failed" }));
        addLog(`[AUTO-PRODUCE FAILED] Failed to save config: ${saveData.error}`);
        setStatus("idle");
        return;
      }
      setPipelineProgress(prev => ({ ...prev, sync: "success" }));
      setPipelineRevision(prev => prev + 1);
      addLog("[AUTO-PRODUCE] Config and alignment successfully synchronized to database.");
    } catch {
      setPipelineProgress(prev => ({ ...prev, sync: "failed" }));
      addLog("[AUTO-PRODUCE FAILED] Failed to contact Express save config service.");
      setStatus("idle");
      return;
    }

    // Clean stop at Step 3 for manual review!
    setStatus("idle");
    addLog("[SUCCESS] Pipeline completed Steps 1-3! Paused for manual preview verification.");
  };

  // E. Handle local Drag-and-Drop or direct BGM file upload
  const handleBgmUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("uploading");
    addLog(`Uploading asset background music track: ${file.name}...`);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await fetch("http://localhost:3005/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, data: base64Data }),
        });

        if (!res.ok) {
          const text = await res.text();
          let parsedError = "Server Error";
          try {
            const parsed = JSON.parse(text);
            parsedError = parsed.error || parsedError;
          } catch {
            parsedError = text.substring(0, 100);
          }
          addLog(`Asset upload failed (${res.status}): ${parsedError}`);
          setUploadStatus("idle");
          return;
        }

        const data = await res.json();
        if (data.success) {
          addLog(`[SUCCESS] Asset successfully added to library: ${file.name}!`);
          setUploadStatus("success");
          // Re-scan BGM list to update dropdown dynamically!
          await fetchBgmList();
          setSelectedBgm(file.name);
        } else {
          addLog(`Asset upload failed: ${data.error}`);
          setUploadStatus("idle");
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addLog(`Failed to communicate with Express asset uploader service: ${errMsg}`);
        setUploadStatus("idle");
      }
    };
    reader.readAsDataURL(file);
  };

  // F. Interactive visual timeline skipping (seeking) and dragging scrubbing logic
  const isDraggingRef = useRef(false);

  const handleTimelineMove = useCallback((clientX: number) => {
    const timelineContainer = document.getElementById("timeline-container");
    if (!timelineContainer) return;
    const rect = timelineContainer.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const width = rect.width;
    const clickedPercent = Math.max(0, Math.min(1, clickX / width));
    const targetFrame = Math.floor(clickedPercent * durationInFrames);
    
    if (playerRef.current) {
      playerRef.current.seekTo(targetFrame);
      setFrame(targetFrame);
    }
  }, [durationInFrames]);

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    handleTimelineMove(e.clientX);
    addLog(`Activated interactive timeline scrubbing`);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      handleTimelineMove(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      addLog(`Deactivated interactive timeline scrubbing`);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Construct dynamic props payload to pass into the embedded Remotion Player!
  const { cleanedCode: parsedCleanedCode } = parseCodeComments();
  const resolvedProps: TutorialData = {
    id,
    seriesTitle,
    audioFile: `audio/${id}.mp3`,
    captionFile: `data/${id}_captions.json`,
    backgroundMusic: selectedBgm !== "none" ? `audio/${selectedBgm}` : undefined,
    codeSnippet: parsedCleanedCode,
    language,
    lineTimings,
    videoSetup,
    beforeCodeSnippet,
    beforeDurationMs,
    lineIntervalMs,
    channelName,
    challengeText,
    narrationText,
    outroText,
    voiceName,
    bgmVolume,
    pipelineRevision,
  };

  return (
    <div className="flex-1 flex flex-col justify-start items-stretch box-border p-6 select-none font-sans overflow-hidden bg-[#F8FAFC]">
      
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] shrink-0">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 bg-[#EAB308] text-[#0B0F19] font-black font-mono rounded text-sm uppercase tracking-wide">
            SHORTS EDITING SUITE
          </span>
          <div>
            <h1 className="text-lg font-black tracking-tight text-[#0F172A] uppercase flex items-center gap-2">
              {seriesTitle} <span className="text-xs text-slate-400 font-mono font-normal">#{id}</span>
            </h1>
            <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mt-0.5">
              Top-Level React Dashboard Website • Embedded Pure Remotion Player
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 bg-[#F1F5F9] border border-[#E2E8F0] rounded-md px-3.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-[#10B981] tracking-wider">
              PIPELINE BACKEND: 3005 ACTIVE
            </span>
          </div>
        </div>
      </div>

      {/* 2. Columns Workspace */}
      <div className="flex-1 grid grid-cols-12 gap-6 mt-6 overflow-hidden min-h-0 shrink-0">
        
        {/* Left Column: Script & Code Editor (Span 4) */}
        <div className="col-span-4 flex flex-col bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 overflow-hidden min-h-0 flat-shadow">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2.5 mb-4">
            <Code size={16} className="text-[#EAB308]" />
            <h2 className="text-xs font-black tracking-wider uppercase font-mono text-[#0F172A]">
              1. Script & Code Studio
            </h2>
          </div>

          <div className="flex flex-col gap-3.5 flex-1 overflow-hidden min-h-0">
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <div>
                <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                  Tutorial ID
                </label>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] px-2 py-1 rounded font-mono text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                  Language Code
                </label>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] px-2 py-1 rounded font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="shrink-0">
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                Series Title
              </label>
              <input
                type="text"
                value={seriesTitle}
                onChange={(e) => setSeriesTitle(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] px-2 py-1 rounded text-xs font-bold focus:outline-none"
              />
            </div>

            {/* Template Configurations Grid */}
            <div className="grid grid-cols-2 gap-2.5 shrink-0 bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <div>
                <label className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                  Video Setup
                </label>
                <select
                  value={videoSetup}
                  onChange={(e) => setVideoSetup(e.target.value as "standard" | "before_after")}
                  className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-1.5 py-1 rounded font-mono text-[10px] focus:outline-none cursor-pointer"
                >
                  <option value="standard">Standard Highlights</option>
                  <option value="before_after">Before & After Fix</option>
                </select>
              </div>
              <div>
                <label className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                  Channel Brand Badge
                </label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-1.5 py-1 rounded font-mono text-[10px] focus:outline-none"
                  placeholder="@TechQuickies"
                />
              </div>
              <div>
                <label className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                  Reveal Speed (ms)
                </label>
                <input
                  type="number"
                  value={lineIntervalMs}
                  onChange={(e) => setLineIntervalMs(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-1.5 py-1 rounded font-mono text-[10px] focus:outline-none"
                  placeholder="2000"
                />
              </div>
              {videoSetup === "before_after" && (
                <div>
                  <label className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                    Intro Delay (ms)
                  </label>
                  <input
                    type="number"
                    value={beforeDurationMs}
                    onChange={(e) => setBeforeDurationMs(parseInt(e.target.value) || 0)}
                    className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-1.5 py-1 rounded font-mono text-[10px] focus:outline-none"
                    placeholder="3000"
                  />
                </div>
              )}
              {videoSetup === "before_after" && (
                <div className="col-span-2">
                  <label className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                    Challenge Text Overlay
                  </label>
                  <input
                    type="text"
                    value={challengeText}
                    onChange={(e) => setChallengeText(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-1.5 py-1 rounded font-mono text-[10px] focus:outline-none"
                    placeholder="How will you debug this?"
                  />
                </div>
              )}
            </div>

            {/* Outro Call to Action Text */}
            <div className="mb-2 select-none">
              <label className="block text-[8px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold">
                Outro CTA Text Overlay
              </label>
              <input
                type="text"
                value={outroText}
                onChange={(e) => setOutroText(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-1.5 py-1 rounded font-mono text-[10px] focus:outline-none"
                placeholder="Follow for more quick challenges!"
              />
            </div>

            {/* Narration script editor */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1 font-bold flex justify-between">
                <span>Narration script (TTS Source)</span>
                <span className="text-[8px] text-[#475569]">Spoken audio text</span>
              </label>
              <textarea
                value={narrationText}
                onChange={(e) => setNarrationText(e.target.value)}
                className="w-full flex-1 bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] p-2.5 rounded font-mono text-xs leading-relaxed resize-none focus:outline-none"
                placeholder="Type the exact narration script here for neural voice synthesis..."
              />
            </div>

            {/* Code Snippet input */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">
                  Code snippet with [sync: ...] comments
                </label>
                {videoSetup === "before_after" && (
                  <div className="flex bg-[#F1F5F9] border border-[#E2E8F0] rounded p-0.5 shrink-0 gap-0.5 select-none">
                    <button
                      type="button"
                      onClick={() => setActiveCodeTab("before")}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all ${
                        activeCodeTab === "before"
                          ? "bg-white text-[#EF4444] shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Before (Buggy)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveCodeTab("after")}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded cursor-pointer transition-all ${
                        activeCodeTab === "after"
                          ? "bg-white text-[#10B981] shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      After (Fixed)
                    </button>
                  </div>
                )}
              </div>

              {/* Conditional tab rendering for textareas */}
              {videoSetup === "before_after" && activeCodeTab === "before" ? (
                <textarea
                  value={beforeCodeSnippet}
                  onChange={(e) => setBeforeCodeSnippet(e.target.value)}
                  className="w-full flex-1 bg-[#F8FAFC] border border-[#CBD5E1] text-[#EF4444] p-2.5 rounded font-mono text-[11px] leading-relaxed resize-none focus:outline-none"
                  placeholder="// Paste the BUGGY script here..."
                />
              ) : (
                <textarea
                  value={codeSnippet}
                  onChange={(e) => setCodeSnippet(e.target.value)}
                  className="w-full flex-1 bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] p-2.5 rounded font-mono text-[11px] leading-relaxed resize-none focus:outline-none"
                  placeholder="# [sync: In python, we can merge lists using stars.]&#10;list_a = [1, 2]"
                />
              )}
            </div>
          </div>
        </div>

        {/* Middle Column: Large Embedded Remotion Player (Span 4) */}
        <div className="col-span-4 flex flex-col justify-start items-center bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 overflow-hidden min-h-0 relative flat-shadow">
          <span className="absolute top-2.5 left-4 text-[10px] font-mono text-[#EAB308] tracking-widest uppercase font-bold">
            Pure Vertical video canvas
          </span>

          {/* Staged vertical player wrapper - enlarged to 360x640 */}
          <div className="w-[360px] h-[640px] bg-[#0B0F19] border border-[#CBD5E1] rounded-lg mt-6 overflow-hidden relative shrink-0 flat-shadow">
            <Player
              ref={playerRef}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              component={PureVerticalVideo as any}
              durationInFrames={durationInFrames}
              fps={30}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{
                width: "100%",
                height: "100%",
              }}
              controls
              inputProps={resolvedProps}
            />
          </div>

          <div className="mt-4 border-t border-[#E2E8F0] pt-3 w-full text-center text-[9px] font-mono text-slate-500 space-y-0.5">
            <p className="font-bold text-slate-600">Pristine 1080x1920 preview</p>
            <p>Click horizontal timeline cursor below to skip frames!</p>
          </div>
        </div>

        {/* Right Column: Pipeline Engine & Asset Uploader (Span 4) */}
        <div className="col-span-4 flex flex-col bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 overflow-hidden min-h-0 flat-shadow">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2.5 mb-4">
            <Settings size={16} className="text-[#38BDF8]" />
            <h2 className="text-xs font-black tracking-wider uppercase font-mono text-[#0F172A]">
              2. Pipeline Automation Deck
            </h2>
          </div>

          <div className="flex flex-col gap-3.5 overflow-hidden min-h-0 flex-1">
            
            {/* Background Music Selector & Asset Uploader */}
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] flex flex-col gap-2 shrink-0">
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Music size={12} className="text-[#38BDF8]" />
                Background Music library
              </label>
              
              <div className="flex gap-2">
                <select
                  value={selectedBgm}
                  onChange={(e) => setSelectedBgm(e.target.value)}
                  className="flex-1 bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-2 py-1.5 rounded font-mono text-xs focus:outline-none cursor-pointer"
                >
                  <option value="none">No Background Music (Muted)</option>
                  {bgmList.map((bg, idx) => (
                    <option key={idx} value={bg}>{bg}</option>
                  ))}
                </select>

                {/* Direct drag & drop uploader button */}
                <label className="px-3 py-1.5 bg-[#38BDF8] hover:bg-[#0284C7] text-white font-bold rounded flex items-center gap-1.5 text-xs cursor-pointer select-none uppercase tracking-wide shrink-0">
                  <Upload size={12} />
                  Upload
                  <input
                    type="file"
                    accept="audio/*, .mp3"
                    onChange={handleBgmUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Dynamic BGM Volume Customizer */}
              <div className={`flex flex-col gap-1.5 mt-2 bg-white/50 border border-slate-100 p-2 rounded-lg transition-all duration-350 ${selectedBgm === "none" ? "opacity-45 pointer-events-none select-none" : ""}`}>
                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold">
                  <span>Background Volume</span>
                  <span className="text-emerald-500 font-extrabold">{selectedBgm === "none" ? "Muted" : `${Math.round(bgmVolume * 100)}%`}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  disabled={selectedBgm === "none"}
                  value={selectedBgm === "none" ? 0 : Math.round(bgmVolume * 100)}
                  onChange={(e) => setBgmVolume(parseFloat(e.target.value) / 100)}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
                />
              </div>

              {/* Upload Status bar */}
              {uploadStatus === "uploading" && (
                <span className="text-[8px] font-mono text-[#EAB308] uppercase font-bold animate-pulse">Uploading file...</span>
              )}
              {uploadStatus === "success" && (
                <span className="text-[8px] font-mono text-[#10B981] uppercase font-bold">Successfully uploaded and added!</span>
              )}
            </div>

            {/* Neural Voice Selection Selector */}
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] flex flex-col gap-2 shrink-0">
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Volume2 size={12} className="text-[#38BDF8]" />
                Neural Voice selection
              </label>
              
              <div className="flex gap-2">
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-2 py-1.5 rounded font-mono text-xs focus:outline-none cursor-pointer"
                >
                  <option value="en-US-GuyNeural">Guy (Male, US)</option>
                  <option value="en-US-AriaNeural">Aria (Female, US)</option>
                  <option value="en-US-JennyNeural">Jenny (Female, US)</option>
                  <option value="en-GB-SoniaNeural">Sonia (Female, UK)</option>
                  <option value="en-GB-RyanNeural">Ryan (Male, UK)</option>
                  <option value="en-US-MichelleNeural">Michelle (Female, US)</option>
                </select>
              </div>
            </div>

            {/* Visual Pipeline Nodal Stepper */}
            <div className="bg-[#050B08] border border-emerald-500/20 rounded-xl p-4 flex flex-col gap-3 shrink-0">
              <span className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest font-bold border-b border-emerald-950 pb-1.5 flex justify-between">
                <span>Pipeline Automation Nodes</span>
                <span>Halt at Step 3 for Manual Review</span>
              </span>

              {/* Horizontal Nodes Connector Graph */}
              <div className="flex justify-between items-center px-2 py-1 font-mono text-[9px] font-bold">
                {/* Node 1: TTS */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    pipelineProgress.tts === 'running' 
                      ? 'border-emerald-400 bg-emerald-950/20 text-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                      : pipelineProgress.tts === 'success'
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : pipelineProgress.tts === 'failed'
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-slate-700 text-slate-500 bg-slate-900/50'
                  }`}>
                    {pipelineProgress.tts === 'success' ? '✓' : '1'}
                  </div>
                  <span className={pipelineProgress.tts === 'running' ? 'text-emerald-400' : pipelineProgress.tts === 'success' ? 'text-emerald-500/80' : 'text-slate-400'}>
                    TTS Voice
                  </span>
                </div>

                {/* Connection Line 1-2 */}
                <div className={`h-0.5 flex-1 mx-2 transition-all duration-350 ${
                  pipelineProgress.tts === 'success' ? 'bg-emerald-500/50' : 'bg-slate-800'
                }`} />

                {/* Node 2: Whisper */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    pipelineProgress.whisper === 'running' 
                      ? 'border-emerald-400 bg-emerald-950/20 text-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                      : pipelineProgress.whisper === 'success'
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : pipelineProgress.whisper === 'failed'
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-slate-700 text-slate-500 bg-slate-900/50'
                  }`}>
                    {pipelineProgress.whisper === 'success' ? '✓' : '2'}
                  </div>
                  <span className={pipelineProgress.whisper === 'running' ? 'text-emerald-400' : pipelineProgress.whisper === 'success' ? 'text-emerald-500/80' : 'text-slate-400'}>
                    Whisper
                  </span>
                </div>

                {/* Connection Line 2-3 */}
                <div className={`h-0.5 flex-1 mx-2 transition-all duration-350 ${
                  pipelineProgress.whisper === 'success' ? 'bg-emerald-500/50' : 'bg-slate-800'
                }`} />

                {/* Node 3: Sync DB */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    pipelineProgress.sync === 'running' 
                      ? 'border-emerald-400 bg-emerald-950/20 text-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                      : pipelineProgress.sync === 'success'
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                        : pipelineProgress.sync === 'failed'
                          ? 'border-red-500 bg-red-500 text-white'
                          : 'border-slate-700 text-slate-500 bg-slate-900/50'
                  }`}>
                    {pipelineProgress.sync === 'success' ? '✓' : '3'}
                  </div>
                  <span className={pipelineProgress.sync === 'running' ? 'text-emerald-400' : pipelineProgress.sync === 'success' ? 'text-emerald-500/80' : 'text-slate-400'}>
                    Sync & Save
                  </span>
                </div>

                {/* Connection Line 3-4 */}
                <div className="h-0.5 flex-1 mx-2 border-t border-dashed border-slate-700" />

                {/* Node 4: Manual Render */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 border-slate-700 text-slate-500 bg-slate-900/50`}>
                    4
                  </div>
                  <span className="text-slate-500">
                    HD Export
                  </span>
                </div>
              </div>

              {/* Manual Verification stopped message */}
              {pipelineProgress.sync === 'success' && (
                <div className="mt-1 bg-emerald-950/20 border border-emerald-500/20 px-3 py-2 rounded-lg text-[10px] text-emerald-400 leading-normal flex flex-col gap-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                    <span>Halted: Ready for Manual Verification</span>
                  </div>
                  <p>TTS, Word transcription, and typing timings are fully synchronized. Use the video preview canvas to play, check subtitles, and verify volume before manual export.</p>
                </div>
              )}
            </div>

            {/* Pipeline Action buttons */}
            <div className="grid grid-cols-1 gap-2.5 shrink-0">
              <button
                type="button"
                disabled={status !== "idle"}
                onClick={handleAutoProduceVideo}
                className="py-3.5 px-4 bg-[#E0F2FE] hover:bg-[#BAE6FD] border-2 border-[#0284C7] text-[#0369A1] font-black rounded-xl flex items-center justify-center gap-3.5 text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-[#0284C7]/15"
              >
                {status === "tts" && (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#0369A1] border-t-transparent animate-spin" />
                    Step 1/3: Synthesizing TTS Voiceover...
                  </span>
                )}
                {status === "whisper" && (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#0369A1] border-t-transparent animate-spin" />
                    Step 2/3: Whispering Timestamps...
                  </span>
                )}
                {status === "save" && (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#0369A1] border-t-transparent animate-spin" />
                    Step 3/3: Synchronizing & Saving Config...
                  </span>
                )}
                {status === "idle" && (
                  <span className="flex items-center gap-2">
                    <PlayCircle size={16} className="text-[#0284C7]" />
                    {pipelineProgress.sync === 'success' ? 'Restart Pipeline (Steps 1-3)' : 'Run Pipeline Start (Steps 1 ➜ 2 ➜ 3)'}
                  </span>
                )}
              </button>

              {/* Dedicated Manual Render Trigger Button */}
              <button
                type="button"
                onClick={handleRenderVideo}
                className="py-3 px-4 bg-[#10B981] hover:bg-[#0D9668] border-2 border-[#059669] text-[#FFFFFF] font-black rounded-xl flex items-center justify-center gap-2.5 text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-[#10B981]/15"
              >
                <Settings size={14} className="text-white" />
                Configure & Export Final Video (Step 4)
              </button>
            </div>

            {/* Pipeline Console Log */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest pb-1 border-b border-[#E2E8F0] font-bold flex items-center gap-1">
                <Terminal size={10} />
                Execution logs & API status
              </span>
              <div className="flex-1 overflow-y-auto mt-2 font-mono text-[9px] text-[#475569] space-y-1">
                {logs.map((l, idx) => (
                  <div key={idx} className={l.includes("[SUCCESS]") || l.includes("Success") ? "text-[#10B981] font-bold" : l.includes("Error") ? "text-[#EF4444] font-bold" : "text-slate-600"}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Horizontal Visual Timeline Deck */}
      <div className="h-[130px] bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl mt-6 p-4 flex flex-col justify-between shrink-0 font-mono flat-shadow">
        <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 border-b border-[#E2E8F0] pb-1.5">
          <span className="flex items-center gap-1.5 text-[#0F172A] uppercase">
            <Music size={11} className="text-[#38BDF8]" />
            3. AUDIO / CODE SEQUENTIAL ALIGNMENT TRACKS
          </span>
          <div className="flex items-center gap-4 text-slate-400 text-[8px]">
            <span>Duration: {durationInFrames} frames ({ (durationInFrames/30).toFixed(1) }s)</span>
            <span>Current Frame: <strong className="text-[#0F172A]">{frame}</strong></span>
          </div>
        </div>

        {/* Visual Timeline Track - Click & Drag to Seek enabled! */}
        <div 
          id="timeline-container"
          onMouseDown={handleTimelineMouseDown}
          className="flex-1 relative bg-[#F8FAFC] rounded-lg mt-2 border border-[#E2E8F0] overflow-hidden cursor-pointer"
        >
          {/* Aligned timings overlay */}
          {lineTimings.map((t, idx) => {
            const startPercent = (t.startFrame / durationInFrames) * 100;
            const endPercent = (t.endFrame / durationInFrames) * 100;
            const widthPercent = endPercent - startPercent;

            return (
              <div
                key={idx}
                style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                className="absolute top-1 bottom-1 bg-[#38BDF8]/15 border-l border-r border-[#38BDF8]/60 rounded px-1.5 flex flex-col justify-center overflow-hidden"
              >
                <span className="text-[8px] text-[#0369A1] font-bold truncate">Segment #{idx+1}</span>
                <span className="text-[7px] text-slate-500 truncate">Lines {t.lineStart}-{t.lineEnd}</span>
              </div>
            );
          })}

          {/* Scrolling horizontal playhead line */}
          <div
            style={{ left: `${(frame / durationInFrames) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-[#EAB308] z-10 shadow-[0_0_6px_#EAB308]"
          />
        </div>
        
        {/* Timeline bottom ticks */}
        <div className="flex justify-between text-[8px] text-slate-400 mt-1">
          <span>0.0s (0f)</span>
          <span>7.5s (225f)</span>
          <span>15.0s (450f)</span>
          <span>22.5s (675f)</span>
          <span>30.0s (900f)</span>
        </div>
      </div>

      {/* 4. Multi-Render & Settings Modal */}
      {showRenderModal && (
        <div className="fixed inset-0 bg-[#0B0F19]/65 flex items-center justify-center z-50 p-4 transition-all duration-300">
          <div className="bg-[#FFFFFF] border border-slate-200 rounded-2xl w-full max-w-4xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col font-sans">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-pulse" />
                <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-widest">Remotion Engine v4.0 • Multi-Render Deck</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRenderModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px]">
              
              {/* Left Column: Settings Configuration */}
              <div className="flex flex-col gap-4 border-r border-slate-100 pr-0 md:pr-6">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">Configure New Render</h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Select high-definition settings for your vertical video compilation.</p>
                </div>

                {/* Resolution Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">Target Resolution Preset</label>
                  <select
                    value={renderResolution}
                    onChange={(e) => setRenderResolution(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-3 py-2 rounded-lg font-mono text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="1080x1920">1080 x 1920 (Standard HD 9:16 - TikTok/Shorts)</option>
                    <option value="720x1280">720 x 1280 (SD 9:16 - Fast Draft)</option>
                  </select>
                </div>

                {/* FPS Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">Target Frame Rate (FPS)</label>
                  <select
                    value={renderFps}
                    onChange={(e) => setRenderFps(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-3 py-2 rounded-lg font-mono text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="30">30 Frames Per Second (Web Standard)</option>
                    <option value="60">60 Frames Per Second (Ultra Smooth)</option>
                  </select>
                </div>

                {/* Video Codec */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">Video Codec & Format</label>
                  <select
                    value={renderCodec}
                    onChange={(e) => setRenderCodec(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#CBD5E1] text-[#0F172A] px-3 py-2 rounded-lg font-mono text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="h264">MP4 H.264 (Universally Compatible)</option>
                    <option value="vp8">WebM VP8 (Web Native)</option>
                  </select>
                </div>

                {/* Start Button */}
                <button
                  type="button"
                  onClick={handleStartRender}
                  className="mt-auto w-full py-3 bg-[#059669] hover:bg-[#047857] text-[#FFFFFF] font-bold rounded-xl shadow-lg shadow-[#059669]/20 transition-all flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider text-xs"
                >
                  Start Headless Render
                </button>
              </div>

              {/* Right Column: Active & Completed Renders List */}
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">Active Render Tasks</h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Monitor your background compiles. Multiple renders run concurrently.</p>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[350px] flex flex-col gap-3 pr-1">
                  {Object.values(renders).length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <span className="text-slate-400 text-xs font-medium">No renders started yet.</span>
                      <span className="text-slate-400 text-[10px] mt-0.5">Click 'Start Headless Render' to trigger a background job.</span>
                    </div>
                  ) : (
                    Object.values(renders).map((r) => (
                      <div 
                        key={r.renderId} 
                        className={`p-3.5 border rounded-xl flex flex-col gap-2 transition-all ${
                          r.status === 'rendering' 
                            ? 'bg-emerald-50/10 border-emerald-500/20' 
                            : r.status === 'success' 
                              ? 'bg-slate-50/50 border-slate-200' 
                              : 'bg-red-50/10 border-red-500/20'
                        }`}
                      >
                        {/* Filename & Close/Dismiss */}
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-[11px] font-bold text-slate-700 truncate max-w-[220px]">
                            {r.filename}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRenders(prev => {
                              const next = { ...prev };
                              delete next[r.renderId];
                              return next;
                            })}
                            className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Progress Bar & Badges */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                            <div
                              style={{ width: `${r.progress}%` }}
                              className={`h-full rounded-full transition-all duration-300 ${
                                r.status === 'rendering' 
                                  ? 'bg-[#059669] shadow-[0_0_8px_#34D399]' 
                                  : r.status === 'success' 
                                    ? 'bg-emerald-500' 
                                    : 'bg-red-500'
                              }`}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-700 w-8 text-right">
                            {r.progress}%
                          </span>
                        </div>

                        {/* Status Badge & Action buttons */}
                        <div className="flex justify-between items-center mt-1">
                          <div>
                            {r.status === 'rendering' && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-mono text-[9px] font-bold uppercase tracking-wider animate-pulse">
                                Rendering
                              </span>
                            )}
                            {r.status === 'success' && (
                              <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-md font-mono text-[9px] font-bold uppercase tracking-wider">
                                Completed ✓
                              </span>
                            )}
                            {r.status === 'failed' && (
                              <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-md font-mono text-[9px] font-bold uppercase tracking-wider">
                                Failed ✕
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {r.status === 'success' && (
                              <button
                                type="button"
                                onClick={() => handleOpenFolder(r.filename)}
                                className="px-2.5 py-1 bg-[#E0F2FE] hover:bg-[#BAE6FD] border border-[#0284C7] text-[#0369A1] font-bold rounded-lg text-[10px] uppercase tracking-wide cursor-pointer"
                              >
                                Show in Explorer
                              </button>
                            )}
                            {r.status === 'failed' && (
                              <button
                                type="button"
                                onClick={() => {
                                  // Clear old task and start render again
                                  setRenders(prev => {
                                    const next = { ...prev };
                                    delete next[r.renderId];
                                    return next;
                                  });
                                  handleStartRender();
                                }}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold rounded-lg text-[10px] uppercase tracking-wide cursor-pointer"
                              >
                                Try Again
                              </button>
                            )}
                          </div>
                        </div>

                        {r.status === 'failed' && r.error && (
                          <p className="text-[10px] text-red-500 font-mono mt-1 bg-red-50/50 p-2 rounded border border-red-100/50 truncate">
                            {r.error}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Run in Background button */}
                <button
                  type="button"
                  onClick={() => setShowRenderModal(false)}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer mt-auto"
                >
                  Run in Background
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 5. Floating Background Render status badge */}
      {!showRenderModal && Object.values(renders).some(r => r.status === "rendering") && (
        <div 
          onClick={() => setShowRenderModal(true)}
          className="fixed bottom-6 right-6 z-40 bg-[#0B0F19]/95 border border-emerald-500/30 text-[#34D399] px-4 py-3 rounded-xl shadow-[0_4px_20px_rgba(16,185,129,0.3)] flex flex-col gap-1.5 cursor-pointer animate-bounce hover:scale-105 transition-all font-mono text-xs font-bold"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Rendering in Background ({Object.values(renders).filter(r => r.status === "rendering").length})</span>
          </div>
          <div className="flex flex-col gap-1 text-[10px] text-slate-400">
            {Object.values(renders).filter(r => r.status === "rendering").map(r => (
              <div key={r.renderId} className="flex justify-between gap-4">
                <span className="truncate max-w-[120px] font-bold text-slate-300">{r.filename}</span>
                <span className="text-emerald-400 font-extrabold">{r.progress}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
