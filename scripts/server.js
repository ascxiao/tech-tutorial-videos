const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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

// 5. POST /api/render - triggers remotion headless video render
app.post('/api/render', (req, res) => {
  const { id } = req.body;
  
  const renderScript = path.join(__dirname, 'render.ps1');
  const cmd = `powershell "${renderScript}" -Id "${id}"`;
  
  console.log(`[*] Running Render command: ${cmd}`);
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`[-] Render error: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    console.log(`[+] Render success: ${stdout}`);
    res.json({ success: true, message: `Successfully compiled video public/output_${id}.mp4`, stdout });
  });
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
