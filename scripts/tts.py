import sys
import asyncio

def install_and_import(package):
    try:
        __import__(package)
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])

async def main():
    if len(sys.argv) < 3:
        print("Usage: python tts.py <text> <output_path> [voice]")
        sys.exit(1)
        
    text = sys.argv[1]
    output_path = sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else "en-US-GuyNeural"
    
    install_and_import("edge_tts")
    import edge_tts
    
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    print(f"[+] TTS successfully saved to: {output_path}")

if __name__ == "__main__":
    asyncio.run(main())
