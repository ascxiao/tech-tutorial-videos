import os
import sys
import re
import json
import asyncio
import subprocess

def install_and_import(package, pip_name=None):
    if pip_name is None:
        pip_name = package
    try:
        __import__(package)
    except ImportError:
        print(f"[*] Local dependency '{package}' not found. Installing '{pip_name}' now...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name])
        print(f"[+] Successfully installed '{pip_name}'!")

def get_bg_music_files():
    audio_dir = "public/audio"
    if not os.path.exists(audio_dir):
        os.makedirs(audio_dir, exist_ok=True)
        return []
    
    # Filter files in public/audio that are mp3 but not tutorial voiceovers (which are named like '001.mp3', '002.mp3')
    bg_files = []
    for f in os.listdir(audio_dir):
        if f.endswith(".mp3"):
            name_without_ext = os.path.splitext(f)[0]
            if not (name_without_ext.isdigit() and len(name_without_ext) == 3):
                bg_files.append(f)
    return bg_files

async def generate_tts(text, output_path):
    print(f"[*] Generating human-like TTS voiceover to: {output_path}...")
    install_and_import("edge_tts")
    import edge_tts
    
    communicate = edge_tts.Communicate(text, "en-US-GuyNeural", volume="-15%")
    await communicate.save(output_path)
    print("[+] TTS voiceover generated successfully!")

def run_transcription(audio_path, captions_path):
    print(f"[*] Transcribing audio with Whisper to: {captions_path}...")
    install_and_import("faster_whisper")
    from faster_whisper import WhisperModel
    
    # Load model on CPU
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, word_timestamps=True)
    
    word_captions = []
    for segment in segments:
        if segment.words:
            for w in segment.words:
                word_clean = w.word.strip()
                if word_clean:
                    word_captions.append({
                        "word": word_clean,
                        "start": round(w.start, 3),
                        "end": round(w.end, 3)
                    })
    
    with open(captions_path, "w", encoding="utf-8") as f:
        json.dump(word_captions, f, indent=2, ensure_ascii=False)
    
    print(f"[+] Transcription complete! {len(word_captions)} words parsed.")
    return word_captions

def parse_code_snippet(code_snippet):
    """
    Parses a code snippet containing speech sync comments.
    Format:
    // [sync: Speech text here...]
    or for Python:
    # [sync: Speech text here...]
    """
    lines = code_snippet.split("\n")
    cleaned_code_lines = []
    speech_segments = []
    
    current_speech = None
    current_start_line = None
    
    for idx, line in enumerate(lines):
        # Match comments like // [sync: ...] or # [sync: ...]
        match = re.match(r"^\s*(?://|#)\s*\[sync:\s*(.*?)\s*\]\s*$", line)
        if match:
            # If we had a previous segment, close it
            if current_speech is not None and current_start_line is not None:
                speech_segments.append({
                    "speech": current_speech,
                    "lineStart": current_start_line,
                    "lineEnd": len(cleaned_code_lines) # ends at current line
                })
            
            current_speech = match.group(1)
            current_start_line = len(cleaned_code_lines) + 1 # 1-indexed next code line
        else:
            cleaned_code_lines.append(line)
            
    # Close last segment
    if current_speech is not None and current_start_line is not None:
        speech_segments.append({
            "speech": current_speech,
            "lineStart": current_start_line,
            "lineEnd": len(cleaned_code_lines)
        })
        
    cleaned_code = "\n".join(cleaned_code_lines)
    return cleaned_code, speech_segments

