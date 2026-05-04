import React, { Suspense, useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useTexture, ContactShadows, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ContourShape, ContourNorm } from '../utils/contour'
import type { Level, ImageEntry, ImageRenderData, ImageTransform, TransformMode } from '../types'
import { DEFAULT_LEVEL_THICKNESS, DEFAULT_LEVEL_Z_OFFSET, DEFAULT_LEVEL_COLOR } from '../store/db'

type SceneProps = {
  images: ImageEntry[]
  renderData: Record<string, ImageRenderData>
  levels: Level[]
  selectedId: string | null
  transformMode: TransformMode
  onSelect: (id: string | null) => void
  onTransformChange: (id: string, t: ImageTransform) => void
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
    <mesh geometry={geo} position={[0, 0, zOffset]} renderOrder={0}>
      <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        polygonOffset={true}
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
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
  useEffect(() => {
    if (texture) texture.colorSpace = THREE.SRGBColorSpace
  }, [texture])
  const planeW = norm.w * norm.scale
  const planeH = norm.h * norm.scale
  const cx = (norm.w / 2 - norm.bcx) * norm.scale
  const cy = (norm.bcy - norm.h / 2) * norm.scale
  return (
    <mesh position={[cx, cy, zOffset + thickness + 0.5]} renderOrder={1}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.01}
        polygonOffset={true}
        polygonOffsetFactor={-1}
        polygonOffsetUnits={1}
      />
    </mesh>
  )
}

/** A single image group — handles its own click and gizmo when selected */
function ImageGroup({
  img,
  rd,
  depth,
  zOffset,
  color,
  isSelected,
  transformMode,
  onSelect,
  onTransformChange,
}: {
  img: ImageEntry
  rd: ImageRenderData
  depth: number
  zOffset: number
  color: string
  isSelected: boolean
  transformMode: TransformMode
  onSelect: (id: string | null) => void
  onTransformChange: (id: string, t: ImageTransform) => void
}) {
  const [groupMounted, setGroupMounted] = useState(false)
  const groupRef = useRef<THREE.Group | null>(null)
  const setGroupRef = useCallback((node: THREE.Group | null) => {
    groupRef.current = node
    setGroupMounted(!!node)
  }, [])
  const orbitRef = useThree(state => (state as any).controls)
  const { x, y, rotationZ, scaleX, scaleY } = img.transform

  // Map our TransformMode to drei TransformControls props
  const tcMode: 'translate' | 'rotate' | 'scale' =
    transformMode === 'translate' ? 'translate'
    : transformMode === 'rotate' ? 'rotate'
    : 'scale'

  const showX = transformMode === 'translate' || transformMode === 'scale-x' || transformMode === 'scale-both'
  const showY = transformMode === 'translate' || transformMode === 'scale-y' || transformMode === 'scale-both'
  const showZ = transformMode === 'rotate'

  // commit transform only on mouse-up to avoid fighting TransformControls during drag

  return (
    <>
      {isSelected && groupMounted && (
        <TransformControls
          object={groupRef.current!}
          mode={tcMode}
          showX={showX}
          showY={showY}
          showZ={showZ}
          onMouseDown={() => { if (orbitRef) orbitRef.enabled = false }}
          onMouseUp={() => {
            if (orbitRef) orbitRef.enabled = true
            const g = groupRef.current
            if (!g) return
            onTransformChange(img.id, {
              x: g.position.x,
              y: g.position.y,
              rotationZ: g.rotation.z,
              scaleX: g.scale.x,
              scaleY: g.scale.y,
            })
          }}
        />
      )}
      <group
        ref={setGroupRef}
        position={[x, y, 0]}
        rotation={[0, 0, rotationZ]}
        scale={[scaleX, scaleY, 1]}
        onClick={e => { e.stopPropagation(); onSelect(img.id) }}
      >
        {rd.shapes.map((shape, idx) => (
          <ExtrudedShape key={idx} shape={shape} depth={depth} zOffset={zOffset} color={color} />
        ))}
        {rd.norm && (
          <Suspense fallback={null}>
            <ImageOverlay imageSrc={img.src} norm={rd.norm} zOffset={zOffset} thickness={depth} />
          </Suspense>
        )}
      </group>
    </>
  )
}

export default function Scene({ images, renderData, levels, selectedId, transformMode, onSelect, onTransformChange }: SceneProps) {
  const levelMap = useMemo(
    () => new Map(levels.map(l => [l.id, l])),
    [levels]
  )

  return (
    <Canvas
      gl={{ logarithmicDepthBuffer: true }}
      camera={{ position: [0, 0, 200], fov: 45, near: 0.1, far: 10000 }}
      style={{ background: '#1a1a2e' }}
      onPointerMissed={() => onSelect(null)}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, 100, 100]} intensity={0.8} />
      <directionalLight position={[-100, -50, 50]} intensity={0.3} />
      <OrbitControls makeDefault />

      <ContactShadows
        position={[0, 0, -0.5]}
        opacity={0.2}
        blur={2.5}
        far={60}
        resolution={512}
      />

      {images.map(img => {
        const rd = renderData[img.id]
        if (!rd || rd.shapes.length === 0) return null

        const level = img.levelId ? levelMap.get(img.levelId) : undefined
        const depth = level?.thickness ?? DEFAULT_LEVEL_THICKNESS
        const zOffset = level?.zOffset ?? DEFAULT_LEVEL_Z_OFFSET
        const color = img.shapeColor ?? level?.color ?? DEFAULT_LEVEL_COLOR

        return (
          <ImageGroup
            key={img.id}
            img={img}
            rd={rd}
            depth={depth}
            zOffset={zOffset}
            color={color}
            isSelected={img.id === selectedId}
            transformMode={transformMode}
            onSelect={onSelect}
            onTransformChange={onTransformChange}
          />
        )
      })}
    </Canvas>
  )
}
