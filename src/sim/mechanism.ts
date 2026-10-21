/**
 * Planar 4-bar linkage (top view, XZ plane) that drives the deflector paddle.
 *
 *   O2 ── crank (r) ──► A ═══ coupler (L) ═══ B ◄── rocker (s) ── O4
 *
 *  - O2 (left, -X): driven by the DC gearmotor, angle `dphi` measured from the neutral pose.
 *  - O4 (right, +X): passive ground pivot.
 *  - The paddle is rigidly attached to the coupler at point P (coupler-frame coords p = [perp, along]),
 *    chosen by least squares so that the paddle keeps almost the same centre for the 3 states.
 *
 * Coupler angle `alpha` is measured from +Z toward +X (so alpha < 0 ⇒ tail at -X ⇒ RED, alpha > 0 ⇒ BLUE).
 */
import { PADDLE } from './layout'

export type V2 = [number, number]

export interface MechPose {
  O2: V2
  O4: V2
  A: V2
  B: V2
  /** Paddle centre in world XZ. */
  P: V2
  alpha: number
}

const L = 0.14
const D = 0.16
const Z2 = -0.4
const Z4 = 0

const A0: V2 = [0, -L / 2]
const B0: V2 = [0, L / 2]
const O2l: V2 = [-D, Z2]
const O4l: V2 = [D, Z4]
const r = Math.hypot(A0[0] - O2l[0], A0[1] - O2l[1])
const s = Math.hypot(B0[0] - O4l[0], B0[1] - O4l[1])
const phi0 = Math.atan2(A0[1] - O2l[1], A0[0] - O2l[0])

interface Local {
  A: V2
  B: V2
  alpha: number
}

function solveLocal(dphi: number, prevB: V2): Local | null {
  const phi = phi0 + dphi
  const A: V2 = [O2l[0] + r * Math.cos(phi), O2l[1] + r * Math.sin(phi)]
  const dx = O4l[0] - A[0]
  const dz = O4l[1] - A[1]
  const d = Math.hypot(dx, dz)
  if (d > L + s || d < Math.abs(L - s)) return null
  const a = (L * L - s * s + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, L * L - a * a))
  const px = A[0] + (a * dx) / d
  const pz = A[1] + (a * dz) / d
  const c1: V2 = [px + (h * dz) / d, pz - (h * dx) / d]
  const c2: V2 = [px - (h * dz) / d, pz + (h * dx) / d]
  const B =
    Math.hypot(c1[0] - prevB[0], c1[1] - prevB[1]) <= Math.hypot(c2[0] - prevB[0], c2[1] - prevB[1])
      ? c1
      : c2
  return { A, B, alpha: Math.atan2(B[0] - A[0], B[1] - A[1]) }
}

/** Branch-continuous sweep from the neutral pose towards `sign` (+1/-1) up to `maxDeg`. */
function sweep(sign: 1 | -1, maxDeg: number, stepDeg = 0.1): { dphi: number; loc: Local }[] {
  const out: { dphi: number; loc: Local }[] = []
  let prev = B0
  for (let k = 0; k <= maxDeg / stepDeg; k++) {
    const dphi = (sign * k * stepDeg * Math.PI) / 180
    const loc = solveLocal(dphi, prev)
    if (!loc) break
    prev = loc.B
    out.push({ dphi, loc })
  }
  return out
}

function crankFor(alphaTarget: number): number {
  const sign = alphaTarget < 0 ? -1 : 1
  const sw = sweep(sign, 120)
  for (let i = 1; i < sw.length; i++) {
    const a0 = sw[i - 1].loc.alpha
    const a1 = sw[i].loc.alpha
    if ((a0 - alphaTarget) * (a1 - alphaTarget) <= 0) {
      const t = (alphaTarget - a0) / (a1 - a0 || 1)
      return sw[i - 1].dphi + t * (sw[i].dphi - sw[i - 1].dphi)
    }
  }
  throw new Error('4-bar cannot reach requested paddle angle')
}

const sortRad = (PADDLE.sortDeg * Math.PI) / 180
/** Crank angle (rad, relative to neutral) for the RED / BLUE states. */
export const PHI_RED = crankFor(-sortRad)
export const PHI_GREEN = 0
export const PHI_BLUE = crankFor(sortRad)

// Coupler frame -> local plane: W = A + px*(cos a, -sin a) + pz*(sin a, cos a)
function toLocal(loc: Local, p: V2): V2 {
  const c = Math.cos(loc.alpha)
  const sn = Math.sin(loc.alpha)
  return [loc.A[0] + p[0] * c + p[1] * sn, loc.A[1] - p[0] * sn + p[1] * c]
}

function fitPaddlePoint(): V2 {
  // red & blue need branch continuity from the neutral pose, so walk there with a sweep first
  const exact = (dphi: number): Local => {
    const sw = sweep(dphi < 0 ? -1 : 1, (Math.abs(dphi) * 180) / Math.PI)
    return solveLocal(dphi, sw.at(-1)!.loc.B)!
  }
  const states: Local[] = [exact(PHI_RED), solveLocal(0, B0)!, exact(PHI_BLUE)]
  let best: { e: number; p: V2 } | null = null
  for (let px = -0.35; px <= 0.35; px += 0.005) {
    for (let pz = -0.2; pz <= 0.4; pz += 0.005) {
      const w = states.map((st) => toLocal(st, [px, pz]))
      const mx = (w[0][0] + w[1][0] + w[2][0]) / 3
      const mz = (w[0][1] + w[1][1] + w[2][1]) / 3
      const e = w.reduce((a, q) => a + 4 * (q[0] - mx) ** 2 + (q[1] - mz) ** 2, 0)
      if (!best || e < best.e) best = { e, p: [px, pz] }
    }
  }
  return best!.p
}

const p = fitPaddlePoint()
const Pn = toLocal(solveLocal(0, B0)!, p)
/** Local plane -> world XZ offset so that the neutral paddle is centred on x = 0, z = PADDLE.zc. */
const OFF: V2 = [-Pn[0], PADDLE.zc - Pn[1]]

export const MECH = {
  L,
  r,
  s,
  p,
  offset: OFF,
  O2: [O2l[0] + OFF[0], O2l[1] + OFF[1]] as V2,
  O4: [O4l[0] + OFF[0], O4l[1] + OFF[1]] as V2,
}

let lastB: V2 = B0

/** Solve the linkage for a crank angle (rad, relative to neutral). Stateful for branch continuity. */
export function solveMech(dphi: number): MechPose {
  let loc = solveLocal(dphi, lastB)
  if (!loc) loc = solveLocal(0, B0)!
  lastB = loc.B
  const P = toLocal(loc, p)
  const w = (q: V2): V2 => [q[0] + OFF[0], q[1] + OFF[1]]
  return {
    O2: MECH.O2,
    O4: MECH.O4,
    A: w(loc.A),
    B: w(loc.B),
    P: w(P),
    alpha: loc.alpha,
  }
}

export const deg = (r_: number) => (r_ * 180) / Math.PI
export const rad = (d_: number) => (d_ * Math.PI) / 180
