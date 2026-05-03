import React, { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { ContourShape, ContourNorm } from '../utils/contour'
import type { Level, ImageEntry, ImageRenderData } from '../types'
import { DEFAULT_LEVEL_THICKNESS, DEFAULT_LEVEL_Z_OFFSET, DEFAULT_LEVEL_COLOR } from '../store/db'

type SceneProps = {
  images: ImageEntry[]
  renderData: Record<string, ImageRenderData>
  levels: Level[]
}

function ExtrudedShape({
  shape,
  depth,
  zOffset,
  color,
}: {
  shape: ContourShape
  depth: number
  zOffset: number
  color: string
}) {
  const geo = useMemo(() => {
    const { outer, holes } = shape
    if (!outer || outer.length < 3) return null
    for (const p of outer) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null

    const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)))
    for (const hole of holes) {
      if (hole.length < 3) continue
      s.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))))
    }
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  }, [shape, depth])

  if (!geo) return null
  return (
    <mesh geometry={geo} position={[0, 0, zOffset]}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} />
    </mesh>
  )
}

function ImageOverlay({
  imageSrc,
  norm,
  zOffset,
  thickness,
}: {
  imageSrc: string
  norm: ContourNorm
  zOffset: number
  thickness: number
}) {
  const texture = useTexture(imageSrc)
  texture.colorSpace = THREE.SRGBColorSpace
  const planeW = norm.w * norm.scale
  const planeH = norm.h * norm.scale
  const cx = (norm.w / 2 - norm.bcx) * norm.scale
  const cy = (norm.bcy - norm.h / 2) * norm.scale
  return (
    <mesh position={[cx, cy, zOffset + thickness + 0.1]}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.01} />
    </mesh>
  )
}

export default function Scene({ images, renderData, levels }: SceneProps) {
  const levelMap = useMemo(
    () => new Map(levels.map(l => [l.id, l])),
    [levels]
  )

  return (
    <Canvas camera={{ position: [0, 0, 200], fov: 45 }} style={{ background: '#1a1a2e' }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 100, 100]} intensity={0.8} />
      <directionalLight position={[-100, -50, 50]} intensity={0.3} />
      <OrbitControls makeDefault />

      {images.map(img => {
        const rd = renderData[img.id]
        if (!rd || rd.shapes.length === 0) return null

        const level = img.levelId ? levelMap.get(img.levelId) : undefined
        const depth = level?.thickness ?? DEFAULT_LEVEL_THICKNESS
        const zOffset = level?.zOffset ?? DEFAULT_LEVEL_Z_OFFSET
        const color = level?.color ?? DEFAULT_LEVEL_COLOR

        return (
          <React.Fragment key={img.id}>
            <group>
              {rd.shapes.map((shape, idx) => (
                <ExtrudedShape
                  key={idx}
                  shape={shape}
                  depth={depth}
                  zOffset={zOffset}
                  color={color}
                />
              ))}
            </group>
            {rd.norm && (
              <Suspense fallback={null}>
                <ImageOverlay
                  imageSrc={img.src}
                  norm={rd.norm}
                  zOffset={zOffset}
                  thickness={depth}
                />
              </Suspense>
            )}
          </React.Fragment>
        )
      })}
    </Canvas>
  )
}
