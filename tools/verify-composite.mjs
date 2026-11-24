#!/usr/bin/env node
/** Validates assets/scene/main.composite: every entity has a Transform +
 * Name, all are registered in inspector::Nodes, positions in 0-32 bounds. */
import { readFileSync } from 'node:fs'

const c = JSON.parse(readFileSync(new URL('../assets/scene/main.composite', import.meta.url), 'utf8'))
const comps = Object.fromEntries(c.components.map((x) => [x.name, x.data]))
const t = comps['core::Transform']
const n = comps['core-schema::Name']
const ids = Object.keys(t)
console.log('entities with Transform:', ids.length)
const missingName = ids.filter((id) => !n[id])
console.log('missing Name:', missingName.length ? missingName : 'none')
const nodes = comps['inspector::Nodes']['0'].json.value
const registered = new Set(nodes.map((e) => e.entity))
const unregistered = ids.filter((id) => !registered.has(Number(id)))
console.log('unregistered in Nodes:', unregistered.length ? unregistered : 'none')
console.log('root children:', nodes.find((e) => e.entity === 0).children.length, '| nodes entries:', nodes.length)
const inBounds = ids.every((id) => {
  // World position: walk up the parent chain (BossRoot at (16,0,25),
  // arm meshes under pivots under BossRoot).
  let x = t[id].json.position.x
  let z = t[id].json.position.z
  let parent = t[id].json.parent
  const seen = new Set()
  while (parent && parent !== 0 && !seen.has(parent)) {
    seen.add(parent)
    const pt = t[String(parent)]
    if (!pt) break
    x += pt.json.position.x
    z += pt.json.position.z
    parent = pt.json.parent
  }
  return x >= 0 && x <= 32 && z >= 0 && z <= 32
})
console.log('all world positions in 0-32 bounds:', inBounds)
const idByName = Object.fromEntries(ids.map((id) => [n[id].json.value, Number(id)]))
const bossRootNode = nodes.find((e) => e.entity === idByName['BossRoot'])
console.log('BossRoot children:', bossRootNode ? bossRootNode.children.length : 'NOT FOUND', '(expect 13)')
const pivotL = nodes.find((e) => e.entity === idByName['BossArmPivotL'])
console.log('BossArmPivotL children:', pivotL ? pivotL.children : 'NOT FOUND', '(expect 1)')
const pivotR = nodes.find((e) => e.entity === idByName['BossArmPivotR'])
console.log('BossArmPivotR children:', pivotR ? pivotR.children : 'NOT FOUND', '(expect 1)')

const fail =
  missingName.length ||
  unregistered.length ||
  !inBounds ||
  !bossRootNode ||
  bossRootNode.children.length !== 13 ||
  !pivotL ||
  pivotL.children.length !== 1 ||
  !pivotR ||
  pivotR.children.length !== 1
if (fail) process.exit(1)
console.log('composite check: OK')
