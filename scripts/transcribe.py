import os
import sys
import json
import subprocess

def install_and_import(package):
    try:
        __import__(package)
    except ImportError:
        print(f"[*] Local dependency '{package}' not found. Installing now...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        print(f"[+] Successfully installed '{package}'!")

def main():
    if len(sys.argv) < 3:
        print("Usage: python transcribe.py <input_audio_path> <output_json_path> [model_size]")
        print("Example: python transcribe.py public/audio/001.mp3 public/data/001_captions.json base")
        sys.exit(1)

    audio_path = sys.argv[1]
    output_path = sys.argv[2]
    model_size = sys.argv[3] if len(sys.argv) > 3 else "base"

    # Verify input file exists
    if not os.path.exists(audio_path):
        print(f"[-] Error: Audio file '{audio_path}' does not exist.")
        sys.exit(1)

    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # Ensure faster-whisper is installed
    try:
        install_and_import("faster_whisper")
    except Exception as e:
        print(f"[-] Failed to automatically install faster-whisper: {e}")
        print("[-] Please run: pip install faster-whisper")
        sys.exit(1)

    from faster_whisper import WhisperModel

    print(f"[*] Initializing local Whisper model '{model_size}' on CPU...")
    # Using cpu + int8 for zero-cost, portable, fast execution across standard hardware
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"[*] Transcribing audio file: {audio_path}...")
    segments, info = model.transcribe(audio_path, word_timestamps=True)

    word_captions = []

    print("[*] Extracting word-level timestamps...")
    for segment in segments:
        if segment.words:
            for w in segment.words:
                # Whisper returns word space formatting sometimes, we clean it
                word_clean = w.word.strip()
                if word_clean:
                    word_captions.append({
                        "word": word_clean,
                        "start": round(w.start, 3),
                        "end": round(w.end, 3)
                    })

    print(f"[+] Processed {len(word_captions)} words successfully!")

    print(f"[*] Saving transcription to: {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(word_captions, f, indent=2, ensure_ascii=False)

    print(f"[+] Local transcription pipeline completed successfully!")

if __name__ == "__main__":
    main()
