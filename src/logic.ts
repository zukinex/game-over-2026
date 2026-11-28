// Pure game logic for the Crystal Golem boss fight.
// No SDK imports: unit-testable with plain node + tsc (see tools/test-logic.mjs).

export const BOSS_MAX_HP = 300
export const PLAYER_MAX_HP = 100
export const PLAYER_ATTACK_DAMAGE = 10
export const PLAYER_ATTACK_COOLDOWN_S = 0.4
export const FIGHT_TIME_LIMIT_S = 300 // 5 minutes, per jam rules

export type BossPhase = 1 | 2 | 3
export type AttackKind = 'slam' | 'volley' | 'shards'

export const DAMAGE: Record<AttackKind | 'shardTouch', number> = {
  slam: 15,
  volley: 10,
  shards: 0, // shards themselves deal no damage; their touch does
  shardTouch: 10
}

/** Phase from remaining boss HP. */
export function phaseForHp(bossHp: number): BossPhase {
  if (bossHp > 200) return 1
  if (bossHp > 100) return 2
  return 3
}

/** Seconds between boss attacks, by phase. */
export function attackCooldownForPhase(phase: BossPhase): number {
  return phase === 1 ? 3.5 : phase === 2 ? 2.2 : 1.7
}

/**
 * Attack rotation per phase. Phase 1: slam only. Phase 2: slam/volley
 * alternating. Phase 3: slam/volley/shards cycle.
 */
export function attackForPhase(phase: BossPhase, attackIndex: number): AttackKind {
  if (phase === 1) return 'slam'
  if (phase === 2) return attackIndex % 2 === 0 ? 'slam' : 'volley'
  const cycle: AttackKind[] = ['slam', 'volley', 'shards']
  return cycle[attackIndex % 3]
}

/** Projectiles per volley, by phase. */
export function volleyCountForPhase(phase: BossPhase): number {
  return phase === 2 ? 5 : 7
}

/** Shards summoned per shards attack. */
export const SHARDS_PER_SUMMON = 3
/** Heal on smashing a shard. */
export const SHARD_HEAL = 10
/** Score per smashed shard. */
export const SHARD_SCORE = 100
/** Win bonus. */
export const WIN_BONUS = 1000
/** Time bonus: 10 points per second under the 5-minute limit. */
export const TIME_BONUS_PER_SECOND = 10

/** True once the 5-minute fight limit is reached: the fight must end. */
export function isTimeUp(secondsElapsed: number): boolean {
  return secondsElapsed >= FIGHT_TIME_LIMIT_S
}

/** Breakable shoulder spikes: the hidden weakness. The center spike hides
 *  behind the head, so only the two shoulder spikes are clickable. */
export const SPIKE_COUNT = 2
export const SPIKE_MAX_HP = 30
/** Damage a spike click deals to the boss body. */
export const SPIKE_CLICK_BOSS_DAMAGE = 5
/** Body-hit damage multiplier once the core is exposed. */
export const CORE_EXPOSED_MULTIPLIER = 2
/** Score per shattered spike. */
export const SPIKE_SCORE = 150

/** Damage of a body hit: doubled once the core is exposed. */
export function bodyHitDamage(coreExposed: boolean): number {
  return PLAYER_ATTACK_DAMAGE * (coreExposed ? CORE_EXPOSED_MULTIPLIER : 1)
}

/** True when every breakable spike is shattered. */
export function allSpikesBroken(brokenCount: number): boolean {
  return brokenCount >= SPIKE_COUNT
}

/** Final score: win bonus + time bonus + shard score + spike score + hit score. */
export function scoreFor(
  secondsElapsed: number,
  shardsSmashed: number,
  spikesBroken = 0,
  hitScore = 0
): number {
  const timeBonus = Math.max(0, FIGHT_TIME_LIMIT_S - Math.floor(secondsElapsed)) * TIME_BONUS_PER_SECOND
  return WIN_BONUS + timeBonus + shardsSmashed * SHARD_SCORE + spikesBroken * SPIKE_SCORE + hitScore
}

// ------------------------------------------------------------------ combo
/** Hits per combo tier: every 5 consecutive hits raises the multiplier. */
export const COMBO_STEP = 5
/** Highest score multiplier a combo can reach. */
export const COMBO_MAX_MULTIPLIER = 4

/** Score multiplier from the current combo count: x1, then +1 every 5 hits, capped at x4. */
export function comboMultiplier(combo: number): number {
  return Math.min(COMBO_MAX_MULTIPLIER, 1 + Math.floor(Math.max(0, combo) / COMBO_STEP))
}

