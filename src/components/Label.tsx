import { memo, useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'

const texCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

function makeLabel(text: string, color: string, bg: string) {
  const key = `${text}|${color}|${bg}`
  const hit = texCache.get(key)
  if (hit) return hit
  const lines = text.split('\n')
  const fontPx = 44
  const pad = 18
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = `600 ${fontPx}px "Segoe UI", Arial, sans-serif`
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2
  const h = lines.length * (fontPx + 8) + pad * 2 - 8
  c.width = w
  c.height = h
  ctx.font = `600 ${fontPx}px "Segoe UI", Arial, sans-serif`
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * (fontPx + 8)))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const res = { tex, aspect: w / h }
  texCache.set(key, res)
  return res
}

interface Props {
  text: string
  position: [number, number, number]
  /** World height of the tag in metres. */
  height?: number
  color?: string
  bg?: string
  billboard?: boolean
}

/** Camera-facing text tag rendered from a canvas (no external font download needed). */
export const Label = memo(function Label({
  text,
  position,
  height = 0.035,
  color = '#ffffff',
  bg = 'rgba(15,20,28,0.82)',
  billboard = true,
}: Props) {
  const { tex, aspect } = useMemo(() => makeLabel(text, color, bg), [text, color, bg])
  const mesh = (
    <mesh renderOrder={20}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
  return billboard ? (
    <Billboard position={position}>{mesh}</Billboard>
  ) : (
    <group position={position}>{mesh}</group>
  )
})
