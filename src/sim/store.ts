import { create } from 'zustand'
import { Engine, type SimPiece, type SortState } from './engine'
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

export interface Telemetry {
  s1: number
  s2: number
  led1: boolean
  led2: boolean
  isRed: boolean
  isGreen: boolean
  target: SortState
  lastDecision: string
  mode: string
  queue: number
  pwmD5: number
  pwmD6: number
  pwmMech: number
  mechDir: number
  hallRed: boolean
  hallBlue: boolean
  hallCountRed: number
  hallCountBlue: number
  encDeg: number
  alphaDeg: number
  beltSpeed: number
  homed: boolean
}

const emptyTelemetry: Telemetry = {
  s1: 0,
  s2: 0,
  led1: false,
  led2: false,
  isRed: false,
  isGreen: false,
  target: 'GREEN',
  lastDecision: '-',
  mode: 'HOMING',
  queue: 0,
  pwmD5: 0,
  pwmD6: 0,
  pwmMech: 0,
  mechDir: 0,
  hallRed: false,
  hallBlue: false,
  hallCountRed: 0,
  hallCountBlue: 0,
  encDeg: 0,
  alphaDeg: 0,
  beltSpeed: 0,
  homed: false,
}

const MAX_PIECES = 70
const colors: PieceColor[] = ['red', 'green', 'blue']

interface SimStore {
  pieces: PieceSpec[]
  nextId: number
  beltRun: boolean
  beltSpeed: number
  estop: boolean
  camera: CamPreset
  shapeMode: ShapeMode
  placeSpec: { color: PieceColor; shape: PieceShape } | null
  followId: number | null
  counts: { red: number; green: number; blue: number }
  telemetry: Telemetry
  log: string[]

  spawn: (color: PieceColor, shape?: PieceShape, at?: { x: number; z: number }) => number
  spawnRandomSequence: (n?: number) => void
  removePieces: (ids: number[]) => void
  clearBelt: () => void
  emptyBins: () => void
  resetCounters: () => void
  toggleEstop: () => void
  setBeltRun: (v: boolean) => void
  setBeltSpeed: (v: number) => void
  setCamera: (c: CamPreset) => void
  setShapeMode: (m: ShapeMode) => void
  setPlaceSpec: (s: { color: PieceColor; shape: PieceShape } | null) => void
  setCounts: (c: { red: number; green: number; blue: number }) => void
  setTelemetry: (t: Telemetry) => void
  pushLog: (line: string) => void
}

const pickShape = (mode: ShapeMode): PieceShape =>
  mode === 'mixed' ? (Math.random() < 0.5 ? 'cube' : 'cylinder') : mode

export const useSim = create<SimStore>((set, get) => ({
  pieces: [],
  nextId: 1,
  beltRun: true,
  beltSpeed: 0.35,
  estop: false,
  camera: 'orbit',
  shapeMode: 'mixed',
  placeSpec: null,
  followId: null,
  counts: { red: 0, green: 0, blue: 0 },
  telemetry: emptyTelemetry,
  log: ['[BOOT] Arduino UNO ready', '[HOME] seeking Hall RED...'],

  spawn: (color, shape, at) => {
    const s = get()
    const id = s.nextId
    const [x, z] = at
      ? clampToInfeed(at.x, at.z)
      : [(Math.random() - 0.5) * 0.1, -1.34 + (Math.random() - 0.5) * 0.04]
    const spec: PieceSpec = {
      id,
      color,
      shape: shape ?? pickShape(s.shapeMode),
      x,
      y: 0.84,
      z,
      yaw: Math.random() * Math.PI,
    }
    let pieces = [...s.pieces, spec]
    if (pieces.length > MAX_PIECES) {
      // drop the oldest already-counted pieces first, then the oldest overall
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
        color: colors[Math.floor(Math.random() * 3)],
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
    runtime.engine.queue = []
    set({ pieces: keep })
    get().pushLog('[CMD] belt cleared')
  },

  emptyBins: () => {
    const keep = get().pieces.filter((p) => !runtime.bodies.get(p.id)?.counted)
    set({ pieces: keep })
  },

  resetCounters: () => {
    runtime.engine.resetCounters()
    set({ counts: { red: 0, green: 0, blue: 0 } })
    get().pushLog('[CMD] LCD counters reset')
  },

  toggleEstop: () => {
    const v = !get().estop
    set({ estop: v })
    if (!v) runtime.engine.resetController()
    get().pushLog(v ? '[E-STOP] outputs disabled' : '[E-STOP] released, re-homing')
  },

  setBeltRun: (v) => set({ beltRun: v }),
  setBeltSpeed: (v) => set({ beltSpeed: v }),
  setCamera: (c) => set({ camera: c }),
  setShapeMode: (m) => set({ shapeMode: m }),
  setPlaceSpec: (s) => set({ placeSpec: s }),
  setCounts: (c) => set({ counts: c }),
  setTelemetry: (t) => set({ telemetry: t }),
  pushLog: (line) => set((s) => ({ log: [...s.log.slice(-39), line] })),
}))

/** Format the 16x2 LCD1602 content. */
export function lcdLines(c: { red: number; green: number; blue: number }): [string, string] {
  const p3 = (n: number) => String(Math.min(999, n)).padStart(3, '0')
  const total = c.red + c.green + c.blue
  return [
    `R${p3(c.red)} G${p3(c.green)} B${p3(c.blue)}`.padEnd(16, ' '),
    `TOTAL COUNT ${String(Math.min(9999, total)).padStart(4, '0')}`,
  ]
}
