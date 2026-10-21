/**
 * Framework-free simulation core: belt drive, IR sensing, Arduino UNO sorting firmware (cascade logic),
 * H-bridge DC motor model + Hall/encoder feedback, bin counting.
 * Stepped from the physics loop at a fixed dt, and unit-testable headless.
 */
import { BELT, PADDLE, PIECE_RGB, SENSORS, binAt, type PieceColor } from './layout'
import { PHI_BLUE, PHI_RED, deg, rad, solveMech, type MechPose } from './mechanism'

export type SortState = 'RED' | 'GREEN' | 'BLUE'
export type CtrlMode = 'HOMING' | 'RUN' | 'ESTOP'

export interface BodyLike {
  translation(): { x: number; y: number; z: number }
  linvel(): { x: number; y: number; z: number }
  setLinvel(v: { x: number; y: number; z: number }, wake: boolean): void
}

export interface SimPiece {
  id: number
  color: PieceColor
  body: BodyLike
  counted: boolean
  bin: PieceColor | null
  floorT: number
}

export interface Inputs {
  beltRun: boolean
  beltSetpoint: number // m/s
  estop: boolean
}

export type SimEvent =
  | { type: 'count'; bin: PieceColor; id: number }
  | { type: 'remove'; id: number }

// ------------------------------------------------------------------ constants
const SENSE_R = 0.045
const PRESENCE_THR = 150
const COLOR_THR = 480
const SENSOR_BASE = 220
const HALL_WIN = 1.5 // deg
const STOP_MARGIN = 2.5 // deg beyond the hall windows (mechanical hard stops)
const MOTOR = { wmax: 5.0, tau: 0.1, kp: 2.9, kd: 0.2, deadband: 0.4 } // crank rad/s etc.
const NOSE_NEUTRAL = PADDLE.zc - PADDLE.halfLen
const TAIL_NEUTRAL = PADDLE.zc + PADDLE.halfLen
const REF_Z = SENSORS.s1z + SENSE_R // piece centre when its trailing edge leaves S1 beam
const APPROACH_DIST = NOSE_NEUTRAL - 0.03 - REF_Z - 0.2 // start moving 0.2 m before contact
const CLEAR_DIST = TAIL_NEUTRAL + 0.04 - REF_Z
const SENSOR_SPACING = SENSORS.s2z - SENSORS.s1z

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Entry {
  state: SortState | 'PENDING'
  passedS2: boolean
  dist: number
}

interface SensorState {
  analog: number
  presence: boolean
  peak: number
  led: boolean
  ledHold: number
}

const newSensor = (): SensorState => ({ analog: 40, presence: false, peak: 0, led: false, ledHold: 0 })

export const STATE_PHI: Record<SortState, number> = {
  RED: PHI_RED,
  GREEN: 0,
  BLUE: PHI_BLUE,
}

export class Engine {
  rnd = mulberry32(1234)

  // conveyor
  belt = { speed: 0, offset: 0 }

  // mechanism motor (crank), starts slightly off-neutral: firmware must home on Hall RED
  motor = { phi: rad(3), omega: 0 }
  hall = { red: false, blue: false }
  pose: MechPose = solveMech(rad(3))

  // Arduino
  mode: CtrlMode = 'HOMING'
  target: SortState = 'GREEN'
  queue: Entry[] = []
  s1 = newSensor()
  s2 = newSensor()
  isRed = false
  isGreen = false
  lastDecision: SortState | '-' = '-'
  pwmConvD5 = 0
  pwmConvD6 = 0
  pwmMech = 0
  mechDir: -1 | 0 | 1 = 0
  encDeg = 0
  private encZero = 0
  private encPrev = 0
  private encVelF = 0
  private idleT = 0
  private encOffsetPowerUp = rad(3)
  hallCountRed = 0
  hallCountBlue = 0
  homed = false

  counts = { red: 0, green: 0, blue: 0 }

  get total() {
    return this.counts.red + this.counts.green + this.counts.blue
  }

  /** E-stop released / reset: firmware re-homes and forgets the in-flight queue. */
  resetController() {
    this.queue = []
    this.mode = 'HOMING'
    this.homed = false
    this.target = 'GREEN'
    this.isRed = false
    this.isGreen = false
    this.lastDecision = '-'
  }

  resetCounters() {
    this.counts = { red: 0, green: 0, blue: 0 }
  }

  private irSignal(color: PieceColor, sensor: 0 | 1): number {
    const [r, g, b] = PIECE_RGB[color]
    const score = sensor === 0 ? r - Math.max(g, b) : g - Math.max(r, b)
    return Math.max(0, Math.min(1023, SENSOR_BASE + 700 * Math.max(0, score) + (this.rnd() - 0.5) * 40))
  }

