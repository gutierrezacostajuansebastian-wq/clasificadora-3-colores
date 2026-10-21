import * as THREE from 'three'

export const mats = {
  alu: new THREE.MeshStandardMaterial({ color: '#c6cbd1', metalness: 0.92, roughness: 0.34 }),
  aluDark: new THREE.MeshStandardMaterial({ color: '#4a525c', metalness: 0.85, roughness: 0.4 }),
  steel: new THREE.MeshStandardMaterial({ color: '#e1e4e8', metalness: 1, roughness: 0.18 }),
  brushed: new THREE.MeshStandardMaterial({ color: '#b9bec5', metalness: 1, roughness: 0.45 }),
  blackPlastic: new THREE.MeshStandardMaterial({ color: '#16181b', metalness: 0.1, roughness: 0.55 }),
  paintGray: new THREE.MeshStandardMaterial({ color: '#b8bec4', metalness: 0.25, roughness: 0.5 }),
  backplate: new THREE.MeshStandardMaterial({ color: '#d9a35c', metalness: 0.5, roughness: 0.55 }),
  acrylic: new THREE.MeshPhysicalMaterial({
    color: '#bfe6ff',
    transparent: true,
    opacity: 0.22,
    roughness: 0.05,
    metalness: 0,
    transmission: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  rubber: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.95, metalness: 0 }),
  floor: new THREE.MeshStandardMaterial({ color: '#2d3139', roughness: 0.82, metalness: 0.05 }),
  motorBody: new THREE.MeshStandardMaterial({ color: '#3b4a63', metalness: 0.7, roughness: 0.4 }),
  gearbox: new THREE.MeshStandardMaterial({ color: '#8d949c', metalness: 0.85, roughness: 0.35 }),
  safetyYellow: new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.6 }),
  anodOrange: new THREE.MeshStandardMaterial({ color: '#e4741a', metalness: 0.7, roughness: 0.38 }),
}

export const ledMat = (color: string, on: boolean) =>
  new THREE.MeshStandardMaterial({
    color: on ? color : '#222',
    emissive: color,
    emissiveIntensity: on ? 5 : 0.02,
    toneMapped: false,
  })
