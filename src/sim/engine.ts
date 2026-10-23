/**
 * Framework-free simulation core (Arduino Mega 2560 firmware model):
 *  - belt DC motor with encoder (slotted disc, 20 slots) + PI speed regulation, debounced SPEED UP/DOWN buttons
 *  - TCS3200 primary colour sensor (S0..S3 / OUT frequency ratios) -> RED / BLUE / PASS
 *  - dual parallel steering paddles driven by a DC gearmotor, 3 Hall sensors (`//`, `||`, `\\`)
 *  - secondary verification sensor (HIGH only for GREEN) + lift bridge DC motor with 2 Hall sensors
 *  - CNC-style homing routine, E-STOP interlock, RESET (only while E-STOP is active), PPM throughput
 * Stepped from the physics loop at a fixed dt, and unit-testable headless.
 */
import { BELT, BRIDGE, HOOD, HOOD2, PADDLE, PIECE_RGB, binAt, type BinId, type PieceColor } from './layout'
import { deg, rad, solveMech, type SteerPose } from './mechanism'

export type MachineState = 'IDLE' | 'HOMING_STEER' | 'HOMING_BRIDGE' | 'RUN' | 'ESTOP'
export type SteerTarget = 'LEFT' | 'CENTER' | 'RIGHT'
export type PrimaryClass = 'RED' | 'BLUE' | 'PASS'

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
  bin: BinId | null
  floorT: number
}

export interface Inputs {
  estop: boolean // mushroom pushed (latched)
  btnUp: boolean // SPEED UP held
  btnDown: boolean // SPEED DOWN held
}

export type SimEvent = { type: 'count'; bin: BinId; id: number } | { type: 'remove'; id: number }

export interface Telemetry {
  state: MachineState
  tcs: { s0: boolean; s1: boolean; s2: boolean; s3: boolean; out: boolean; fR: number; fG: number; fB: number; present: boolean }
  primary: PrimaryClass | '-'
  verify: { d3: boolean; present: boolean; verdict: 'GREEN' | 'ANOMALY' | '-' }
  hall: boolean[]
  hallCount: number[]
  steerDeg: number
  steerTarget: SteerTarget
  bridgeDeg: number
  bridgeTarget: 'FLAT' | 'LIFT'
  queue1: number
  queue2: number
  pwmBelt: number
  pwmSteer: number
  pwmBridge: number
  setpoint: number
  speed: number
  vMeas: number
  tachPulses: number
  ppm: number
  ppmAvg: number
  bounceRejected: number
  btnAccepted: number
  counts: { red: number; green: number; blue: number; anomaly: number }
  total: number
  homedSteer: boolean
  homedBridge: boolean
}

// ------------------------------------------------------------------ constants
export const SPEED_MIN = 0.15
export const SPEED_MAX = 0.75
export const SPEED_STEP = 0.05
const ENC_SLOTS = 20
const PULSE_DIST = (2 * Math.PI * BELT.rollerR) / ENC_SLOTS
const HALL_WIN = 2 // deg
const STEER_MOTOR = { wmax: 5.0, tau: 0.1, kp: 2.9, kd: 0.2, deadband: 0.4 }
const BRIDGE_MOTOR = { wmax: 4.0, tau: 0.1, kp: 3.6, kd: 0.25, deadband: 0.4 }
const STEER_STOP = 50 // deg, mechanical hard stop
const BRIDGE_STOP_LO = -3
const BRIDGE_STOP_HI = BRIDGE.liftDeg + 3
const PI_KP = 60
const PI_KI = 120
const PWM_FF_GAIN = 1.15 // m/s at 255 (free running)
const PWM_DEADZONE = 0.04 // m/s lost to friction
const RAMP = 0.5 // m/s^2 set-point ramp when the belt starts
const DEBOUNCE_T = 0.02
const SUB = 4

