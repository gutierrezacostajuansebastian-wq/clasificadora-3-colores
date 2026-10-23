import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, ConvexHullCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { BELT, COLORS, PADDLE, paddleShapes } from '../sim/layout'
import { rad } from '../sim/mechanism'
import { PINS } from '../sim/pins'
import { runtime } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { mats } from './materials'

const BEAM_Y = BELT.top + 0.255 // suspended bridge: beams 0.25 m above the belt surface
const LINK_Y = BEAM_Y + 0.05
const HALL_R = 0.042
const HALL_ANGLES = [-PADDLE.sortDeg, 0, PADDLE.sortDeg]
const HALL_LABELS = ['H1 `//`', 'H2 `||`', 'H3 `\\\\`']

function placeBar(g: THREE.Group | null, x1: number, z1: number, x2: number, z2: number, y: number) {
  if (!g) return
  g.position.set((x1 + x2) / 2, y, (z1 + z2) / 2)
  g.rotation.set(0, Math.atan2(x2 - x1, z2 - z1), 0)
}

function Paddle({
  side,
  bodyRef,
}: {
  side: -1 | 1
  bodyRef: React.RefObject<RapierRigidBody | null>
}) {
  const shapes = useMemo(() => paddleShapes(), [])
  const geo = useMemo(() => {
    const hl = PADDLE.halfLen
    const zs0 = -hl + PADDLE.noseLen
    const h = PADDLE.top - PADDLE.bottom
    const sh = new THREE.Shape()
    sh.moveTo(0, hl) // chevron nose, pointing upstream (-Z)
    sh.lineTo(PADDLE.noseHalfW, -zs0)
    sh.lineTo(PADDLE.halfT, -zs0)
    sh.lineTo(PADDLE.halfT, -hl)
    sh.lineTo(-PADDLE.halfT, -hl)
    sh.lineTo(-PADDLE.halfT, -zs0)
    sh.lineTo(-PADDLE.noseHalfW, -zs0)
    sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, -h / 2, 0)
    g.computeVertexNormals()
    return g
  }, [])
  const grp = useRef<THREE.Group>(null)

  useFrame(() => {
    const a = runtime.engine.pose.alpha
    if (grp.current) grp.current.rotation.y = a
  })

  const shaftTop = LINK_Y + 0.02
  const h = PADDLE.top - PADDLE.bottom

  return (
    <group position={[side * PADDLE.pivotX, 0, PADDLE.zc]}>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[0, shapes.centerY, 0]}
      >
        <CuboidCollider args={shapes.stem.half} position={shapes.stem.pos} friction={0.18} restitution={0.05} />
        <ConvexHullCollider args={[shapes.nose]} friction={0.18} restitution={0.05} />
      </RigidBody>
      {/* visual blade (follows the integrated steering angle) */}
      <group ref={grp} position={[0, shapes.centerY, 0]}>
        <mesh geometry={geo} material={mats.anodOrange} castShadow receiveShadow />
        {/* hazard cap & hanger shaft up to the link plane */}
        <mesh position={[0, h / 2 + 0.004, 0]} material={mats.aluDark}>
          <boxGeometry args={[PADDLE.halfT * 2.6, 0.008, PADDLE.halfLen * 1.4]} />
        </mesh>
        <mesh position={[0, (shaftTop - shapes.centerY) / 2 + h / 4, 0]} material={mats.steel} castShadow>
          <cylinderGeometry args={[0.0065, 0.0065, shaftTop - shapes.centerY - h / 2 + 0.01, 16]} />
        </mesh>
        {/* shaft collar */}
        <mesh position={[0, h / 2 + 0.018, 0]} material={mats.steel}>
          <cylinderGeometry args={[0.012, 0.012, 0.012, 20]} />
        </mesh>
      </group>
    </group>
  )
}

