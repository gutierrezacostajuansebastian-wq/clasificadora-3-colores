import { create } from 'zustand'
import { Engine, type SimPiece, type Telemetry } from './engine'
import { clampToInfeed, type PieceColor, type PieceShape } from './layout'

/** Mutable, non-reactive runtime shared between the physics loop and the 3D components. */
export const runtime = {
  engine: new Engine(),
  bodies: new Map<number, SimPiece>(),
  pieceKinds: new Map<number, { color: PieceColor; shape: PieceShape }>(),
  lastSpawnOffset: -10,
  seqQueue: [] as { color: PieceColor; shape: PieceShape }[],
}

export type CamPreset = 'top' | 'follow' | 'orbit'
export type ShapeMode = PieceShape | 'mixed'

export interface PieceSpec {
  id: number
  color: PieceColor
  shape: PieceShape
  x: number
  y: number
  z: number
  yaw: number
}

const MAX_PIECES = 70
const sequenceColors: PieceColor[] = ['red', 'green', 'blue', 'red', 'green', 'blue', 'yellow']

const emptyTelemetry: Telemetry = runtime.engine.snapshot()

interface SimStore {
  pieces: PieceSpec[]
  nextId: number
  estop: boolean
  btnUp: boolean
  btnDown: boolean
  camera: CamPreset
  shapeMode: ShapeMode
  placeSpec: { color: PieceColor; shape: PieceShape } | null
  followId: number | null
  xray: boolean
  telemetry: Telemetry
  log: string[]

  spawn: (color: PieceColor, shape?: PieceShape, at?: { x: number; z: number }) => number
  spawnRandomSequence: (n?: number) => void
  removePieces: (ids: number[]) => void
  clearBelt: () => void
  emptyBins: () => void
  pressStart: () => void
  pressReset: () => void
  toggleEstop: () => void
  setButton: (which: 'up' | 'down', held: boolean) => void
  setCamera: (c: CamPreset) => void
  setShapeMode: (m: ShapeMode) => void
  setPlaceSpec: (s: { color: PieceColor; shape: PieceShape } | null) => void
  setXray: (v: boolean) => void
  setTelemetry: (t: Telemetry) => void
  pushLog: (line: string) => void
}

const pickShape = (mode: ShapeMode): PieceShape =>
  mode === 'mixed' ? (Math.random() < 0.5 ? 'cube' : 'cylinder') : mode

export const useSim = create<SimStore>((set, get) => ({
  pieces: [],
  nextId: 1,
  estop: false,
  btnUp: false,
  btnDown: false,
  camera: 'orbit',
  shapeMode: 'mixed',
  placeSpec: null,
  followId: null,
  xray: false,
  telemetry: emptyTelemetry,
  log: ['[BOOT] Arduino Mega 2560 ready', '[IDLE] press START to run the homing routine'],

  spawn: (color, shape, at) => {
    const s = get()
    const id = s.nextId
    const [x, z] = at
      ? clampToInfeed(at.x, at.z)
      : [(Math.random() - 0.5) * 0.06, -1.34 + (Math.random() - 0.5) * 0.04]
    const spec: PieceSpec = {
      id,
      color,
      shape: shape ?? pickShape(s.shapeMode),
      x,
      y: 0.8,
      z,
      yaw: Math.random() * Math.PI,
    }
    let pieces = [...s.pieces, spec]
    if (pieces.length > MAX_PIECES) {
      const counted = pieces.filter((p) => runtime.bodies.get(p.id)?.counted)
      const victims = (counted.length ? counted : pieces).slice(0, pieces.length - MAX_PIECES)
      const gone = new Set(victims.map((v) => v.id))
      pieces = pieces.filter((p) => !gone.has(p.id))
    }
    set({ pieces, nextId: id + 1, followId: id })
    return id
  },

  spawnRandomSequence: (n = 6) => {
    for (let i = 0; i < n; i++) {
      runtime.seqQueue.push({
        color: sequenceColors[Math.floor(Math.random() * sequenceColors.length)],
        shape: pickShape(get().shapeMode),
      })
    }
  },

  removePieces: (ids) => {
    if (!ids.length) return
    const gone = new Set(ids)
    set((s) => ({ pieces: s.pieces.filter((p) => !gone.has(p.id)) }))
  },

  clearBelt: () => {
    const keep = get().pieces.filter((p) => runtime.bodies.get(p.id)?.counted)
    runtime.seqQueue.length = 0
    runtime.engine.clearQueues()
    set({ pieces: keep })
    get().pushLog('[CMD] belt cleared')
  },

  emptyBins: () => {
    const keep = get().pieces.filter((p) => !runtime.bodies.get(p.id)?.counted)
    set({ pieces: keep })
  },

  pressStart: () => {
    if (get().estop) {
      get().pushLog('[START] ignored: release E-STOP first')
      return
    }
    if (runtime.engine.state !== 'IDLE') return
    runtime.engine.pressStart()
    get().pushLog('[START] homing: steering -> centre Hall, bridge -> flat Hall, then belt ramp-up')
  },

  pressReset: () => {
    if (!get().estop) {
      get().pushLog('[RESET] ignored: only enabled while E-STOP is active')
      return
    }
    runtime.engine.pressReset()
    get().pushLog('[RESET] LCD counters zeroed')
  },

  toggleEstop: () => {
    const v = !get().estop
    set({ estop: v })
    get().pushLog(v ? '[E-STOP] ACTIVE: drives cut, machine locked' : '[E-STOP] released (twist): press START to re-home')
  },

  setButton: (which, held) => set(which === 'up' ? { btnUp: held } : { btnDown: held }),
  setCamera: (c) => set({ camera: c }),
  setShapeMode: (m) => set({ shapeMode: m }),
  setPlaceSpec: (s) => set({ placeSpec: s }),
  setXray: (v) => set({ xray: v }),
  setTelemetry: (t) => set({ telemetry: t }),
  pushLog: (line) => set((s) => ({ log: [...s.log.slice(-39), line] })),
}))

/** Format the 16x2 LCD1602 content (16 columns: the spec's 19/17 character lines cannot fit). */
export function lcdLines(c: { red: number; green: number; blue: number; anomaly: number }): [string, string] {
  const p3 = (n: number) => String(Math.min(999, n)).padStart(3, '0')
  const total = c.red + c.green + c.blue + c.anomaly
  return [
    `R${p3(c.red)} G${p3(c.green)} B${p3(c.blue)}`.padEnd(16, ' '),
    `TOTAL ${String(Math.min(9999, total)).padStart(4, '0')} N:${p3(c.anomaly)}`,
  ]
}
