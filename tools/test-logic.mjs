#!/usr/bin/env node
/** Unit tests for src/logic.ts (pure logic, no SDK imports). */
import { execSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = '/tmp/game-over-logic-test'
execSync(
  `npx tsc src/logic.ts --outDir ${outDir} --module commonjs --target es2020 --skipLibCheck`,
  { cwd: root, stdio: 'pipe' }
)
const L = createRequire(import.meta.url)(join(outDir, 'logic.js'))

assert.equal(L.phaseForHp(300), 1)
assert.equal(L.phaseForHp(201), 1)
assert.equal(L.phaseForHp(200), 2)
assert.equal(L.phaseForHp(101), 2)
assert.equal(L.phaseForHp(100), 3)
assert.equal(L.phaseForHp(0), 3)

assert.equal(L.attackCooldownForPhase(1), 2.8)
assert.equal(L.attackCooldownForPhase(2), 2.2)
assert.equal(L.attackCooldownForPhase(3), 1.7)

assert.equal(L.attackForPhase(1, 0), 'slam')
assert.equal(L.attackForPhase(1, 5), 'slam')
assert.equal(L.attackForPhase(2, 0), 'slam')
assert.equal(L.attackForPhase(2, 1), 'volley')
assert.equal(L.attackForPhase(2, 2), 'slam')
assert.equal(L.attackForPhase(3, 0), 'slam')
assert.equal(L.attackForPhase(3, 1), 'volley')
assert.equal(L.attackForPhase(3, 2), 'shards')
assert.equal(L.attackForPhase(3, 3), 'slam')

assert.equal(L.volleyCountForPhase(2), 5)
assert.equal(L.volleyCountForPhase(3), 7)

assert.equal(L.scoreFor(0, 0), 1000 + 300 * 10)
assert.equal(L.scoreFor(300, 0), 1000)
assert.equal(L.scoreFor(120, 3), 1000 + 180 * 10 + 300)
assert.equal(L.scoreFor(400, 0), 1000) // over the limit: no time bonus

assert.equal(L.bodyHitDamage(false), 10)
assert.equal(L.bodyHitDamage(true), 20)

assert.equal(L.allSpikesBroken(0), false)
assert.equal(L.allSpikesBroken(1), false)
assert.equal(L.allSpikesBroken(2), true)

assert.equal(L.scoreFor(0, 0, 0), 1000 + 300 * 10)
assert.equal(L.scoreFor(120, 3, 2), 1000 + 180 * 10 + 300 + 300)
assert.equal(L.scoreFor(300, 0, 2), 1000 + 300)

assert.equal(L.isTimeUp(299.9), false)
assert.equal(L.isTimeUp(300), true)
assert.equal(L.isTimeUp(301), true)

assert.equal(L.formatTime(0), '0:00')
assert.equal(L.formatTime(65), '1:05')
assert.equal(L.formatTime(300), '5:00')
assert.equal(L.formatTime(59.9), '0:59')

assert.equal(L.clampHp(-5, 100), 0)
assert.equal(L.clampHp(150, 100), 100)
assert.equal(L.clampHp(50, 100), 50)

// Charged heavy blow: 25 base, 50 with the core exposed.
assert.equal(L.heavyHitDamage(false), 25)
assert.equal(L.heavyHitDamage(true), 50)
assert.equal(L.chargeFraction(0), 0)
assert.equal(L.chargeFraction(0.4), 0.5)
assert.equal(L.chargeFraction(0.8), 1)
assert.equal(L.chargeFraction(2), 1)
assert.equal(L.isChargeFull(0.79), false)
assert.equal(L.isChargeFull(0.8), true)

// Dodge: 3 s cooldown, 0.6 s of invulnerability.
assert.equal(L.dodgeReady(-3, 0), true)
assert.equal(L.dodgeReady(0, 2.9), false)
assert.equal(L.dodgeReady(0, 3), true)
assert.equal(L.dodgeActive(0.6, 0.5), true)
assert.equal(L.dodgeActive(0.6, 0.6), false)
assert.deepEqual(L.dashTarget(16, 16, 1, 0, 3), { x: 19, z: 16 })
assert.deepEqual(L.dashTarget(29, 16, 1, 0, 3), { x: 30, z: 16 }) // clamped at the wall
assert.deepEqual(L.dashTarget(16, 16, 0, 0, 3), { x: 16, z: 19 }) // zero direction -> south

// Shardlings: spawn interval shortens as phases advance.
assert.equal(L.shardlingSpawnIntervalS(1), 12)
assert.equal(L.shardlingSpawnIntervalS(2), 9)
assert.equal(L.shardlingSpawnIntervalS(3), 7)

assert.equal(L.distanceXZ(0, 0, 3, 4), 5)
assert.equal(L.insideSlamDisc(16, 16, 16, 16, 2.5), true)
assert.equal(L.insideSlamDisc(19, 16, 16, 16, 2.5), false)

console.log('logic tests: all passed')
