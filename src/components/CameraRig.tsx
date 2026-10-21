import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { runtime, useSim } from '../sim/store'

export function CameraRig() {
  const cameraMode = useSim((s) => s.camera)
  const followId = useSim((s) => s.followId)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()

  const desiredPos = useRef(new THREE.Vector3(1.65, 1.55, -0.35))
  const desiredTarget = useRef(new THREE.Vector3(0, 0.78, 0.1))

  useEffect(() => {
    const ctrl = controlsRef.current
    if (!ctrl) return
    if (cameraMode === 'top') {
      camera.position.set(0.01, 2.75, 0.02)
      ctrl.target.set(0, 0.8, 0.02)
      ctrl.update()
    } else if (cameraMode === 'orbit') {
      camera.position.set(1.65, 1.55, -0.35)
      ctrl.target.set(0, 0.78, 0.1)
      ctrl.update()
    }
  }, [cameraMode, camera])

  useFrame((_, dt) => {
    const ctrl = controlsRef.current
    if (!ctrl) return

    if (cameraMode === 'top') {
      desiredPos.current.set(0.001, 2.75, 0.02)
      desiredTarget.current.set(0, 0.8, 0.02)
      camera.position.lerp(desiredPos.current, Math.min(1, dt * 6))
      ctrl.target.lerp(desiredTarget.current, Math.min(1, dt * 6))
      ctrl.update()
    } else if (cameraMode === 'follow') {
      const piece =
        (followId ? runtime.bodies.get(followId) : undefined) ??
        Array.from(runtime.bodies.values()).at(-1)
      if (piece) {
        const t = piece.body.translation()
        desiredTarget.current.set(t.x, t.y + 0.04, t.z + 0.1)
        desiredPos.current.set(t.x + 0.68, t.y + 0.48, t.z - 0.55)
      } else {
        desiredTarget.current.set(0, 0.8, 0.05)
        desiredPos.current.set(1.1, 1.35, -0.8)
      }
      camera.position.lerp(desiredPos.current, Math.min(1, dt * 4.5))
      ctrl.target.lerp(desiredTarget.current, Math.min(1, dt * 6))
      ctrl.update()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.45}
      maxDistance={6.5}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  )
}
