/**
 * Dual-paddle parallel steering linkage (Ackermann-style tie-rod / parallelogram), top view (XZ plane).
 *
 *     PL ──────── ground link (0.15 m) ──────── PR        pivots at 1/3 and 2/3 of the belt width
 *     │ arm a                                   │ arm a
 *    tipL ═════════ tie-rod (= ground link) ═══ tipR      PL-PR-tipR-tipL is a parallelogram
 *
 * Both paddle shafts and both arms rotate by the same angle `alpha`, so the paddles are strictly parallel at any angle.
 * The steering gearmotor drives the left shaft (PL). alpha < 0 ⇒ `//` (RED, left), 0 ⇒ `||`, alpha > 0 ⇒ `\\` (BLUE, right).
 */
import { PADDLE } from './layout'

export type V2 = [number, number]

export const STEER = {
  pivotX: PADDLE.pivotX,
  zc: PADDLE.zc,
  arm: 0.1,
  limitDeg: 50,
  sortDeg: PADDLE.sortDeg,
} as const

export interface SteerPose {
  alpha: number
  PL: V2
  PR: V2
  tipL: V2
  tipR: V2
}

const PL: V2 = [-STEER.pivotX, STEER.zc]
const PR: V2 = [STEER.pivotX, STEER.zc]

export function solveMech(alpha: number): SteerPose {
  const dx = Math.sin(alpha) * STEER.arm
  const dz = Math.cos(alpha) * STEER.arm
  return {
    alpha,
    PL,
    PR,
    tipL: [PL[0] + dx, PL[1] + dz],
    tipR: [PR[0] + dx, PR[1] + dz],
  }
}

export const deg = (r: number) => (r * 180) / Math.PI
export const rad = (d: number) => (d * Math.PI) / 180
