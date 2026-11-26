#!/bin/bash
# Regenerate the synthesized placeholder SFX in assets/Audio/.
# These are simple ffmpeg tones/noise bursts so the fight has audible
# feedback in preview right now. Replace any file with a same-named real
# .mp3 (same filename, no code change) for final sound design.
# Requires: ffmpeg. Run from the repo root.
set -e
cd "$(dirname "$0")/../assets/Audio"
ffmpeg -y -v error -f lavfi -i "aevalsrc='sin(2*PI*140*t)*exp(-t*20)':duration=0.25" -ar 22050 -ac 1 -b:a 96k hit.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='sin(2*PI*1250*t)*exp(-t*22)':duration=0.22" -ar 22050 -ac 1 -b:a 96k spike-hit.mp3
ffmpeg -y -v error -f lavfi -i "anoisesrc=duration=0.5:color=white" -af "highpass=f=3000, afade=t=out:st=0.15:d=0.35, volume=0.5" -ar 22050 -ac 1 -b:a 96k spike-shatter.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='sin(2*PI*55*t)*exp(-t*7)':duration=0.7" -ar 22050 -ac 1 -b:a 96k slam.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='sin(2*PI*(500+1700*t)*t)*exp(-t*6)':duration=0.35" -ar 22050 -ac 1 -b:a 96k volley.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='(sin(2*PI*880*t)+0.6*sin(2*PI*1318*t))*exp(-t*14)':duration=0.35" -ar 22050 -ac 1 -b:a 96k shard-smash.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='(sin(2*PI*440*t)*lt(t,0.18)+sin(2*PI*660*t)*gte(t,0.18))*exp(-t*4)':duration=0.55" -ar 22050 -ac 1 -b:a 96k phase.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='(sin(2*PI*523*t)*lt(t,0.2)+sin(2*PI*659*t)*gte(t,0.2)*lt(t,0.4)+sin(2*PI*784*t)*gte(t,0.4)*lt(t,0.6)+sin(2*PI*1046*t)*gte(t,0.6))*exp(-t*2.2)':duration=1.4" -ar 22050 -ac 1 -b:a 96k victory.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='(sin(2*PI*330*t)*lt(t,0.4)+sin(2*PI*220*t)*gte(t,0.4))*exp(-t*3)':duration=0.9" -ar 22050 -ac 1 -b:a 96k defeat.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='(sin(2*PI*98*t)*exp(-t*8)+0.5*sin(2*PI*392*t)*gte(t,0.15)*exp(-(t-0.15)*6))':duration=0.6" -ar 22050 -ac 1 -b:a 96k start.mp3
ffmpeg -y -v error -f lavfi -i "anoisesrc=duration=0.3:color=white" -af "highpass=f=900, afade=t=out:st=0.12:d=0.18, volume=0.6" -ar 22050 -ac 1 -b:a 96k dodge.mp3
ffmpeg -y -v error -f lavfi -i "aevalsrc='sin(2*PI*70*t)*exp(-t*9)+0.5*sin(2*PI*180*t)*exp(-t*15)':duration=0.4" -ar 22050 -ac 1 -b:a 96k heavy.mp3
echo "OK: $(ls *.mp3 | wc -l) placeholder clips in assets/Audio/"