const REF1 = HOOD.z + HOOD.winHalfZ // piece centre when its trailing edge leaves the TCS3200 window
const REF2 = HOOD2.z + HOOD2.winHalfZ
const NOSE_NEUTRAL = PADDLE.zc - PADDLE.halfLen
const TAIL_NEUTRAL = PADDLE.zc + PADDLE.halfLen
const CLEAR1 = TAIL_NEUTRAL + 0.03 - REF1
const BRIDGE_RELEASE = 1.58 - REF2 // piece centre already dropped past the belt end
const BRIDGE_CLEAR = BRIDGE.hingeZ + 0.03 - REF2

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Entry1 {
  cls: PrimaryClass
  dist: number
}
interface Entry2 {
  anomaly: boolean
  dist: number
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

interface Motor {
  x: number
  omega: number
}

export class Engine {
  rnd = mulberry32(1234)
  simTime = 0
  state: MachineState = 'IDLE'

  // ---- conveyor / encoder / speed regulation
  belt = { speed: 0, offset: 0 }
  pwmBelt = 0
  setpoint = 0.35
  private rampSet = 0
  private integ = 0
  vMeas = 0
  tachPulses = 0
  private lastPulseT = 0

  // ---- steering motor (power-up position is arbitrary, firmware must home on Hall 2)
  private initSteer = rad(8)
  steer: Motor = { x: rad(8), omega: 0 }
  pwmSteer = 0
  private steerZero = 0
  private steerEnc = 0
  private steerEncPrev = 0
  private steerVel = 0
  private steerDir: -1 | 1 = 1
  homedSteer = false
  steerTarget: SteerTarget = 'CENTER'
  pose: SteerPose = solveMech(rad(8))

  // ---- lift bridge motor
  private initBridge = rad(28)
  bridge: Motor = { x: rad(28), omega: 0 }
  pwmBridge = 0
  private bridgeZero = 0
  private bridgeEnc = 0
  private bridgeEncPrev = 0
  private bridgeVel = 0
  homedBridge = false
  bridgeTarget: 'FLAT' | 'LIFT' = 'FLAT'

  // ---- Hall sensors 1..5
  hall: boolean[] = [false, false, false, false, false]
  hallCount = [0, 0, 0, 0, 0]

  // ---- primary TCS3200
  tcsPresent = false
  private tcsAcc = [0, 0, 0] // R, B, G filter
  private tcsN = [0, 0, 0]
  private filterIdx = 0
  tcsFreq = [0, 0, 0] // R, G, B (display order)
  primary: PrimaryClass | '-' = '-'
  queue1: Entry1[] = []

  // ---- secondary verification sensor
  verifyPresent = false
  verifyHigh = false
  private sawHigh = false
  verifyVerdict: 'GREEN' | 'ANOMALY' | '-' = '-'
  queue2: Entry2[] = []

  // ---- buttons (debounce)
  private rawUp = false
  private rawDown = false
  private stableUp = false
  private stableDown = false
  private lastRawUp = false
  private lastRawDown = false
  private rawChangeUp = 0
  private rawChangeDown = 0
  private prevInUp = false
  private prevInDown = false
  private bounceUpUntil = 0
  private bounceDownUntil = 0
  bounceRejected = 0
  btnAccepted = 0

  private startReq = false
  private resetReq = false
  private idleT = 0

  counts = { red: 0, green: 0, blue: 0, anomaly: 0 }
  private sortTimes: number[] = []
  private runTime = 0

  get total() {
    return this.counts.red + this.counts.green + this.counts.blue + this.counts.anomaly
  }

  /** START switch (ignored while E-STOP is engaged). */
  pressStart() {
    this.startReq = true
  }

  /** RESET button: only effective while E-STOP is active, zeroes the counters. */
  pressReset() {
    this.resetReq = true
  }

  resetCounters() {
    this.counts = { red: 0, green: 0, blue: 0, anomaly: 0 }
    this.sortTimes = []
    this.runTime = 0
  }

  clearQueues() {
    this.queue1 = []
    this.queue2 = []
  }

  get ppm(): number {
    const win = Math.min(60, this.runTime)
    if (win < 3) return 0
    const n = this.sortTimes.filter((t) => this.simTime - t <= 60).length
    return (n / win) * 60
  }

  get ppmAvg(): number {
    if (this.runTime < 3) return 0
    return (this.total / this.runTime) * 60
  }

