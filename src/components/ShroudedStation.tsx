import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BELT, HOOD } from '../sim/layout'
import { PINS } from '../sim/pins'
import { runtime, useSim } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { hoodMaterial, mats } from './materials'

type Kind = 'primary' | 'verify'

/** TCS3200 RGB colour sensor module: 28 mm PCB, centre photodiode array and 4 white illumination LEDs. */
function Tcs3200Module({ y }: { y: number }) {
  const s = 0.028
  const pcb = '#0a4a8f'
  return (
    <group position={[0, y, 0]}>
      {/* PCB (lens / LED side faces the belt) */}
      <mesh position={[0, 0.0008, 0]} castShadow>
        <boxGeometry args={[s, 0.0016, s]} />
        <meshStandardMaterial color={pcb} roughness={0.4} />
      </mesh>
      {/* sensor IC with photodiode lens */}
      <mesh position={[0, -0.0006, 0]}>
        <boxGeometry args={[0.009, 0.0016, 0.009]} />
        <meshStandardMaterial color="#d8dbe0" metalness={0.4} roughness={0.3} />
      </mesh>
      {/* 4 white illumination LEDs */}
      {[
        [-0.0095, -0.0095],
        [0.0095, -0.0095],
        [-0.0095, 0.0095],
        [0.0095, 0.0095],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, -0.0011, z]} material={mats.ledWhite}>
          <sphereGeometry args={[0.0023, 12, 8]} />
        </mesh>
      ))}
      {/* 8-pin header (S0 S1 S2 S3 OUT OE GND VCC) on the back */}
      <mesh position={[0, 0.0045, -s / 2 + 0.0025]} material={mats.blackPlastic}>
        <boxGeometry args={[0.022, 0.0058, 0.0025]} />
      </mesh>
    </group>
  )
}

/**
 * Opaque matte-black hood ("dark chamber") over the lane with low-profile entrance / exit curtains.
 * The sensor lens sits at exactly HOOD.lensY (belt + 37 mm).
 */
