import type { ImageEntry, ImageRenderData } from '../types'

export type ItemSize = { widthMm: number; heightMm: number; rotationRad: number }

export function computeItemSize(img: ImageEntry, rd: ImageRenderData | undefined, mmPerUnit: number): ItemSize | null {
  if (!rd || !rd.norm) return null
  const norm = rd.norm
  const widthMm = norm.w * norm.scale * img.transform.scaleX * mmPerUnit
  const heightMm = norm.h * norm.scale * img.transform.scaleY * mmPerUnit
  const rotationRad = img.transform.rotationZ || 0
  return { widthMm, heightMm, rotationRad }
}

/**
 * Simple greedy row-fill packer. Returns positions in mm (x,y)
 */
export function packItems(sizes: { id: string; w: number; h: number }[], pageWidthMm: number, marginMm = 6) {
  const sorted = sizes.slice().sort((a, b) => b.h - a.h)
  const positions: Record<string, { x: number; y: number }> = {}

  let curX = marginMm
  let curY = marginMm
  let rowH = 0

  for (const s of sorted) {
    if (curX + s.w + marginMm > pageWidthMm) {
      // new row
      curX = marginMm
      curY += rowH + marginMm
      rowH = 0
    }
    positions[s.id] = { x: curX, y: curY }
    curX += s.w + marginMm
    rowH = Math.max(rowH, s.h)
  }

  return positions
}
