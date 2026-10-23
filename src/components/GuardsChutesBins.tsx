import { useMemo, useState } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BELT,
  BINS,
  CHUTE,
  COLORS,
  GUARD,
  INFEED,
  PIECE,
  SLOT,
  chuteGeom,
  clampToInfeed,
  fixedBoxes,
  type BinDef,
} from '../sim/layout'
import { useSim } from '../sim/store'
import { Label } from './Label'
import { mats } from './materials'

function BinVisual({ bin, label, colorHex }: { bin: BinDef; label: string; colorHex: string }) {
  const t = 0.012
  const h = bin.rim
  const binMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.42,
        metalness: 0.18,
      }),
    [colorHex],
  )
  const rimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.28,
        metalness: 0.35,
      }),
    [colorHex],
  )

  return (
    <group position={[bin.cx, 0, bin.cz]}>
      {/* Base floor */}
      <mesh position={[0, t, 0]} material={binMat} castShadow receiveShadow>
        <boxGeometry args={[bin.hx * 2 + 4 * t, 2 * t, bin.hz * 2 + 4 * t]} />
      </mesh>
      {/* Inner dark rubber mat */}
      <mesh position={[0, 2 * t + 0.002, 0]} material={mats.rubber} receiveShadow>
        <boxGeometry args={[bin.hx * 1.92, 0.004, bin.hz * 1.92]} />
      </mesh>
      {/* 4 walls */}
      <mesh position={[bin.hx + t, h / 2, 0]} material={binMat} castShadow receiveShadow>
        <boxGeometry args={[2 * t, h, bin.hz * 2 + 4 * t]} />
      </mesh>
      <mesh position={[-bin.hx - t, h / 2, 0]} material={binMat} castShadow receiveShadow>
        <boxGeometry args={[2 * t, h, bin.hz * 2 + 4 * t]} />
      </mesh>
      <mesh position={[0, h / 2, bin.hz + t]} material={binMat} castShadow receiveShadow>
        <boxGeometry args={[bin.hx * 2 + 4 * t, h, 2 * t]} />
      </mesh>
      <mesh position={[0, h / 2, -bin.hz - t]} material={binMat} castShadow receiveShadow>
        <boxGeometry args={[bin.hx * 2 + 4 * t, h, 2 * t]} />
      </mesh>
      {/* Upper reinforced rim lip */}
      <mesh position={[0, h + 0.008, bin.hz + t]} material={rimMat}>
        <boxGeometry args={[bin.hx * 2 + 6 * t, 0.016, 3 * t]} />
      </mesh>
      <mesh position={[0, h + 0.008, -bin.hz - t]} material={rimMat}>
        <boxGeometry args={[bin.hx * 2 + 6 * t, 0.016, 3 * t]} />
      </mesh>
      <mesh position={[bin.hx + t, h + 0.008, 0]} material={rimMat}>
        <boxGeometry args={[3 * t, 0.016, bin.hz * 2 + 6 * t]} />
      </mesh>
      <mesh position={[-bin.hx - t, h + 0.008, 0]} material={rimMat}>
        <boxGeometry args={[3 * t, 0.016, bin.hz * 2 + 6 * t]} />
      </mesh>
      <Label text={label} position={[0, h + 0.09, 0]} height={0.036} />
    </group>
  )
}

