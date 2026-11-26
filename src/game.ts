// Crystal Golem boss fight: state machine, boss AI, attacks, projectiles,
// shards, and the HUD state the React-ECS HUD reads every frame.
//
// Static arena + golem bodies live in assets/scene/main.composite and are
// fetched by name here; only projectiles, shards and slam discs are
// spawned at runtime.
import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  MaterialTransparencyMode,
  VisibilityComponent,
  PointerEventType,
  InputAction,
  inputSystem,
  pointerEventsSystem,
  ColliderLayer
} from '@dcl/sdk/ecs'
import type { Entity } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { EntityNames } from '../assets/scene/entity-names'
import { initAudio, playSfx } from './audio'
import {
  BOSS_MAX_HP,
  PLAYER_MAX_HP,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_COOLDOWN_S,
  HEAVY_COOLDOWN_S,
  DODGE_IFRAMES_S,
  DODGE_COOLDOWN_S,
  DODGE_DISTANCE,
  SHARDLING_MAX_ALIVE,
  SHARDLING_FIRST_SPAWN_S,
  SPIKE_COUNT,
  SPIKE_MAX_HP,
  SPIKE_CLICK_BOSS_DAMAGE,
  SHARDS_PER_SUMMON,
  SHARD_HEAL,
  SHARD_SCORE,
  attackForPhase,
  attackCooldownForPhase,
  phaseForHp,
  volleyCountForPhase,
  bodyHitDamage,
  heavyHitDamage,
  chargeFraction,
  isChargeFull,
  dodgeReady,
  dodgeActive,
  dashTarget,
  shardlingSpawnIntervalS,
  allSpikesBroken,
  clampHp,
  distanceXZ,
  insideSlamDisc,
  isTimeUp,
  scoreFor
} from './logic'

export type GamePhase = 'intro' | 'fight' | 'dying' | 'victory' | 'defeat'

/** Mutable HUD state. hud.tsx reads this every frame; no events needed. */
export const hudState: {
  phase: GamePhase
  bossHp: number
  bossMax: number
  playerHp: number
  playerMax: number
  timeS: number
  score: number
  shardsSmashed: number
  spikesBroken: number
  charge: number
  heavyReady: boolean
  dodgeCooldown: number
  dodging: boolean
  banner: string | null
} = {
  phase: 'intro',
  bossHp: BOSS_MAX_HP,
  bossMax: BOSS_MAX_HP,
  playerHp: PLAYER_MAX_HP,
  playerMax: PLAYER_MAX_HP,
  timeS: 0,
  score: 0,
  shardsSmashed: 0,
  spikesBroken: 0,
  charge: 0,
  heavyReady: true,
  dodgeCooldown: 0,
  dodging: false,
  banner: null
}

// ------------------------------------------------------------------- state
let state: GamePhase = 'intro'
let bossHp = BOSS_MAX_HP
let playerHp = PLAYER_MAX_HP
let timeS = 0
let clock = 0
let attackTimer = 0
let attackIndex = 0
let lastPlayerAttackAt = -1
let dyingT = 0
let bossYaw = 0
let hitFlashT = 0
let bannerUntil = 0
let shardsSmashed = 0
let spikesBroken = 0
let coreExposed = false
let spikeHp: number[] = [SPIKE_MAX_HP, SPIKE_MAX_HP]
let spikeFlashT: number[] = [0, 0]
// Charged heavy attack: hold the golem, release to strike.
let chargeStartAt = -1
let heavyReadyAt = -HEAVY_COOLDOWN_S
// Dodge: dash + brief invulnerability, on a cooldown.
let dodgeUntil = -1
let lastDodgeAt = -DODGE_COOLDOWN_S
// Shardlings: periodic minion spawns (the phase-3 shards attack bursts reuse them).
let shardlingTimer = SHARDLING_FIRST_SPAWN_S
let shardlingBannerShown = false
// Breakable shoulder spikes (Spike2 left, Spike3 right). Spike1 (center)
// hides behind the head, so it stays visual-only.
let breakableSpikes: Entity[] = []

const SLAM_RADIUS = 2.5
const SLAM_TELEGRAPH_S = 0.9
const PROJECTILE_SPEED = 8
const PROJECTILE_LIFE_S = 3
const SHARD_SPEED = 1.2
const BOSS_ROOT_POS = { x: 16, y: 0, z: 25 }

