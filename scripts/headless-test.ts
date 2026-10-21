/**
 * Headless validation of the sorting line (no rendering): real Rapier world + the same colliders / engine
 * used by the React scene. Run with:  npm run test:sim
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { Engine, type SimPiece } from '../src/sim/engine'
import { BINS, PADDLE, PIECE, fixedBoxes, paddleShapes, type PieceColor } from '../src/sim/layout'
import { MECH, PHI_BLUE, PHI_RED, deg, solveMech } from '../src/sim/mechanism'

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
  // three.js 'XYZ' order
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
  const col = RAPIER.ColliderDesc.cuboid(...b.half)
    .setTranslation(...b.pos)
    .setRotation(eulerToQuat(...(b.rot ?? [0, 0, 0])))
    .setFriction(b.friction ?? 0.5)
    .setRestitution(b.restitution ?? 0.05)
  world.createCollider(col)
}

// paddle
const sh = paddleShapes()
const paddle = world.createRigidBody(
  RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, sh.centerY, PADDLE.zc),
)
world.createCollider(RAPIER.ColliderDesc.cuboid(...sh.stem.half).setTranslation(...sh.stem.pos).setFriction(0.2), paddle)
const hull = RAPIER.ColliderDesc.convexHull(sh.nose)
if (!hull) throw new Error('hull failed')
world.createCollider(hull.setFriction(0.2), paddle)

const engine = new Engine()
const pieces: SimPiece[] = []
let nextId = 1
const spawn = (color: PieceColor, x: number) => {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.82, -1.3)
      .setRotation(eulerToQuat(0, rand() * Math.PI, 0))
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setLinearDamping(0.05)
      .setAngularDamping(0.6),
  )
  const s = PIECE.size / 2
  world.createCollider(RAPIER.ColliderDesc.cuboid(s, s, s).setDensity(1200).setFriction(0.1).setRestitution(0.1), body)
  pieces.push({ id: nextId++, color, body, counted: false, bin: null, floorT: 0 })
}

console.log('Crank angles  RED %s°  BLUE %s°', deg(PHI_RED).toFixed(1), deg(PHI_BLUE).toFixed(1))
console.log('Pivots O2', MECH.O2.map((v) => v.toFixed(3)), 'O4', MECH.O4.map((v) => v.toFixed(3)), 'p', MECH.p.map((v) => v.toFixed(3)))
for (const [n, ph] of [['RED', PHI_RED], ['GREEN', 0], ['BLUE', PHI_BLUE]] as const) {
  const ps = solveMech(ph)
  console.log(n, 'alpha', deg(ps.alpha).toFixed(1), 'P', ps.P.map((v) => v.toFixed(3)), 'A', ps.A.map((v) => v.toFixed(3)), 'B', ps.B.map((v) => v.toFixed(3)))
}
solveMech(0)

const seq: PieceColor[] = ['red', 'green', 'blue', 'blue', 'red', 'green', 'red', 'blue', 'green', 'green', 'blue', 'red']
const spawnEvery = 3.0
let t = 0
let k = 0
let lastLog = -1
const poseLog: string[] = []
const SIM_T = 6 + seq.length * spawnEvery + 14

while (t < SIM_T) {
  if (t >= 4 + k * spawnEvery && k < seq.length) {
    spawn(seq[k], (rand() - 0.5) * 0.12)
    k++
  }
  const ev = engine.step(DT, { beltRun: true, beltSetpoint: 0.35, estop: false }, pieces)
  for (const e of ev) if (e.type === 'remove') console.log('remove', e.id)
  // kinematic paddle follows the 4-bar
  const q = { x: 0, y: Math.sin(engine.pose.alpha / 2), z: 0, w: Math.cos(engine.pose.alpha / 2) }
  paddle.setNextKinematicTranslation({ x: engine.pose.P[0], y: sh.centerY, z: engine.pose.P[1] })
  paddle.setNextKinematicRotation(q)
  world.step()
  t += DT
  if (process.env.TRACE && pieces[0] && Math.round(t*120)%24===0 && t>8 && t<16) { const tr=pieces[0].body.translation(); console.log('TR', t.toFixed(2), tr.x.toFixed(3), tr.y.toFixed(3), tr.z.toFixed(3), 'alpha', deg(engine.pose.alpha).toFixed(1), 'tgt', engine.target) }
  if (Math.floor(t) !== lastLog) {
    lastLog = Math.floor(t)
    poseLog.push(
      `t=${t.toFixed(0).padStart(3)} mode=${engine.mode} tgt=${engine.target} alpha=${deg(engine.pose.alpha).toFixed(1).padStart(6)}° q=${engine.queue.length} counts=${JSON.stringify(engine.counts)}`,
    )
  }
}
console.log(poseLog.join('\n'))
console.log('--- results ---')
let ok = 0
for (const p of pieces) {
  const tr = p.body.translation()
  const good = p.bin === p.color
  if (good) ok++
  console.log(`piece ${p.id} ${p.color.padEnd(5)} -> bin ${p.bin ?? 'NONE'} at (${tr.x.toFixed(2)}, ${tr.y.toFixed(2)}, ${tr.z.toFixed(2)}) ${good ? 'OK' : 'FAIL'}`)
}
console.log(`sorted correctly: ${ok}/${pieces.length}  counts=${JSON.stringify(engine.counts)}`)
void BINS
process.exit(ok === pieces.length ? 0 : 1)
