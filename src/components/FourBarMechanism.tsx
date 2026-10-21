import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  ConvexHullCollider,
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { BELT, COLORS, PADDLE, paddleShapes } from '../sim/layout'
import { MECH } from '../sim/mechanism'
import { runtime } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { mats } from './materials'

const BRIDGE_Y = BELT.top + 0.25 // 0.25 m above belt surface = 1.00 m
const LINK_Y = BRIDGE_Y + 0.045

function placeLink(
  grp: THREE.Group | null,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
) {
  if (!grp) return
  grp.position.set((x1 + x2) / 2, y, (z1 + z2) / 2)
  grp.rotation.set(0, Math.atan2(x2 - x1, z2 - z1), 0)
}

export function FourBarMechanism() {
  const paddleBody = useRef<RapierRigidBody>(null)
  const crankRef = useRef<THREE.Group>(null)
  const rockerRef = useRef<THREE.Group>(null)
  const couplerRef = useRef<THREE.Group>(null)
  const paddleVisualRef = useRef<THREE.Group>(null)
  const pinARef = useRef<THREE.Mesh>(null)
  const pinBRef = useRef<THREE.Mesh>(null)
  const hallRedLed = useRef<THREE.MeshStandardMaterial>(null)
  const hallBlueLed = useRef<THREE.MeshStandardMaterial>(null)

  const shapes = useMemo(() => paddleShapes(), [])

  // Extruded chevron + stem geometry for the visual paddle
  const paddleGeo = useMemo(() => {
    const hl = PADDLE.halfLen
    const zs0 = -hl + PADDLE.noseLen
    const h = PADDLE.top - PADDLE.bottom
    const sh = new THREE.Shape()
    // 2D shape in (X, -Z) so after rotateX(-PI/2) it lies in (X, Z) and extrudes along +Y
    sh.moveTo(0, hl) // upstream chevron tip at z = -hl
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

  useFrame(() => {
    const pose = runtime.engine.pose
    const [o2x, o2z] = pose.O2
    const [o4x, o4z] = pose.O4
    const [ax, az] = pose.A
    const [bx, bz] = pose.B
    const [px, pz] = pose.P

    placeLink(crankRef.current, o2x, o2z, ax, az, LINK_Y + 0.018)
    placeLink(rockerRef.current, o4x, o4z, bx, bz, LINK_Y + 0.018)
    placeLink(couplerRef.current, ax, az, bx, bz, LINK_Y)

    if (pinARef.current) pinARef.current.position.set(ax, LINK_Y + 0.012, az)
    if (pinBRef.current) pinBRef.current.position.set(bx, LINK_Y + 0.012, bz)

    if (paddleVisualRef.current) {
      paddleVisualRef.current.position.set(px, shapes.centerY, pz)
      paddleVisualRef.current.rotation.set(0, pose.alpha, 0)
    }

    if (paddleBody.current) {
      const half = pose.alpha / 2
      paddleBody.current.setNextKinematicTranslation({
        x: px,
        y: shapes.centerY,
        z: pz,
      })
      paddleBody.current.setNextKinematicRotation({
        x: 0,
        y: Math.sin(half),
        z: 0,
        w: Math.cos(half),
      })
    }

    if (hallRedLed.current) {
      hallRedLed.current.emissiveIntensity = runtime.engine.hall.red ? 6 : 0.15
    }
    if (hallBlueLed.current) {
      hallBlueLed.current.emissiveIntensity = runtime.engine.hall.blue ? 6 : 0.15
    }
  })

  const [o2x, o2z] = MECH.O2
  const [o4x, o4z] = MECH.O4
  const bridgeZ0 = -0.14
  const bridgeZ1 = 0.52
  const bridgeZc = (bridgeZ0 + bridgeZ1) / 2
  const bridgeX = 0.27

  return (
    <group>
      {/* Kinematic RigidBody for the Deflector Paddle (5 mm clearance above belt) */}
      <RigidBody
        ref={paddleBody}
        type="kinematicPosition"
        colliders={false}
        position={[0, shapes.centerY, PADDLE.zc]}
      >
        <CuboidCollider
          args={shapes.stem.half}
          position={shapes.stem.pos}
          friction={0.18}
          restitution={0.05}
        />
        <ConvexHullCollider args={[shapes.nose]} friction={0.18} restitution={0.05} />
      </RigidBody>

      {/* Suspended Bridge Aluminum Extrusion Frame (0.25 m above belt) */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          {[bridgeZ0, bridgeZ1].map((zp) => (
            <Extrusion
              key={zp}
              axis="y"
              length={BRIDGE_Y - 0.68}
              size={0.03}
              position={[s * bridgeX, (BRIDGE_Y + 0.68) / 2, zp]}
            />
          ))}
          <Extrusion
            axis="z"
            length={bridgeZ1 - bridgeZ0 + 0.04}
            size={0.03}
            position={[s * bridgeX, BRIDGE_Y, bridgeZc]}
          />
        </group>
      ))}
      {[bridgeZ0, bridgeZ1].map((zp) => (
        <Extrusion
          key={zp}
          axis="x"
          length={bridgeX * 2 + 0.04}
          size={0.03}
          position={[0, BRIDGE_Y, zp]}
        />
      ))}

      {/* Ground Pivot Support Crossbeams for O2 (Input Crank) and O4 (Output Rocker) */}
      <Extrusion axis="x" length={bridgeX * 2} size={0.025} position={[0, BRIDGE_Y, o2z]} />
      <Extrusion axis="x" length={bridgeX * 2} size={0.025} position={[0, BRIDGE_Y, o4z]} />

      {/* O2: Input Crank Ground Pivot + High-Torque DC Gearmotor + Hall Limit Sensors (D2/D3) */}
      <group position={[o2x, BRIDGE_Y, o2z]}>
        {/* Bearing pillow block */}
        <mesh position={[0, 0.022, 0]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.055, 0.032, 0.055]} />
        </mesh>
        {/* High-torque planetary gearbox + DC motor */}
        <mesh position={[0, 0.075, 0]} material={mats.gearbox} castShadow>
          <cylinderGeometry args={[0.026, 0.026, 0.055, 24]} />
        </mesh>
        <mesh position={[0, 0.135, 0]} material={mats.motorBody} castShadow>
          <cylinderGeometry args={[0.024, 0.024, 0.07, 24]} />
        </mesh>
        {/* Rotary optical encoder cap on top of motor */}
        <mesh position={[0, 0.178, 0]} material={mats.blackPlastic}>
          <cylinderGeometry args={[0.02, 0.02, 0.018, 20]} />
        </mesh>
        {/* Output shaft & collar */}
        <mesh position={[0, 0.045, 0]} material={mats.steel}>
          <cylinderGeometry args={[0.008, 0.008, 0.05, 16]} />
        </mesh>
        {/* Dual Hall Effect Limit Sensors (D2 RED limit, D3 BLUE limit) */}
        <group position={[-0.034, 0.048, 0.022]}>
          <mesh material={mats.blackPlastic}>
            <boxGeometry args={[0.016, 0.012, 0.02]} />
          </mesh>
          <mesh position={[0, 0.009, 0]}>
            <sphereGeometry args={[0.005, 12, 12]} />
            <meshStandardMaterial
              ref={hallRedLed}
              color="#331111"
              emissive={COLORS.red}
              emissiveIntensity={0.2}
              toneMapped={false}
            />
          </mesh>
        </group>
        <group position={[0.034, 0.048, 0.022]}>
          <mesh material={mats.blackPlastic}>
            <boxGeometry args={[0.016, 0.012, 0.02]} />
          </mesh>
          <mesh position={[0, 0.009, 0]}>
            <sphereGeometry args={[0.005, 12, 12]} />
            <meshStandardMaterial
              ref={hallBlueLed}
              color="#111b33"
              emissive={COLORS.blue}
              emissiveIntensity={0.2}
              toneMapped={false}
            />
          </mesh>
        </group>
        <Label text="M2 · Crank + Hall (D2/D3)" position={[0, 0.24, 0]} height={0.028} />
      </group>

      {/* O4: Passive Rocker Ground Pivot (+X) */}
      <group position={[o4x, BRIDGE_Y, o4z]}>
        <mesh position={[0, 0.022, 0]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.05, 0.032, 0.05]} />
        </mesh>
        <mesh position={[0, 0.048, 0]} material={mats.steel} castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.05, 18]} />
        </mesh>
        <Label text="O4 · Passive Pivot" position={[0, 0.11, 0]} height={0.026} />
      </group>

      {/* Input Link (Crank O2 -> A, length MECH.r) */}
      <group ref={crankRef}>
        <mesh material={mats.anodOrange} castShadow>
          <boxGeometry args={[0.024, 0.01, MECH.r + 0.024]} />
        </mesh>
      </group>

      {/* Output Link (Rocker O4 -> B, length MECH.s) */}
      <group ref={rockerRef}>
        <mesh material={mats.alu} castShadow>
          <boxGeometry args={[0.022, 0.01, MECH.s + 0.022]} />
        </mesh>
      </group>

      {/* Coupler Link (A -> B, length MECH.L) */}
      <group ref={couplerRef}>
        <mesh material={mats.steel} castShadow>
          <boxGeometry args={[0.028, 0.012, MECH.L + 0.028]} />
        </mesh>
      </group>

      {/* Moving Revolute Joint Pins A & B */}
      <mesh ref={pinARef} material={mats.steel} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.042, 16]} />
      </mesh>
      <mesh ref={pinBRef} material={mats.steel} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.042, 16]} />
      </mesh>

      {/* Suspended Coupler / Deflector Paddle with Upstream Wedge/Chevron Tip (>) */}
      <group ref={paddleVisualRef}>
        <mesh geometry={paddleGeo} material={mats.anodOrange} castShadow receiveShadow />
        {/* Vertical hanger posts connecting coupler arm down to the deflector paddle */}
        {[-0.08, 0.08].map((dz) => (
          <mesh key={dz} position={[0, 0.11, dz]} material={mats.steel} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.1, 14]} />
          </mesh>
        ))}
        {/* Top spine cap */}
        <mesh position={[0, (PADDLE.top - PADDLE.bottom) / 2 + 0.004, 0.02]} material={mats.aluDark}>
          <boxGeometry args={[PADDLE.halfT * 2.2, 0.01, PADDLE.halfLen * 1.75]} />
        </mesh>
      </group>
    </group>
  )
}
