import { useRef } from 'react'
import { useBeforePhysicsStep } from '@react-three/rapier'
import { runtime, useSim } from '../sim/store'

export function SimController() {
  const uiTimer = useRef(0)
  const prevPrimary = useRef('-')
  const prevVerify = useRef('-')
  const prevState = useRef(runtime.engine.state)

  useBeforePhysicsStep((world) => {
    const dt = world.timestep || 1 / 120
    const st = useSim.getState()
    const eng = runtime.engine

    // Auto-dispatch queued sequence pieces spaced by belt travel when machine is in RUN
    if (
      runtime.seqQueue.length > 0 &&
      !st.estop &&
      eng.state === 'RUN' &&
      eng.belt.speed > 0.08 &&
      eng.belt.offset - runtime.lastSpawnOffset >= 0.88
    ) {
      const next = runtime.seqQueue.shift()!
      runtime.lastSpawnOffset = eng.belt.offset
      st.spawn(next.color, next.shape)
    }

    const events = eng.step(
      dt,
      {
        estop: st.estop,
        btnUp: st.btnUp,
        btnDown: st.btnDown,
      },
      runtime.bodies.values(),
    )

    if (eng.state !== prevState.current) {
      prevState.current = eng.state
      st.pushLog(`[FSM] State -> ${eng.state}`)
    }

    if (eng.primary !== prevPrimary.current && eng.primary !== '-') {
      prevPrimary.current = eng.primary
      const [fR, fG, fB] = eng.tcsFreq
      st.pushLog(
        `[TCS3200] R=${Math.round(fR)} G=${Math.round(fG)} B=${Math.round(fB)} Hz -> ${eng.primary}`,
      )
    }

    if (eng.verifyVerdict !== prevVerify.current && eng.verifyVerdict !== '-') {
      prevVerify.current = eng.verifyVerdict
      st.pushLog(
        `[VERIFY D3] Pin D3=${eng.verifyHigh ? 'HIGH' : 'LOW'} -> ${eng.verifyVerdict} (${
          eng.verifyVerdict === 'GREEN' ? 'Bridge FLAT _' : 'Bridge LIFT 65°'
        })`,
      )
    }

    const toRemove: number[] = []
    for (const ev of events) {
      if (ev.type === 'count') {
        st.pushLog(
          `[BIN] Piece #${ev.id} -> ${
            ev.bin === 'anomaly' ? 'NOVEDADES / ANOMALY' : ev.bin.toUpperCase()
          } BIN`,
        )
      } else if (ev.type === 'remove') {
        toRemove.push(ev.id)
      }
    }
    if (toRemove.length > 0) {
      st.removePieces(toRemove)
    }

    uiTimer.current += dt
    if (uiTimer.current >= 0.065) {
      uiTimer.current = 0
      st.setTelemetry(eng.snapshot())
    }
  })

  return null
}