export function DualSteering() {
  const bodyL = useRef<RapierRigidBody>(null)
  const bodyR = useRef<RapierRigidBody>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const rod = useRef<THREE.Group>(null)
  const jointL = useRef<THREE.Mesh>(null)
  const jointR = useRef<THREE.Mesh>(null)
  const disc = useRef<THREE.Group>(null)
  const hallLeds = useRef<(THREE.MeshStandardMaterial | null)[]>([])

  const shapes = useMemo(() => paddleShapes(), [])
  const zc = PADDLE.zc
  const crossZ = zc - 0.045

  useFrame(() => {
    const e = runtime.engine
    const p = e.pose
    placeBar(armL.current, p.PL[0], p.PL[1], p.tipL[0], p.tipL[1], LINK_Y)
    placeBar(armR.current, p.PR[0], p.PR[1], p.tipR[0], p.tipR[1], LINK_Y)
    placeBar(rod.current, p.tipL[0], p.tipL[1], p.tipR[0], p.tipR[1], LINK_Y + 0.012)
    jointL.current?.position.set(p.tipL[0], LINK_Y + 0.006, p.tipL[1])
    jointR.current?.position.set(p.tipR[0], LINK_Y + 0.006, p.tipR[1])
    if (disc.current) disc.current.rotation.y = p.alpha
    for (let i = 0; i < 3; i++) {
      const m = hallLeds.current[i]
      if (m) m.emissiveIntensity = e.hall[i] ? 8 : 0.1
    }
    // kinematic colliders follow the integrated motor angle (both paddles stay strictly parallel)
    const half = p.alpha / 2
    const q = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }
    ;[bodyL.current, bodyR.current].forEach((b, i) => {
      if (!b) return
      b.setNextKinematicTranslation({ x: (i === 0 ? -1 : 1) * PADDLE.pivotX, y: shapes.centerY, z: zc })
      b.setNextKinematicRotation(q)
    })
  })

  const bx = 0.3 // bridge side beams
  const zUp = -0.2 // portal columns (upstream of the paddles)
  const zEnd = zc + 0.42

  return (
    <group>
      <Paddle side={-1} bodyRef={bodyL} />
      <Paddle side={1} bodyRef={bodyR} />

      {/* ---- suspended bridge: portal columns upstream + two cantilever beams over the chutes */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <Extrusion axis="y" length={BEAM_Y - 0.01} size={0.04} position={[s * bx, (BEAM_Y - 0.01) / 2 + 0.005, zUp]} />
          <mesh position={[s * bx, 0.011, zUp]} material={mats.steel} castShadow>
            <cylinderGeometry args={[0.032, 0.032, 0.022, 24]} />
          </mesh>
          <Extrusion axis="z" length={zEnd - zUp + 0.04} size={0.03} position={[s * bx, BEAM_Y, (zUp + zEnd) / 2]} />
          {/* diagonal braces */}
          <mesh
            position={[s * bx, BEAM_Y - 0.14, zUp + 0.17]}
            rotation={[Math.atan2(0.28, 0.34), 0, 0]}
            material={mats.alu}
            castShadow
          >
            <boxGeometry args={[0.02, 0.02, 0.44]} />
          </mesh>
        </group>
      ))}
      <Extrusion axis="x" length={bx * 2 + 0.04} size={0.03} position={[0, BEAM_Y, zUp]} />
      <Extrusion axis="x" length={bx * 2 + 0.04} size={0.03} position={[0, BEAM_Y, zEnd]} />
      {/* pivot cross beam + mounting plate carrying both pillow blocks */}
      <Extrusion axis="x" length={bx * 2} size={0.025} position={[0, BEAM_Y, crossZ]} />
      <mesh position={[0, BEAM_Y + 0.0165, zc - 0.015]} material={mats.brushed} castShadow>
        <boxGeometry args={[0.3, 0.006, 0.09]} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * PADDLE.pivotX, BEAM_Y + 0.03, zc]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.036, 0.02, 0.036]} />
        </mesh>
      ))}

      {/* ---- steering gearmotor (drives the left shaft) with Hall disc and 3 Hall sensors */}
      <group position={[-PADDLE.pivotX, 0, zc]}>
        {/* bracket posts + plate */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.034, (LINK_Y + 0.1 + BEAM_Y) / 2, 0.034]} material={mats.aluDark}>
            <boxGeometry args={[0.01, LINK_Y + 0.1 - BEAM_Y, 0.01]} />
          </mesh>
        ))}
        <mesh position={[0, LINK_Y + 0.1, 0]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.1, 0.008, 0.1]} />
        </mesh>
        <mesh position={[0, LINK_Y + 0.135, 0]} material={mats.gearbox} castShadow>
          <cylinderGeometry args={[0.026, 0.026, 0.06, 24]} />
        </mesh>
        <mesh position={[0, LINK_Y + 0.2, 0]} material={mats.motorBody} castShadow>
          <cylinderGeometry args={[0.024, 0.024, 0.07, 24]} />
        </mesh>
        <mesh position={[0, LINK_Y + 0.05, 0]} material={mats.steel}>
          <cylinderGeometry args={[0.007, 0.007, 0.1, 14]} />
        </mesh>
        {/* magnet disc: rotates with the steering angle */}
        <group ref={disc} position={[0, LINK_Y + 0.062, 0]}>
          <mesh material={mats.aluDark} castShadow>
            <cylinderGeometry args={[0.034, 0.034, 0.004, 40]} />
          </mesh>
          <mesh position={[0, 0.004, 0.028]} material={mats.magnet}>
            <cylinderGeometry args={[0.0052, 0.0052, 0.005, 16]} />
          </mesh>
          <mesh position={[0, 0.0016, 0.012]} material={mats.safetyYellow}>
            <boxGeometry args={[0.004, 0.0012, 0.026]} />
          </mesh>
        </group>
        {/* Hall sensors (`//`, `||`, `\\`) with neodymium target and indicator LEDs */}
        {HALL_ANGLES.map((a, i) => {
          const ar = rad(a)
          const x = Math.sin(ar)
          const z = Math.cos(ar)
          return (
            <group key={a} position={[x * HALL_R, LINK_Y + 0.062, z * HALL_R]} rotation={[0, ar, 0]}>
              <mesh material={mats.pcbBlack} castShadow>
                <boxGeometry args={[0.02, 0.006, 0.01]} />
              </mesh>
              <mesh position={[0, 0.005, 0]} material={mats.blackPlastic}>
                <boxGeometry args={[0.006, 0.004, 0.004]} />
              </mesh>
              <mesh position={[0, 0.011, 0.012]}>
                <sphereGeometry args={[0.0058, 14, 10]} />
                <meshStandardMaterial
                  ref={(m) => {
                    hallLeds.current[i] = m
                  }}
                  color="#1b1e24"
                  emissive={i === 0 ? COLORS.red : i === 1 ? '#fafafa' : COLORS.blue}
                  emissiveIntensity={0.1}
                  toneMapped={false}
                />
              </mesh>
              <Label
                text={`${HALL_LABELS[i]} · D${PINS.hall[i]}`}
                position={[x * 0.03, 0.045, z * 0.03 + 0.02]}
                height={0.018}
              />
            </group>
          )
        })}
        <Label
          text={`M2 STEERING · PWM D${PINS.steer.pwm} · D${PINS.steer.in1}/D${PINS.steer.in2}`}
          position={[0, LINK_Y + 0.27, 0]}
          height={0.026}
        />
      </group>

      {/* passive follower shaft at the right pivot */}
      <group position={[PADDLE.pivotX, 0, zc]}>
        <mesh position={[0, LINK_Y + 0.045, 0]} material={mats.steel}>
          <cylinderGeometry args={[0.007, 0.007, 0.09, 14]} />
        </mesh>
      </group>

      {/* ---- parallelogram: two crank arms + tie-rod (steering-linkage style) */}
      <group ref={armL}>
        <mesh material={mats.anodOrange} castShadow>
          <boxGeometry args={[0.014, 0.008, 0.1 + 0.014]} />
        </mesh>
      </group>
      <group ref={armR}>
        <mesh material={mats.anodOrange} castShadow>
          <boxGeometry args={[0.014, 0.008, 0.1 + 0.014]} />
        </mesh>
      </group>
      <group ref={rod}>
        <mesh material={mats.steel} castShadow>
          <boxGeometry args={[0.01, 0.007, 2 * PADDLE.pivotX + 0.014]} />
        </mesh>
      </group>
      <mesh ref={jointL} material={mats.steel} castShadow>
        <cylinderGeometry args={[0.0075, 0.0075, 0.03, 16]} />
      </mesh>
      <mesh ref={jointR} material={mats.steel} castShadow>
        <cylinderGeometry args={[0.0075, 0.0075, 0.03, 16]} />
      </mesh>

      <Label text="TIE-ROD · parallel paddles" position={[0, LINK_Y + 0.07, zc + 0.14]} height={0.024} />
      <Label text="4 mm blade clearance" position={[0.0, BELT.top + 0.06, zc - 0.28]} height={0.02} color="#9ca3af" />
    </group>
  )
}