type Projectile = { entity: Entity; dirX: number; dirZ: number; life: number }
type Shard = { entity: Entity; touchCooldown: number }
type Telegraph = { t: number; x: number; z: number; disc: Entity } | null

const projectiles: Projectile[] = []
const shards: Shard[] = []
let telegraph: Telegraph = null

// Composite entities (fetched in setupGame). NO_ENTITY marks a missing one.
const NO_ENTITY = 0 as Entity
let bossRoot: Entity = NO_ENTITY
let bossTorso: Entity = NO_ENTITY
let bossChestCore: Entity = NO_ENTITY
let bossHead: Entity = NO_ENTITY
let bossArmPivotL: Entity = NO_ENTITY
let bossArmPivotR: Entity = NO_ENTITY
let bossHitbox: Entity = NO_ENTITY
let bossSpike1: Entity = NO_ENTITY
let bossSpike2: Entity = NO_ENTITY
let bossSpike3: Entity = NO_ENTITY
let flames: Entity[] = []

// ------------------------------------------------------------------ helpers
function playerXZ(): { x: number; z: number } | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return null
  return { x: t.position.x, z: t.position.z }
}

function showBanner(text: string, seconds = 2.5) {
  hudState.banner = text
  bannerUntil = clock + seconds
}

function syncHud() {
  hudState.phase = state
  hudState.bossHp = bossHp
  hudState.playerHp = playerHp
  hudState.timeS = timeS
  hudState.shardsSmashed = shardsSmashed
  hudState.spikesBroken = spikesBroken
  hudState.charge = chargeStartAt >= 0 ? chargeFraction(timeS - chargeStartAt) : 0
  hudState.heavyReady = timeS >= heavyReadyAt
  hudState.dodgeCooldown = Math.max(0, lastDodgeAt + DODGE_COOLDOWN_S - timeS)
  hudState.dodging = dodgeActive(dodgeUntil, timeS)
  hudState.score =
    state === 'victory' ? scoreFor(timeS, shardsSmashed, spikesBroken) : hudState.score
}

function damagePlayer(amount: number) {
  if (state !== 'fight') return
  if (dodgeActive(dodgeUntil, timeS)) return // dodging: the hit whiffs
  playerHp = clampHp(playerHp - amount, PLAYER_MAX_HP)
  if (playerHp <= 0) {
    chargeStartAt = -1
    state = 'defeat'
    playSfx('defeat')
    showBanner('The Golem endures... The mountain keeps its secret — for now.', 4)
    syncHud()
  }
  syncHud()
}

function damageBoss(amount: number) {
  if (state !== 'fight') return
  const prevPhase = phaseForHp(bossHp)
  bossHp = clampHp(bossHp - amount, BOSS_MAX_HP)
  hitFlashT = 0.15
  const nextPhase = phaseForHp(bossHp)
  if (nextPhase !== prevPhase) {
    playSfx('phase')
    if (nextPhase === 2) showBanner("Phase 2! 'My heart is safe!' — Volley incoming!")
    if (nextPhase === 3) {
      showBanner("FINAL PHASE! 'My spikes guard my heart!'")
      enrageBoss()
    }
  }
  if (bossHp <= 0) {
    state = 'dying'
    dyingT = 0
    showBanner('The Golem falls!', 3)
  }
  syncHud()
}

/** Phase 3: core + spikes turn magenta (the exposed core keeps its gold). */
function enrageBoss() {
  const magenta = Color4.fromHexString('#e879f9')
  const glow = Color4.fromHexString('#d946ef')
  const targets = coreExposed
    ? [bossSpike1, bossSpike2, bossSpike3]
    : [bossChestCore, bossSpike1, bossSpike2, bossSpike3]
  for (const e of targets) {
    if (!e) continue
    Material.setPbrMaterial(e, {
      albedoColor: magenta,
      emissiveColor: glow,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      metallic: 0.1
    })
  }
}

/** Click a shoulder spike: it cracks, deals a little body damage, and after
 *  enough hits it shatters. Shatter every breakable spike to expose the core. */