/** Score for one boss hit of `damage` at the current combo (counted before this hit). */
export function hitScoreFor(damage: number, combo: number): number {
  return damage * comboMultiplier(combo)
}

/** "M:SS" timer format. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${m}:${rest.toString().padStart(2, '0')}`
}

/** Clamp HP into [0, max]. */
export function clampHp(hp: number, max: number): number {
  return Math.max(0, Math.min(max, hp))
}

/** Distance on the XZ plane (fights happen on flat ground). */
export function distanceXZ(
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = ax - bx
  const dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

/** True when the player stands inside a slam disc of the given radius. */
export function insideSlamDisc(
  playerX: number,
  playerZ: number,
  discX: number,
  discZ: number,
  radius: number
): boolean {
  return distanceXZ(playerX, playerZ, discX, discZ) <= radius
}

// ------------------------------------------------------------------ heavy attack
/** Damage of a charged heavy blow: hold the golem to charge, release to strike. */
export const HEAVY_DAMAGE = 25
/** Seconds of holding to fully charge a heavy blow. */
export const CHARGE_TIME_S = 0.8
/** Seconds after a heavy blow before the next one can be charged. */
export const HEAVY_COOLDOWN_S = 2.5

/** Damage of a heavy blow: doubled once the core is exposed. */
export function heavyHitDamage(coreExposed: boolean): number {
  return HEAVY_DAMAGE * (coreExposed ? CORE_EXPOSED_MULTIPLIER : 1)
}

/** Charge bar fill 0..1 for a hold of `heldS` seconds. */
export function chargeFraction(heldS: number): number {
  return Math.max(0, Math.min(1, heldS / CHARGE_TIME_S))
}

/** True once the hold is long enough for a heavy blow. */
export function isChargeFull(heldS: number): boolean {
  return heldS >= CHARGE_TIME_S
}

// ------------------------------------------------------------------ dodge
/** Invulnerability window granted by a dodge, in seconds. */
export const DODGE_IFRAMES_S = 0.6
/** Seconds between dodges. */
export const DODGE_COOLDOWN_S = 3
/** Dash distance in metres. */
export const DODGE_DISTANCE = 3

/** True when the dodge cooldown has elapsed. */
export function dodgeReady(lastDodgeAt: number, nowS: number): boolean {
  return nowS - lastDodgeAt >= DODGE_COOLDOWN_S
}

/** True while the dodge invulnerability window is open. */
export function dodgeActive(dodgeUntil: number, nowS: number): boolean {
  return nowS < dodgeUntil
}

// ------------------------------------------------------------------ shardlings
/** Arena bounds for dash targets (the 2x2-parcel World spans 0..32). */
export const ARENA_MIN = 2
export const ARENA_MAX = 30

/** Dash target: step `distance` metres from (px, pz) along (dx, dz),
 *  clamped inside the arena. A zero direction dashes south (+Z). */
export function dashTarget(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  distance: number
): { x: number; z: number } {
  const len = Math.hypot(dx, dz)
  const ux = len < 0.01 ? 0 : dx / len
  const uz = len < 0.01 ? 1 : dz / len
  return {
    x: Math.max(ARENA_MIN, Math.min(ARENA_MAX, px + ux * distance)),
    z: Math.max(ARENA_MIN, Math.min(ARENA_MAX, pz + uz * distance))
  }
}

/** Max shardlings alive at once (the phase-3 shards attack can burst past this). */
export const SHARDLING_MAX_ALIVE = 4
/** First periodic shardling spawns 8 s into the fight, so phase 1 gets a second enemy fast. */
export const SHARDLING_FIRST_SPAWN_S = 8

/** Seconds between periodic shardling spawns, by phase. */
export function shardlingSpawnIntervalS(phase: BossPhase): number {
  return phase === 1 ? 12 : phase === 2 ? 9 : 7
}

// ------------------------------------------------------------------ golem movement (v6)
// The golem walks slowly toward the player between attacks, so the fight
// is no longer a stationary shooting gallery. It stops a few metres out
// so it never walks onto the player, and plants its feet while a slam
// telegraph is active.
/** Golem walk speed, metres per second. */
export const GOLEM_WALK_SPEED = 0.6
/** Stop walking this close to the player. */
export const GOLEM_STOP_DISTANCE = 3

/** Step from (ax, az) toward (bx, bz) by at most maxStep metres. */
export function stepToward(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  maxStep: number
): { x: number; z: number } {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 0.01 || maxStep <= 0) return { x: ax, z: az }
  const step = Math.min(maxStep, len)
  return { x: ax + (dx / len) * step, z: az + (dz / len) * step }
}
