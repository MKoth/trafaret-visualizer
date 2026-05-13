import type { ContourParams, ContourShape, ContourNorm } from './utils/contour'

export type { ContourParams, ContourShape, ContourNorm }

export type Level = {
  id: string
  name: string
  zOffset: number
  thickness: number
  color: string
  projectId: string
}

export type Project = {
  id: string
  name: string
  createdAt: number
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
  /** Per-image shape color override. Falls back to assigned level color, then DEFAULT_LEVEL_COLOR. */
  shapeColor?: string
  /** Border outline thickness in scene units (0 = no border). */
  borderThickness?: number
  /** Border outline color (hex). */
  borderColor?: string
  projectId: string
  params: ContourParams
  transform: ImageTransform
}

/** Derived per-image render data (not persisted) */
export type ImageRenderData = {
  shapes: ContourShape[]
  norm: ContourNorm | null
  extracting: boolean
}

export type TemplateItem = {
  instanceId: string
  imageId: string
  x: number // mm from page left
  y: number // mm from page top
  widthMm: number
  heightMm: number
  rotationRad: number
}
