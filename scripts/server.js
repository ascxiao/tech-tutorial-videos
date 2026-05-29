const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// Track rendering progress in real-time
const activeRenders = {};

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 1. GET /api/bgm - lists background music files in public/audio
app.get('/api/bgm', (req, res) => {
  const audioDir = path.join(__dirname, '..', 'public', 'audio');
  if (!fs.existsSync(audioDir)) {
    return res.json([]);
  }
  
  const files = fs.readdirSync(audioDir);
  const bgm = files.filter(f => {
    if (!f.endsWith('.mp3')) return false;
    const base = path.basename(f, '.mp3');
    // filter out tutorial voiceovers (which are 3-digit IDs like '001', '002')
    return !(base.length === 3 && !isNaN(base));
  });
  
  res.json(bgm);
});

// 2. POST /api/save - saves tutorial metadata directly to tutorials.json
app.post('/api/save', (req, res) => {
  const tutorial = req.body;
  const tutorialsPath = path.join(__dirname, '..', 'public', 'data', 'tutorials.json');
  
  let tutorials = [];
  if (fs.existsSync(tutorialsPath)) {
    try {
      tutorials = JSON.parse(fs.readFileSync(tutorialsPath, 'utf8'));
    } catch (e) {
      tutorials = [];
    }
  }
  
  const existingIdx = tutorials.findIndex(t => t.id === tutorial.id);
  if (existingIdx !== -1) {
    tutorials[existingIdx] = tutorial;
  } else {
    tutorials.push(tutorial);
  }
  
  fs.writeFileSync(tutorialsPath, JSON.stringify(tutorials, null, 2), 'utf8');
  res.json({ success: true, message: `Successfully registered tutorial ${tutorial.id} to tutorials.json` });
});

// 3. POST /api/tts - generates voiceover audio via Python neural TTS
app.post('/api/tts', (req, res) => {
  const { text, id, voiceName = "en-US-GuyNeural" } = req.body;
  const audioPath = path.join(__dirname, '..', 'public', 'audio', `${id}.mp3`);
  
  // Call tts.py using python command
  const ttsScript = path.join(__dirname, 'tts.py');
  
  // Clean double quotes from speech text to prevent shell injection/breakage
  const cleanText = text.replace(/"/g, "'").replace(/\n/g, " ");
  const cmd = `python "${ttsScript}" "${cleanText}" "${audioPath}" "${voiceName}"`;
  
  console.log(`[*] Running TTS command: ${cmd}`);
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[-] TTS error: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    console.log(`[+] TTS Success: ${stdout}`);
    res.json({ success: true, message: `Successfully generated tts to public/audio/${id}.mp3`, stdout });
  });
});

// 4. POST /api/transcribe - transcribes the audio using faster-whisper
app.post('/api/transcribe', (req, res) => {
  const { id } = req.body;
  const audioPath = path.join(__dirname, '..', 'public', 'audio', `${id}.mp3`);
  const captionsPath = path.join(__dirname, '..', 'public', 'data', `${id}_captions.json`);
  
  const transcribeScript = path.join(__dirname, 'transcribe.py');
  const cmd = `python "${transcribeScript}" "${audioPath}" "${captionsPath}"`;
  
  console.log(`[*] Running Transcribe command: ${cmd}`);
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[-] Transcribe error: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    
    // Read and return the generated captions JSON
    try {
      const captions = JSON.parse(fs.readFileSync(captionsPath, 'utf8'));
      res.json({ success: true, captions });
    } catch (e) {
      res.status(500).json({ error: "Failed to read generated captions file", details: e.message });
    }
  });
});