function damageSpike(index: number) {
  if (state !== 'fight') return
  if (spikeHp[index] <= 0) return
  if (timeS - lastPlayerAttackAt < PLAYER_ATTACK_COOLDOWN_S) return
  lastPlayerAttackAt = timeS
  spikeHp[index] = Math.max(0, spikeHp[index] - PLAYER_ATTACK_DAMAGE)
  spikeFlashT[index] = 0.15
  playSfx('spikeHit')
  damageBoss(SPIKE_CLICK_BOSS_DAMAGE)
  if (state !== 'fight') {
    syncHud()
    return
  }
  if (spikeHp[index] <= 0) {
    spikesBroken++
    playSfx('spikeShatter')
    const e = breakableSpikes[index]
    if (e) VisibilityComponent.createOrReplace(e, { visible: false })
    if (allSpikesBroken(spikesBroken)) {
      exposeCore()
    } else {
      showBanner(`A crystal spike shatters! (${spikesBroken}/${SPIKE_COUNT})`)
    }
  }
  syncHud()
}

/** All breakable spikes shattered: the core stays exposed, body hits deal 2x. */
function exposeCore() {
  coreExposed = true
  if (bossChestCore) {
    Material.setPbrMaterial(bossChestCore, {
      albedoColor: Color4.fromHexString('#fbbf24'),
      emissiveColor: Color4.fromHexString('#f59e0b'),
      emissiveIntensity: 3.5,
      roughness: 0.2,
      metallic: 0.1
    })
  }
  showBanner('The core is exposed! Strike now!', 4)
  playSfx('phase')
}

function clearRuntimeEntities() {
  for (const p of projectiles) engine.removeEntity(p.entity)
  projectiles.length = 0
  for (const s of shards) engine.removeEntity(s.entity)
  shards.length = 0
  if (telegraph) {
    engine.removeEntity(telegraph.disc)
    telegraph = null
  }
}

// ------------------------------------------------------------------ actions
export function startFight() {
  if (state !== 'intro') return
  state = 'fight'
  timeS = 0
  attackTimer = 1.5 // first attack 1.5 s after START
  attackIndex = 0
  lastPlayerAttackAt = -1
  shardlingTimer = SHARDLING_FIRST_SPAWN_S
  playSfx('start')
  showBanner('The Crystal Golem awakens!')
  syncHud()
}

export function resetFight() {
  clearRuntimeEntities()
  bossHp = BOSS_MAX_HP
  playerHp = PLAYER_MAX_HP
  timeS = 0
  attackTimer = 1.5
  attackIndex = 0
  lastPlayerAttackAt = -1
  chargeStartAt = -1
  heavyReadyAt = -HEAVY_COOLDOWN_S
  dodgeUntil = -1
  lastDodgeAt = -DODGE_COOLDOWN_S
  shardlingTimer = SHARDLING_FIRST_SPAWN_S
  shardlingBannerShown = false
  dyingT = 0
  shardsSmashed = 0
  spikesBroken = 0
  coreExposed = false
  spikeHp = [SPIKE_MAX_HP, SPIKE_MAX_HP]
  spikeFlashT = [0, 0]
  hitFlashT = 0
  // Restore the boss: visible, upright, facing the spawn (-Z).
  if (bossRoot) {
    VisibilityComponent.createOrReplace(bossRoot, { visible: true })
    const t = Transform.getMutable(bossRoot)
    t.position = { x: BOSS_ROOT_POS.x, y: BOSS_ROOT_POS.y, z: BOSS_ROOT_POS.z }
    t.rotation = Quaternion.fromAngleAxis(0, Vector3.Up())
  }
  bossYaw = 0
  // Restore phase-1 colors.
  const cyan = Color4.fromHexString('#22d3ee')
  for (const e of [bossChestCore, bossSpike1, bossSpike2, bossSpike3]) {
    if (!e) continue
    Material.setPbrMaterial(e, {
      albedoColor: cyan,
      emissiveColor: cyan,
      emissiveIntensity: e === bossChestCore ? 2.5 : 1.5,
      roughness: 0.2,
      metallic: 0.1
    })
  }
  // Un-hide any shattered spikes.
  for (const e of breakableSpikes) {
    if (!e) continue
    VisibilityComponent.createOrReplace(e, { visible: true })
  }
  state = 'fight'
  playSfx('start')
  showBanner('Round two — the Golem awakens!')
  syncHud()
}

