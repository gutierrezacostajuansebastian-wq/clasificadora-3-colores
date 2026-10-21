/**
 * Shared, framework-free geometry of the sorting line.
 * World axes: +Z = belt travel (infeed at -Z, discharge at +Z), X = lateral, Y = up (floor = 0).
 * All dimensions in metres.
 */

export type V3 = [number, number, number]

export const BELT = {
  halfLen: 1.5, // belt length 3.0 m
  halfW: 0.225, // belt width 0.45 m
  top: 0.75, // belt surface height
  rollerR: 0.035,
  frameH: 0.75,
} as const

export const GUARD = { x: 0.234, halfT: 0.006, h: 0.12 } as const

/** Optical stations (S1 red, S2 green) spaced 0.15 m on the centre line. */
export const SENSORS = {
  s1z: -0.55,
  s2z: -0.4,
  gantryZ: -0.475,
  beamR: 0.025,
  headY: 0.93,
} as const

/** Deflector paddle (4-bar coupler) geometry. */
export const PADDLE = {
  zc: 0.4, // neutral centre along Z
  halfLen: 0.31,
  halfT: 0.015,
  noseLen: 0.07,
  noseHalfW: 0.04,
  bottom: BELT.top + 0.005, // 5 mm above the belt
  top: BELT.top + 0.31,
  sortDeg: 45,
} as const

/** Side discharge slots (both walls). */
export const SLOT = { z0: 0.36, z1: 0.9 } as const

export const PIECE = { size: 0.06 } as const

export const COLORS = {
  red: '#e0221c',
  green: '#16b04a',
  blue: '#1d55e0',
} as const

export type PieceColor = keyof typeof COLORS
export type PieceShape = 'cube' | 'cylinder'

/** Linear RGB-ish signature used by the IR colour model (0..1). */
export const PIECE_RGB: Record<PieceColor, V3> = {
  red: [0.88, 0.13, 0.11],
  green: [0.09, 0.69, 0.29],
  blue: [0.11, 0.33, 0.88],
}

export interface BoxDef {
  id: string
  pos: V3
  half: V3
  rot?: V3
  friction?: number
  restitution?: number
}

// ---------------------------------------------------------------- helpers
function seg(
  id: string,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  halfT: number,
  y0: number,
  y1: number,
  friction = 0.12,
): BoxDef {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.hypot(dx, dz)
  return {
    id,
    pos: [(x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2],
    half: [len / 2, (y1 - y0) / 2, halfT],
    rot: [0, Math.atan2(-dz, dx), 0],
    friction,
  }
}

// ---------------------------------------------------------------- bins
export interface BinDef {
  id: 'red' | 'green' | 'blue'
  cx: number
  cz: number
  hx: number
  hz: number
  rim: number
}

export const BINS: Record<'red' | 'green' | 'blue', BinDef> = {
  red: { id: 'red', cx: -0.66, cz: 0.63, hx: 0.19, hz: 0.3, rim: 0.34 },
  blue: { id: 'blue', cx: 0.66, cz: 0.63, hx: 0.19, hz: 0.3, rim: 0.34 },
  green: { id: 'green', cx: 0, cz: 1.66, hx: 0.22, hz: 0.25, rim: 0.34 },
}

export function binAt(x: number, y: number, z: number): BinDef | null {
  for (const b of Object.values(BINS)) {
    if (
      Math.abs(x - b.cx) < b.hx &&
      Math.abs(z - b.cz) < b.hz &&
      y < b.rim - 0.03 &&
      y > 0
    ) {
      return b
    }
  }
  return null
}

function binBoxes(b: BinDef): BoxDef[] {
  const t = 0.01
  const h = b.rim
  return [
    { id: `bin-${b.id}-floor`, pos: [b.cx, t, b.cz], half: [b.hx + 2 * t, t, b.hz + 2 * t], friction: 0.6 },
    { id: `bin-${b.id}-xp`, pos: [b.cx + b.hx + t, h / 2, b.cz], half: [t, h / 2, b.hz + 2 * t], friction: 0.4 },
    { id: `bin-${b.id}-xn`, pos: [b.cx - b.hx - t, h / 2, b.cz], half: [t, h / 2, b.hz + 2 * t], friction: 0.4 },
    { id: `bin-${b.id}-zp`, pos: [b.cx, h / 2, b.cz + b.hz + t], half: [b.hx + 2 * t, h / 2, t], friction: 0.4 },
    { id: `bin-${b.id}-zn`, pos: [b.cx, h / 2, b.cz - b.hz - t], half: [b.hx + 2 * t, h / 2, t], friction: 0.4 },
  ]
}

// ---------------------------------------------------------------- chutes
export const CHUTE = {
  topX: 0.222,
  topY: 0.746,
  botX: 0.5,
  botY: 0.4,
  zc: (SLOT.z0 + SLOT.z1) / 2,
  halfZ: (SLOT.z1 - SLOT.z0) / 2,
} as const

/** Geometry of the chute surface for side s (-1 = left/red, +1 = right/blue). */
export function chuteGeom(s: -1 | 1) {
  const x0 = s * CHUTE.topX
  const y0 = CHUTE.topY
  const x1 = s * CHUTE.botX
  const y1 = CHUTE.botY
  const dx = x0 - x1
  const dy = y0 - y1
  const len = Math.hypot(dx, dy)
  const ang = Math.atan2(dy, dx) // slope direction measured bottom -> top
  // upward normal of the surface
  const n: [number, number] = dx > 0 ? [-dy / len, dx / len] : [dy / len, -dx / len]
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, len, ang, n }
}