// 5. POST /api/render - triggers background remotion headless video render with progress tracking
app.post('/api/render', (req, res) => {
  const { id } = req.body;
  const outputPath = path.resolve(__dirname, '..', 'public', `output_${id}.mp4`);

  if (activeRenders[id] && activeRenders[id].status === 'rendering') {
    return res.json({ success: true, message: "Render already in progress", id, progress: activeRenders[id].progress });
  }

  activeRenders[id] = {
    progress: 0,
    status: 'rendering',
    outputPath,
    error: null
  };

  const compositionId = `tutorial-${id}`;
  const relativeOutputPath = `public/output_${id}.mp4`;
  console.log(`[*] Starting background Remotion render for composition: ${compositionId}`);

  // Spawn npx remotion render in the workspace root directory
  const child = spawn('npx', ['remotion', 'render', compositionId, relativeOutputPath], {
    shell: true,
    cwd: path.join(__dirname, '..')
  });

  child.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Remotion ${id}]: ${output.trim()}`);
    
    // Ignore bundler percentage outputs to prevent false-positive early 100% states
    if (output.includes('Bundling')) {
      return;
    }
    
    // Parse progress percentage e.g. "35%" or frame ratio e.g. "46/758"
    const pctMatch = output.match(/(\d+)%/);
    if (pctMatch) {
      const prg = parseInt(pctMatch[1], 10);
      activeRenders[id].progress = Math.max(activeRenders[id].progress, prg);
    } else {
      const frameMatch = output.match(/(\d+)\s*\/\s*(\d+)/);
      if (frameMatch) {
        const current = parseInt(frameMatch[1], 10);
        const total = parseInt(frameMatch[2], 10);
        if (total > 0) {
          const pct = Math.round((current / total) * 100);
          activeRenders[id].progress = Math.min(100, Math.max(activeRenders[id].progress, pct));
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    console.error(`[Remotion ${id} Error]: ${data.toString().trim()}`);
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log(`[+] Render completed successfully: public/output_${id}.mp4`);
      activeRenders[id].status = 'success';
      activeRenders[id].progress = 100;
    } else {
      console.error(`[-] Remotion process exited with error code ${code}`);
      activeRenders[id].status = 'failed';
      activeRenders[id].error = `Headless process exited with code ${code}`;
    }
  });

  res.json({ success: true, message: "Render started in background", id });
});

// 5b. GET /api/render/status/:id - polls active render progress
app.get('/api/render/status/:id', (req, res) => {
  const { id } = req.params;
  const render = activeRenders[id];
  if (!render) {
    return res.status(404).json({ error: "No active rendering found" });
  }
  res.json(render);
});

// 5c. POST /api/open-folder - highlights the rendered video in Windows Explorer
app.post('/api/open-folder', (req, res) => {
  const { id } = req.body;
  const outputPath = path.resolve(__dirname, '..', 'public', `output_${id}.mp4`);

  if (fs.existsSync(outputPath)) {
    // explorer /select highlights the exact output file
    const cmd = `explorer.exe /select,"${outputPath}"`;
    console.log(`[*] Executing: ${cmd}`);
    exec(cmd);
    res.json({ success: true, message: "Folder opened" });
  } else {
    res.status(404).json({ error: `File not found at ${outputPath}` });
  }
});

// 6. POST /api/upload - uploads assets (e.g. bgm audio files) directly as base64
app.post('/api/upload', (req, res) => {
  const { filename, data } = req.body;
  if (!filename || !data) {
    return res.status(400).json({ error: "Missing filename or base64 data" });
  }

  try {
    const audioDir = path.join(__dirname, '..', 'public', 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Strip out base64 schema prefix if present (e.g. "data:audio/mp3;base64,")
    const base64Data = data.includes('base64,') ? data.split('base64,')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');
    
    const outputPath = path.join(audioDir, filename);
    fs.writeFileSync(outputPath, buffer);

    console.log(`[+] Upload Success: Saved asset to public/audio/${filename}`);
    res.json({ success: true, message: `Successfully uploaded public/audio/${filename}` });
  } catch (err) {
    console.error(`[-] Upload error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`[+] Tech Tutorials Local Creator API listening on port ${PORT}!`);
});