  step(dt: number, inputs: Inputs, pieces: Iterable<SimPiece>): SimEvent[] {
    const events: SimEvent[] = []
    const list = Array.from(pieces)

    // ---------------------------------------------------------- conveyor DC motor (PWM D5/D6 through driver)
    const run = inputs.beltRun && !inputs.estop
    const target = run ? inputs.beltSetpoint : 0
    const tau = inputs.estop ? 0.08 : 0.3
    this.belt.speed += (target - this.belt.speed) * (1 - Math.exp(-dt / tau))
    if (this.belt.speed < 1e-4 && target === 0) this.belt.speed = 0
    this.belt.offset += this.belt.speed * dt
    this.pwmConvD5 = run ? Math.round(Math.min(1, inputs.beltSetpoint / 1.0) * 255) : 0
    this.pwmConvD6 = 0

    // ---------------------------------------------------------- IR sensors S1 / S2 (analog A0 / A1)
    const reading = (sz: number, idx: 0 | 1): { present: boolean; value: number } => {
      for (const p of list) {
        const t = p.body.translation()
        if (t.y < 0.77 || t.y > 0.95) continue
        if (Math.hypot(t.x, t.z - sz) < SENSE_R) return { present: true, value: this.irSignal(p.color, idx) }
      }
      return { present: false, value: 40 + (this.rnd() - 0.5) * 12 }
    }
    const r1 = reading(SENSORS.s1z, 0)
    const r2 = reading(SENSORS.s2z, 1)

    // Firmware / motor / encoder run at 4x the physics rate (an Arduino loop is far faster than 120 Hz)
    const SUB = 4
    const h = dt / SUB
    for (let sub = 0; sub < SUB; sub++) {
      // ---------------------------------------------------------- encoder / Hall inputs
      const phiDeg = deg(this.motor.phi)
      const redLimit = deg(PHI_RED)
      const blueLimit = deg(PHI_BLUE)
      const hallRed = phiDeg <= redLimit + HALL_WIN
      const hallBlue = phiDeg >= blueLimit - HALL_WIN
      if (hallRed && !this.hall.red) this.hallCountRed++
      if (hallBlue && !this.hall.blue) this.hallCountBlue++
      this.hall.red = hallRed
      this.hall.blue = hallBlue
      // incremental encoder: counts since power-up, 0.5° resolution
      const rawEnc = Math.round((phiDeg - deg(this.encOffsetPowerUp)) / 0.5) * 0.5
      const encDeg = rawEnc - this.encZero
      // low-pass filtered speed estimate (the firmware differentiates the quantised counts)
      this.encVelF += ((encDeg - this.encPrev) / h - this.encVelF) * Math.min(1, h * 25)
      const encVel = this.encVelF
      this.encPrev = encDeg
      this.encDeg = encDeg
  
      // ---------------------------------------------------------- Arduino firmware
      this.firmware(h, inputs, r1, r2, hallRed, encDeg, encVel, rawEnc)
  
      // ---------------------------------------------------------- mechanism DC motor (H-bridge) physics
      let u = this.pwmMech / 255
      if (this.mode === 'ESTOP') u = 0
      if (inputs.estop) {
        this.motor.omega *= Math.exp(-h * 10) // brake
      } else {
        this.motor.omega += ((MOTOR.wmax * u - this.motor.omega) / MOTOR.tau) * h
      }
      this.motor.phi += this.motor.omega * h
      const lo = rad(redLimit - STOP_MARGIN)
      const hi = rad(blueLimit + STOP_MARGIN)
      if (this.motor.phi < lo) {
        this.motor.phi = lo
        this.motor.omega = Math.max(0, this.motor.omega)
      } else if (this.motor.phi > hi) {
        this.motor.phi = hi
        this.motor.omega = Math.min(0, this.motor.omega)
      }
      this.pose = solveMech(this.motor.phi)
    }

    // ---------------------------------------------------------- pieces: belt friction drive, counting, housekeeping
    const kz = 1 - Math.exp(-dt * 60)
    const kx = Math.exp(-dt * 2.5)
    for (const p of list) {
      const t = p.body.translation()
      const v = p.body.linvel()
      const onBelt =
        Math.abs(t.x) < BELT.halfW &&
        t.z > -BELT.halfLen &&
        t.z < BELT.halfLen &&
        t.y > BELT.top - 0.01 &&
        t.y < BELT.top + 0.1 &&
        Math.abs(v.y) < 0.6
      if (onBelt) {
        p.body.setLinvel({ x: v.x * kx, y: v.y, z: v.z + (this.belt.speed - v.z) * kz }, true)
      }
      const bin = binAt(t.x, t.y, t.z)
      if (bin && !p.counted) {
        p.counted = true
        p.bin = bin.id
        this.counts[bin.id]++
        events.push({ type: 'count', bin: bin.id, id: p.id })
      }
      if (!bin && t.y < 0.12) {
        p.floorT += dt
        if (p.floorT > 6) events.push({ type: 'remove', id: p.id })
      } else {
        p.floorT = 0
      }
      if (t.y < -1) events.push({ type: 'remove', id: p.id })
    }
    return events
  }

