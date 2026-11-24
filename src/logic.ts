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
  slam: 20,
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
  return phase === 1 ? 2.8 : phase === 2 ? 2.2 : 1.7
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
export const SHARD_HEAL = 5
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

/** Final score: win bonus + time bonus + shard score. */
export function scoreFor(secondsElapsed: number, shardsSmashed: number): number {
  const timeBonus = Math.max(0, FIGHT_TIME_LIMIT_S - Math.floor(secondsElapsed)) * TIME_BONUS_PER_SECOND
  return WIN_BONUS + timeBonus + shardsSmashed * SHARD_SCORE
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
