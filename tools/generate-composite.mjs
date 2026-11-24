#!/usr/bin/env node
/**
 * Generates the static arena + Crystal Golem entities into
 * assets/scene/main.composite (edit mode: the template's inspector::*
 * components are preserved and inspector::Nodes is kept in sync).
 *
 * Run from the project root:  node tools/generate-composite.mjs
 * Idempotent: re-running replaces only the entities this script owns
 * (ids >= 513) and rewrites their Nodes entries.
 *
 * Scene: 2x2 parcels (32x32 m). Arena center (16, 16). Boss at (16, 25)
 * facing the player spawn at (16, 5).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const COMPOSITE_PATH = new URL('../assets/scene/main.composite', import.meta.url)
const START_ID = 513

// ---------------------------------------------------------------- materials
const MATERIALS = {
  floor: { albedoColor: { r: 0.42, g: 0.45, b: 0.5, a: 1 }, metallic: 0, roughness: 1 },
  stone: { albedoColor: { r: 0.29, g: 0.33, b: 0.39, a: 1 }, metallic: 0.1, roughness: 0.9 },
  crystal: {
    albedoColor: { r: 0.13, g: 0.83, b: 0.93, a: 1 },
    emissiveColor: { r: 0.02, g: 0.71, b: 0.83, a: 1 },
    emissiveIntensity: 1.5,
    metallic: 0.2,
    roughness: 0.25
  },
  flame: {
    albedoColor: { r: 0.97, g: 0.45, b: 0.09, a: 1 },
    emissiveColor: { r: 0.92, g: 0.35, b: 0.05, a: 1 },
    emissiveIntensity: 2.5,
    metallic: 0,
    roughness: 0.4
  },
  bossBody: { albedoColor: { r: 0.12, g: 0.16, b: 0.22, a: 1 }, metallic: 0.4, roughness: 0.7 },
  bossCore: {
    albedoColor: { r: 0.13, g: 0.83, b: 0.93, a: 1 },
    emissiveColor: { r: 0.13, g: 0.83, b: 0.93, a: 1 },
    emissiveIntensity: 2.5,
    metallic: 0.1,
    roughness: 0.2
  },
  eye: {
    albedoColor: { r: 0.94, g: 0.27, b: 0.27, a: 1 },
    emissiveColor: { r: 0.94, g: 0.27, b: 0.27, a: 1 },
    emissiveIntensity: 3,
    metallic: 0,
    roughness: 0.3
  }
}

// ------------------------------------------------------------------ helpers
const quatY = (deg) => {
  const t = (deg * Math.PI) / 360
  return { x: 0, y: Math.sin(t), z: 0, w: Math.cos(t) }
}
const quatZ = (deg) => {
  const t = (deg * Math.PI) / 360
  return { x: 0, y: 0, z: Math.sin(t), w: Math.cos(t) }
}
const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 }

/**
 * Entity spec:
 *  name, pos [x,y,z], scale [x,y,z], rot (quaternion, default identity),
 *  parent (entity id, default 0),
 *  mesh: { box: {} } | { sphere: {} } | { cylinder: {radiusTop, radiusBottom} } | { plane: {uvs: []} }
 *  mat: key of MATERIALS (needs mesh)
 *  collider: null | 1 (pointer) | 2 (physics) | 3 (both)
 *  text: { text, fontSize, color: {r,g,b,a} } (TextShape, no mesh)
 *  billboard: true (Billboard mode 7)
 */
const ENTITIES = []

function add(spec) {
  ENTITIES.push(spec)
}

// -------------------------------------------------------------------- arena
add({
  name: 'ArenaFloor',
  pos: [16, 0.1, 16],
  scale: [1, 0.2, 1],
  mesh: { cylinder: { radiusTop: 13.5, radiusBottom: 13.5 } },
  mat: 'floor',
  collider: 2
})

// Wall ring: 12 boxes on a circle of radius 13.5, tangent to the circle.
for (let i = 0; i < 12; i++) {
  const deg = i * 30
  const rad = (deg * Math.PI) / 180
  add({
    name: `Wall${String(i + 1).padStart(2, '0')}`,
    pos: [16 + 13.5 * Math.sin(rad), 1.5, 16 + 13.5 * Math.cos(rad)],
    scale: [4.6, 3, 0.5],
    rot: quatY(deg),
    mesh: { box: { uvs: [] } },
    mat: 'stone',
    collider: 2
  })
}