  private updateSensor(s: SensorState, r: { present: boolean; value: number }, dt: number) {
    s.analog = r.value
    const wasPresent = s.presence
    s.presence = r.value > PRESENCE_THR
    if (s.presence) s.ledHold = 0.25
    else s.ledHold = Math.max(0, s.ledHold - dt)
    s.led = s.presence || s.ledHold > 0
    const rising = s.presence && !wasPresent
    const falling = !s.presence && wasPresent
    if (rising) s.peak = r.value
    else if (s.presence) s.peak = Math.max(s.peak, r.value)
    return { rising, falling }
  }

  private firmware(
    dt: number,
    inputs: Inputs,
    r1: { present: boolean; value: number },
    r2: { present: boolean; value: number },
    hallRed: boolean,
    enc: number,
    encVel: number,
    rawEnc: number,
  ) {
    // E-STOP: all outputs de-energised, resume => re-home.
    if (inputs.estop) {
      if (this.mode !== 'ESTOP') {
        this.mode = 'ESTOP'
        this.queue = []
        this.homed = false
      }
      this.pwmMech = 0
      this.mechDir = 0
      this.updateSensor(this.s1, r1, dt)
      this.updateSensor(this.s2, r2, dt)
      return
    }
    if (this.mode === 'ESTOP') {
      this.mode = 'HOMING'
    }

    // Edge detection on S1 / S2 (cascade: S1 -> RED?, S2 -> GREEN?, else BLUE)
    const e1 = this.updateSensor(this.s1, r1, dt)
    const e2 = this.updateSensor(this.s2, r2, dt)
    if (e1.falling) {
      this.isRed = this.s1.peak > COLOR_THR
      this.isGreen = false
      const entry: Entry = { state: this.isRed ? 'RED' : 'PENDING', passedS2: false, dist: 0 }
      if (this.isRed) this.lastDecision = 'RED'
      this.queue.push(entry)
    }
    if (e2.falling) {
      const green = this.s2.peak > COLOR_THR
      const entry = this.queue.find((q) => !q.passedS2)
      if (entry) {
        entry.passedS2 = true
        if (entry.state === 'PENDING') {
          this.isGreen = green
          entry.state = green ? 'GREEN' : 'BLUE'
          this.lastDecision = entry.state
        }
      } else {
        // piece placed downstream of S1: classify with S2 only
        this.isGreen = green
        const st: SortState = green ? 'GREEN' : this.s2.peak > PRESENCE_THR ? 'BLUE' : 'GREEN'
        this.queue.push({ state: st, passedS2: true, dist: SENSOR_SPACING })
        this.lastDecision = st
      }
    }

    // Distance travelled from the encoder of the belt motor (tach feedback)
    const vMeas = this.belt.speed * (1 + (this.rnd() - 0.5) * 0.01)
    for (const q of this.queue) q.dist += vMeas * dt

    // Homing on the Hall (RED limit)
    if (this.mode === 'HOMING') {
      if (hallRed) {
        this.encZero = rawEnc - (deg(PHI_RED) + HALL_WIN)
        this.encPrev = enc
        this.homed = true
        this.mode = 'RUN'
        this.target = 'GREEN'
        this.pwmMech = 0
        this.mechDir = 0
      } else {
        this.pwmMech = -70
        this.mechDir = -1
      }
      return
    }

    // Queue management: front piece sets the deflector target when it is approaching
    while (this.queue.length && this.queue[0].dist >= CLEAR_DIST) this.queue.shift()
    const front = this.queue[0]
    if (front && front.state !== 'PENDING' && front.dist >= APPROACH_DIST) {
      this.target = front.state
      this.idleT = 0
    } else if (!front) {
      this.idleT += dt
      if (this.idleT > 1.2) this.target = 'GREEN'
    }

    // PD position control on the encoder, output PWM + direction pins
    const tgtDeg = deg(STATE_PHI[this.target])
    const err = rad(tgtDeg - enc)
    let uCmd = 0
    if (Math.abs(tgtDeg - enc) > MOTOR.deadband) {
      uCmd = MOTOR.kp * err - MOTOR.kd * rad(encVel)
    } else {
      uCmd = -MOTOR.kd * rad(encVel)
    }
    uCmd = Math.max(-1, Math.min(1, uCmd))
    this.pwmMech = Math.round(uCmd * 255)
    this.mechDir = this.pwmMech > 0 ? 1 : this.pwmMech < 0 ? -1 : 0
  }
}
