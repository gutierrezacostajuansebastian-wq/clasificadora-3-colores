import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { CameraRig } from './components/CameraRig'
import { ControlDock } from './components/ControlDock'
import { Conveyor } from './components/Conveyor'
import { DualSteering } from './components/DualSteering'
import { ElectricalCabinet } from './components/ElectricalCabinet'
import { GuardsChutesBins } from './components/GuardsChutesBins'
import { LiftBridge } from './components/LiftBridge'
import { Pieces } from './components/Pieces'
import { ShroudedStation } from './components/ShroudedStation'
import { SimController } from './components/SimController'
import { HOOD, HOOD2, LANE, LANE2 } from './sim/layout'
import { useSim } from './sim/store'

export default function App() {
  const pressStart = useSim((s) => s.pressStart)
  const spawnRandomSequence = useSim((s) => s.spawnRandomSequence)

  // Trigger automatic CNC-style homing sequence & queue a demo batch on boot
  useEffect(() => {
    const t1 = setTimeout(() => {
      pressStart()
    }, 450)
    const t2 = setTimeout(() => {
      spawnRandomSequence(7)
    }, 950)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [pressStart, spawnRandomSequence])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0d1015] select-none">
      <ControlDock />

      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.85, 1.62, 0.25], fov: 42, near: 0.05, far: 40 }}
      >
        <color attach="background" args={['#0f131a']} />
        <fog attach="fog" args={['#0f131a', 6, 16]} />

        {/* Realistic industrial key + fill lighting & studio HDRI reflections */}
        <ambientLight intensity={0.45} />
        <hemisphereLight args={['#dbeafe', '#1e293b', 0.55]} />
        <directionalLight
          castShadow
          position={[2.6, 4.2, 1.8]}
          intensity={2.2}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-2.8}
          shadow-camera-right={2.8}
          shadow-camera-top={2.8}
          shadow-camera-bottom={-2.8}
          shadow-camera-near={0.5}
          shadow-camera-far={10}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-2.4, 2.2, -1.6]} intensity={0.7} color="#93c5fd" />

        <Environment resolution={256}>
          <group rotation={[-Math.PI / 3, 0, 1]}>
            <Lightformer
              form="rect"
              intensity={3}
              rotation-x={Math.PI / 2}
              position={[0, 5, -2]}
              scale={[6, 2, 1]}
            />
            <Lightformer
              form="rect"
              intensity={2}
              rotation-y={Math.PI / 2}
              position={[-5, 2, -1]}
              scale={[5, 1.5, 1]}
            />
            <Lightformer
              form="ring"
              color="#60a5fa"
              intensity={1.5}
              rotation-y={-Math.PI / 2}
              position={[5, 2, 1]}
              scale={[3, 3, 1]}
            />
          </group>
        </Environment>

        <Suspense fallback={null}>
          <Physics timeStep={1 / 120} gravity={[0, -9.81, 0]}>
            <SimController />
            <Conveyor />
            <GuardsChutesBins />
            <ShroudedStation kind="primary" z={HOOD.z} railX={LANE.x} />
            <DualSteering />
            <ShroudedStation kind="verify" z={HOOD2.z} railX={LANE2.x} />
            <LiftBridge />
            <ElectricalCabinet />
            <Pieces />
          </Physics>
        </Suspense>

        <CameraRig />
      </Canvas>
    </div>
  )
}