// Pillars.
for (const [i, [x, z]] of [[7, 7], [25, 7], [7, 25], [25, 25]].entries()) {
  add({
    name: `Pillar${i + 1}`,
    pos: [x, 2.5, z],
    scale: [1, 5, 1],
    mesh: { cylinder: { radiusTop: 0.7, radiusBottom: 0.7 } },
    mat: 'stone',
    collider: 2
  })
}

// Torches: pole + flame (flames are pulsed by code).
for (const [i, [x, z]] of [[10.5, 10.5], [21.5, 10.5], [10.5, 21.5], [21.5, 21.5]].entries()) {
  add({
    name: `TorchPole${i + 1}`,
    pos: [x, 1.1, z],
    scale: [1, 2.2, 1],
    mesh: { cylinder: { radiusTop: 0.12, radiusBottom: 0.12 } },
    mat: 'stone'
  })
  add({
    name: `TorchFlame${i + 1}`,
    pos: [x, 2.5, z],
    scale: [0.7, 0.7, 0.7],
    mesh: { sphere: {} },
    mat: 'flame'
  })
}

// Decorative crystals around the inner edge.
const CRYSTAL_H = [0.9, 1.3, 1.6, 1.1, 1.4, 1.0, 1.5, 1.2]
for (let k = 0; k < 8; k++) {
  const deg = 22.5 + k * 45
  const rad = (deg * Math.PI) / 180
  const h = CRYSTAL_H[k]
  add({
    name: `Crystal${k + 1}`,
    pos: [16 + 11 * Math.sin(rad), h / 2, 16 + 11 * Math.cos(rad)],
    scale: [1, h, 1],
    mesh: { cylinder: { radiusTop: 0.05, radiusBottom: 0.4 } },
    mat: 'crystal'
  })
}

// Intro signs at the spawn (billboarded so they always face the player).
add({
  name: 'SignTitle',
  pos: [16, 2.4, 5.5],
  scale: [1, 1, 1],
  text: { text: 'DEFEAT THE CRYSTAL GOLEM', fontSize: 2, color: { r: 1, g: 1, b: 1, a: 1 } },
  billboard: true
})
add({
  name: 'SignHint',
  pos: [16, 1.7, 5.5],
  scale: [1, 1, 1],
  text: {
    text: 'Click the golem to attack. Dodge the red circles.',
    fontSize: 1.1,
    color: { r: 0.8, g: 0.8, b: 0.8, a: 1 }
  },
  billboard: true
})

// --------------------------------------------------------------------- boss
// BossRoot is id START_ID; parts are parented to it (positions relative).
const BOSS_ROOT_POS = [16, 0, 25]
const bossParts = [
  { name: 'BossTorso', pos: [0, 2.2, 0], scale: [2.6, 2.6, 1.6], mesh: { box: { uvs: [] } }, mat: 'bossBody' },
  {
    name: 'BossChestCore',
    pos: [0, 2.4, -0.85],
    scale: [0.9, 0.9, 0.3],
    rot: quatZ(45),
    mesh: { box: { uvs: [] } },
    mat: 'bossCore'
  },
  { name: 'BossHead', pos: [0, 4.1, 0], scale: [1.3, 1.1, 1.2], mesh: { box: { uvs: [] } }, mat: 'bossBody' },
  { name: 'BossEyeL', pos: [-0.35, 4.2, -0.62], scale: [0.25, 0.15, 0.1], mesh: { box: { uvs: [] } }, mat: 'eye' },
  { name: 'BossEyeR', pos: [0.35, 4.2, -0.62], scale: [0.25, 0.15, 0.1], mesh: { box: { uvs: [] } }, mat: 'eye' },
  // Arms hang from shoulder pivots so the pivot rotation raises them.
  { name: 'BossArmPivotL', pos: [-1.5, 3.3, 0], scale: [1, 1, 1] },
  { name: 'BossArmPivotR', pos: [1.5, 3.3, 0], scale: [1, 1, 1] },
  { name: 'BossLegL', pos: [-0.7, 0.6, 0], scale: [1, 1.2, 1], mesh: { cylinder: { radiusTop: 0.45, radiusBottom: 0.45 } }, mat: 'bossBody' },
  { name: 'BossLegR', pos: [0.7, 0.6, 0], scale: [1, 1.2, 1], mesh: { cylinder: { radiusTop: 0.45, radiusBottom: 0.45 } }, mat: 'bossBody' },
  { name: 'BossSpike1', pos: [0, 3.9, 0.5], scale: [1, 1.2, 1], mesh: { cylinder: { radiusTop: 0.05, radiusBottom: 0.4 } }, mat: 'crystal' },
  { name: 'BossSpike2', pos: [-0.9, 3.5, 0.4], scale: [0.6, 0.9, 0.6], mesh: { cylinder: { radiusTop: 0.05, radiusBottom: 0.35 } }, mat: 'crystal' },
  { name: 'BossSpike3', pos: [0.9, 3.5, 0.4], scale: [0.6, 0.9, 0.6], mesh: { cylinder: { radiusTop: 0.05, radiusBottom: 0.35 } }, mat: 'crystal' },
  // Invisible click target: pointer-only collider, no renderer.
  { name: 'BossHitbox', pos: [0, 2.2, 0], scale: [3.6, 5.2, 2.6], mesh: { box: {} }, collider: 1, hitbox: true }
]

