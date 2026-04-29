import os
import subprocess
import glob
from pathlib import Path

# Set up paths relative to this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, "input")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

def build_v0():
    print("🚀 Audra v0 Automation Engine Started...\n")
    
    # Ensure directories exist
    os.makedirs(INPUT_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 1. Find audio files
    audio_files = []
    for ext in ['*.mp3', '*.wav', '*.MP3', '*.WAV']:
        audio_files.extend(glob.glob(os.path.join(INPUT_DIR, ext)))
    
    # 2. Find image files
    image_files = []
    for ext in ['*.jpg', '*.jpeg', '*.png', '*.JPG', '*.JPEG', '*.PNG']:
        image_files.extend(glob.glob(os.path.join(INPUT_DIR, ext)))

    if not audio_files:
        print("❌ No audio files found in 'input/' folder. Drop an MP3 in there!")
        return
    
    if not image_files:
        print("❌ No image files found in 'input/' folder. Drop a cover JPG/PNG in there!")
        return

    # For v0: use the first image found as the universal cover
    cover_image = image_files[0]
    print(f"🖼️  Using cover image: {os.path.basename(cover_image)}")
    
    for audio in audio_files:
        audio_name = Path(audio).stem
        output_file = os.path.join(OUTPUT_DIR, f"{audio_name}_video.mp4")
        
        print(f"\n🎵 Processing: {os.path.basename(audio)}")
        print(f"🎬 Generating: {os.path.basename(output_file)}")
        print("⏳ Please wait, FFmpeg is rendering your video...")
        
        # FFmpeg command matching exact specs
        command = [
            "ffmpeg",
            "-y", # Overwrite output if necessary without prompting
            "-loop", "1",
            "-i", cover_image,
            "-i", audio,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-shortest", 
            "-pix_fmt", "yuv420p",
            output_file
        ]
        
        try:
            # Run the command and hide verbose ffmpeg output, only showing errors
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            print(f"✅ Success! File saved to: {output_file}")
            
        except subprocess.CalledProcessError as e:
            print(f"❌ Error processing {os.path.basename(audio)}. FFmpeg might have failed.")
            print(f"Details: {e}")

if __name__ == "__main__":
    build_v0()
    print("\n🎉 Job Complete!")
