import { useRef } from 'react'
import { useBeforePhysicsStep } from '@react-three/rapier'
import { deg } from '../sim/mechanism'
import { runtime, useSim } from '../sim/store'

export function SimController() {
  const uiTimer = useRef(0)
  const prevDecision = useRef('-')

  useBeforePhysicsStep((world) => {
    const dt = world.timestep || 1 / 120
    const st = useSim.getState()
    const eng = runtime.engine

    // Auto-dispatch queued random sequence pieces spaced by belt travel
    if (
      runtime.seqQueue.length > 0 &&
      st.beltRun &&
      !st.estop &&
      eng.mode === 'RUN' &&
      eng.belt.offset - runtime.lastSpawnOffset >= 0.98
    ) {
      const next = runtime.seqQueue.shift()!
      runtime.lastSpawnOffset = eng.belt.offset
      st.spawn(next.color, next.shape)
    }

    const events = eng.step(
      dt,
      {
        beltRun: st.beltRun,
        beltSetpoint: st.beltSpeed,
        estop: st.estop,
      },
      runtime.bodies.values(),
    )

    if (eng.lastDecision !== prevDecision.current && eng.lastDecision !== '-') {
      prevDecision.current = eng.lastDecision
      st.pushLog(
        `[S1/S2] isRed=${eng.isRed ? 1 : 0} isGreen=${eng.isGreen ? 1 : 0} -> ${eng.lastDecision}`,
      )
    }

    const toRemove: number[] = []
    for (const ev of events) {
      if (ev.type === 'count') {
        st.setCounts({ ...eng.counts })
        st.pushLog(`[BIN] Piece #${ev.id} sorted -> ${ev.bin.toUpperCase()} BIN`)
      } else if (ev.type === 'remove') {
        toRemove.push(ev.id)
      }
    }
    if (toRemove.length > 0) {
      st.removePieces(toRemove)
    }

    uiTimer.current += dt
    if (uiTimer.current >= 0.07) {
      uiTimer.current = 0
      st.setTelemetry({
        s1: Math.round(eng.s1.analog),
        s2: Math.round(eng.s2.analog),
        led1: eng.s1.led,
        led2: eng.s2.led,
        isRed: eng.isRed,
        isGreen: eng.isGreen,
        target: eng.target,
        lastDecision: eng.lastDecision,
        mode: eng.mode,
        queue: eng.queue.length,
        pwmD5: eng.pwmConvD5,
        pwmD6: eng.pwmConvD6,
        pwmMech: eng.pwmMech,
        mechDir: eng.mechDir,
        hallRed: eng.hall.red,
        hallBlue: eng.hall.blue,
        hallCountRed: eng.hallCountRed,
        hallCountBlue: eng.hallCountBlue,
        encDeg: Number(eng.encDeg.toFixed(1)),
        alphaDeg: Number(deg(eng.pose.alpha).toFixed(1)),
        beltSpeed: Number(eng.belt.speed.toFixed(2)),
        homed: eng.homed,
      })
    }
  })

  return null
}