function ChuteVisual({ side, colorHex, label }: { side: -1 | 1; colorHex: string; label: string }) {
  const g = useMemo(() => chuteGeom(side), [side])
  const fl = 0.05
  const trimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.4 }),
    [colorHex],
  )
  return (
    <group>
      {/* Slide bed */}
      <mesh
        position={[g.cx, g.cy, CHUTE.zc]}
        rotation={[0, 0, g.ang]}
        material={mats.steel}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[g.len, 0.01, CHUTE.halfZ * 2]} />
      </mesh>
      {/* Side containment flanges */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            position={[
              g.cx + g.n[0] * fl,
              g.cy + g.n[1] * fl,
              CHUTE.zc + s * (CHUTE.halfZ + 0.005),
            ]}
            rotation={[0, 0, g.ang]}
            material={mats.brushed}
            castShadow
          >
            <boxGeometry args={[g.len, fl * 2, 0.01]} />
          </mesh>
          <mesh
            position={[
              g.cx + g.n[0] * (fl * 2 + 0.004),
              g.cy + g.n[1] * (fl * 2 + 0.004),
              CHUTE.zc + s * (CHUTE.halfZ + 0.005),
            ]}
            rotation={[0, 0, g.ang]}
            material={trimMat}
          >
            <boxGeometry args={[g.len, 0.012, 0.014]} />
          </mesh>
        </group>
      ))}
      <Label
        text={label}
        position={[side * 0.39, 0.69, CHUTE.zc]}
        height={0.028}
      />
    </group>
  )
}

