import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BELT, COLORS, SENSORS } from '../sim/layout'
import { runtime } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { mats } from './materials'

function SensorUnit({
  z,
  name,
  ledColor,
  isS1,
}: {
  z: number
  name: string
  ledColor: string
  isS1: boolean
}) {
  const ledRef = useRef<THREE.MeshStandardMaterial>(null)
  const beamRef = useRef<THREE.MeshBasicMaterial>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(() => {
    const s = isS1 ? runtime.engine.s1 : runtime.engine.s2
    const active = s.led
    if (ledRef.current) {
      ledRef.current.emissiveIntensity = active ? 6.5 : 0.15
      ledRef.current.color.set(active ? ledColor : '#2a2e35')
    }
    if (beamRef.current) {
      beamRef.current.opacity = active ? 0.58 : 0.18
    }
    if (lightRef.current) {
      lightRef.current.intensity = active ? 1.2 : 0
    }
  })

  const beamLen = SENSORS.headY - BELT.top - 0.02

  return (
    <group position={[0, 0, z]}>
      {/* Mounting bracket to gantry spine */}
      <mesh position={[0, SENSORS.headY + 0.035, 0]} material={mats.aluDark} castShadow>
        <boxGeometry args={[0.048, 0.05, 0.048]} />
      </mesh>
      {/* Optical sensor housing (emitter + receiver pair) */}
      <mesh position={[0, SENSORS.headY, 0]} material={mats.blackPlastic} castShadow>
        <boxGeometry args={[0.056, 0.036, 0.046]} />
      </mesh>
      {/* Dual optical lenses (IR Emitter + Photodiode Receiver) */}
      {[-0.012, 0.012].map((dx) => (
        <mesh
          key={dx}
          position={[dx, SENSORS.headY - 0.019, 0]}
          material={mats.steel}
        >
          <cylinderGeometry args={[0.007, 0.007, 0.006, 16]} />
        </mesh>
      ))}
      {/* Active Status LED on top of sensor */}
      <mesh position={[0, SENSORS.headY + 0.024, 0.014]}>
        <sphereGeometry args={[0.009, 16, 16]} />
        <meshStandardMaterial
          ref={ledRef}
          color="#2a2e35"
          emissive={ledColor}
          emissiveIntensity={0.15}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, SENSORS.headY + 0.03, 0.02]}
        color={ledColor}
        distance={0.35}
        intensity={0}
      />
      {/* Optical / IR beam cone */}
      <mesh position={[0, BELT.top + beamLen / 2, 0]}>
        <cylinderGeometry args={[0.006, SENSORS.beamR, beamLen, 20, 1, true]} />
        <meshBasicMaterial
          ref={beamRef}
          color={ledColor}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Label text={name} position={[0, SENSORS.headY + 0.11, 0]} height={0.028} />
    </group>
  )
}

export function OpticalGantry() {
  const gx = 0.258
  const topY = 0.98

  return (
    <group>
      {/* Overhead Gantry Arch columns & crossbeams (2020 / 4040 aluminum extrusion) */}
      {([-1, 1] as const).map((s) => (
        <Extrusion
          key={s}
          axis="y"
          length={topY - 0.68}
          size={0.03}
          position={[s * gx, (topY + 0.68) / 2, SENSORS.gantryZ]}
        />
      ))}
      <Extrusion
        axis="x"
        length={gx * 2 + 0.04}
        size={0.03}
        position={[0, topY, SENSORS.gantryZ]}
      />
      {/* Longitudinal sensor rail */}
      <Extrusion
        axis="z"
        length={0.28}
        size={0.025}
        position={[0, topY - 0.015, SENSORS.gantryZ]}
      />

      {/* S1 (Red signature detector, A0) & S2 (Green signature detector, A1) spaced 0.15 m apart */}
      <SensorUnit z={SENSORS.s1z} name="S1 · IR RED (A0)" ledColor={COLORS.red} isS1={true} />
      <SensorUnit z={SENSORS.s2z} name="S2 · IR GREEN (A1)" ledColor={COLORS.green} isS1={false} />
    </group>
  )
}
