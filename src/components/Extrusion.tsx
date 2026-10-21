import { useMemo } from 'react'
import * as THREE from 'three'
import { mats } from './materials'

const cache = new Map<string, THREE.ExtrudeGeometry>()

/** T-slot aluminium profile (4040 / 2020 style). Outline traced CCW with four T-slots + centre bore. */
function profileShape(S: number): THREE.Shape {
  const h = S / 2
  const wo = 0.22 * S
  const dn = 0.07 * S
  const wc = 0.44 * S
  const dc = 0.2 * S
  const top: [number, number][] = [
    [h, h],
    [wo / 2, h],
    [wo / 2, h - dn],
    [wc / 2, h - dn],
    [wc / 2, h - dn - dc],
    [-wc / 2, h - dn - dc],
    [-wc / 2, h - dn],
    [-wo / 2, h - dn],
    [-wo / 2, h],
  ]
  const pts: [number, number][] = []
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (const [x, y] of top) pts.push([x * c - y * s, x * s + y * c])
  }
  const shape = new THREE.Shape()
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const hole = new THREE.Path()
  hole.absarc(0, 0, 0.09 * S, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

function getGeometry(S: number, length: number, axis: 'x' | 'y' | 'z') {
  const key = `${S}|${length.toFixed(4)}|${axis}`
  let g = cache.get(key)
  if (!g) {
    g = new THREE.ExtrudeGeometry(profileShape(S), { depth: length, bevelEnabled: false, curveSegments: 6 })
    g.translate(0, 0, -length / 2)
    if (axis === 'y') g.rotateX(-Math.PI / 2)
    else if (axis === 'x') g.rotateY(Math.PI / 2)
    cache.set(key, g)
  }
  return g
}

interface Props {
  /** Centre of the profile in world/parent coordinates. */
  position: [number, number, number]
  length: number
  axis: 'x' | 'y' | 'z'
  size?: number
  castShadow?: boolean
  material?: THREE.Material
}

export function Extrusion({ position, length, axis, size = 0.04, castShadow = true, material }: Props) {
  const geo = useMemo(() => getGeometry(size, length, axis), [size, length, axis])
  return <mesh position={position} geometry={geo} material={material ?? mats.alu} castShadow={castShadow} receiveShadow />
}

/** Helper: profile between two points that are axis aligned. */
export function ExtrusionBetween({
  from,
  to,
  size = 0.04,
}: {
  from: [number, number, number]
  to: [number, number, number]
  size?: number
}) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const axis = Math.abs(d[0]) > 1e-6 ? 'x' : Math.abs(d[1]) > 1e-6 ? 'y' : 'z'
  const length = Math.hypot(d[0], d[1], d[2])
  return (
    <Extrusion
      axis={axis}
      length={length}
      size={size}
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
    />
  )
}
