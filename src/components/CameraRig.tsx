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
  const { camera, size } = useThree()

  // Scale out camera distance automatically on portrait mobile screens so the 3m conveyor fits
  const aspect = size.width / Math.max(1, size.height)
  const portraitScale = aspect < 1 ? Math.min(1.65, 1 / Math.pow(aspect, 0.52)) : 1

  const desiredPos = useRef(new THREE.Vector3(1.85, 1.62, 0.25))
  const desiredTarget = useRef(new THREE.Vector3(0, 0.75, 0.2))

  useEffect(() => {
    const ctrl = controlsRef.current
    if (!ctrl) return
    if (cameraMode === 'top') {
      camera.position.set(0.01, 2.85 * portraitScale, 0.22)
      ctrl.target.set(0, 0.76, 0.22)
      ctrl.update()
    } else if (cameraMode === 'orbit') {
      camera.position.set(
        1.85 * portraitScale,
        1.55 * Math.pow(portraitScale, 0.7),
        0.25 * portraitScale,
      )
      ctrl.target.set(0, 0.74, 0.2)
      ctrl.update()
    }
  }, [cameraMode, camera, portraitScale])

  useFrame((_, dt) => {
    const ctrl = controlsRef.current
    if (!ctrl) return

    if (cameraMode === 'top') {
      desiredPos.current.set(0.001, 2.85 * portraitScale, 0.22)
      desiredTarget.current.set(0, 0.76, 0.22)
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
        desiredPos.current.set(
          t.x + 0.68 * portraitScale,
          t.y + 0.48 * portraitScale,
          t.z - 0.55 * portraitScale,
        )
      } else {
        desiredTarget.current.set(0, 0.78, 0.15)
        desiredPos.current.set(1.2 * portraitScale, 1.35 * portraitScale, -0.75)
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
      minDistance={0.4}
      maxDistance={9.5}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  )
}
