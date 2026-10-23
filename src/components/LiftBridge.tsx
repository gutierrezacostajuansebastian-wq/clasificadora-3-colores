import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { BELT, BRIDGE, COLORS, bridgeShapes } from '../sim/layout'
import { rad } from '../sim/mechanism'
import { PINS } from '../sim/pins'
import { runtime } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { mats } from './materials'

const SHAPES = bridgeShapes()
const DISC_X = -0.268
const HALL_R = 0.05

/** Motorised horizontal drop-bridge ("puente levadizo") with 2 Hall sensors (flat / lifted). */
export function LiftBridge() {
  const body = useRef<RapierRigidBody>(null)
  const disc = useRef<THREE.Group>(null)
  const led4 = useRef<THREE.MeshStandardMaterial>(null)
  const led5 = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(() => {
    const e = runtime.engine
    const th = e.bridge.x
    if (body.current) {
      const h = th / 2
      body.current.setNextKinematicRotation({ x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) })
    }
    if (disc.current) disc.current.rotation.x = th
    if (led4.current) led4.current.emissiveIntensity = e.hall[3] ? 8 : 0.1
    if (led5.current) led5.current.emissiveIntensity = e.hall[4] ? 8 : 0.1
  })

  const hz = BRIDGE.hingeZ
  const hy = BRIDGE.hingeY
  const railY = 0.665
  const a5 = rad(BRIDGE.liftDeg)

  return (
    <group>
      {/* rails + pillow-block uprights carrying the hinge shaft */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <Extrusion axis="z" length={0.4} size={0.04} position={[s * 0.2575, railY, 1.62]} />
          <Extrusion axis="y" length={railY - 0.02} size={0.04} position={[s * 0.2575, (railY - 0.02) / 2, hz + 0.02]} />
          <mesh position={[s * 0.2575, 0.011, hz + 0.02]} material={mats.steel} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.022, 24]} />
          </mesh>
          <mesh position={[s * 0.236, hy - 0.016, hz]} material={mats.aluDark} castShadow>
            <boxGeometry args={[0.03, 0.04, 0.04]} />
          </mesh>
        </group>
      ))}
      <Extrusion axis="x" length={0.2575 * 2 - 0.04} size={0.02} position={[0, railY, hz + 0.02]} />

      {/* hinge shaft along X */}
      <mesh position={[0, hy, hz]} rotation={[0, 0, Math.PI / 2]} material={mats.steel} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.56, 16]} />
      </mesh>

      {/* ramp: kinematic body rotating about the hinge (flat `_` = 0°, lifted = 65°) */}
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[0, hy, hz]}
      >
        {SHAPES.map((s, i) => (
          <CuboidCollider key={i} args={s.half} position={s.pos} friction={0.1} restitution={0.05} />
        ))}
        <mesh position={[0, -0.006, -BRIDGE.len / 2]} material={mats.brushed} castShadow receiveShadow>
          <boxGeometry args={[BRIDGE.halfW * 2, 0.012, BRIDGE.len]} />
        </mesh>
        <mesh position={[0, 0.0003, -BRIDGE.len / 2]} material={mats.rubber} receiveShadow>
          <boxGeometry args={[BRIDGE.halfW * 2 - 0.03, 0.001, BRIDGE.len - 0.01]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * (BRIDGE.halfW - 0.004), BRIDGE.flangeH / 2, -BRIDGE.len / 2]}
            material={mats.safetyYellow}
            castShadow
          >
            <boxGeometry args={[0.008, BRIDGE.flangeH, BRIDGE.len]} />
          </mesh>
        ))}
        <Label text="LIFT BRIDGE" position={[0, 0.05, -BRIDGE.len / 2]} height={0.024} />
      </RigidBody>

      {/* Hall disc + sensors H4 (flat `_`) and H5 (lifted) at the left end of the hinge */}
      <group position={[DISC_X, hy, hz]}>
        <group ref={disc}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.aluDark} castShadow>
            <cylinderGeometry args={[0.038, 0.038, 0.004, 40]} />
          </mesh>
          <mesh position={[0, 0, -0.031]} rotation={[0, 0, Math.PI / 2]} material={mats.magnet}>
            <cylinderGeometry args={[0.0055, 0.0055, 0.006, 16]} />
          </mesh>
          <mesh position={[0, 0, -0.016]} material={mats.safetyYellow}>
            <boxGeometry args={[0.0012, 0.004, 0.028]} />
          </mesh>
        </group>
        {[0, a5].map((a, i) => (
          <group key={i} position={[0, Math.sin(a) * HALL_R, -Math.cos(a) * HALL_R]} rotation={[a, 0, 0]}>
            <mesh material={mats.pcbBlack} castShadow>
              <boxGeometry args={[0.006, 0.01, 0.02]} />
            </mesh>
            <mesh position={[0, 0, 0.013]}>
              <sphereGeometry args={[0.0058, 14, 10]} />
              <meshStandardMaterial
                ref={i === 0 ? led4 : led5}
                color="#1b1e24"
                emissive={i === 0 ? '#fafafa' : COLORS.yellow}
                emissiveIntensity={0.1}
                toneMapped={false}
              />
            </mesh>
            <Label
              text={i === 0 ? `H4 \`_\` flat · D${PINS.hall[3]}` : `H5 lifted · D${PINS.hall[4]}`}
              position={[-0.06, i === 0 ? -0.02 : 0.04, 0]}
              height={0.018}
            />
          </group>
        ))}
        {/* bridge DC gearmotor */}
        <mesh position={[-0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.gearbox} castShadow>
          <cylinderGeometry args={[0.026, 0.026, 0.05, 24]} />
        </mesh>
        <mesh position={[-0.115, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.motorBody} castShadow>
          <cylinderGeometry args={[0.024, 0.024, 0.08, 24]} />
        </mesh>
        <mesh position={[-0.026, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.steel}>
          <cylinderGeometry args={[0.009, 0.009, 0.04, 14]} />
        </mesh>
        <Label
          text={`M3 BRIDGE · PWM D${PINS.bridge.pwm} · D${PINS.bridge.in1}/D${PINS.bridge.in2}`}
          position={[-0.1, 0.075, 0]}
          height={0.024}
        />
      </group>

      {/* belt surface marker */}
      <Label text="OUTFEED · lift bridge" position={[0, BELT.top + 0.17, hz - 0.05]} height={0.026} />
    </group>
  )
}