export function GuardsChutesBins() {
  const boxes = useMemo(() => fixedBoxes(), [])
  const placeSpec = useSim((s) => s.placeSpec)
  const spawn = useSim((s) => s.spawn)
  const counts = useSim((s) => s.telemetry.counts)
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null)

  const wallY0 = BELT.top
  const wallY1 = BELT.top + GUARD.h
  const guardSegs: [number, number][] = [
    [-BELT.halfLen, SLOT.z0],
    [SLOT.z1, BELT.halfLen],
  ]

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const [x, z] = clampToInfeed(e.point.x, e.point.z)
    setHoverPos([x, z])
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!placeSpec) return
    e.stopPropagation()
    const [x, z] = clampToInfeed(e.point.x, e.point.z)
    spawn(placeSpec.color, placeSpec.shape, { x, z })
  }

  return (
    <group>
      {/* Static physics colliders for floor, belt bed, guards, funnel, chutes and bins */}
      <RigidBody type="fixed" colliders={false}>
        {boxes.map((b) => (
          <CuboidCollider
            key={b.id}
            args={b.half}
            position={b.pos}
            rotation={b.rot ?? [0, 0, 0]}
            friction={b.friction ?? 0.5}
            restitution={b.restitution ?? 0.05}
          />
        ))}
      </RigidBody>

      {/* Industrial Shop Floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floor} receiveShadow>
        <planeGeometry args={[12, 12]} />
      </mesh>
      <gridHelper args={[8, 32, '#3b4252', '#252a34']} position={[0, 0.002, 0]} />

      {/* Clear Acrylic & Metallic Sidewall Guards with Left (-X) & Right (+X) Discharge Slots */}
      {([-1, 1] as const).map((s) => {
        const x = s * GUARD.x
        return (
          <group key={s}>
            {guardSegs.map(([za, zb], idx) => {
              const len = zb - za
              const zc = (za + zb) / 2
              return (
                <group key={idx}>
                  {/* Top & bottom metallic rails */}
                  <mesh position={[x, wallY1, zc]} material={mats.aluDark} castShadow>
                    <boxGeometry args={[GUARD.halfT * 2.4, 0.012, len]} />
                  </mesh>
                  <mesh position={[x, wallY0 + 0.006, zc]} material={mats.aluDark}>
                    <boxGeometry args={[GUARD.halfT * 2.4, 0.012, len]} />
                  </mesh>
                  {/* Clear low-friction polycarbonate panel */}
                  <mesh position={[x, (wallY0 + wallY1) / 2, zc]} material={mats.acrylic}>
                    <boxGeometry args={[GUARD.halfT * 1.4, GUARD.h - 0.024, len]} />
                  </mesh>
                </group>
              )
            })}
            {/* Slot portal vertical posts */}
            {[SLOT.z0, SLOT.z1].map((zp) => (
              <mesh key={zp} position={[x, (wallY0 + wallY1) / 2, zp]} material={mats.steel} castShadow>
                <boxGeometry args={[0.016, GUARD.h + 0.01, 0.016]} />
              </mesh>
            ))}
          </group>
        )
      })}

      {/* Infeed Portal (-Z) with Entry Cutout Slot */}
      <group position={[0, 0, -BELT.halfLen - 0.012]}>
        <mesh position={[-0.164, 0.81, 0]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.128, 0.12, 0.012]} />
        </mesh>
        <mesh position={[0.164, 0.81, 0]} material={mats.aluDark} castShadow>
          <boxGeometry args={[0.128, 0.12, 0.012]} />
        </mesh>
        <mesh position={[0, 0.86, 0]} material={mats.safetyYellow} castShadow>
          <boxGeometry args={[0.2, 0.022, 0.016]} />
        </mesh>
        <Label text="INFEED (-Z)" position={[0, 0.93, 0]} height={0.028} />
      </group>

      {/* Centering Infeed Funnel + Metering Guide Rails */}
      {boxes
        .filter((b) => b.id.startsWith('funnel') || b.id.startsWith('lane'))
        .map((b) => (
          <group key={b.id} position={b.pos} rotation={b.rot ?? [0, 0, 0]}>
            <mesh material={mats.acrylic}>
              <boxGeometry args={[b.half[0] * 2, b.half[1] * 2, b.half[2] * 2]} />
            </mesh>
            <mesh position={[0, b.half[1], 0]} material={mats.steel}>
              <boxGeometry args={[b.half[0] * 2, 0.008, b.half[2] * 2.2]} />
            </mesh>
          </group>
        ))}

      {/* Terminal End Discharge Guide (+Z) */}
      <Label
        text="LIFT-BRIDGE DISCHARGE (+Z · GREEN / NOVEDADES)"
        position={[0, BELT.top + 0.2, BELT.halfLen - 0.02]}
        height={0.026}
      />

      {/* Decline Chutes */}
      <ChuteVisual side={-1} colorHex={COLORS.red} label="RED SLOT (-X)" />
      <ChuteVisual side={1} colorHex={COLORS.blue} label="BLUE SLOT (+X)" />

      {/* 4 Collection Bins: Red (-X), Blue (+X), Novedades/Anomaly (under bridge void), Green (+Z) */}
      <BinVisual bin={BINS.red} label={`RED BIN (-X) [${counts.red}]`} colorHex={COLORS.red} />
      <BinVisual bin={BINS.blue} label={`BLUE BIN (+X) [${counts.blue}]`} colorHex={COLORS.blue} />
      <BinVisual
        bin={BINS.anomaly}
        label={`NOVEDADES / DEFECT [${counts.anomaly}]`}
        colorHex={COLORS.yellow}
      />
      <BinVisual bin={BINS.green} label={`GREEN BIN (+Z) [${counts.green}]`} colorHex={COLORS.green} />

      {/* Interactive Infeed Click-to-Place / Drag-and-Drop Zone */}
      <mesh
        position={[0, BELT.top + 0.003, (INFEED.z0 + INFEED.z1) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverPos(null)}
        onPointerDown={onDown}
      >
        <planeGeometry args={[INFEED.halfW * 2, INFEED.z1 - INFEED.z0]} />
        <meshBasicMaterial
          color={placeSpec ? COLORS[placeSpec.color] : '#38bdf8'}
          transparent
          opacity={placeSpec ? 0.26 : 0.08}
          depthWrite={false}
        />
      </mesh>

      {/* Ghost preview when Click-to-Place mode is armed */}
      {placeSpec && hoverPos && (
        <group position={[hoverPos[0], BELT.top + PIECE.h / 2 + 0.01, hoverPos[1]]}>
          <mesh>
            {placeSpec.shape === 'cube' ? (
              <boxGeometry args={[PIECE.size, PIECE.h, PIECE.size]} />
            ) : (
              <cylinderGeometry args={[PIECE.size / 2, PIECE.size / 2, PIECE.h, 24]} />
            )}
            <meshStandardMaterial
              color={COLORS[placeSpec.color]}
              transparent
              opacity={0.65}
              emissive={COLORS[placeSpec.color]}
              emissiveIntensity={0.4}
            />
          </mesh>
        </group>
      )}
    </group>
  )
}
