import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BELT, BRIDGE, HOOD, HOOD2, PADDLE } from '../sim/layout'
import { lcdLines, useSim } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { mats } from './materials'

interface WireSpec {
  id: string
  color: string
  radius?: number
  points: [number, number, number][]
  label?: { text: string; pos: [number, number, number] }
}

function WireTube({
  points,
  color,
  radius = 0.0042,
}: {
  points: [number, number, number][]
  color: string
  radius?: number
}) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    return new THREE.TubeGeometry(curve, 36, radius, 8, false)
  }, [points, radius])

  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.1} />
    </mesh>
  )
}

export function ElectricalCabinet() {
  const telemetry = useSim((s) => s.telemetry)
  const estop = useSim((s) => s.estop)
  const btnUp = useSim((s) => s.btnUp)
  const btnDown = useSim((s) => s.btnDown)
  const pressStart = useSim((s) => s.pressStart)
  const pressReset = useSim((s) => s.pressReset)
  const toggleEstop = useSim((s) => s.toggleEstop)
  const setButton = useSim((s) => s.setButton)

  const counts = telemetry.counts
  const state = telemetry.state

  // Dynamic 16x2 LCD1602 CanvasTexture rendered in 3D on the operator console
  const { lcdCanvas, lcdTex } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 160
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { lcdCanvas: c, lcdTex: tex }
  }, [])

  useEffect(() => {
    const ctx = lcdCanvas.getContext('2d')!
    ctx.fillStyle = estop ? '#581212' : '#1b4319'
    ctx.fillRect(0, 0, 512, 160)
    ctx.strokeStyle = '#0d260c'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, 504, 152)

    // Character cell matrix background
    ctx.fillStyle = estop ? 'rgba(120,25,25,0.45)' : 'rgba(42,95,38,0.45)'
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        ctx.fillRect(18 + col * 30, 22 + row * 64, 26, 52)
      }
    }

    const [row1, row2] = lcdLines(counts)
    const line1 = row1
    const line2 = estop
      ? '!! E-STOP ACT !!'
      : state === 'HOMING_STEER'
        ? 'HOMING STEER || '
        : state === 'HOMING_BRIDGE'
          ? 'HOMING BRIDGE _ '
          : row2

    ctx.font = 'bold 39px "Consolas", "Courier New", monospace'
    ctx.fillStyle = estop ? '#ffdf70' : '#b8ff6b'
    ctx.textBaseline = 'top'
    ctx.fillText(line1, 18, 26)
    ctx.fillText(line2, 18, 90)
    lcdTex.needsUpdate = true
  }, [counts, estop, state, lcdCanvas, lcdTex])

  // Cabinet world coordinates (mounted on left side of conveyor at z = -0.68 m)
  const cabX = -0.72
  const cabZ = -0.68
  const megaPos: [number, number, number] = [cabX + 0.045, 0.73, cabZ - 0.06]
  const drv1Pos: [number, number, number] = [cabX + 0.045, 0.76, cabZ + 0.11]
  const drv2Pos: [number, number, number] = [cabX + 0.045, 0.65, cabZ + 0.11]
  const consolePos: [number, number, number] = [cabX + 0.05, 1.02, cabZ]

  const zr = BELT.halfLen - BELT.rollerR
  const yr = BELT.top - BELT.rollerR

  const wires = useMemo<WireSpec[]>(
    () => [
      // 1. Conveyor DC Motor M1 <- Driver 1 <- Mega D5 (PWM), D6 (IN1), D7 (IN2)
      {
        id: 'm1-drv',
        color: '#e63946',
        points: [
          drv1Pos,
          [cabX + 0.14, 0.7, cabZ + 0.11],
          [-0.44, 0.66, -1.12],
          [-0.35, yr, -zr],
        ],
        label: { text: 'M1 Belt · D5(PWM),D6,D7', pos: [-0.46, 0.62, -1.12] },
      },
      // 2. Optical Speed Tachometer -> D14
      {
        id: 'tacho-d14',
        color: '#38bdf8',
        points: [
          megaPos,
          [-0.44, 0.68, -1.2],
          [0.0, 0.64, -zr - 0.04],
          [BELT.halfW + 0.075, yr + 0.042, -zr],
        ],
        label: { text: 'Tacho Disc -> D14', pos: [0.18, 0.61, -zr - 0.05] },
      },
      // 3. Primary Color Sensor (TCS3200) -> D22(S0), D23(S1), D24(S2), D25(S3), D2(OUT)
      {
        id: 'tcs3200-bus',
        color: '#facc15',
        points: [
          megaPos,
          [-0.46, 0.8, -0.58],
          [-0.25, 0.88, HOOD.z],
          [0, HOOD.topY + 0.01, HOOD.z],
        ],
        label: { text: 'TCS3200 -> D22..D25, D2(OUT)', pos: [-0.38, 0.92, HOOD.z] },
      },
      // 4. Dual-Paddle Steering Motor M2 (D8,D9,D10) & Hall 1-3 (D18,D19,D20)
      {
        id: 'steer-m2',
        color: '#fb923c',
        points: [
          drv1Pos,
          [-0.46, 0.78, -0.25],
          [-0.3, 1.0, PADDLE.zc],
          [-PADDLE.pivotX, 1.08, PADDLE.zc],
        ],
      },
      {
        id: 'hall-123',
        color: '#a855f7',
        points: [
          megaPos,
          [-0.48, 0.8, -0.28],
          [-0.32, 1.02, PADDLE.zc + 0.02],
          [-PADDLE.pivotX, 1.04, PADDLE.zc + 0.02],
        ],
        label: { text: 'M2 (D8..D10) + Hall H1..H3 (D18..D20)', pos: [-0.42, 0.94, -0.14] },
      },
      // 5. Secondary Verification Sensor (D3)
      {
        id: 'verify-d3',
        color: '#22c55e',
        points: [
          megaPos,
          [-0.45, 0.74, 0.35],
          [-0.3, 0.84, HOOD2.z],
          [0, HOOD2.topY + 0.01, HOOD2.z],
        ],
        label: { text: '2nd Verify -> D3', pos: [-0.38, 0.89, HOOD2.z] },
      },
      // 6. Lift-Bridge Motor M3 (D11,D12,D13) & Hall 4-5 (D21,D4)
      {
        id: 'bridge-m3-h45',
        color: '#ec4899',
        points: [
          drv2Pos,
          [-0.44, 0.68, 0.85],
          [-0.3, 0.74, BRIDGE.hingeZ],
          [-0.25, BELT.top + 0.02, BRIDGE.hingeZ],
        ],
        label: {
          text: 'Bridge M3 (D11..D13) + H4/H5 (D21,D4)',
          pos: [-0.42, 0.78, 1.48],
        },
      },
      // 7. Operator Console Pushbuttons (D30..D34) & LCD 1602 (D40..D45)
      {
        id: 'console-bus',
        color: '#60a5fa',
        points: [
          megaPos,
          [cabX + 0.08, 0.88, cabZ - 0.02],
          [consolePos[0], consolePos[1] - 0.06, consolePos[2]],
        ],
        label: {
          text: 'Btns D30..D34 · LCD D40..D45',
          pos: [cabX + 0.16, 0.9, cabZ - 0.1],
        },
      },
    ],
    [cabX, cabZ, consolePos, drv1Pos, drv2Pos, megaPos, yr, zr],
  )

  return (
    <group>
      {/* Pedestal Stand & Extrusion Post for Control Enclosure */}
      <Extrusion axis="y" length={0.74} size={0.045} position={[cabX, 0.37, cabZ]} />
      <mesh position={[cabX, 0.012, cabZ]} material={mats.steel} castShadow>
        <boxGeometry args={[0.26, 0.024, 0.32]} />
      </mesh>

      {/* Industrial Control Enclosure Box */}
      <group position={[cabX, 0.72, cabZ]}>
        {/* Main steel cabinet shell */}
        <mesh position={[-0.02, 0, 0]} material={mats.paintGray} castShadow receiveShadow>
          <boxGeometry args={[0.11, 0.32, 0.42]} />
        </mesh>
        {/* Internal mounting backplate */}
        <mesh position={[0.036, 0, 0]} material={mats.backplate}>
          <boxGeometry args={[0.006, 0.29, 0.39]} />
        </mesh>
        {/* Clear hinged inspection cover */}
        <mesh position={[0.078, 0, 0]} material={mats.acrylic}>
          <boxGeometry args={[0.006, 0.31, 0.41]} />
        </mesh>

        {/* Arduino Mega 2560 Rev3 Board (Elongated Blue PCB + ATmega2560 + 54 Digital / 16 Analog Pins) */}
        <group position={[0.045, 0.01, -0.065]}>
          <mesh material={mats.pcbBlue} castShadow>
            <boxGeometry args={[0.012, 0.115, 0.195]} />
          </mesh>
          {/* USB-B port */}
          <mesh position={[0.009, 0.038, -0.082]} material={mats.steel}>
            <boxGeometry args={[0.016, 0.022, 0.026]} />
          </mesh>
          {/* DC Barrel Jack */}
          <mesh position={[0.009, -0.036, -0.082]} material={mats.blackPlastic}>
            <boxGeometry args={[0.016, 0.02, 0.026]} />
          </mesh>
          {/* ATmega2560 TQFP-100 Square Microcontroller IC */}
          <mesh position={[0.008, 0.0, -0.01]} material={mats.blackPlastic}>
            <boxGeometry args={[0.008, 0.028, 0.028]} />
          </mesh>
          {/* Top header rails: PWM D2..D13 + Comm D14..D21 */}
          <mesh position={[0.009, 0.048, -0.005]} material={mats.blackPlastic}>
            <boxGeometry args={[0.012, 0.008, 0.145]} />
          </mesh>
          {/* Bottom header rails: Power + Analog A0..A15 */}
          <mesh position={[0.009, -0.048, -0.005]} material={mats.blackPlastic}>
            <boxGeometry args={[0.012, 0.008, 0.145]} />
          </mesh>
          {/* Extended 36-pin Dual-Row Digital Header (D22..D53) on right edge (+Z) */}
          <mesh position={[0.009, 0, 0.086]} material={mats.blackPlastic}>
            <boxGeometry args={[0.012, 0.098, 0.014]} />
          </mesh>
          <Label text="ARDUINO MEGA 2560" position={[0.042, 0.082, 0]} height={0.024} />
        </group>

        {/* Dual H-Bridge Motor Driver #1 (M1 Conveyor & M2 Steering) */}
        <group position={[0.045, 0.055, 0.115]}>
          <mesh material={mats.pcbRed} castShadow>
            <boxGeometry args={[0.012, 0.082, 0.085]} />
          </mesh>
          <mesh position={[0.016, 0, 0]} material={mats.aluDark} castShadow>
            <boxGeometry args={[0.024, 0.04, 0.045]} />
          </mesh>
          <Label text="DRV1 (M1·D5-7 / M2·D8-10)" position={[0.042, 0.055, 0]} height={0.019} />
        </group>

        {/* H-Bridge Motor Driver #2 (M3 Lift-Bridge Actuator) */}
        <group position={[0.045, -0.06, 0.115]}>
          <mesh material={mats.pcbRed} castShadow>
            <boxGeometry args={[0.012, 0.075, 0.085]} />
          </mesh>
          <mesh position={[0.016, 0, 0]} material={mats.aluDark} castShadow>
            <boxGeometry args={[0.024, 0.036, 0.042]} />
          </mesh>
          <Label text="DRV2 (M3 Bridge·D11-13)" position={[0.042, -0.055, 0]} height={0.019} />
        </group>
      </group>

      {/* Operator Console Turret: Live 16x2 LCD + Physical 3D Interactive Pushbuttons */}
      <group position={consolePos} rotation={[0, 0.32, 0]}>
        {/* Sloped metallic operator console housing */}
        <mesh position={[-0.02, 0, 0]} material={mats.aluDark} castShadow receiveShadow>
          <boxGeometry args={[0.055, 0.22, 0.36]} />
        </mesh>

        {/* LCD1602 Bezel & Backlit Screen (Top Half of Console) */}
        <mesh position={[0.009, 0.045, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.25, 0.088]} />
          <meshBasicMaterial map={lcdTex} toneMapped={false} />
        </mesh>
        <Label text="LCD 1602 (D40..D45)" position={[0, 0.13, 0]} height={0.022} />

        {/* Physical 3D Interactive Pushbuttons Row (Bottom Half of Console) */}
        {/* 1. Twist-to-Release Mushroom E-STOP (D34) */}
        <group
          position={[0.012, -0.055, -0.125]}
          onClick={(e) => {
            e.stopPropagation()
            toggleEstop()
          }}
        >
          {/* Yellow Safety Collar */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.safetyYellow}>
            <cylinderGeometry args={[0.026, 0.026, 0.012, 24]} />
          </mesh>
          {/* Red Mushroom Cap (depresses and rotates when latched) */}
          <mesh
            position={[estop ? 0.008 : 0.018, 0, 0]}
            rotation={[estop ? 0.45 : 0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.022, 0.016, 0.018, 24]} />
            <meshStandardMaterial
              color="#dc2626"
              emissive={estop ? '#ef4444' : '#000000'}
              emissiveIntensity={estop ? 0.8 : 0}
              roughness={0.3}
            />
          </mesh>
        </group>

        {/* 2. START Switch (D32) */}
        <group
          position={[0.012, -0.055, -0.055]}
          onClick={(e) => {
            e.stopPropagation()
            pressStart()
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.steel}>
            <cylinderGeometry args={[0.016, 0.016, 0.01, 20]} />
          </mesh>
          <mesh position={[0.01, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.012, 20]} />
            <meshStandardMaterial
              color="#16a34a"
              emissive={!estop && state !== 'IDLE' ? '#22c55e' : '#000000'}
              emissiveIntensity={!estop && state !== 'IDLE' ? 0.9 : 0}
            />
          </mesh>
        </group>

        {/* 3. RESET Pushbutton (D33 - enabled only when E-Stop is active) */}
        <group
          position={[0.012, -0.055, 0.005]}
          onClick={(e) => {
            e.stopPropagation()
            pressReset()
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.steel}>
            <cylinderGeometry args={[0.016, 0.016, 0.01, 20]} />
          </mesh>
          <mesh position={[0.01, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.012, 20]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive={estop ? '#fbbf24' : '#000000'}
              emissiveIntensity={estop ? 0.7 : 0}
            />
          </mesh>
        </group>

        {/* 4. SPEED DOWN (D31) */}
        <group
          position={[0.012, -0.055, 0.068]}
          onPointerDown={(e) => {
            e.stopPropagation()
            setButton('down', true)
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            setButton('down', false)
          }}
          onPointerLeave={() => setButton('down', false)}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.steel}>
            <cylinderGeometry args={[0.015, 0.015, 0.01, 20]} />
          </mesh>
          <mesh position={[btnDown ? 0.006 : 0.011, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.011, 0.011, 0.012, 20]} />
            <meshStandardMaterial
              color="#0284c7"
              emissive={btnDown ? '#38bdf8' : '#000000'}
              emissiveIntensity={btnDown ? 0.9 : 0}
            />
          </mesh>
        </group>

        {/* 5. SPEED UP (D30) */}
        <group
          position={[0.012, -0.055, 0.125]}
          onPointerDown={(e) => {
            e.stopPropagation()
            setButton('up', true)
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            setButton('up', false)
          }}
          onPointerLeave={() => setButton('up', false)}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.steel}>
            <cylinderGeometry args={[0.015, 0.015, 0.01, 20]} />
          </mesh>
          <mesh position={[btnUp ? 0.006 : 0.011, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.011, 0.011, 0.012, 20]} />
            <meshStandardMaterial
              color="#2563eb"
              emissive={btnUp ? '#60a5fa' : '#000000'}
              emissiveIntensity={btnUp ? 0.9 : 0}
            />
          </mesh>
        </group>

        <Label
          text="E-STOP(D34) · START(D32) · RST(D33) · SPD-(D31) · SPD+(D30)"
          position={[0.02, -0.13, 0]}
          height={0.019}
        />
      </group>

      {/* Labeled Wire Harnesses */}
      {wires.map((w) => (
        <group key={w.id}>
          <WireTube points={w.points} color={w.color} radius={w.radius} />
          {w.label && <Label text={w.label.text} position={w.label.pos} height={0.022} />}
        </group>
      ))}
    </group>
  )
}