export function ShroudedStation({ z, railX, kind }: { z: number; railX: number; kind: Kind }) {
  const xray = useSim((s) => s.xray)
  const mat = useMemo(() => hoodMaterial(xray), [xray])
  const led1 = useRef<THREE.MeshStandardMaterial>(null)
  const led2 = useRef<THREE.MeshStandardMaterial>(null)
  const light = useRef<THREE.PointLight>(null)

  useFrame(() => {
    const e = runtime.engine
    if (kind === 'primary') {
      if (led1.current) led1.current.emissiveIntensity = e.tcsPresent ? 7 : 0.2
      if (led2.current) led2.current.emissiveIntensity = 2.2 // illumination LEDs always ON
    } else {
      if (led1.current) led1.current.emissiveIntensity = e.verifyHigh ? 7 : 0.15 // D3 HIGH (green)
      if (led2.current) led2.current.emissiveIntensity = e.verifyPresent && !e.verifyHigh ? 7 : 0.15 // anomaly (amber)
    }
    if (light.current) light.current.intensity = kind === 'primary' ? 0.55 : 0.25
  })

  const len = HOOD.len
  const roofY = HOOD.topY
  const skirtH = roofY - BELT.top
  const curtains = [-1, 0, 1].map((i) => i * (railX * 0.62))
  const postTopY = 0.93

  return (
    <group position={[0, 0, z]}>
      {/* roof */}
      <mesh position={[0, roofY + 0.006, 0]} material={mat} castShadow>
        <boxGeometry args={[HOOD.halfW * 2, 0.012, len]} />
      </mesh>
      {/* side skirts (continue the lane rails up to the roof) */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (railX + 0.003), BELT.top + skirtH / 2, 0]}
          material={mat}
          castShadow
        >
          <boxGeometry args={[0.008, skirtH, len]} />
        </mesh>
      ))}
      {/* entrance / exit curtains: three flexible strips each, bottom edge above the piece top */}
      {[-1, 1].map((end) =>
        curtains.map((cx, i) => (
          <mesh
            key={`${end}${i}`}
            position={[cx, HOOD.baffleY + (roofY - HOOD.baffleY) / 2, end * (len / 2 - 0.002)]}
            rotation={[end * 0.12, 0, 0]}
            material={mat}
          >
            <boxGeometry args={[railX * 0.6, roofY - HOOD.baffleY, 0.0025]} />
          </mesh>
        )),
      )}

      {/* the sensor module hangs from the roof on 4 stainless posts, lens plane = belt + 37 mm */}
      <group>
        {[
          [-0.011, -0.011],
          [0.011, -0.011],
          [-0.011, 0.011],
          [0.011, 0.011],
        ].map(([x, zz]) => (
          <mesh
            key={`${x}${zz}`}
            position={[x, HOOD.lensY + (roofY - HOOD.lensY) / 2, zz]}
            material={mats.steel}
          >
            <cylinderGeometry args={[0.0012, 0.0012, roofY - HOOD.lensY, 8]} />
          </mesh>
        ))}
        {kind === 'primary' ? (
          <Tcs3200Module y={HOOD.lensY} />
        ) : (
          <group position={[0, HOOD.lensY, 0]}>
            {/* verification sensor: IR emitter/receiver pair on a small PCB */}
            <mesh position={[0, 0.0008, 0]} material={mats.pcbBlack} castShadow>
              <boxGeometry args={[0.028, 0.0016, 0.022]} />
            </mesh>
            {[-0.006, 0.006].map((dx) => (
              <mesh key={dx} position={[dx, -0.0014, 0]} material={mats.steel}>
                <cylinderGeometry args={[0.0032, 0.0032, 0.003, 14]} />
              </mesh>
            ))}
          </group>
        )}
        <pointLight ref={light} position={[0, HOOD.lensY - 0.004, 0]} color="#ffffff" distance={0.12} intensity={0.5} />
      </group>

      {/* gantry holding the hood: two 2020 uprights + cross beam clamped on the roof */}
      {[-1, 1].map((s) => (
        <Extrusion
          key={s}
          axis="y"
          length={postTopY + 0.02 - 0.685}
          size={0.02}
          position={[s * 0.2575, (postTopY + 0.02 + 0.685) / 2, 0]}
        />
      ))}
      <Extrusion axis="x" length={0.2575 * 2 + 0.02} size={0.02} position={[0, postTopY + 0.01 + 0.002, 0]} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, (postTopY + roofY + 0.012) / 2, 0]} material={mats.aluDark}>
          <boxGeometry args={[0.014, postTopY - roofY - 0.012 + 0.004, 0.03]} />
        </mesh>
      ))}

      {/* exterior status LEDs and name plate */}
      <mesh position={[-0.05, roofY + 0.016, 0.05]}>
        <sphereGeometry args={[0.006, 14, 10]} />
        <meshStandardMaterial
          ref={led1}
          color="#10151c"
          emissive={kind === 'primary' ? '#38bdf8' : '#22c55e'}
          emissiveIntensity={0.2}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-0.032, roofY + 0.016, 0.05]}>
        <sphereGeometry args={[0.006, 14, 10]} />
        <meshStandardMaterial
          ref={led2}
          color="#10151c"
          emissive={kind === 'primary' ? '#fafafa' : '#f59e0b'}
          emissiveIntensity={0.2}
          toneMapped={false}
        />
      </mesh>
      <Label
        text={
          kind === 'primary'
            ? `TCS3200 · S0-S3 D${PINS.tcs.s0}-D${PINS.tcs.s3} · OUT D${PINS.tcs.out}`
            : `VERIFY (HIGH = GREEN) · D${PINS.verify}`
        }
        position={[0, postTopY + 0.11, 0]}
        height={0.03}
      />
      <Label
        text={kind === 'primary' ? 'lens 37 mm above belt' : 'light-shielded IR/colour'}
        position={[0, postTopY + 0.07, 0]}
        height={0.022}
        color="#9ca3af"
      />
    </group>
  )
}