  snapshot(): Telemetry {
    const f = this.tcsFreq
    return {
      state: this.state,
      tcs: {
        s0: true,
        s1: false, // 20 % output scaling
        s2: this.filterIdx === 2,
        s3: this.filterIdx !== 0,
        out: this.tcsPresent,
        fR: Math.round(f[0]),
        fG: Math.round(f[1]),
        fB: Math.round(f[2]),
        present: this.tcsPresent,
      },
      primary: this.primary,
      verify: { d3: this.verifyHigh, present: this.verifyPresent, verdict: this.verifyVerdict },
      hall: [...this.hall],
      hallCount: [...this.hallCount],
      steerDeg: Number(deg(this.steer.x).toFixed(1)),
      steerTarget: this.steerTarget,
      bridgeDeg: Number(deg(this.bridge.x).toFixed(1)),
      bridgeTarget: this.bridgeTarget,
      queue1: this.queue1.length,
      queue2: this.queue2.length,
      pwmBelt: Math.round(this.pwmBelt),
      pwmSteer: this.pwmSteer,
      pwmBridge: this.pwmBridge,
      setpoint: this.setpoint,
      speed: Number(this.belt.speed.toFixed(3)),
      vMeas: Number(this.vMeas.toFixed(3)),
      tachPulses: this.tachPulses,
      ppm: Number(this.ppm.toFixed(1)),
      ppmAvg: Number(this.ppmAvg.toFixed(1)),
      bounceRejected: this.bounceRejected,
      btnAccepted: this.btnAccepted,
      counts: { ...this.counts },
      total: this.total,
      homedSteer: this.homedSteer,
      homedBridge: this.homedBridge,
    }
  }

  private findInWindow(list: SimPiece[], z: number): SimPiece | null {
    for (const p of list) {
      const t = p.body.translation()
      if (t.y < BELT.top + 0.002 || t.y > BELT.top + 0.05) continue
      if (Math.abs(t.x) < HOOD.winHalfX && Math.abs(t.z - z) < HOOD.winHalfZ) return p
    }
    return null
  }

  // ------------------------------------------------------------------ button debounce
  private debounceButtons(inputs: Inputs) {
    const t = this.simTime
    // contact bounce: for 30 ms after each real press/release the raw pin flutters
    if (inputs.btnUp !== this.prevInUp) {
      this.bounceUpUntil = t + 0.03
      this.prevInUp = inputs.btnUp
    }
    if (inputs.btnDown !== this.prevInDown) {
      this.bounceDownUntil = t + 0.03
      this.prevInDown = inputs.btnDown
    }
    this.rawUp = t < this.bounceUpUntil ? this.rnd() < 0.5 : inputs.btnUp
    this.rawDown = t < this.bounceDownUntil ? this.rnd() < 0.5 : inputs.btnDown

    const handle = (raw: boolean, last: boolean, changeT: number, stable: boolean) => {
      let rising = false
      if (raw !== last) {
        // every raw edge restarts the debounce timer; edges that never settle are counted as rejected flutter
        if (t - changeT < DEBOUNCE_T) this.bounceRejected++
        changeT = t
        last = raw
      }
      if (t - changeT >= DEBOUNCE_T && raw !== stable) {
        stable = raw
        rising = raw
      }
      return { last, changeT, stable, rising }
    }
    const u = handle(this.rawUp, this.lastRawUp, this.rawChangeUp, this.stableUp)
    this.lastRawUp = u.last
    this.rawChangeUp = u.changeT
    this.stableUp = u.stable
    const d = handle(this.rawDown, this.lastRawDown, this.rawChangeDown, this.stableDown)
    this.lastRawDown = d.last
    this.rawChangeDown = d.changeT
    this.stableDown = d.stable
    if (this.state !== 'ESTOP') {
      if (u.rising) {
        this.setpoint = clamp(Number((this.setpoint + SPEED_STEP).toFixed(2)), SPEED_MIN, SPEED_MAX)
        this.btnAccepted++
      }
      if (d.rising) {
        this.setpoint = clamp(Number((this.setpoint - SPEED_STEP).toFixed(2)), SPEED_MIN, SPEED_MAX)
        this.btnAccepted++
      }
    }
  }