/** Spawn one shardling minion at (x, z): chases the player, smashable to heal.
 *  Shared by the phase-3 shards attack and the periodic spawner. */
function spawnShardling(x: number, z: number) {
  const e = engine.addEntity()
  Transform.create(e, { position: { x, y: 0.45, z }, scale: { x: 1, y: 0.9, z: 1 } })
  MeshRenderer.setCylinder(e, 0.02, 0.35)
  Material.setPbrMaterial(e, {
    albedoColor: Color4.fromHexString('#e879f9'),
    emissiveColor: Color4.fromHexString('#d946ef'),
    emissiveIntensity: 2,
    roughness: 0.2,
    metallic: 0.1
  })
  MeshCollider.setBox(e, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: e, opts: { button: InputAction.IA_POINTER, hoverText: 'Smash!', maxDistance: 12 } },
    () => smashShard(e)
  )
  shards.push({ entity: e, touchCooldown: 0 })
}

/** Dodge: dash 3 m away from the golem + 0.6 s of invulnerability.
 *  Works from the HUD button and the F key. The slide uses movePlayerTo
 *  (no scene permission needed); even if the slide fails, the i-frames
 *  still apply, so the dodge never silently does nothing. */
export function tryDodge() {
  if (state !== 'fight') return
  if (!dodgeReady(lastDodgeAt, timeS)) return
  const p = playerXZ()
  if (!p) return
  lastDodgeAt = timeS
  dodgeUntil = timeS + DODGE_IFRAMES_S
  playSfx('dodge')
  const target = dashTarget(p.x, p.z, p.x - BOSS_ROOT_POS.x, p.z - BOSS_ROOT_POS.z, DODGE_DISTANCE)
  void movePlayerTo({ newRelativePosition: Vector3.create(target.x, 0, target.z), duration: 0.15 })
  syncHud()
}

// ------------------------------------------------------------------ attacks
function fireAttack() {
  const phase = phaseForHp(bossHp)
  const kind = attackForPhase(phase, attackIndex)
  attackIndex++
  attackTimer = attackCooldownForPhase(phase)
  const p = playerXZ()
  if (!p) return

  if (kind === 'slam') {
    // Telegraph: red disc at the player's current spot, arms raise.
    const disc = engine.addEntity()
    Transform.create(disc, { position: { x: p.x, y: 0.25, z: p.z }, scale: { x: 1, y: 1, z: 1 } })
    MeshRenderer.setCylinder(disc, SLAM_RADIUS, SLAM_RADIUS)
    Material.setPbrMaterial(disc, {
      albedoColor: Color4.create(1, 0.1, 0.1, 0.45),
      emissiveColor: Color4.create(1, 0, 0, 1),
      emissiveIntensity: 1,
      roughness: 1,
      metallic: 0,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
    })
    telegraph = { t: 0, x: p.x, z: p.z, disc }
  } else if (kind === 'volley') {
    playSfx('volley')
    const count = volleyCountForPhase(phase)
    const root = bossRoot !== NO_ENTITY ? Transform.getOrNull(bossRoot) : null
    const ox = root ? root.position.x : BOSS_ROOT_POS.x
    const oz = root ? root.position.z : BOSS_ROOT_POS.z
    for (let i = 0; i < count; i++) {
      // Spread the volley around the player's position.
      const spread = (i - (count - 1) / 2) * 0.9
      const tx = p.x + spread
      const tz = p.z + spread * 0.5
      const len = Math.max(0.01, Math.hypot(tx - ox, tz - oz))
      const e = engine.addEntity()
      Transform.create(e, { position: { x: ox, y: 1.5, z: oz }, scale: { x: 1, y: 1, z: 1 } })
      MeshRenderer.setSphere(e)
      Material.setPbrMaterial(e, {
        albedoColor: Color4.fromHexString('#22d3ee'),
        emissiveColor: Color4.fromHexString('#06b6d4'),
        emissiveIntensity: 2,
        roughness: 0.2,
        metallic: 0.1
      })
      projectiles.push({ entity: e, dirX: (tx - ox) / len, dirZ: (tz - oz) / len, life: PROJECTILE_LIFE_S })
    }
  } else {
    // shards: 3 shardlings at the arena edge, chasing the player.
    playSfx('volley')
    for (let i = 0; i < SHARDS_PER_SUMMON; i++) {
      const angle = (i / SHARDS_PER_SUMMON) * Math.PI * 2 + Math.random() * 0.8
      spawnShardling(16 + 11 * Math.sin(angle), 16 + 11 * Math.cos(angle))
    }
  }
}

