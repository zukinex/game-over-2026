// Audio for the Crystal Golem fight.
//
// Every cue gets its own AudioSource entity: one AudioSource plays one clip
// at a time, so cues that can overlap (a hit landing while a phase sting
// plays) must not share an entity. Retriggering uses AudioSource.playSound,
// never a hand-mutated `playing` flag — the latter can be swallowed by
// CRDT dedup on the second trigger (see the audio-video SDK skill).
//
// All clips are `global: true` (same volume everywhere in the 32x32 arena)
// and every entity carries a Transform — without one the Explorer creates
// no Unity audio source and nothing plays, silently.
//
// Clips in assets/Audio/ are SYNTHESIZED PLACEHOLDERS made with ffmpeg
// (see tools/generate-audio-placeholders.sh). To swap in real sound design,
// drop a same-named .mp3 over the file — no code change needed. All cues
// fire only after the player clicks START FIGHT, so the browser autoplay
// policy is satisfied.
import { engine, Transform, AudioSource } from '@dcl/sdk/ecs'
import type { Entity } from '@dcl/sdk/ecs'

export type SfxName =
  | 'hit'
  | 'spikeHit'
  | 'spikeShatter'
  | 'slam'
  | 'volley'
  | 'shardSmash'
  | 'phase'
  | 'victory'
  | 'defeat'
  | 'start'
  | 'dodge'
  | 'heavy'

const CLIPS: { name: SfxName; file: string; volume: number; pitchJitter?: number }[] = [
  { name: 'hit', file: 'assets/Audio/hit.mp3', volume: 0.7, pitchJitter: 0.06 },
  { name: 'spikeHit', file: 'assets/Audio/spike-hit.mp3', volume: 0.7, pitchJitter: 0.06 },
  { name: 'spikeShatter', file: 'assets/Audio/spike-shatter.mp3', volume: 0.8 },
  { name: 'slam', file: 'assets/Audio/slam.mp3', volume: 0.9 },
  { name: 'volley', file: 'assets/Audio/volley.mp3', volume: 0.6 },
  { name: 'shardSmash', file: 'assets/Audio/shard-smash.mp3', volume: 0.7 },
  { name: 'phase', file: 'assets/Audio/phase.mp3', volume: 0.7 },
  { name: 'victory', file: 'assets/Audio/victory.mp3', volume: 0.8 },
  { name: 'defeat', file: 'assets/Audio/defeat.mp3', volume: 0.8 },
  { name: 'start', file: 'assets/Audio/start.mp3', volume: 0.7 },
  { name: 'dodge', file: 'assets/Audio/dodge.mp3', volume: 0.7 },
  { name: 'heavy', file: 'assets/Audio/heavy.mp3', volume: 0.9 }
]

const entities = new Map<SfxName, Entity>()
let ready = false

/** Create one silent AudioSource entity per cue. Call once from setupGame. */
export function initAudio() {
  if (ready) return
  for (const clip of CLIPS) {
    const e = engine.addEntity()
    // Transform is required even for global sources (see header note).
    Transform.create(e, { position: { x: 16, y: 2, z: 16 } })
    AudioSource.create(e, {
      audioClipUrl: clip.file,
      playing: false,
      loop: false,
      volume: clip.volume,
      global: true
    })
    entities.set(clip.name, e)
  }
  ready = true
}

/** Play a cue from the start. Safe to call before initAudio (no-op). */
export function playSfx(name: SfxName) {
  const e = entities.get(name)
  if (!e) return
  const clip = CLIPS.find((c) => c.name === name)
  if (!clip) return
  if (clip.pitchJitter) {
    // Small random pitch keeps repeated hits from sounding mechanical.
    const src = AudioSource.getMutableOrNull(e)
    if (src) src.pitch = 1 + (Math.random() * 2 - 1) * clip.pitchJitter
  }
  AudioSource.playSound(e, clip.file)
}
