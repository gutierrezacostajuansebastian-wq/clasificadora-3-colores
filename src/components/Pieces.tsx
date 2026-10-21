import { useEffect, useMemo, useRef } from 'react'
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import * as THREE from 'three'
import { COLORS, PIECE, type PieceColor } from '../sim/layout'
import { runtime, useSim, type PieceSpec } from '../sim/store'

const pieceMats: Record<PieceColor, THREE.MeshStandardMaterial> = {
  red: new THREE.MeshStandardMaterial({
    color: COLORS.red,
    roughness: 0.36,
    metalness: 0.08,
  }),
  green: new THREE.MeshStandardMaterial({
    color: COLORS.green,
    roughness: 0.36,
    metalness: 0.08,
  }),
  blue: new THREE.MeshStandardMaterial({
    color: COLORS.blue,
    roughness: 0.36,
    metalness: 0.08,
  }),
}

function WorkpieceItem({ spec }: { spec: PieceSpec }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const setFollow = useSim((s) => s.setCamera)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    runtime.bodies.set(spec.id, {
      id: spec.id,
      color: spec.color,
      body,
      counted: false,
      bin: null,
      floorT: 0,
    })
    runtime.pieceKinds.set(spec.id, { color: spec.color, shape: spec.shape })
    return () => {
      runtime.bodies.delete(spec.id)
      runtime.pieceKinds.delete(spec.id)
    }
  }, [spec.id, spec.color, spec.shape])

  const half = PIECE.size / 2
  const mat = useMemo(() => pieceMats[spec.color], [spec.color])

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={[spec.x, spec.y, spec.z]}
      rotation={[0, spec.yaw, 0]}
      ccd={true}
      canSleep={false}
      linearDamping={0.05}
      angularDamping={0.6}
    >
      {spec.shape === 'cube' ? (
        <CuboidCollider args={[half, half, half]} density={1200} friction={0.1} restitution={0.1} />
      ) : (
        <CylinderCollider args={[half, half]} density={1200} friction={0.1} restitution={0.1} />
      )}
      <mesh
        material={mat}
        castShadow
        receiveShadow
        onDoubleClick={(e) => {
          e.stopPropagation()
          useSim.setState({ followId: spec.id })
          setFollow('follow')
        }}
      >
        {spec.shape === 'cube' ? (
          <boxGeometry args={[PIECE.size, PIECE.size, PIECE.size]} />
        ) : (
          <cylinderGeometry args={[half, half, PIECE.size, 28]} />
        )}
      </mesh>
    </RigidBody>
  )
}

export function Pieces() {
  const pieces = useSim((s) => s.pieces)
  return (
    <group>
      {pieces.map((p) => (
        <WorkpieceItem key={p.id} spec={p} />
      ))}
    </group>
  )
}