function smashShard(entity: Entity) {
  if (state !== 'fight') return
  const idx = shards.findIndex((s) => s.entity === entity)
  if (idx === -1) return
  shards.splice(idx, 1)
  engine.removeEntity(entity)
  shardsSmashed++
  playSfx('shardSmash')
  playerHp = clampHp(playerHp + SHARD_HEAL, PLAYER_MAX_HP)
  syncHud()
}

function detonateSlam() {
  if (!telegraph) return
  playSfx('slam')
  const p = playerXZ()
  if (p && insideSlamDisc(p.x, p.z, telegraph.x, telegraph.z, SLAM_RADIUS)) {
    damagePlayer(20)
  }
  engine.removeEntity(telegraph.disc)
  telegraph = null
}

// ------------------------------------------------------------------ systems
function bossAnimSystem(dt: number) {
  clock += dt
  if (hudState.banner && clock > bannerUntil) hudState.banner = null
  if (hitFlashT > 0) hitFlashT = Math.max(0, hitFlashT - dt)

  // Torch flames flicker.
  for (let i = 0; i < flames.length; i++) {
    const f = flames[i]
    if (!f) continue
    const t = Transform.getMutableOrNull(f)
    if (!t) continue
    const s = 0.7 + Math.sin(clock * 9 + i * 1.7) * 0.08
    t.scale = { x: s, y: s * 1.15, z: s }
  }

  // Breakable spikes glint (the hidden clue): bright cyan pulse, dimming as
  // they crack. A fresh hit flashes white. In phase 3 they keep the enrage
  // magenta instead of pulsing.
  const phaseNow = phaseForHp(bossHp)
  for (let i = 0; i < breakableSpikes.length; i++) {
    const e = breakableSpikes[i]
    if (!e || spikeHp[i] <= 0) continue
    if (spikeFlashT[i] > 0) {
      spikeFlashT[i] = Math.max(0, spikeFlashT[i] - dt)
      Material.setPbrMaterial(e, {
        albedoColor: Color4.White(),
        emissiveColor: Color4.White(),
        emissiveIntensity: 4,
        roughness: 0.2,
        metallic: 0.1
      })
      continue
    }
    if (phaseNow >= 3) {
      Material.setPbrMaterial(e, {
        albedoColor: Color4.fromHexString('#e879f9'),
        emissiveColor: Color4.fromHexString('#d946ef'),
        emissiveIntensity: 2.5,
        roughness: 0.2,
        metallic: 0.1
      })
      continue
    }
    const hpFrac = spikeHp[i] / SPIKE_MAX_HP
    const pulse = 1.5 + Math.sin(clock * 2.5 + i * 2.1) * 0.9
    const dim = 0.45 + 0.55 * hpFrac
    Material.setPbrMaterial(e, {
      albedoColor: Color4.fromHexString('#22d3ee'),
      emissiveColor: Color4.fromHexString('#22d3ee'),
      emissiveIntensity: pulse * dim,
      roughness: 0.2,
      metallic: 0.1
    })
  }

  if (!bossRoot) return

  // Face the player (smooth turn).
  const p = playerXZ()
  if (p && state !== 'dying') {
    const root = Transform.get(bossRoot)
    const target = Math.atan2(-(p.x - root.position.x), -(p.z - root.position.z))
    let diff = target - bossYaw
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    bossYaw += diff * Math.min(1, dt * 2)
  }

  const rootT = Transform.getMutable(bossRoot)
  if (state === 'dying') {
    // Sink + spin as it dies.
    rootT.position.y = BOSS_ROOT_POS.y - dyingT * 0.9
    rootT.rotation = Quaternion.fromAngleAxis(bossYaw + dyingT * 3, Vector3.Up())
    return
  }
  // Idle bob — big and visible from across the arena (playtest 2026-11-26:
  // the golem read as frozen with a 0.06 bob on a 4.5 m body).
  rootT.position.y = BOSS_ROOT_POS.y + Math.sin(clock * 1.5) * 0.18
  rootT.rotation = Quaternion.fromAngleAxis(bossYaw, Vector3.Up())

  // Arms: raise during the slam telegraph, else hang with a wide sway.
  const raise = telegraph ? Math.min(1, telegraph.t / 0.35) : 0
  const sway = Math.sin(clock * 1.5) * 0.15
  const armAngle = -2.09 * raise + sway
  if (bossArmPivotL) {
    Transform.getMutable(bossArmPivotL).rotation = Quaternion.fromAngleAxis(armAngle, Vector3.Left())
  }
  if (bossArmPivotR) {
    Transform.getMutable(bossArmPivotR).rotation = Quaternion.fromAngleAxis(armAngle, Vector3.Right())
  }

  // Chest core breathes continuously + pulses on hit.
  if (bossChestCore) {
    const s = 1 + Math.sin(clock * 1.5) * 0.12 + hitFlashT * 1.5
    Transform.getMutable(bossChestCore).scale = { x: 0.9 * s, y: 0.9 * s, z: 0.3 * s }
  }
  // Head tracks the bob, wider now so the golem reads as alive.
  if (bossHead) {
    Transform.getMutable(bossHead).rotation = Quaternion.fromAngleAxis(
      Math.sin(clock * 0.9) * 0.15,
      Vector3.Up()
    )
  }
}

