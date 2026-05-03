import type { ContourParams, ContourShape, ContourNorm } from './utils/contour'

export type { ContourParams, ContourShape, ContourNorm }

export type Level = {
  id: string
  name: string
  zOffset: number
  thickness: number
  color: string
}

export type ImageEntry = {
  id: string
  filename: string
  /** Stored in IndexedDB */
  blob: Blob
  /** Runtime blob URL — regenerated after load, not persisted */
  src: string
  levelId: string | null
  params: ContourParams
}

/** Derived per-image render data (not persisted) */
export type ImageRenderData = {
  shapes: ContourShape[]
  norm: ContourNorm | null
  extracting: boolean
}
