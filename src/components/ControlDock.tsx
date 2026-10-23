import type { PieceColor, PieceShape } from '../sim/layout'
import { HALL_NAMES, PINS } from '../sim/pins'
import { lcdLines, useSim, type CamPreset, type ShapeMode } from '../sim/store'

export function ControlDock() {
  const estop = useSim((s) => s.estop)
  const btnUp = useSim((s) => s.btnUp)
  const btnDown = useSim((s) => s.btnDown)
  const camera = useSim((s) => s.camera)
  const shapeMode = useSim((s) => s.shapeMode)
  const placeSpec = useSim((s) => s.placeSpec)
  const xray = useSim((s) => s.xray)
  const telemetry = useSim((s) => s.telemetry)
  const log = useSim((s) => s.log)

  const spawn = useSim((s) => s.spawn)
  const spawnRandomSequence = useSim((s) => s.spawnRandomSequence)
  const clearBelt = useSim((s) => s.clearBelt)
  const emptyBins = useSim((s) => s.emptyBins)
  const pressStart = useSim((s) => s.pressStart)
  const pressReset = useSim((s) => s.pressReset)
  const toggleEstop = useSim((s) => s.toggleEstop)
  const setButton = useSim((s) => s.setButton)
  const setCamera = useSim((s) => s.setCamera)
  const setShapeMode = useSim((s) => s.setShapeMode)
  const setPlaceSpec = useSim((s) => s.setPlaceSpec)
  const setXray = useSim((s) => s.setXray)

  const counts = telemetry.counts
  const [rawRow1, rawRow2] = lcdLines(counts)
  const lcdRow1 = rawRow1
  const lcdRow2 = estop
    ? '!! E-STOP ACT !!'
    : telemetry.state === 'HOMING_STEER'
      ? 'HOMING STEER || '
      : telemetry.state === 'HOMING_BRIDGE'
        ? 'HOMING BRIDGE _ '
        : rawRow2

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
                  : telemetry.state === 'RUN'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-amber-400'
              }`}
            />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wider text-slate-100 uppercase">
              Mechatronic Color Sorter · Parallel Steering & Lift-Bridge
            </h1>
            <p className="text-[11px] text-slate-400">
              Arduino Mega 2560 · TCS3200 (≤37 mm) · 5x Hall Sensors · Optical Tachometer (D14)
            </p>
          </div>
        </div>

        {/* Shroud X-Ray & Camera Presets Bar */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/90 p-1.5 shadow-xl backdrop-blur-md">
          <button
            onClick={() => setXray(!xray)}
            className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold transition border ${
              xray
                ? 'border-amber-400/80 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle translucent cutaway on the matte-black sensor shrouds"
          >
            {xray ? 'Shroud: X-Ray' : 'Shroud: Opaque'}
          </button>
          {(
            [
              ['top', 'Preset 1 · Top-Down'],
              ['follow', 'Preset 2 · Follow Piece'],
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

      {/* Left Floating Dock: LCD, Safety & Homing, Tachometer & Speed, Spawner */}
      <aside className="dock-scroll pointer-events-auto fixed top-20 bottom-3 left-3 z-20 flex w-84 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-2xl backdrop-blur-md">
        {/* Live Virtual 16x2 Alphanumeric LCD Display */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              LCD 1602 (Mega D40–D45)
            </span>
            <span className="rounded border border-emerald-700/50 bg-emerald-950 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
              {telemetry.state}
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
          <div className="mt-1.5 grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
            <div className="rounded bg-red-950/60 border border-red-800/50 py-0.5 text-red-300">
              R: {counts.red}
            </div>
            <div className="rounded bg-emerald-950/60 border border-emerald-800/50 py-0.5 text-emerald-300">
              G: {counts.green}
            </div>
            <div className="rounded bg-blue-950/60 border border-blue-800/50 py-0.5 text-blue-300">
              B: {counts.blue}
            </div>
            <div className="rounded bg-amber-950/60 border border-amber-800/50 py-0.5 text-amber-300">
              NOV: {counts.anomaly}
            </div>
          </div>
        </section>

        {/* Safety Interlocks, E-Stop & CNC Homing Routine */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Safety Interlocks & CNC Homing
            </span>
            <span className="font-mono text-[10px] text-slate-400">D32 · D33 · D34</span>
          </div>

          <button
            onClick={toggleEstop}
            className={`w-full cursor-pointer rounded-xl border-2 px-3 py-2 text-xs font-extrabold tracking-wider uppercase shadow-lg transition ${
              estop
                ? 'border-yellow-300 bg-red-600 text-white animate-pulse'
                : 'border-red-500/80 bg-red-950/80 text-red-200 hover:bg-red-800'
            }`}
          >
            {estop
              ? 'E-STOP ACTIVE · D34 (TWIST TO RELEASE)'
              : 'EMERGENCY STOP · D34 (MUSHROOM)'}
          </button>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              onClick={pressStart}
              disabled={estop || telemetry.state !== 'IDLE'}
              className="cursor-pointer rounded-lg border border-emerald-500/60 bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              START + HOME (D32)
            </button>
            <button
              onClick={pressReset}
              disabled={!estop}
              title="Only enabled while E-Stop is active"
              className="cursor-pointer rounded-lg border border-amber-500/60 bg-amber-600 px-2.5 py-2 text-xs font-bold text-slate-950 shadow hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-35 transition"
            >
              RESET LCD (D33)
            </button>
          </div>

          {/* CNC Homing Sequence Status */}
          <div className="mt-1.5 grid grid-cols-2 gap-1 font-mono text-[10px]">
            <div
              className={`rounded border px-2 py-1 ${
                telemetry.homedSteer
                  ? 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-500'
              }`}
            >
              1. Steer || (H2): {telemetry.homedSteer ? 'HOMED' : 'UNHOMED'}
            </div>
            <div
              className={`rounded border px-2 py-1 ${
                telemetry.homedBridge
                  ? 'border-emerald-700/60 bg-emerald-950/50 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-500'
              }`}
            >
              2. Bridge _ (H4): {telemetry.homedBridge ? 'HOMED' : 'UNHOMED'}
            </div>
          </div>
        </section>

        {/* Optical Speed Tachometer & Debounced Pushbuttons */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Tachometer (D14) & Speed Control
            </span>
            <span className="font-mono text-xs text-sky-300">
              v = {telemetry.vMeas.toFixed(2)} m/s
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onPointerDown={() => setButton('down', true)}
              onPointerUp={() => setButton('down', false)}
              onPointerLeave={() => setButton('down', false)}
              className={`cursor-pointer rounded-lg border px-2.5 py-2 text-xs font-bold transition ${
                btnDown
                  ? 'border-sky-300 bg-sky-500 text-slate-950'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              ▼ SPEED DOWN (D31)
              <div className="text-[10px] font-normal opacity-80">-0.05 m/s (min 0.15)</div>
            </button>
            <button
              onPointerDown={() => setButton('up', true)}
              onPointerUp={() => setButton('up', false)}
              onPointerLeave={() => setButton('up', false)}
              className={`cursor-pointer rounded-lg border px-2.5 py-2 text-xs font-bold transition ${
                btnUp
                  ? 'border-sky-300 bg-sky-500 text-slate-950'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              ▲ SPEED UP (D30)
              <div className="text-[10px] font-normal opacity-80">+0.05 m/s (max 0.75)</div>
            </button>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1 font-mono text-[10px] text-slate-300">
            <div className="rounded border border-slate-800 bg-slate-950/80 px-2 py-1">
              Setpoint: <span className="text-sky-300">{telemetry.setpoint.toFixed(2)} m/s</span>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/80 px-2 py-1">
              Throughput: <span className="text-emerald-300">{telemetry.ppm.toFixed(1)} PPM</span>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/80 px-2 py-1">
              Tacho D14: <span className="text-amber-300">{telemetry.tachPulses} pulses</span>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/80 px-2 py-1">
              Debounce: <span className="text-slate-400">ok {telemetry.btnAccepted} / rej {telemetry.bounceRejected}</span>
            </div>
          </div>
        </section>

        {/* Manual Workpiece Spawner */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Workpiece Spawner
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

          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => spawn('red', resolvedShape())}
              className="cursor-pointer rounded-lg border border-red-500/60 bg-red-600/90 px-1.5 py-2 text-xs font-bold text-white shadow hover:bg-red-500 active:scale-95 transition"
            >
              + Red
              <div className="text-[9px] font-normal opacity-85">Left //</div>
            </button>
            <button
              onClick={() => spawn('green', resolvedShape())}
              className="cursor-pointer rounded-lg border border-emerald-500/60 bg-emerald-600/90 px-1.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 active:scale-95 transition"
            >
              + Green
              <div className="text-[9px] font-normal opacity-85">Pass _</div>
            </button>
            <button
              onClick={() => spawn('blue', resolvedShape())}
              className="cursor-pointer rounded-lg border border-blue-500/60 bg-blue-600/90 px-1.5 py-2 text-xs font-bold text-white shadow hover:bg-blue-500 active:scale-95 transition"
            >
              + Blue
              <div className="text-[9px] font-normal opacity-85">Right \\</div>
            </button>
            <button
              onClick={() => spawn('yellow', resolvedShape())}
              className="cursor-pointer rounded-lg border border-amber-400/70 bg-amber-500/90 px-1.5 py-2 text-xs font-bold text-slate-950 shadow hover:bg-amber-400 active:scale-95 transition"
              title="Off-color / defect piece: passes center corridor and triggers Lift-Bridge drop into Novedades Bin"
            >
              + Defect
              <div className="text-[9px] font-semibold opacity-85">Novedad</div>
            </button>
          </div>

          <button
            onClick={() => spawnRandomSequence(7)}
            className="mt-2 w-full cursor-pointer rounded-lg border border-indigo-400/50 bg-indigo-600/90 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-indigo-500 transition"
          >
            Spawn Random Batch (7 pcs incl. Anomalies)
          </button>

          {/* Click-to-Place on Infeed Zone */}
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
            <div className="flex items-center justify-between text-[10px] text-slate-300">
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
            <div className="mt-1 grid grid-cols-4 gap-1">
              {(['red', 'green', 'blue', 'yellow'] as PieceColor[]).map((c) => {
                const active = placeSpec?.color === c
                return (
                  <button
                    key={c}
                    onClick={() => togglePlace(c)}
                    className={`cursor-pointer rounded px-1.5 py-1 text-[10px] font-semibold capitalize border transition ${
                      active
                        ? 'border-amber-300 bg-amber-500/20 text-amber-200'
                        : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {c === 'yellow' ? 'Defect' : c}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
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
        </section>
      </aside>

      {/* Right Floating Dock: TCS3200, Dual Steering, Lift-Bridge, 5x Hall Sensors & Serial Log */}
      <aside className="dock-scroll pointer-events-auto fixed top-20 bottom-3 right-3 z-20 flex w-84 flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3.5 shadow-2xl backdrop-blur-md">
        {/* 1. Primary Sensing Housing: TCS3200 RGB Color Sensor */}
        <section>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              1. Primary TCS3200 (D22–D25, D2)
            </span>
            <span className="font-mono text-[10px] text-emerald-300">h = 37 mm · Shrouded</span>
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
            <div className="rounded border border-red-900/60 bg-slate-950/90 p-1.5">
              <div className="text-[10px] text-red-400">f_RED</div>
              <div className="font-bold text-slate-100">
                {(telemetry.tcs.fR / 1000).toFixed(1)} kHz
              </div>
            </div>
            <div className="rounded border border-emerald-900/60 bg-slate-950/90 p-1.5">
              <div className="text-[10px] text-emerald-400">f_GREEN</div>
              <div className="font-bold text-slate-100">
                {(telemetry.tcs.fG / 1000).toFixed(1)} kHz
              </div>
            </div>
            <div className="rounded border border-blue-900/60 bg-slate-950/90 p-1.5">
              <div className="text-[10px] text-blue-400">f_BLUE</div>
              <div className="font-bold text-slate-100">
                {(telemetry.tcs.fB / 1000).toFixed(1)} kHz
              </div>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 text-[11px]">
            <span className="font-mono text-[10px] text-slate-400">
              S0={Number(telemetry.tcs.s0)} S1={Number(telemetry.tcs.s1)} S2={Number(telemetry.tcs.s2)}{' '}
              S3={Number(telemetry.tcs.s3)}
            </span>
            <span className="font-mono text-xs font-bold text-sky-300">
              Class: {telemetry.primary}
            </span>
          </div>
        </section>

        {/* 2. Dual-Paddle Parallel Steering & Hall 1-3 */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              2. Dual Parallel Steering (M2 · D8–D10)
            </span>
            <span className="font-mono text-xs text-amber-300">α = {telemetry.steerDeg}°</span>
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
            {(
              [
                ['LEFT', '// Red (-X)', 'border-red-500/70 bg-red-950/60 text-red-300'],
                ['CENTER', '|| Bypass', 'border-emerald-500/70 bg-emerald-950/60 text-emerald-300'],
                ['RIGHT', '\\\\ Blue (+X)', 'border-blue-500/70 bg-blue-950/60 text-blue-300'],
              ] as const
            ).map(([st, desc, cls]) => (
              <div
                key={st}
                className={`rounded-lg border p-1.5 ${
                  telemetry.steerTarget === st
                    ? cls
                    : 'border-slate-800 bg-slate-950/50 text-slate-500'
                }`}
              >
                <div className="text-xs font-extrabold">{st}</div>
                <div className="text-[10px] font-mono">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Secondary Optical Station & Lift-Bridge Sorter ("Puente Levadizo") */}
        <section className="border-t border-slate-800 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              3. Verify (D3) & Lift-Bridge (M3)
            </span>
            <span className="font-mono text-xs text-pink-300">β = {telemetry.bridgeDeg}°</span>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">2nd Sensor (D3)</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    telemetry.verify.d3
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : telemetry.verify.present
                        ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                        : 'bg-slate-700'
                  }`}
                />
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Pin D3:{' '}
                <b className={telemetry.verify.d3 ? 'text-emerald-400' : 'text-amber-300'}>
                  {telemetry.verify.d3 ? 'HIGH (GREEN)' : 'LOW'}
                </b>
              </div>
              <div className="text-[10px] text-slate-400">
                Verdict: <b className="text-slate-200">{telemetry.verify.verdict}</b>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="text-slate-300">Puente Levadizo</div>
              <div className="mt-1 text-[10px] text-slate-400">
                State:{' '}
                <b
                  className={
                    telemetry.bridgeTarget === 'FLAT' ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {telemetry.bridgeTarget === 'FLAT' ? 'FLAT (_) -> GREEN' : 'LIFT (65°) -> DROP'}
                </b>
              </div>
              <div className="text-[10px] text-slate-400">
                PWM D11: <b className="text-slate-200">{telemetry.pwmBridge}</b>
              </div>
            </div>
          </div>
        </section>

        {/* 5x Hall Effect Sensors Array (H1..H5) */}
        <section className="border-t border-slate-800 pt-2.5">
          <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            5x Hall Effect Sensor Array
          </span>
          <div className="mt-1.5 grid grid-cols-5 gap-1 text-center font-mono text-[9px]">
            {HALL_NAMES.map((name, i) => {
              const active = telemetry.hall[i]
              const pin = PINS.hall[i]
              return (
                <div
                  key={name}
                  title={name}
                  className={`rounded border p-1 ${
                    active
                      ? 'border-emerald-400 bg-emerald-950/80 text-emerald-200 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                      : 'border-slate-800 bg-slate-950/60 text-slate-500'
                  }`}
                >
                  <div className="font-bold">H{i + 1}</div>
                  <div>D{pin}</div>
                  <div className="mt-0.5 text-[8px]">{active ? 'ON' : 'OFF'}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Serial Monitor / Event Log */}
        <section className="flex min-h-[115px] flex-1 flex-col border-t border-slate-800 pt-2.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Mega 2560 Serial (115200)
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              Q1:{telemetry.queue1} · Q2:{telemetry.queue2}
            </span>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[10.5px] text-slate-300">
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