function chuteBoxes(s: -1 | 1): BoxDef[] {
  const g = chuteGeom(s)
  const name = s < 0 ? 'L' : 'R'
  const fl = 0.05
  const flange = (z: number, id: string): BoxDef => ({
    id,
    pos: [g.cx + g.n[0] * fl, g.cy + g.n[1] * fl, z],
    half: [g.len / 2, fl, 0.005],
    rot: [0, 0, g.ang],
    friction: 0.1,
  })
  return [
    {
      id: `chute-${name}`,
      pos: [g.cx, g.cy, CHUTE.zc],
      half: [g.len / 2, 0.005, CHUTE.halfZ],
      rot: [0, 0, g.ang],
      friction: 0.3,
    },
    flange(CHUTE.zc - CHUTE.halfZ - 0.005, `chute-${name}-f0`),
    flange(CHUTE.zc + CHUTE.halfZ + 0.005, `chute-${name}-f1`),
  ]
}

// ---------------------------------------------------------------- static colliders
const wallY0 = BELT.top
const wallY1 = BELT.top + GUARD.h

export function fixedBoxes(): BoxDef[] {
  const out: BoxDef[] = []
  out.push({ id: 'floor', pos: [0, -0.05, 0], half: [8, 0.05, 8], friction: 0.8 })
  out.push({
    id: 'belt',
    pos: [0, BELT.top - 0.01, 0],
    half: [BELT.halfW, 0.01, BELT.halfLen],
    friction: 0.05,
  })

  // Side guards with discharge slots
  for (const s of [-1, 1] as const) {
    const x = s * GUARD.x
    const parts: [number, number][] = [
      [-BELT.halfLen, SLOT.z0],
      [SLOT.z1, BELT.halfLen],
    ]
    parts.forEach(([za, zb], i) => {
      out.push({
        id: `guard-${s}-${i}`,
        pos: [x, (wallY0 + wallY1) / 2, (za + zb) / 2],
        half: [GUARD.halfT, (wallY1 - wallY0) / 2, (zb - za) / 2],
        friction: 0.08,
      })
    })
  }

  // Infeed hood (back plate with an infeed slot)
  const bz = -BELT.halfLen - 0.012
  out.push({ id: 'infeed-l', pos: [-0.164, 0.81, bz], half: [0.064, 0.06, 0.006] })
  out.push({ id: 'infeed-r', pos: [0.164, 0.81, bz], half: [0.064, 0.06, 0.006] })
  out.push({ id: 'infeed-t', pos: [0, 0.85, bz], half: [0.1, 0.02, 0.006] })

  // Infeed funnel + metering lane
  for (const s of [-1, 1] as const) {
    out.push(seg(`funnel-${s}`, s * 0.228, -1.15, s * 0.085, -0.85, 0.006, 0.75, 0.85))
    out.push(seg(`lane-${s}`, s * 0.091, -0.85, s * 0.091, -0.05, 0.006, 0.75, 0.85))
  }

  // Chutes & bins
  out.push(...chuteBoxes(-1), ...chuteBoxes(1))
  out.push(...binBoxes(BINS.red), ...binBoxes(BINS.blue), ...binBoxes(BINS.green))
  return out
}

/** Region of the infeed where the operator may drop pieces. */
export const INFEED = { z0: -1.45, z1: -1.2, halfW: BELT.halfW - 0.03 } as const

export function clampToInfeed(x: number, z: number): [number, number] {
  return [
    Math.max(-INFEED.halfW, Math.min(INFEED.halfW, x)),
    Math.max(INFEED.z0, Math.min(INFEED.z1, z)),
  ]
}

/**
 * Paddle collision shapes in the paddle's local frame (origin = paddle centre at mid height, +Z = downstream tail).
 * A chevron nose (convex hull of a triangular prism, pointing upstream) + a straight stem.
 */
export function paddleShapes() {
  const hl = PADDLE.halfLen
  const hh = (PADDLE.top - PADDLE.bottom) / 2
  const zs0 = -hl + PADDLE.noseLen
  const noseVerts: number[] = []
  for (const y of [-hh, hh]) {
    noseVerts.push(0, y, -hl)
    noseVerts.push(PADDLE.noseHalfW, y, zs0)
    noseVerts.push(-PADDLE.noseHalfW, y, zs0)
  }
  return {
    centerY: (PADDLE.top + PADDLE.bottom) / 2,
    stem: {
      pos: [0, 0, (zs0 + hl) / 2] as V3,
      half: [PADDLE.halfT, hh, (hl - zs0) / 2] as V3,
    },
    nose: new Float32Array(noseVerts),
  }
}