function fightSystem(dt: number) {
  if (state === 'fight') {
    timeS += dt
    if (isTimeUp(timeS)) {
      // Hard 5-minute limit (jam rules): the fight ends, win or lose.
      state = 'defeat'
      chargeStartAt = -1
      playSfx('defeat')
      clearRuntimeEntities()
      showBanner("Time's up! The Golem endures.", 4)
      syncHud()
      return
    }
    // F key dodges (the HUD DODGE button calls tryDodge directly).
    if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
      tryDodge()
    }
    // Stale charge guard: if the pointer-up never arrives, drop the charge.
    if (chargeStartAt >= 0 && timeS - chargeStartAt > 3) chargeStartAt = -1
    // Periodic shardlings: a second enemy from early in the fight, so the
    // golem is never the only thing to fight.
    shardlingTimer -= dt
    if (shardlingTimer <= 0) {
      shardlingTimer = shardlingSpawnIntervalS(phaseForHp(bossHp))
      if (shards.length < SHARDLING_MAX_ALIVE) {
        const angle = Math.random() * Math.PI * 2
        spawnShardling(16 + 11 * Math.sin(angle), 16 + 11 * Math.cos(angle))
        if (!shardlingBannerShown) {
          shardlingBannerShown = true
          showBanner('Shardlings incoming — smash them to heal!')
        }
      }
    }
    if (telegraph) {
      telegraph.t += dt
      if (telegraph.t >= SLAM_TELEGRAPH_S) detonateSlam()
    } else {
      attackTimer -= dt
      if (attackTimer <= 0) fireAttack()
    }
  } else if (state === 'dying') {
    dyingT += dt
    if (dyingT >= 3) {
      if (bossRoot) VisibilityComponent.createOrReplace(bossRoot, { visible: false })
      state = 'victory'
      playSfx('victory')
      syncHud()
    }
  }
  syncHud()
}

function projectileSystem(dt: number) {
  if (state !== 'fight') return
  const p = playerXZ()
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i]
    pr.life -= dt
    const t = Transform.getMutableOrNull(pr.entity)
    if (!t || pr.life <= 0) {
      engine.removeEntity(pr.entity)
      projectiles.splice(i, 1)
      continue
    }
    t.position.x += pr.dirX * PROJECTILE_SPEED * dt
    t.position.z += pr.dirZ * PROJECTILE_SPEED * dt
    if (p && distanceXZ(t.position.x, t.position.z, p.x, p.z) < 1.2) {
      engine.removeEntity(pr.entity)
      projectiles.splice(i, 1)
      damagePlayer(10)
    }
  }
}