// ------------------------------------------------------------------- build
function main() {
  const composite = JSON.parse(readFileSync(COMPOSITE_PATH, 'utf8'))
  const byName = new Map(composite.components.map((c) => [c.name, c]))

  // Drop the template's stale demo component (entity 512, no Transform).
  composite.components = composite.components.filter((c) => c.name !== 'cube-id')

  // Assign ids: arena entities first, then BossRoot, then boss parts, then arms.
  const allSpecs = [...ENTITIES]
  const bossRootId = START_ID + ENTITIES.length
  allSpecs.push({ name: 'BossRoot', pos: BOSS_ROOT_POS, scale: [1, 1, 1] })
  const partBase = bossRootId + 1
  // Arm meshes are children of their pivots.
  const armLId = partBase + bossParts.length
  const armRId = armLId + 1
  const idOf = new Map()
  allSpecs.forEach((s, i) => idOf.set(s.name, START_ID + i))
  bossParts.forEach((s, i) => idOf.set(s.name, partBase + i))
  idOf.set('BossArmL', armLId)
  idOf.set('BossArmR', armRId)

  const parentOf = new Map()
  bossParts.forEach((s) => parentOf.set(s.name, bossRootId))
  parentOf.set('BossArmL', idOf.get('BossArmPivotL'))
  parentOf.set('BossArmR', idOf.get('BossArmPivotR'))

  const fullSpecs = [
    ...allSpecs,
    ...bossParts,
    { name: 'BossArmL', pos: [0, -1, 0], scale: [0.8, 2.4, 0.8], mesh: { box: { uvs: [] } }, mat: 'bossBody' },
    { name: 'BossArmR', pos: [0, -1, 0], scale: [0.8, 2.4, 0.8], mesh: { box: { uvs: [] } }, mat: 'bossBody' }
  ]

  // Remove any previous run's entities (ids >= START_ID) from every component.
  for (const comp of composite.components) {
    if (!comp.data) continue
    for (const key of Object.keys(comp.data)) {
      if (Number(key) >= START_ID) delete comp.data[key]
    }
  }

  const ensure = (name) => {
    if (!byName.has(name)) {
      const comp = { name, data: {} }
      // Non-core components need a jsonSchema; core::* and core-schema::Name
      // are handled below. Name gets its schema copied from the template.
      composite.components.push(comp)
      byName.set(name, comp)
    }
    return byName.get(name)
  }

  // core-schema::Name needs a jsonSchema (copy it from the existing file if
  // present, else use the standard shape).
  const nameComp = ensure('core-schema::Name')
  if (!nameComp.jsonSchema) {
    nameComp.jsonSchema = {
      type: 'object',
      properties: { value: { type: 'string', serializationType: 'utf8-string' } },
      serializationType: 'map'
    }
  }

  const put = (compName, id, json) => {
    const comp = ensure(compName)
    comp.data[String(id)] = { json }
  }

  const childrenOfRoot = []
  const childrenOfBossRoot = []
  for (const spec of fullSpecs) {
    const id = idOf.get(spec.name)
    const parent = parentOf.get(spec.name) ?? 0
    put('core::Transform', id, {
      position: { x: spec.pos[0], y: spec.pos[1], z: spec.pos[2] },
      scale: { x: spec.scale[0], y: spec.scale[1], z: spec.scale[2] },
      rotation: spec.rot ?? IDENTITY_ROT,
      parent
    })
    put('core-schema::Name', id, { value: spec.name })
    if (spec.mesh && !spec.hitbox) {
      const [kind, opts] = Object.entries(spec.mesh)[0]
      put('core::MeshRenderer', id, { mesh: { $case: kind, [kind]: opts } })
      const mat = MATERIALS[spec.mat]
      put('core::Material', id, { material: { $case: 'pbr', pbr: mat } })
    }
    if (spec.collider) {
      const [kind, opts] = spec.hitbox
        ? ['box', {}]
        : Object.entries(spec.mesh)[0]
      put('core::MeshCollider', id, {
        collisionMask: spec.collider,
        mesh: { $case: kind, [kind]: opts }
      })
    }
    if (spec.text) {
      put('core::TextShape', id, {
        text: spec.text.text,
        fontSize: spec.text.fontSize,
        textColor: spec.text.color
      })
    }
    if (spec.billboard) {
      put('core::Billboard', id, { billboardMode: 7 })
    }
    if (parent === 0) childrenOfRoot.push(id)
    else if (parent === bossRootId) childrenOfBossRoot.push(id)
  }
  // Arm meshes are children of their pivots.
  const bossRootEntryChildren = [...childrenOfBossRoot]
  // (arm meshes live under pivots, handled in Nodes below via parent map)

  // ---- inspector::Nodes: register every new entity.
  const nodes = byName.get('inspector::Nodes')
  if (!nodes) throw new Error('inspector::Nodes missing — unexpected template shape')
  const value = nodes.data['0'].json.value
  // Remove previous run's entries.
  const kept = value.filter((e) => e.entity < START_ID)
  const rootEntry = kept.find((e) => e.entity === 0)
  rootEntry.children = [...(rootEntry.children ?? []), ...childrenOfRoot]
  for (const entry of kept) {
    if (entry.entity === bossRootId) entry.children = bossRootEntryChildren
  }
  const newEntries = fullSpecs.map((spec) => {
    const id = idOf.get(spec.name)
    let children = []
    if (id === bossRootId) children = bossRootEntryChildren
    if (id === idOf.get('BossArmPivotL')) children = [armLId]
    if (id === idOf.get('BossArmPivotR')) children = [armRId]
    return { entity: id, children }
  })
  nodes.data['0'].json.value = [...kept, ...newEntries]

  // ---- inspector::SceneMetadata: match the new scene.json (2x2, spawn).
  const meta = byName.get('inspector::SceneMetadata')
  if (meta) {
    const m = meta.data['0'].json
    m.name = 'Crystal Golem — Final Boss'
    m.description = 'A 5-minute final boss fight: defeat the Crystal Golem in its arena.'
    m.categories = ['game']
    m.layout = {
      base: { x: 0, y: 0 },
      parcels: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 }
      ]
    }
    m.spawnPoints = [
      {
        name: 'spawn1',
        default: true,
        position: {
          x: { $case: 'range', value: [15, 17] },
          y: { $case: 'range', value: [0, 0] },
          z: { $case: 'range', value: [4, 6] }
        },
        cameraTarget: { x: 16, y: 2, z: 25 }
      }
    ]
  }

  writeFileSync(COMPOSITE_PATH, JSON.stringify(composite, null, 2) + '\n')

  // ---- validation
  const ids = fullSpecs.map((s) => idOf.get(s.name))
  if (new Set(ids).size !== ids.length) throw new Error('duplicate entity ids')
  for (const spec of fullSpecs) {
    if (spec.pos.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
      throw new Error(`bad position for ${spec.name}`)
    }
  }
  console.log(`Wrote ${fullSpecs.length} entities (ids ${START_ID}–${Math.max(...ids)}) to main.composite`)
  console.log('Names:', fullSpecs.map((s) => s.name).join(', '))
}

main()