  // ------------------------------------------------------------------ main step
  step(dt: number, inputs: Inputs, pieces: Iterable<SimPiece>): SimEvent[] {
    this.simTime += dt
    const events: SimEvent[] = []
    const list = Array.from(pieces)

    // ---- machine state: E-STOP interlock, START, RESET
    if (inputs.estop) {
      if (this.state !== 'ESTOP') {
        this.state = 'ESTOP'
        this.clearQueues()
        this.homedSteer = false
        this.homedBridge = false
        this.integ = 0
        this.rampSet = 0
      }
    } else if (this.state === 'ESTOP') {
      this.state = 'IDLE' // mushroom twisted open: machine stays locked until START
    }
    if (this.startReq) {
      this.startReq = false
      if (this.state === 'IDLE') {
        this.state = 'HOMING_STEER'
        this.homedSteer = false
        this.homedBridge = false
        this.steerDir = 1
        this.clearQueues()
      }
    }
    if (this.resetReq) {
      this.resetReq = false
      if (this.state === 'ESTOP') this.resetCounters()
    }
    if (this.state === 'RUN') this.runTime += dt

    this.debounceButtons(inputs)

    // ---- conveyor DC motor: PI speed regulation on the encoder speed, driver PWM D5 / direction D6, D7
    const run = this.state === 'RUN'
    if (run) {
      this.rampSet += clamp(this.setpoint - this.rampSet, -RAMP * dt, RAMP * dt)
      const err = this.rampSet - this.vMeas
      this.integ = clamp(this.integ + err * PI_KI * dt, -80, 80)
      const ff = ((this.rampSet + PWM_DEADZONE) / PWM_FF_GAIN) * 255
      this.pwmBelt = clamp(this.rampSet > 0.001 ? ff + PI_KP * err + this.integ : 0, 0, 255)
    } else {
      this.pwmBelt = 0
      this.integ = 0
      this.rampSet = 0
    }
    const vTarget = this.pwmBelt > 0 ? Math.max(0, (PWM_FF_GAIN * this.pwmBelt) / 255 - PWM_DEADZONE) : 0
    const tau = this.state === 'ESTOP' ? 0.08 : 0.3
    this.belt.speed += (vTarget - this.belt.speed) * (1 - Math.exp(-dt / tau))
    if (this.belt.speed < 1e-4 && vTarget === 0) this.belt.speed = 0
    this.belt.offset += this.belt.speed * dt

    // ---- optical speed encoder (interrupt D14): period measurement between slot edges
    const nPulse = Math.floor(this.belt.offset / PULSE_DIST)
    if (nPulse > this.tachPulses) {
      const dtp = Math.max(1e-4, this.simTime - this.lastPulseT)
      this.vMeas += (PULSE_DIST / dtp - this.vMeas) * 0.5
      this.lastPulseT = this.simTime
      this.tachPulses = nPulse
    }
    if (this.simTime - this.lastPulseT > 0.35) this.vMeas *= Math.exp(-dt * 8)
    if (this.vMeas < 0.003) this.vMeas = 0

    // ---- primary station: TCS3200 (S0=H,S1=L -> 20 %), filter cycled R -> B -> G through S2/S3
    const p1 = this.findInWindow(list, HOOD.z)
    const wasPresent1 = this.tcsPresent
    this.tcsPresent = !!p1
    if (p1) {
      this.filterIdx = (this.filterIdx + 1) % 3
      const [r, g, b] = PIECE_RGB[p1.color]
      const chan = [r, b, g][this.filterIdx]
      const f = (400 + 9000 * chan) * (1 + (this.rnd() - 0.5) * 0.06)
      this.tcsAcc[this.filterIdx] += f
      this.tcsN[this.filterIdx]++
      const map = [0, 2, 1] // filter index -> [R,G,B] slot
      this.tcsFreq[map[this.filterIdx]] = f
    }
    if (!this.tcsPresent && wasPresent1) {
      const fr = this.tcsAcc[0] / Math.max(1, this.tcsN[0])
      const fb = this.tcsAcc[1] / Math.max(1, this.tcsN[1])
      const fg = this.tcsAcc[2] / Math.max(1, this.tcsN[2])
      this.tcsAcc = [0, 0, 0]
      this.tcsN = [0, 0, 0]
      this.tcsFreq = [fr, fg, fb]
      let cls: PrimaryClass = 'PASS'
      if (fr / fg > 2 && fr / fb > 2) cls = 'RED'
      else if (fb / fr > 2 && fb / fg > 1.5) cls = 'BLUE'
      this.primary = cls
      if (this.state !== 'ESTOP') this.queue1.push({ cls, dist: 0 })
    }

    // ---- secondary station: verification sensor, D3 HIGH only for GREEN
    const p2 = this.findInWindow(list, HOOD2.z)
    const wasPresent2 = this.verifyPresent
    this.verifyPresent = !!p2
    this.verifyHigh = false
    if (p2) {
      const [r, g, b] = PIECE_RGB[p2.color]
      const nz = () => 1 + (this.rnd() - 0.5) * 0.06
      const fR = (400 + 9000 * r) * nz()
      const fG = (400 + 9000 * g) * nz()
      const fB = (400 + 9000 * b) * nz()
      this.verifyHigh = fG / fR > 2 && fG / fB > 1.5
      if (this.verifyHigh) this.sawHigh = true
    }
    if (!this.verifyPresent && wasPresent2) {
      const green = this.sawHigh
      this.sawHigh = false
      this.verifyVerdict = green ? 'GREEN' : 'ANOMALY'
      if (this.state !== 'ESTOP') this.queue2.push({ anomaly: !green, dist: 0 })
    }

    // ---- fast loop (firmware + motors + Hall + encoders) at 4x the physics rate
    const h = dt / SUB
    for (let sub = 0; sub < SUB; sub++) this.fastLoop(h)

    // ---- pieces: belt friction drive, counting, housekeeping
    const kz = 1 - Math.exp(-dt * 60)
    const kx = Math.exp(-dt * 2.5)
    const bridgeFlat = deg(this.bridge.x) < 6
    for (const p of list) {
      const t = p.body.translation()
      const v = p.body.linvel()
      const onRamp = t.z >= BELT.halfLen
      const onBelt =
        Math.abs(t.x) < (onRamp ? BRIDGE.halfW - 0.01 : BELT.halfW) &&
        t.z > -BELT.halfLen &&
        t.z < (bridgeFlat ? BRIDGE.hingeZ : BELT.halfLen) &&
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
        this.sortTimes.push(this.simTime)
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

  // ------------------------------------------------------------------ fast loop
  private pd(
    targetDeg: number,
    encDeg: number,
    velDegS: number,
    m: { kp: number; kd: number; deadband: number },
  ): number {
    const err = rad(targetDeg - encDeg)
    let u = -m.kd * rad(velDegS)
    if (Math.abs(targetDeg - encDeg) > m.deadband) u += m.kp * err
    return clamp(u, -1, 1)
  }

  private fastLoop(h: number) {
    const estop = this.state === 'ESTOP'

    // Hall sensors (digital inputs on the interrupt-capable pins D18, D19, D20, D21, D4)
    const sDeg = deg(this.steer.x)
    const bDeg = deg(this.bridge.x)
    const halls = [
      Math.abs(sDeg + PADDLE.sortDeg) <= HALL_WIN,
      Math.abs(sDeg) <= HALL_WIN,
      Math.abs(sDeg - PADDLE.sortDeg) <= HALL_WIN,
      bDeg <= HALL_WIN,
      bDeg >= BRIDGE.liftDeg - HALL_WIN,
    ]
    halls.forEach((v, i) => {
      if (v && !this.hall[i]) this.hallCount[i]++
      this.hall[i] = v
    })

    // incremental encoders (0.5 deg resolution) with low-pass speed estimates
    const rawS = Math.round((sDeg - deg(this.initSteer)) / 0.5) * 0.5
    this.steerEnc = rawS - this.steerZero
    this.steerVel += ((this.steerEnc - this.steerEncPrev) / h - this.steerVel) * Math.min(1, h * 25)
    this.steerEncPrev = this.steerEnc
    const rawB = Math.round((bDeg - deg(this.initBridge)) / 0.5) * 0.5
    this.bridgeEnc = rawB - this.bridgeZero
    this.bridgeVel += ((this.bridgeEnc - this.bridgeEncPrev) / h - this.bridgeVel) * Math.min(1, h * 25)
    this.bridgeEncPrev = this.bridgeEnc

    // ---------------------------------------------------------- firmware
    if (estop || this.state === 'IDLE') {
      this.pwmSteer = 0
      this.pwmBridge = 0
    } else if (this.state === 'HOMING_STEER') {
      // pan back and forth between the limit Halls until the centre Hall (`||`) triggers
      this.pwmBridge = 0
      if (this.hall[1]) {
        this.steerZero = rawS - (this.steerDir < 0 ? HALL_WIN : -HALL_WIN)
        this.steerEncPrev = rawS - this.steerZero
        this.homedSteer = true
        this.state = 'HOMING_BRIDGE'
        this.pwmSteer = 0
      } else {
        if (this.steerDir > 0 && this.hall[2]) this.steerDir = -1
        else if (this.steerDir < 0 && this.hall[0]) this.steerDir = 1
        this.pwmSteer = this.steerDir * 70
      }
    } else {
      // steering holds the centre (or the queued target) with a PD on the encoder
      this.updateSteerTarget(h)
      const tgt = this.steerTarget === 'LEFT' ? -PADDLE.sortDeg : this.steerTarget === 'RIGHT' ? PADDLE.sortDeg : 0
      this.pwmSteer = Math.round(this.pd(tgt, this.steerEnc, this.steerVel, STEER_MOTOR) * 255)

      if (this.state === 'HOMING_BRIDGE') {
        // lower the bridge until the flat Hall (`_`) triggers
        if (this.hall[3]) {
          this.bridgeZero = rawB - HALL_WIN
          this.bridgeEncPrev = rawB - this.bridgeZero
          this.homedBridge = true
          this.state = 'RUN'
          this.pwmBridge = 0
        } else {
          this.pwmBridge = -75
        }
      } else {
        this.updateBridgeTarget(h)
        const tb = this.bridgeTarget === 'LIFT' ? BRIDGE.liftDeg : 0
        this.pwmBridge = Math.round(this.pd(tb, this.bridgeEnc, this.bridgeVel, BRIDGE_MOTOR) * 255)
      }
    }

    // ---------------------------------------------------------- DC motor physics (H-bridge, direction pins from sign)
    const integrate = (m: Motor, pwm: number, mp: { wmax: number; tau: number }, lo: number, hi: number) => {
      if (estop) m.omega *= Math.exp(-h * 10)
      else m.omega += ((mp.wmax * (pwm / 255) - m.omega) / mp.tau) * h
      m.x += m.omega * h
      if (m.x < lo) {
        m.x = lo
        m.omega = Math.max(0, m.omega)
      } else if (m.x > hi) {
        m.x = hi
        m.omega = Math.min(0, m.omega)
      }
    }
    integrate(this.steer, this.pwmSteer, STEER_MOTOR, rad(-STEER_STOP), rad(STEER_STOP))
    integrate(this.bridge, this.pwmBridge, BRIDGE_MOTOR, rad(BRIDGE_STOP_LO), rad(BRIDGE_STOP_HI))
    this.pose = solveMech(this.steer.x)
  }

  /** Steering queue: dynamic lead = time the paddles need to swing, converted to belt distance. */
  private updateSteerTarget(h: number) {
    const v = this.vMeas
    for (const q of this.queue1) q.dist += v * h
    while (this.queue1.length && this.queue1[0].dist >= CLEAR1) this.queue1.shift()
    const front = this.queue1[0]
    const approach = Math.max(0, NOSE_NEUTRAL - 0.02 - REF1 - (v * 0.45 + 0.02))
    if (front && front.dist >= approach) {
      this.steerTarget = front.cls === 'RED' ? 'LEFT' : front.cls === 'BLUE' ? 'RIGHT' : 'CENTER'
      this.idleT = 0
    } else if (!front) {
      this.idleT += h
      if (this.idleT > 1.2) this.steerTarget = 'CENTER'
    }
  }

  private updateBridgeTarget(h: number) {
    const v = this.vMeas
    for (const q of this.queue2) q.dist += v * h
    while (this.queue2.length) {
      const q = this.queue2[0]
      if (q.dist >= (q.anomaly ? BRIDGE_RELEASE : BRIDGE_CLEAR)) this.queue2.shift()
      else break
    }
    const front = this.queue2[0]
    const approach = Math.max(0, BELT.halfLen - 0.018 - REF2 - (v * 0.55 + 0.03))
    this.bridgeTarget = front && front.anomaly && front.dist >= approach ? 'LIFT' : 'FLAT'
  }
}
