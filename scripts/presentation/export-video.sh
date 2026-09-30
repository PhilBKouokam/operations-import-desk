#!/usr/bin/env bash
set -euo pipefail
# Real browser footage remains unchanged; captions are placed in a new bottom band.
ffmpeg -y -i recording-raw/walkthrough.webm -t 275 -an -vf "fps=10,pad=1280:1080:0:0:color=0x0f172a,subtitles=docs/presentation/walkthrough.srt:force_style='FontName=DejaVu Sans,FontSize=8,PrimaryColour=&H00FFFFFF,OutlineColour=&H001A170F,BorderStyle=1,Outline=0,MarginV=12,Alignment=2'" -c:v libx264 -preset slow -crf 29 -pix_fmt yuv420p -map_metadata -1 -movflags +faststart docs/presentation/walkthrough.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height -of json docs/presentation/walkthrough.mp4
