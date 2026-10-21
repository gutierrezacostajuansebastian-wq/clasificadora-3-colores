import type { PieceColor, PieceShape } from '../sim/layout'
import { useSim, type CamPreset, type ShapeMode } from '../sim/store'

export function ControlDock() {
  const counts = useSim((s) => s.counts)
  const beltRun = useSim((s) => s.beltRun)
  const beltSpeed = useSim((s) => s.beltSpeed)
  const estop = useSim((s) => s.estop)
  const camera = useSim((s) => s.camera)
  const shapeMode = useSim((s) => s.shapeMode)
  const placeSpec = useSim((s) => s.placeSpec)
  const telemetry = useSim((s) => s.telemetry)
  const log = useSim((s) => s.log)

  const spawn = useSim((s) => s.spawn)
  const spawnRandomSequence = useSim((s) => s.spawnRandomSequence)
  const clearBelt = useSim((s) => s.clearBelt)
  const emptyBins = useSim((s) => s.emptyBins)
  const resetCounters = useSim((s) => s.resetCounters)
  const toggleEstop = useSim((s) => s.toggleEstop)
  const setBeltRun = useSim((s) => s.setBeltRun)
  const setBeltSpeed = useSim((s) => s.setBeltSpeed)
  const setCamera = useSim((s) => s.setCamera)
  const setShapeMode = useSim((s) => s.setShapeMode)
  const setPlaceSpec = useSim((s) => s.setPlaceSpec)

  const p3 = (n: number) => String(Math.min(999, n)).padStart(3, '0')
  const total = counts.red + counts.green + counts.blue
  const lcdRow1 = `R:${p3(counts.red)}  G:${p3(counts.green)}  B:${p3(counts.blue)}`
  const lcdRow2 = estop
    ? '!! E-STOP ACTIVE !!'
    : `TOTAL COUNT: ${String(Math.min(9999, total)).padStart(4, '0')}`

  const resolvedShape = (): PieceShape =>
    shapeMode === 'mixed' ? (Math.random() < 0.5 ? 'cube' : 'cylinder') : shapeMode

  const togglePlace = (color: PieceColor) => {
    const sh: PieceShape = shapeMode === 'cylinder' ? 'cylinder' : 'cube'
    if (placeSpec && placeSpec.color === color) {
      setPlaceSpec(null)
    } else {
      setPlaceSpec({ color, shape: sh })
    }
  }

  return (
    <>
      {/* Top Header Bar */}
      <div className="pointer-events-none fixed top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-900/90 px-4 py-2 shadow-xl backdrop-blur-md">
          <div className="flex h-3 w-3 items-center justify-center">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                estop
                  ? 'animate-ping bg-red-500'
                  : beltRun
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-amber-400'
              }`}
            />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wider text-slate-100 uppercase">
              3-Way Color Sorting Conveyor · 4-Bar Linkage Deflector
            </h1>
            <p className="text-[11px] text-slate-400">
              Arduino UNO Controller · Cascade IR Sorters (S1/S2) · Rapier 3D RigidBody Physics
            </p>
          </div>
        </div>

        {/* Camera Presets Bar */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 p-1.5 shadow-xl backdrop-blur-md">
          {(
            [
              ['top', 'Preset 1 · Top-Down (Planta)'],
              ['follow', 'Preset 2 · Cinematic Tracking'],
              ['orbit', 'Preset 3 · Free Orbit'],
            ] as [CamPreset, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setCamera(id)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                camera === id
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Left Floating Dock: Spawner, Conveyor, Simulation Controls */}
      <aside className="dock-scroll pointer-events-auto fixed top-20 bottom-3 left-3 z-20 flex w-80 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-2xl backdrop-blur-md">
        {/* Live Virtual 16x2 Alphanumeric LCD Display */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              LCD 1602 (I2C · A4/A5)
            </span>
            <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-700/50">
              0x27 LIVE
            </span>
          </div>
          <div
            className={`lcd-font rounded-lg border-2 p-2.5 shadow-inner ${
              estop
                ? 'border-red-700 bg-red-950/90 text-amber-200'
                : 'border-emerald-700/80 bg-[#183a17] text-[#b8ff6b]'
            }`}
          >
            <div className="text-sm font-bold tracking-widest whitespace-pre">{lcdRow1}</div>
            <div className="mt-0.5 text-sm font-bold tracking-widest whitespace-pre">{lcdRow2}</div>
          </div>
        </section>

        {/* Manual Piece Spawner Panel */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Manual Piece Spawner
            </span>
            <div className="flex rounded-md border border-slate-700 bg-slate-950 p-0.5 text-[10px]">
              {(['cube', 'cylinder', 'mixed'] as ShapeMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setShapeMode(m)}
                  className={`cursor-pointer rounded px-1.5 py-0.5 capitalize ${
                    shapeMode === m ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => spawn('red', resolvedShape())}
              className="cursor-pointer rounded-lg border border-red-500/60 bg-red-600/90 px-2 py-2 text-xs font-bold text-white shadow hover:bg-red-500 active:scale-95 transition"
            >
              + Red
              <div className="text-[10px] font-normal opacity-85">Cube/Cyl</div>
            </button>
            <button
              onClick={() => spawn('green', resolvedShape())}
              className="cursor-pointer rounded-lg border border-emerald-500/60 bg-emerald-600/90 px-2 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 active:scale-95 transition"
            >
              + Green
              <div className="text-[10px] font-normal opacity-85">Cube/Cyl</div>
            </button>
            <button
              onClick={() => spawn('blue', resolvedShape())}
              className="cursor-pointer rounded-lg border border-blue-500/60 bg-blue-600/90 px-2 py-2 text-xs font-bold text-white shadow hover:bg-blue-500 active:scale-95 transition"
            >
              + Blue
              <div className="text-[10px] font-normal opacity-85">Cube/Cyl</div>
            </button>
          </div>

          <button
            onClick={() => spawnRandomSequence(6)}
            className="mt-2 w-full cursor-pointer rounded-lg border border-indigo-400/50 bg-indigo-600/90 px-3 py-2 text-xs font-bold text-white shadow hover:bg-indigo-500 active:scale-98 transition"
          >
            Spawn Random Sequence (6 pcs)
          </button>

          {/* Click-to-Place on Infeed Zone */}
          <div className="mt-2.5 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>Click-to-Place on Infeed (-Z):</span>
              {placeSpec && (
                <button
                  onClick={() => setPlaceSpec(null)}
                  className="cursor-pointer text-[10px] text-amber-400 underline"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(['red', 'green', 'blue'] as PieceColor[]).map((c) => {
                const active = placeSpec?.color === c
                return (
                  <button
                    key={c}
                    onClick={() => togglePlace(c)}
                    className={`cursor-pointer rounded px-2 py-1 text-[11px] font-semibold capitalize border transition ${
                      active
                        ? 'border-amber-300 bg-amber-500/20 text-amber-200'
                        : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Place {c}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* Conveyor Belt Controls */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Conveyor Drive (PWM D5/D6)
            </span>
            <span className="font-mono text-xs text-sky-300">
              v = {telemetry.beltSpeed.toFixed(2)} m/s
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBeltRun(!beltRun)}
              disabled={estop}
              className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-bold transition ${
                beltRun && !estop
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              } disabled:opacity-40`}
            >
              {beltRun && !estop ? 'PAUSE BELT' : 'START BELT'}
            </button>
          </div>

          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Linear Speed Setpoint</span>
              <span className="font-mono text-slate-200">{beltSpeed.toFixed(2)} m/s</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={beltSpeed}
              onChange={(e) => setBeltSpeed( parseFloat(e.target.value) )}
              className="mt-1 w-full accent-sky-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0.10 m/s</span>
              <span>0.35 m/s (nom)</span>
              <span>1.00 m/s</span>
            </div>
          </div>
        </section>

        {/* Simulation & Safety Controls */}
        <section className="border-t border-slate-800 pt-2.5">
          <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Simulation & Safety
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <button
              onClick={resetCounters}
              className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              Reset LCD
            </button>
            <button
              onClick={clearBelt}
              className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              Clear Belt
            </button>
            <button
              onClick={emptyBins}
              className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              Empty Bins
            </button>
          </div>

          <button
            onClick={toggleEstop}
            className={`mt-2 w-full cursor-pointer rounded-xl border-2 px-3 py-2.5 text-xs font-extrabold tracking-wider uppercase shadow-lg transition ${
              estop
                ? 'border-yellow-300 bg-red-600 text-white animate-pulse'
                : 'border-red-500/80 bg-red-950/80 text-red-200 hover:bg-red-800'
            }`}
          >
            {estop ? 'E-STOP ENGAGED (CLICK TO RELEASE)' : 'EMERGENCY STOP (E-STOP)'}
          </button>
        </section>
      </aside>

      {/* Right Floating Dock: Optical Cascade & 4-Bar Linkage + Arduino UNO Telemetry */}
      <aside className="dock-scroll pointer-events-auto fixed top-20 bottom-3 right-3 z-20 flex w-80 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-2xl backdrop-blur-md">
        {/* Optical Sensing Station (S1 & S2 Cascade Logic) */}
        <section>
          <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Optical Sensing Station (Cascade IR)
          </span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">S1 (Pin A0)</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    telemetry.led1 ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-slate-700'
                  }`}
                />
              </div>
              <div className="mt-1 font-mono text-xs text-slate-300">ADC: {telemetry.s1}</div>
              <div className="text-[10px] text-slate-400">
                isRed: <b className="text-red-400">{String(telemetry.isRed)}</b>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">S2 (Pin A1)</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    telemetry.led2 ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-700'
                  }`}
                />
              </div>
              <div className="mt-1 font-mono text-xs text-slate-300">ADC: {telemetry.s2}</div>
              <div className="text-[10px] text-slate-400">
                isGreen: <b className="text-emerald-400">{String(telemetry.isGreen)}</b>
              </div>
            </div>
          </div>
          <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-[11px] text-slate-300">
            Cascade Logic:{' '}
            <span className="font-mono text-xs font-bold text-sky-300">
              {telemetry.lastDecision === 'BLUE'
                ? 'Exhaustion (!Red & !Green) -> BLUE'
                : `Matched -> ${telemetry.lastDecision}`}
            </span>
          </div>
        </section>

        {/* 4-Bar Linkage & Deflector Kinematics */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              4-Bar Linkage & Deflector
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
              {telemetry.mode}
            </span>
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
            {(
              [
                ['RED', '/ Left (-X)', 'border-red-500/70 bg-red-950/60 text-red-300'],
                ['GREEN', '| Center (+Z)', 'border-emerald-500/70 bg-emerald-950/60 text-emerald-300'],
                ['BLUE', '\\ Right (+X)', 'border-blue-500/70 bg-blue-950/60 text-blue-300'],
              ] as const
            ).map(([st, desc, cls]) => (
              <div
                key={st}
                className={`rounded-lg border p-1.5 ${
                  telemetry.target === st ? cls : 'border-slate-800 bg-slate-950/50 text-slate-500'
                }`}
              >
                <div className="text-xs font-extrabold">{st}</div>
                <div className="text-[10px] font-mono">{desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-300">
            <div className="rounded bg-slate-950/80 px-2 py-1 border border-slate-800">
              Coupler α: <span className="text-amber-300">{telemetry.alphaDeg}°</span>
            </div>
            <div className="rounded bg-slate-950/80 px-2 py-1 border border-slate-800">
              Crank θ: <span className="text-sky-300">{telemetry.encDeg}°</span>
            </div>
            <div className="rounded bg-slate-950/80 px-2 py-1 border border-slate-800">
              Hall D2 (R):{' '}
              <span className={telemetry.hallRed ? 'text-red-400 font-bold' : 'text-slate-500'}>
                {telemetry.hallRed ? 'HIGH' : 'LOW'}
              </span>
            </div>
            <div className="rounded bg-slate-950/80 px-2 py-1 border border-slate-800">
              Hall D3 (B):{' '}
              <span className={telemetry.hallBlue ? 'text-blue-400 font-bold' : 'text-slate-500'}>
                {telemetry.hallBlue ? 'HIGH' : 'LOW'}
              </span>
            </div>
            <div className="rounded bg-slate-950/80 px-2 py-1 border border-slate-800">
              PWM D5/D6: <span className="text-emerald-300">{telemetry.pwmD5}</span>
            </div>
            <div className="rounded bg-slate-950/80 px-2 py-1 border border-slate-800">
              H-Bridge M2: <span className="text-amber-300">{telemetry.pwmMech}</span>
            </div>
          </div>
        </section>

        {/* Serial Monitor / Event Log */}
        <section className="flex flex-1 flex-col border-t border-slate-800 pt-2.5 min-h-[120px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Arduino Serial Log (115200 baud)
            </span>
            <span className="font-mono text-[10px] text-slate-500">Queue: {telemetry.queue}</span>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] text-slate-300 space-y-0.5">
            {log.map((line, idx) => (
              <div key={idx} className="leading-tight">
                {line}
              </div>
            ))}
          </div>
        </section>
      </aside>
    </>
  )
}
