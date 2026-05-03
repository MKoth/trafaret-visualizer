import * as MarchingSquares from 'marchingsquares'
import simplify from 'simplify-js'

export type ContourParams = {
  /** Alpha channel threshold: pixels with alpha > this are "opaque" (1–254) */
  alphaThreshold: number
  /** marchingsquares iso level (0.1–0.9) */
  isoLevel: number
  /** simplify-js tolerance in pixels (0.1–10) */
  simplifyTolerance: number
  /** If >0, downscale images whose largest dimension exceeds this value (px) */
  maxDimension: number
  /** Flip opaque/transparent — use when background is opaque and subject is transparent */
  invertAlpha: boolean
}

export const DEFAULT_PARAMS: ContourParams = {
  alphaThreshold: 10,
  isoLevel: 0.5,
  simplifyTolerance: 1.5,
  maxDimension: 0,
  invertAlpha: false,
}

export type ContourShape = {
  outer: Array<[number, number]>
  holes: Array<Array<[number, number]>>
}

/** Normalization params used to map image pixels → 3D coordinates */
export type ContourNorm = {
  w: number    // image width after any downscaling
  h: number    // image height after any downscaling
  bcx: number  // bounding-box center x in pixel space
  bcy: number  // bounding-box center y in pixel space
  scale: number
}

export type ContourResult = {
  shapes: ContourShape[]
  norm: ContourNorm
}

function shoelaceArea(pts: Array<[number, number]>): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}



export async function imageToContours(
  src: string,
  params: ContourParams = DEFAULT_PARAMS
): Promise<ContourResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
        const iw = img.width
        const ih = img.height
        // Optionally downscale very large images for more stable contouring
        const scaleFactor = params.maxDimension && params.maxDimension > 0 && Math.max(iw, ih) > params.maxDimension
          ? params.maxDimension / Math.max(iw, ih)
          : 1
        const w = Math.max(1, Math.round(iw * scaleFactor))
        const h = Math.max(1, Math.round(ih * scaleFactor))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        // draw scaled image to canvas
        ctx.drawImage(img, 0, 0, w, h)
        const data = ctx.getImageData(0, 0, w, h).data

      // Build binary grid: row-major grid[y][x], 1=opaque, 0=transparent
      const grid: number[][] = []
      for (let y = 0; y < h; y++) {
        const row: number[] = []
        for (let x = 0; x < w; x++) {
          const alpha = data[(y * w + x) * 4 + 3]
          let cell = alpha > params.alphaThreshold ? 1 : 0
          if (params.invertAlpha) cell = 1 - cell
          row.push(cell)
        }
        grid.push(row)
      }

      try {
        const rawContours: Array<Array<[number, number]>> =
          (MarchingSquares.isoContours as any)(grid, params.isoLevel)

        const fallbackNorm: ContourNorm = { w, h, bcx: w / 2, bcy: h / 2, scale: 100 / (Math.max(w, h) || 1) }
        if (!rawContours || rawContours.length === 0) return resolve({ shapes: [], norm: fallbackNorm })

        // Keep all contours with enough vertices — no filtering, no classification.
        // Every poly becomes a standalone outer shape with no holes.
        // Use invertAlpha to flip inside/outside when the wrong region is filled.
        const polys = rawContours
          .map(contour => {
            const pts = contour.map(([x, y]: [number, number]) => ({ x, y }))
            return simplify(pts, params.simplifyTolerance, true).map((p: {x:number,y:number}) => [p.x, p.y] as [number, number])
          })
          .filter(p => p.length >= 3)

        if (polys.length === 0) return resolve({ shapes: [], norm: fallbackNorm })

        // Compute bounding box across all polys for normalization
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const pts of polys)
          for (const [x, y] of pts) {
            if (x < minX) minX = x; if (x > maxX) maxX = x
            if (y < minY) minY = y; if (y > maxY) maxY = y
          }
        const bcx = (minX + maxX) / 2
        const bcy = (minY + maxY) / 2
        const scale = 100 / (Math.max(maxX - minX, maxY - minY) || 1)

        const transform = (poly: Array<[number, number]>): Array<[number, number]> =>
          poly.map(([x, y]) => [(x - bcx) * scale, -(y - bcy) * scale])

        // THREE.Shape needs CCW winding (area > 0 in y-up space)
        const ensureCCW = (p: Array<[number, number]>): Array<[number, number]> =>
          shoelaceArea(p) < 0 ? [...p].reverse() : p

        const shapes: ContourShape[] = polys
          .map(p => ensureCCW(transform(p)))
          .map(outer => ({ outer, holes: [] }))

        resolve({ shapes, norm: { w, h, bcx, bcy, scale } })
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = reject
    img.src = src
  })
}