function shardSystem(dt: number) {
  if (state !== 'fight') return
  const p = playerXZ()
  if (!p) return
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i]
    const t = Transform.getMutableOrNull(s.entity)
    if (!t) {
      shards.splice(i, 1)
      continue
    }
    s.touchCooldown = Math.max(0, s.touchCooldown - dt)
    const dx = p.x - t.position.x
    const dz = p.z - t.position.z
    const len = Math.max(0.01, Math.hypot(dx, dz))
    t.position.x += (dx / len) * SHARD_SPEED * dt
    t.position.z += (dz / len) * SHARD_SPEED * dt
    // Spin while chasing.
    t.rotation = Quaternion.fromAngleAxis(clock * 3, Vector3.Up())
    if (len < 1.2 && s.touchCooldown <= 0) {
      s.touchCooldown = 1
      damagePlayer(10)
      engine.removeEntity(s.entity)
      shards.splice(i, 1)
    }
  }
}

// -------------------------------------------------------------------- setup
function fetchEntity(name: EntityNames): Entity {
  const e = engine.getEntityOrNullByName(name)
  if (!e) {
    console.error(`[game] entity missing from main.composite: ${name}`)
    return NO_ENTITY
  }
  return e
}

export function setupGame() {
  initAudio()
  bossRoot = fetchEntity(EntityNames.BossRoot)
  bossTorso = fetchEntity(EntityNames.BossTorso)
  bossChestCore = fetchEntity(EntityNames.BossChestCore)
  bossHead = fetchEntity(EntityNames.BossHead)
  bossArmPivotL = fetchEntity(EntityNames.BossArmPivotL)
  bossArmPivotR = fetchEntity(EntityNames.BossArmPivotR)
  bossHitbox = fetchEntity(EntityNames.BossHitbox)
  bossSpike1 = fetchEntity(EntityNames.BossSpike1)
  bossSpike2 = fetchEntity(EntityNames.BossSpike2)
  bossSpike3 = fetchEntity(EntityNames.BossSpike3)
  flames = [
    fetchEntity(EntityNames.TorchFlame1),
    fetchEntity(EntityNames.TorchFlame2),
    fetchEntity(EntityNames.TorchFlame3),
    fetchEntity(EntityNames.TorchFlame4)
  ].filter((e) => e !== NO_ENTITY)

  // Click / tap the golem to attack; hold to charge a heavy blow.
  // Registered once, guarded by state. Damage lands on release, so a quick
  // click still hits exactly like before and a full hold strikes heavy.
  if (bossHitbox) {
    const hitboxOpts = {
      entity: bossHitbox,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Attack! Hold to charge...', maxDistance: 24 }
    }
    pointerEventsSystem.onPointerDown(hitboxOpts, () => {
      if (state !== 'fight') return
      if (chargeStartAt >= 0) return // already charging
      chargeStartAt = timeS
    })
    pointerEventsSystem.onPointerUp(hitboxOpts, () => {
      if (state !== 'fight') {
        chargeStartAt = -1
        return
      }
      if (chargeStartAt < 0) return
      const held = timeS - chargeStartAt
      chargeStartAt = -1
      if (isChargeFull(held) && timeS >= heavyReadyAt) {
        heavyReadyAt = timeS + HEAVY_COOLDOWN_S
        playSfx('heavy')
        damageBoss(heavyHitDamage(coreExposed))
      } else if (timeS - lastPlayerAttackAt >= PLAYER_ATTACK_COOLDOWN_S) {
        lastPlayerAttackAt = timeS
        playSfx('hit')
        damageBoss(bodyHitDamage(coreExposed))
      }
      syncHud()
    })
  }

  // Breakable shoulder spikes (the hidden weakness): the center spike hides
  // behind the head, so only the two shoulder spikes are clickable. Their
  // hover text stays a mystery on purpose — the glint is the only clue.
  breakableSpikes = [bossSpike2, bossSpike3].filter((e) => e !== NO_ENTITY)
  breakableSpikes.forEach((e, i) => {
    MeshCollider.setBox(e, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      {
        entity: e,
        opts: { button: InputAction.IA_POINTER, hoverText: '???', maxDistance: 24 }
      },
      () => damageSpike(i)
    )
  })

  engine.addSystem(bossAnimSystem)
  engine.addSystem(fightSystem)
  engine.addSystem(projectileSystem)
  engine.addSystem(shardSystem)
  syncHud()
}
