import type { ContourParams, ContourShape, ContourNorm } from './utils/contour'

export type { ContourParams, ContourShape, ContourNorm }

export type Level = {
  id: string
  name: string
  zOffset: number
  thickness: number
  color: string
}

export type ImageTransform = {
  x: number
  y: number
  rotationZ: number
  scaleX: number
  scaleY: number
}

export type TransformMode = 'translate' | 'rotate' | 'scale-x' | 'scale-y' | 'scale-both'

export type ImageEntry = {
  id: string
  filename: string
  /** Stored in IndexedDB */
  blob: Blob
  /** Runtime blob URL — regenerated after load, not persisted */
  src: string
  levelId: string | null
  params: ContourParams
  transform: ImageTransform
}

/** Derived per-image render data (not persisted) */
export type ImageRenderData = {
  shapes: ContourShape[]
  norm: ContourNorm | null
  extracting: boolean
}
