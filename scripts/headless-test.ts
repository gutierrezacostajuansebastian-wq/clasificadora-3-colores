/**
 * Headless validation of the sorting line (no rendering): real Rapier world + the same colliders / engine
 * used by the React scene. Run with:  npm run test:sim   (SEED=n to change the random lane offsets)
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { Engine, type SimPiece } from '../src/sim/engine'
import {
  BRIDGE,
  PADDLE,
  PIECE,
  bridgeShapes,
  fixedBoxes,
  paddleShapes,
  type BinId,
  type PieceColor,
  type PieceShape,
} from '../src/sim/layout'
import { deg } from '../src/sim/mechanism'

await RAPIER.init()
let seed = Number(process.env.SEED ?? 1)
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const DT = 1 / 120
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
world.timestep = DT

const eulerToQuat = (x: number, y: number, z: number) => {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2)
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  }
}

for (const b of fixedBoxes()) {
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(...b.half)
      .setTranslation(...b.pos)
      .setRotation(eulerToQuat(...(b.rot ?? [0, 0, 0])))
      .setFriction(b.friction ?? 0.5)
      .setRestitution(b.restitution ?? 0.05),
  )
}

// two parallel paddles (kinematic)
const sh = paddleShapes()
const paddles = [-1, 1].map((s) => {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s * PADDLE.pivotX, sh.centerY, PADDLE.zc),
  )
  world.createCollider(RAPIER.ColliderDesc.cuboid(...sh.stem.half).setTranslation(...sh.stem.pos).setFriction(0.18), body)
  const hull = RAPIER.ColliderDesc.convexHull(sh.nose)
  if (!hull) throw new Error('hull failed')
  world.createCollider(hull.setFriction(0.18), body)
  return body
})

// lift bridge ramp (kinematic, hinge frame)
const ramp = world.createRigidBody(
  RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, BRIDGE.hingeY, BRIDGE.hingeZ),
)
for (const s of bridgeShapes()) {
  world.createCollider(RAPIER.ColliderDesc.cuboid(...s.half).setTranslation(...s.pos).setFriction(0.1), ramp)
}

const engine = new Engine()
const pieces: SimPiece[] = []
let nextId = 1
const kinds = new Map<number, PieceShape>()
const spawn = (color: PieceColor, x: number, shape: PieceShape) => {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.8, -1.3)
      .setRotation(eulerToQuat(0, rand() * Math.PI, 0))
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setLinearDamping(0.05)
      .setAngularDamping(0.6),
  )
  const hs = PIECE.size / 2
  const hh = PIECE.h / 2
  const col = shape === 'cube' ? RAPIER.ColliderDesc.cuboid(hs, hh, hs) : RAPIER.ColliderDesc.cylinder(hh, hs)
  world.createCollider(col.setDensity(1200).setFriction(0.1).setRestitution(0.1), body)
  pieces.push({ id: nextId, color, body, counted: false, bin: null, floorT: 0 })
  kinds.set(nextId, shape)
  nextId++
}

const expected: Record<PieceColor, BinId> = { red: 'red', green: 'green', blue: 'blue', yellow: 'anomaly' }
const seq: PieceColor[] = ['red', 'green', 'blue', 'yellow', 'blue', 'red', 'yellow', 'green', 'red', 'blue', 'green', 'yellow', 'blue', 'red']
const speedTest = Number(process.env.SPEED_PRESSES ?? 0)
const spacing = Number(process.env.SPACING ?? 3.0)
let t = 0
let k = 0
let nextSpawn = -1
let pressedStart = false
let log = ''
const SIM_T = 40 + seq.length * spacing + 10
let lastState = ''
let estopTested = false
let estop = false
let btnUp = false

const steerStates: string[] = []
while (t < SIM_T) {
  if (t > 0.5 && !pressedStart) {
    engine.pressStart()
    pressedStart = true
  }
  // speed up through the debounced pushbutton (each press is a real 60 ms hold with contact bounce)
  if (speedTest > 0 && t > 8 && t < 8 + speedTest * 0.3) btnUp = Math.floor((t - 8) / 0.15) % 2 === 0
  else btnUp = false
  if (engine.state !== lastState) {
    log += `t=${t.toFixed(2)} state ${lastState || '-'} -> ${engine.state}\n`
    lastState = engine.state
  }
  if (engine.state === 'RUN' && nextSpawn < 0) nextSpawn = t + 0.5
  if (nextSpawn >= 0 && t >= nextSpawn && k < seq.length) {
    spawn(seq[k], (rand() - 0.5) * 0.08, process.env.SHAPE === 'cylinder' || (process.env.SHAPE !== 'cube' && k % 2) ? 'cylinder' : 'cube')
    k++
    nextSpawn = t + spacing
  }
  // E-stop test: engage during run, release, check lock until START
  if (process.env.ESTOP && t > 20 && t < 20.1 && !estopTested) {
    estop = true
    estopTested = true
  }
  if (estop && t > 23) {
    estop = false
  }
  if (!estop && estopTested && t > 24 && engine.state === 'IDLE') engine.pressStart()
  const ev = engine.step(DT, { estop, btnUp, btnDown: false }, pieces)
  for (const e of ev) if (e.type === 'remove') log += `remove ${e.id}\n`
  const half = engine.pose.alpha / 2
  paddles.forEach((p, i) => {
    p.setNextKinematicTranslation({ x: (i === 0 ? -1 : 1) * PADDLE.pivotX, y: sh.centerY, z: PADDLE.zc })
    p.setNextKinematicRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
  })
  const th = engine.bridge.x / 2
  ramp.setNextKinematicRotation({ x: Math.sin(th), y: 0, z: 0, w: Math.cos(th) })
  world.step()
  t += DT
  if (Math.floor(t * 2) !== Math.floor((t - DT) * 2) && process.env.TRACE)
    steerStates.push(
      `t=${t.toFixed(1)} ${engine.state} steer=${deg(engine.steer.x).toFixed(1)} tgt=${engine.steerTarget} bridge=${deg(engine.bridge.x).toFixed(1)} v=${engine.vMeas.toFixed(2)}/${engine.belt.speed.toFixed(2)} sp=${engine.setpoint}`,
    )
}
console.log(log)
if (steerStates.length) console.log(steerStates.join('\n'))
console.log('--- results ---')
let ok = 0
for (const p of pieces) {
  const tr = p.body.translation()
  const good = p.bin === expected[p.color]
  if (good) ok++
  console.log(
    `piece ${p.id} ${p.color.padEnd(6)} ${kinds.get(p.id)!.padEnd(8)} -> bin ${(p.bin ?? 'NONE').padEnd(7)} at (${tr.x.toFixed(2)}, ${tr.y.toFixed(2)}, ${tr.z.toFixed(2)}) ${good ? 'OK' : 'FAIL'}`,
  )
}
console.log(`sorted correctly: ${ok}/${pieces.length}  counts=${JSON.stringify(engine.counts)}  setpoint=${engine.setpoint}  bounceRejected=${engine.bounceRejected} accepted=${engine.btnAccepted} ppm=${engine.ppm.toFixed(1)}`)
process.exit(ok === pieces.length ? 0 : 1)
