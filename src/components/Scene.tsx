import React, { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { ContourShape, ContourNorm } from '../utils/contour'

type Props = {
  shapes: ContourShape[]
  imageSrc?: string | null
  norm?: ContourNorm | null
}

function ExtrudedShape({ shape }: { shape: ContourShape }) {
  const geo = useMemo(() => {
    const { outer, holes } = shape
    if (!outer || outer.length < 3) return null
    for (const p of outer) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null

    const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))

    for (const hole of holes) {
      if (hole.length < 3) continue
      s.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))))
    }

    return new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: false })
  }, [shape])

  if (!geo) return null
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#f5f5dc" side={THREE.DoubleSide} />
    </mesh>
  )
}

function ImageOverlay({ imageSrc, norm }: { imageSrc: string; norm: ContourNorm }) {
  const texture = useTexture(imageSrc)
  texture.colorSpace = THREE.SRGBColorSpace
  // Derive plane size and position from the same normalization used for contours
  const planeW = norm.w * norm.scale
  const planeH = norm.h * norm.scale
  const cx = (norm.w / 2 - norm.bcx) * norm.scale
  const cy = (norm.bcy - norm.h / 2) * norm.scale
  return (
    <mesh position={[cx, cy, 5.1]}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.01} />
    </mesh>
  )
}

export default function Scene({ shapes, imageSrc, norm }: Props) {
  return (
    <Canvas camera={{ position: [0, 0, 200], fov: 45 }} style={{ background: '#1a1a2e' }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 100, 100]} intensity={0.8} />
      <directionalLight position={[-100, -50, 50]} intensity={0.3} />
      <OrbitControls makeDefault />
      <group>
        {shapes.map((s, idx) => <ExtrudedShape key={idx} shape={s} />)}
      </group>
      {imageSrc && norm && (
        <Suspense fallback={null}>
          <ImageOverlay imageSrc={imageSrc} norm={norm} />
        </Suspense>
      )}
    </Canvas>
  )
}