def align_code_timings(speech_segments, word_captions, fps=30):
    """
    Aligns speech segments with Whisper word-level timestamps to generate frame timings.
    """
    print("[*] Performing code-audio alignment...")
    
    # Flatten word list to plain words for sequence matching
    caption_words = [w["word"].lower().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") for w in word_captions]
    
    current_word_idx = 0
    line_timings = []
    
    for idx, seg in enumerate(speech_segments):
        seg_words = seg["speech"].lower().split()
        seg_words_cleaned = [w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") for w in seg_words]
        
        if not seg_words_cleaned:
            continue
            
        start_word_idx = current_word_idx
        # Match segment words with captions sequentially
        match_count = 0
        for w in seg_words_cleaned:
            # Look ahead in captions to find matching word
            lookahead = 0
            found = False
            while (current_word_idx + lookahead) < len(word_captions):
                cap_w = word_captions[current_word_idx + lookahead]["word"].lower().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
                if cap_w == w or w in cap_w or cap_w in w:
                    current_word_idx += lookahead + 1
                    found = True
                    break
                lookahead += 1
            if not found:
                # If word is not found, advance current word index by 1 safely
                current_word_idx = min(len(word_captions), current_word_idx + 1)
                
        end_word_idx = min(len(word_captions) - 1, current_word_idx - 1)
        
        # Determine times
        start_time = word_captions[start_word_idx]["start"]
        end_time = word_captions[end_word_idx]["end"]
        
        # Convert to frames
        start_frame = int(start_time * fps)
        end_frame = int(end_time * fps)
        
        # In a Shorts buildup, the code should remain revealed till the end of the video
        # But it is active/highlighted during this frame range
        line_timings.append({
            "lineStart": seg["lineStart"],
            "lineEnd": seg["lineEnd"],
            "startFrame": start_frame,
            "endFrame": end_frame
        })
        
        print(f"  -> Line {seg['lineStart']}-{seg['lineEnd']} aligned to frames {start_frame}-{end_frame} (Text: '{seg['speech'][:40]}...')")
        
    return line_timings

async def main():
    print("==============================================")
    print("  REMOTION AUTOMATED VIDEO CREATION PIPELINE  ")
    print("==============================================")
    
    # 1. Gather Inputs Interactively
    tut_id = input("[?] Enter Tutorial ID (e.g. 002): ").strip()
    if not tut_id:
        tut_id = "002"
        
    series_title = input("[?] Enter Series Title (e.g. PYTHON LIST MERGE): ").strip()
    if not series_title:
        series_title = "PYTHON TIP: LIST MERGE"
        
    language = input("[?] Enter Language (e.g. python, typescript): ").strip()
    if not language:
        language = "python"
        
    # Discover available background music files
    bg_music_list = get_bg_music_files()
    selected_bg_music = None
    if bg_music_list:
        print("[*] Discovered Background Music Files:")
        print("  0: None (Silence)")
        for idx, f in enumerate(bg_music_list):
            print(f"  {idx + 1}: {f}")
        music_sel = input("[?] Choose Background Music index: ").strip()
        if music_sel.isdigit() and 0 < int(music_sel) <= len(bg_music_list):
            selected_bg_music = f"/public/audio/{bg_music_list[int(music_sel) - 1]}"
    else:
        print("[!] No background music tracks found in 'public/audio'. Put your MP3s there to select them!")
        
    print("\n[?] Enter your Code Snippet with sync comments. Type 'END' on a blank line when finished:")
    print("Example (Python):")
    print("  # [sync: We declare a list of numbers.]")
    print("  num = [1, 2, 3]")
    print("  # [sync: Then we print it.]")
    print("  print(num)")
    
    snippet_lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        snippet_lines.append(line)
    
    code_raw = "\n".join(snippet_lines)
    
    # 2. Parse code comments
    cleaned_code, speech_segments = parse_code_snippet(code_raw)
    
    if not speech_segments:
        print("[-] Error: No speech comments ('[sync: ...]') found. Please include comments to generate voiceover!")
        sys.exit(1)
        
    # Build complete speech narration text
    full_speech_script = " ".join([seg["speech"] for seg in speech_segments])
    print(f"\n[+] Full Narration Script Compiled ({len(full_speech_script)} characters):")
    print(f"  '{full_speech_script}'")
    
    # 3. Generate Audio via edge-tts
    audio_path = f"public/audio/{tut_id}.mp3"
    captions_path = f"public/data/{tut_id}_captions.json"
    
    await generate_tts(full_speech_script, audio_path)
    
    # 4. Transcribe Audio via Whisper
    word_captions = run_transcription(audio_path, captions_path)
    
    # 5. Align timings
    line_timings = align_code_timings(speech_segments, word_captions)
    
    # 6. Save/Register to tutorials.json
    tutorials_path = "public/data/tutorials.json"
    tutorials = []
    if os.path.exists(tutorials_path):
        try:
            with open(tutorials_path, "r", encoding="utf-8") as f:
                tutorials = json.load(f)
        except Exception:
            tutorials = []
            
    # Check if entry already exists to update it, else append
    existing_idx = next((idx for idx, t in enumerate(tutorials) if t["id"] == tut_id), None)
    
    tutorial_payload = {
        "id": tut_id,
        "seriesTitle": series_title,
        "audioFile": f"/public/audio/{tut_id}.mp3",
        "captionFile": f"/public/data/{tut_id}_captions.json",
        "codeSnippet": cleaned_code,
        "language": language,
        "lineTimings": line_timings
    }
    
    if selected_bg_music:
        tutorial_payload["backgroundMusic"] = selected_bg_music
        
    if existing_idx is not None:
        tutorials[existing_idx] = tutorial_payload
        print(f"[+] Updated existing tutorial registry #{tut_id} in {tutorials_path}")
    else:
        tutorials.append(tutorial_payload)
        print(f"[+] Registered new tutorial #{tut_id} in {tutorials_path}")
        
    with open(tutorials_path, "w", encoding="utf-8") as f:
        json.dump(tutorials, f, indent=2, ensure_ascii=False)
        
    print("\n[+] PIPELINE COMPLETED SUCCESSFULLY!")
    print(f"  - Voiceover Audio: {audio_path}")
    print(f"  - Word Captions JSON: {captions_path}")
    print(f"  - Code Timings: Aligned sequentially")
    print(f"  - Dynamic Registry: Updated in public/data/tutorials.json")
    
    # Ask if user wants to render the video immediately
    render_opt = input("\n[?] Do you want to render the MP4 video immediately? (y/n): ").strip().lower()
    if render_opt == "y" or render_opt == "yes":
        print(f"[*] Starting render command for tutorial-{tut_id}...")
        subprocess.run(["powershell", "./scripts/render.ps1", "-Id", tut_id])

if __name__ == "__main__":
    asyncio.run(main())
