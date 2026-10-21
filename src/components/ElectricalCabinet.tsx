import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BELT, SENSORS } from '../sim/layout'
import { MECH } from '../sim/mechanism'
import { useSim } from '../sim/store'
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

function WireTube({ points, color, radius = 0.0045 }: { points: [number, number, number][]; color: string; radius?: number }) {
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
  const counts = useSim((s) => s.counts)
  const estop = useSim((s) => s.estop)

  // Dynamic 16x2 LCD1602 CanvasTexture rendered in 3D on the operator panel
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

    const p3 = (n: number) => String(Math.min(999, n)).padStart(3, '0')
    const total = counts.red + counts.green + counts.blue
    const line1 = `R:${p3(counts.red)} G:${p3(counts.green)} B:${p3(counts.blue)}`
    const line2 = estop
      ? '!! E-STOP HALT !!'
      : `TOTAL COUNT:${String(Math.min(9999, total)).padStart(4, '0')}`

    ctx.font = 'bold 39px "Consolas", "Courier New", monospace'
    ctx.fillStyle = estop ? '#ffdf70' : '#b8ff6b'
    ctx.textBaseline = 'top'
    ctx.fillText(line1, 18, 26)
    ctx.fillText(line2, 18, 90)
    lcdTex.needsUpdate = true
  }, [counts, estop, lcdCanvas, lcdTex])

  // Cabinet world coordinates (mounted on left side of conveyor at z = -0.75 m)
  const cabX = -0.68
  const cabZ = -0.75
  const unoPos: [number, number, number] = [cabX + 0.04, 0.72, cabZ - 0.05]
  const l298Pos: [number, number, number] = [cabX + 0.04, 0.72, cabZ + 0.09]
  const lcdPos: [number, number, number] = [cabX + 0.05, 0.96, cabZ]

  const zr = BELT.halfLen - BELT.rollerR
  const yr = BELT.top - BELT.rollerR
  const [o2x, o2z] = MECH.O2

  const wires = useMemo<WireSpec[]>(
    () => [
      // 1. Conveyor DC Motor M1 <- L298N Driver <- Arduino PWM (D5, D6)
      {
        id: 'm1-pwr',
        color: '#e63946',
        points: [
          l298Pos,
          [cabX + 0.14, 0.68, cabZ + 0.09],
          [-0.42, 0.66, -1.1],
          [-0.35, yr, -zr],
        ],
        label: { text: 'PWM D5/D6 -> L298N -> M1', pos: [-0.46, 0.63, -1.12] },
      },
      {
        id: 'uno-l298',
        color: '#f4a261',
        points: [
          unoPos,
          [cabX + 0.08, 0.75, cabZ + 0.02],
          l298Pos,
        ],
      },
      // 2. Mechanism DC Motor M2 & Hall Effect Sensors (D2, D3)
      {
        id: 'm2-drv',
        color: '#ff9f1c',
        points: [
          l298Pos,
          [-0.46, 0.74, -0.35],
          [-0.32, 0.98, o2z],
          [o2x, 1.08, o2z],
        ],
      },
      {
        id: 'hall-d2d3',
        color: '#a855f7',
        points: [
          unoPos,
          [-0.48, 0.76, -0.4],
          [-0.34, 1.0, o2z + 0.02],
          [o2x, 1.05, o2z + 0.02],
        ],
        label: { text: 'Hall INT (D2/D3) + H-Bridge -> M2', pos: [-0.42, 0.89, -0.22] },
      },
      // 3. Optical Sensors S1 (A0) & S2 (A1)
      {
        id: 's1-a0',
        color: '#ef4444',
        points: [
          unoPos,
          [-0.44, 0.8, -0.58],
          [-0.26, 0.98, SENSORS.gantryZ],
          [0, SENSORS.headY + 0.04, SENSORS.s1z],
        ],
        label: { text: 'S1 -> A0 · S2 -> A1', pos: [-0.36, 0.96, -0.54] },
      },
      {
        id: 's2-a1',
        color: '#22c55e',
        points: [
          unoPos,
          [-0.42, 0.8, -0.52],
          [-0.25, 0.98, SENSORS.gantryZ],
          [0, SENSORS.headY + 0.04, SENSORS.s2z],
        ],
      },
      // 4. LCD 1602 I2C 4-conductor harness (VCC, GND, SDA->A4, SCL->A5)
      {
        id: 'i2c-sda',
        color: '#38bdf8',
        points: [
          unoPos,
          [cabX + 0.07, 0.83, cabZ - 0.02],
          [lcdPos[0], lcdPos[1] - 0.04, lcdPos[2]],
        ],
        label: { text: 'I2C (VCC,GND,SDA->A4,SCL->A5)', pos: [cabX + 0.14, 0.86, cabZ - 0.08] },
      },
    ],
    [cabX, cabZ, l298Pos, lcdPos, o2x, o2z, unoPos, yr, zr],
  )

  return (
    <group>
      {/* Pedestal Stand & Extrusion Post for Control Enclosure */}
      <Extrusion axis="y" length={0.72} size={0.04} position={[cabX, 0.36, cabZ]} />
      <mesh position={[cabX, 0.012, cabZ]} material={mats.steel} castShadow>
        <boxGeometry args={[0.24, 0.024, 0.28]} />
      </mesh>

      {/* Industrial Control Enclosure Box */}
      <group position={[cabX, 0.72, cabZ]}>
        {/* Main steel cabinet shell */}
        <mesh position={[-0.02, 0, 0]} material={mats.paintGray} castShadow receiveShadow>
          <boxGeometry args={[0.1, 0.28, 0.36]} />
        </mesh>
        {/* Brass/orange internal mounting backplate */}
        <mesh position={[0.032, 0, 0]} material={mats.backplate}>
          <boxGeometry args={[0.006, 0.25, 0.33]} />
        </mesh>
        {/* Clear hinged inspection cover */}
        <mesh position={[0.072, 0, 0]} material={mats.acrylic}>
          <boxGeometry args={[0.006, 0.27, 0.35]} />
        </mesh>

        {/* Arduino UNO R3 Board (Teal PCB + ATmega328P + USB-B + Pin Headers) */}
        <group position={[0.042, 0, -0.055]}>
          <mesh castShadow>
            <boxGeometry args={[0.012, 0.11, 0.14]} />
            <meshStandardMaterial color="#006d77" roughness={0.35} metalness={0.2} />
          </mesh>
          {/* USB port */}
          <mesh position={[0.008, 0.038, -0.055]} material={mats.steel}>
            <boxGeometry args={[0.016, 0.022, 0.026]} />
          </mesh>
          {/* DC Barrel Jack */}
          <mesh position={[0.008, -0.035, -0.055]} material={mats.blackPlastic}>
            <boxGeometry args={[0.016, 0.02, 0.026]} />
          </mesh>
          {/* ATmega328P DIP IC */}
          <mesh position={[0.008, -0.01, 0.015]} material={mats.blackPlastic}>
            <boxGeometry args={[0.01, 0.018, 0.06]} />
          </mesh>
          {/* Female header strips (Digital D0-D13 & Analog A0-A5) */}
          <mesh position={[0.009, 0.046, 0.005]} material={mats.blackPlastic}>
            <boxGeometry args={[0.012, 0.008, 0.1]} />
          </mesh>
          <mesh position={[0.009, -0.046, 0.005]} material={mats.blackPlastic}>
            <boxGeometry args={[0.012, 0.008, 0.1]} />
          </mesh>
          <Label text="ARDUINO UNO R3" position={[0.04, 0.08, 0]} height={0.024} />
        </group>

        {/* L298N / Dual MOSFET H-Bridge Driver Module */}
        <group position={[0.042, 0, 0.095]}>
          <mesh castShadow>
            <boxGeometry args={[0.012, 0.09, 0.09]} />
            <meshStandardMaterial color="#b91c1c" roughness={0.4} metalness={0.2} />
          </mesh>
          {/* Black Aluminum Heatsink */}
          <mesh position={[0.016, 0, 0]} material={mats.aluDark} castShadow>
            <boxGeometry args={[0.026, 0.045, 0.05]} />
          </mesh>
          {/* Blue screw terminal blocks */}
          <mesh position={[0.01, 0.034, 0]}>
            <boxGeometry args={[0.016, 0.016, 0.06]} />
            <meshStandardMaterial color="#1d4ed8" />
          </mesh>
          <Label text="L298N / MOSFET H-BRIDGE" position={[0.04, -0.075, 0]} height={0.022} />
        </group>
      </group>

      {/* Operator Turret & Live 16x2 Alphanumeric LCD Display (with I2C Backpack) */}
      <group position={lcdPos} rotation={[0, 0.35, 0]}>
        <mesh position={[-0.018, 0, 0]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.04, 0.14, 0.28]} />
        </mesh>
        {/* I2C Backpack PCB on rear */}
        <mesh position={[-0.042, 0, 0]} material={mats.blackPlastic}>
          <boxGeometry args={[0.012, 0.05, 0.09]} />
        </mesh>
        {/* LCD1602 Bezel & Backlit Screen */}
        <mesh position={[0.004, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.25, 0.095]} />
          <meshBasicMaterial map={lcdTex} toneMapped={false} />
        </mesh>
        <Label text="LCD 1602 (I2C 0x27)" position={[0, 0.095, 0]} height={0.025} />
      </group>

      {/* Labeled Wire Harnesses */}
      {wires.map((w) => (
        <group key={w.id}>
          <WireTube points={w.points} color={w.color} radius={w.radius} />
          {w.label && <Label text={w.label.text} position={w.label.pos} height={0.023} />}
        </group>
      ))}
    </group>
  )
}
