import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BELT } from '../sim/layout'
import { runtime } from '../sim/store'
import { Extrusion } from './Extrusion'
import { Label } from './Label'
import { mats } from './materials'

const BELT_PERIOD = 1.5 // metres of belt per texture repeat

function makeBeltTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 1024
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#161719'
  ctx.fillRect(0, 0, w, h)
  // rubber grain
  for (let i = 0; i < 9000; i++) {
    const v = 20 + Math.random() * 22
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  // fine transverse ribs (matte tread) every 25 mm
  const ribs = 60
  for (let i = 0; i < ribs; i++) {
    const y = (i / ribs) * h
    ctx.fillStyle = 'rgba(70,72,78,0.55)'
    ctx.fillRect(0, y, w, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, y + 3, w, 3)
  }
  // belt splice + alignment marker so the motion is readable
  ctx.fillStyle = '#b89a1a'
  ctx.fillRect(0, 12, w, 10)
  ctx.fillStyle = '#e8e8e8'
  ctx.fillRect(10, 40, 18, 90)
  ctx.fillRect(w - 28, 40, 18, 90)
  // edge guides
  ctx.fillStyle = '#0b0b0c'
  ctx.fillRect(0, 0, 8, h)
  ctx.fillRect(w - 8, 0, 8, h)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapT = THREE.RepeatWrapping
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function Conveyor() {
  const tex = useMemo(makeBeltTexture, [])
  const texRet = useMemo(() => {
    const t = tex.clone()
    t.needsUpdate = true
    return t
  }, [tex])
  const rollerTex = useMemo(() => {
    const t = tex.clone()
    t.needsUpdate = true
    t.repeat.set(1, 0.15)
    return t
  }, [tex])
  const rollerA = useRef<THREE.Mesh>(null)
  const rollerB = useRef<THREE.Mesh>(null)
  const len = 2 * (BELT.halfLen - BELT.rollerR)

  useEffect(() => {
    tex.repeat.set(1, len / BELT_PERIOD)
    texRet.repeat.set(1, len / BELT_PERIOD)
  }, [tex, texRet, len])

  const last = useRef(0)
  useFrame(() => {
    const off = runtime.engine.belt.offset
    const d = off - last.current
    last.current = off
    tex.offset.y += d / BELT_PERIOD
    texRet.offset.y += d / BELT_PERIOD
    const ang = d / BELT.rollerR
    if (rollerA.current) rollerA.current.rotation.y -= ang
    if (rollerB.current) rollerB.current.rotation.y -= ang
  })

  const zr = BELT.halfLen - BELT.rollerR
  const yr = BELT.top - BELT.rollerR
  const railX = 0.2575
  const railY = 0.665

  return (
    <group>
      {/* belt: top run, return run, end rollers */}
      <mesh position={[0, BELT.top + 0.0004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BELT.halfW * 2, len]} />
        <meshStandardMaterial map={tex} roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[0, yr - BELT.rollerR - 0.0004, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BELT.halfW * 2, len]} />
        <meshStandardMaterial map={texRet} roughness={0.95} />
      </mesh>
      {[-zr, zr].map((z, i) => (
        <group key={z} position={[0, yr, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh ref={i === 0 ? rollerA : rollerB} castShadow>
            <cylinderGeometry args={[BELT.rollerR + 0.0006, BELT.rollerR + 0.0006, BELT.halfW * 2, 32]} />
            <meshStandardMaterial map={rollerTex} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* roller shafts, bearings & collars (stainless) */}
      {[-zr, zr].map((z) => (
        <group key={`sh${z}`} position={[0, yr, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh material={mats.steel} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.56, 16]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[0, s * 0.252, 0]} material={mats.steel}>
                <cylinderGeometry args={[0.0145, 0.0145, 0.012, 20]} />
              </mesh>
              <mesh position={[0, s * 0.268, 0]} material={mats.steel}>
                <cylinderGeometry args={[0.011, 0.011, 0.012, 20]} />
              </mesh>
              <mesh position={[0, s * 0.239, 0]} material={mats.aluDark}>
                <cylinderGeometry args={[0.02, 0.02, 0.016, 24]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* side plates carrying the rollers */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.2395, 0.705, 0]} material={mats.brushed} castShadow receiveShadow>
          <boxGeometry args={[0.008, 0.08, BELT.halfLen * 2 + 0.02]} />
        </mesh>
      ))}

      {/* frame: 4040 side rails, legs and cross members */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Extrusion axis="z" length={2.96} size={0.04} position={[s * railX, railY, 0]} />
          {[-1.35, 1.35].map((z) => (
            <group key={z}>
              <Extrusion axis="y" length={railY - 0.02} size={0.04} position={[s * railX, (railY - 0.02) / 2, z]} />
              <mesh position={[s * railX, 0.011, z]} material={mats.steel} castShadow>
                <cylinderGeometry args={[0.03, 0.03, 0.022, 24]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {[-1.35, 1.35].map((z) => (
        <group key={z}>
          <Extrusion axis="x" length={2 * railX - 0.04} size={0.02} position={[0, 0.3, z]} />
          <Extrusion axis="x" length={2 * railX - 0.04} size={0.02} position={[0, railY, z]} />
        </group>
      ))}
      {[-1, 1].map((s) => (
        <Extrusion key={s} axis="z" length={2.7} size={0.02} position={[s * railX, 0.3, 0]} />
      ))}

      {/* guard support posts (2020) */}
      {[-1, 1].map((s) =>
        [-1.4, -1.05, -0.8, -0.2, 0.2, 1.3].map((z) => (
          <Extrusion
            key={`${s}${z}`}
            axis="y"
            length={0.2}
            size={0.02}
            position={[s * railX, railY + 0.02 + 0.1, z]}
          />
        )),
      )}

      {/* M1: conveyor DC gearmotor at the infeed drive roller */}
      <group position={[-0.275, yr, -zr]}>
        <mesh material={mats.gearbox} position={[-0.005, 0, 0]} castShadow>
          <boxGeometry args={[0.06, 0.05, 0.06]} />
        </mesh>
        <mesh material={mats.motorBody} position={[-0.075, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.024, 0.024, 0.09, 28]} />
        </mesh>
        <mesh material={mats.steel} position={[-0.126, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.012, 20]} />
        </mesh>
        <mesh material={mats.blackPlastic} position={[-0.09, 0.032, 0]} castShadow>
          <boxGeometry args={[0.035, 0.02, 0.03]} />
        </mesh>
        <mesh material={mats.aluDark} position={[0.005, -0.04, 0]}>
          <boxGeometry args={[0.07, 0.01, 0.08]} />
        </mesh>
        <Label text="M1 · motor cinta" position={[-0.08, 0.1, 0]} height={0.03} />
      </group>
    </group>
  )
}
