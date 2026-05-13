import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { jsPDF } from 'jspdf'
import type { ImageEntry, ImageRenderData, TemplateItem } from '../types'
import { dilateContourShapes, type ContourNorm, type ContourShape } from '../utils/contour'
import { computeItemSize, packItems } from '../utils/template'

type Props = {
  images: ImageEntry[]
  renderData: Record<string, ImageRenderData>
  mmPerUnit: number
  onClose: () => void
}

const PRESETS: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000'
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ]
}

function buildShapePath(
  ctx: CanvasRenderingContext2D,
  shapes: ContourShape[],
  norm: ContourNorm,
  scaleX: number,
  scaleY: number,
  mmPerUnit: number,
  padXpx: number,
  padYpx: number,
  pxPerMm: number
) {
  const planeW = norm.w * norm.scale
  const planeH = norm.h * norm.scale
  const imageLeft = (norm.w / 2 - norm.bcx) * norm.scale - planeW / 2
  const imageTop = (norm.bcy - norm.h / 2) * norm.scale + planeH / 2

  ctx.beginPath()
  for (const shape of shapes) {
    if (shape.outer.length < 3) continue
    shape.outer.forEach(([x, y], index) => {
      const px = padXpx + (x - imageLeft) * scaleX * mmPerUnit * pxPerMm
      const py = padYpx + (imageTop - y) * scaleY * mmPerUnit * pxPerMm
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()

    for (const hole of shape.holes) {
      if (hole.length < 3) continue
      hole.forEach(([x, y], index) => {
        const px = padXpx + (x - imageLeft) * scaleX * mmPerUnit * pxPerMm
        const py = padYpx + (imageTop - y) * scaleY * mmPerUnit * pxPerMm
        if (index === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
    }
  }
}

function composeItemCanvas(
  entry: ImageEntry,
  rd: ImageRenderData,
  imgEl: HTMLImageElement,
  mmPerUnit: number,
  dpi: number
) {
  if (!rd.norm) return null

  const pxPerMm = dpi / 25.4
  const borderThickness = entry.borderThickness ?? 0
  const borderColor = entry.borderColor ?? '#000000'
  const scaleX = Math.abs(entry.transform.scaleX)
  const scaleY = Math.abs(entry.transform.scaleY)
  const mirrorX = entry.transform.scaleX < 0 ? -1 : 1
  const mirrorY = entry.transform.scaleY < 0 ? -1 : 1
  const baseWidthMm = rd.norm.w * rd.norm.scale * scaleX * mmPerUnit
  const baseHeightMm = rd.norm.h * rd.norm.scale * scaleY * mmPerUnit
  const padXmm = borderThickness * scaleX * mmPerUnit
  const padYmm = borderThickness * scaleY * mmPerUnit
  const totalWidthMm = baseWidthMm + padXmm * 2
  const totalHeightMm = baseHeightMm + padYmm * 2
  const widthPx = Math.max(1, Math.round(totalWidthMm * pxPerMm))
  const heightPx = Math.max(1, Math.round(totalHeightMm * pxPerMm))
  const padXpx = padXmm * pxPerMm
  const padYpx = padYmm * pxPerMm
  const baseWidthPx = Math.max(1, Math.round(baseWidthMm * pxPerMm))
  const baseHeightPx = Math.max(1, Math.round(baseHeightMm * pxPerMm))

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.save()
  if (mirrorX < 0 || mirrorY < 0) {
    ctx.translate(mirrorX < 0 ? canvas.width : 0, mirrorY < 0 ? canvas.height : 0)
    ctx.scale(mirrorX, mirrorY)
  }

  if (borderThickness > 0) {
    const borderShapes = dilateContourShapes(rd.shapes, borderThickness)
    if (borderShapes.length > 0) {
      const [r, g, b] = hexToRgb(borderColor)
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      buildShapePath(
        ctx,
        borderShapes,
        rd.norm,
        scaleX,
        scaleY,
        mmPerUnit,
        padXpx,
        padYpx,
        pxPerMm
      )
      ctx.fill('evenodd')
    }
  }

  ctx.drawImage(imgEl, padXpx, padYpx, baseWidthPx, baseHeightPx)
  ctx.restore()

  return { canvas, widthMm: totalWidthMm, heightMm: totalHeightMm }
}

export default function TemplateEditor({ images, renderData, mmPerUnit, onClose }: Props) {
  const [pageW, setPageW] = useState(210)
  const [pageH, setPageH] = useState(297)
  const [preset, setPreset] = useState('A4')
  const [items, setItems] = useState<TemplateItem[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const paperRef = useRef<HTMLDivElement | null>(null)
  const [displayScale, setDisplayScale] = useState(1)

  // initialize items from images (one instance each), packing them
  useEffect(() => {
    const margin = 6
    const sizes: { id: string; w: number; h: number }[] = []
    for (const img of images) {
      const rd = renderData[img.id]
      const s = computeItemSize(img, rd, mmPerUnit)
      if (!s) continue
      sizes.push({ id: img.id, w: s.widthMm, h: s.heightMm })
    }
    const positions = packItems(sizes, pageW - margin * 2, margin)
    const newItems: TemplateItem[] = sizes.map(s => {
      const pos = positions[s.id] ?? { x: margin, y: margin }
      const rd = renderData[s.id]
      const img = images.find(im => im.id === s.id)!
      const size = computeItemSize(img, rd, mmPerUnit)!
      return {
        instanceId: uuidv4(),
        imageId: s.id,
        x: pos.x,
        y: pos.y,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        rotationRad: size.rotationRad,
      }
    })
    setItems(newItems)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, renderData, mmPerUnit, pageW, pageH])

  // recompute displayScale on resize
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (!containerRef.current) return
      const availW = containerRef.current.clientWidth - 40
      const availH = containerRef.current.clientHeight - 40
      const ds = Math.min(availW / pageW, availH / pageH)
      setDisplayScale(Math.max(0.1, ds))
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [pageW, pageH])

  // add duplicate instance of an image
  const addInstance = useCallback((imageId: string) => {
    const img = images.find(i => i.id === imageId)
    if (!img) return
    const rd = renderData[imageId]
    const s = computeItemSize(img, rd, mmPerUnit)
    if (!s) return
    setItems(prev => [...prev, {
      instanceId: uuidv4(),
      imageId,
      x: 10,
      y: 10 + prev.length * 6,
      widthMm: s.widthMm,
      heightMm: s.heightMm,
      rotationRad: s.rotationRad,
    }])
  }, [images, renderData, mmPerUnit])

  // Drag handling — window-level listeners with stable refs to avoid stale-closure accumulation
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const displayScaleRef = useRef(displayScale)
  useEffect(() => { displayScaleRef.current = displayScale }, [displayScale])

  // Stable handler: only reads from refs, empty dep array → same reference across renders
  const handleWindowMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const scale = displayScaleRef.current || 1
    const dx = (e.clientX - d.startX) / scale
    const dy = (e.clientY - d.startY) / scale
    setItems(prev =>
      prev.map(it =>
        it.instanceId === d.id ? { ...it, x: d.origX + dx, y: d.origY + dy } : it
      )
    )
  }, [])

  const handleWindowUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', handleWindowMove)
    window.removeEventListener('pointerup', handleWindowUp)
  }, [handleWindowMove])

  // Clean up listeners if the component unmounts while dragging
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleWindowMove)
      window.removeEventListener('pointerup', handleWindowUp)
    }
  }, [handleWindowMove, handleWindowUp])

  const onPointerDown = useCallback((e: React.PointerEvent, it: TemplateItem) => {
    e.preventDefault() // block browser native image drag
    dragRef.current = { id: it.instanceId, startX: e.clientX, startY: e.clientY, origX: it.x, origY: it.y }
    window.addEventListener('pointermove', handleWindowMove)
    window.addEventListener('pointerup', handleWindowUp)
  }, [handleWindowMove, handleWindowUp])

  const removeInstance = (instanceId: string) => setItems(prev => prev.filter(i => i.instanceId !== instanceId))

  // Export to PDF
  const handleExport = async () => {
    const pdf = new jsPDF({ unit: 'mm', format: [pageW, pageH] })
    const dpi = 96
    // preload images
    const imgMap: Record<string, HTMLImageElement> = {}
    await Promise.all(items.map(async it => {
      if (imgMap[it.imageId]) return
      const entry = images.find(i => i.id === it.imageId)
      if (!entry) return
      await new Promise<void>((res, rej) => {
        const im = new Image()
        im.onload = () => { imgMap[it.imageId] = im; res() }
        im.onerror = () => res()
        im.src = entry.src
      })
    }))

    for (const it of items) {
      const imgEl = imgMap[it.imageId]
      if (!imgEl) continue
      const entry = images.find(i => i.id === it.imageId)
      const rd = renderData[it.imageId]
      if (!entry || !rd?.norm) continue
      const composed = composeItemCanvas(entry, rd, imgEl, mmPerUnit, dpi)
      if (!composed) continue
      const rot = it.rotationRad || 0
      if (Math.abs(rot) < 0.0001) {
        const x = it.x + (it.widthMm - composed.widthMm) / 2
        const y = it.y + (it.heightMm - composed.heightMm) / 2
        pdf.addImage(composed.canvas.toDataURL('image/png'), 'PNG', x, y, composed.widthMm, composed.heightMm)
      } else {
        const bboxW = Math.abs(Math.cos(rot)) * composed.canvas.width + Math.abs(Math.sin(rot)) * composed.canvas.height
        const bboxH = Math.abs(Math.sin(rot)) * composed.canvas.width + Math.abs(Math.cos(rot)) * composed.canvas.height
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(bboxW)
        canvas.height = Math.ceil(bboxH)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate(rot)
        ctx.drawImage(composed.canvas, -composed.canvas.width / 2, -composed.canvas.height / 2)
        const bboxWmm = (canvas.width / dpi) * 25.4
        const bboxHmm = (canvas.height / dpi) * 25.4
        const x = it.x + (it.widthMm - bboxWmm) / 2
        const y = it.y + (it.heightMm - bboxHmm) / 2
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, bboxWmm, bboxHmm)
      }
    }
    pdf.save('template.pdf')
  }

  // preset change
  useEffect(() => {
    if (preset in PRESETS) {
      const [w, h] = PRESETS[preset]
      setPageW(w)
      setPageH(h)
    }
  }, [preset])

  return (
    <div className="template-overlay">
      <div className="template-header">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={preset} onChange={e => setPreset(e.target.value)}>
            {Object.keys(PRESETS).map(p => <option key={p} value={p}>{p}</option>)}
            <option value="custom">Custom</option>
          </select>
          {preset === 'custom' ? (
            <>
              <input type="number" value={pageW} onChange={e => setPageW(parseFloat(e.target.value) || 0)} style={{ width: 80 }} />
              <input type="number" value={pageH} onChange={e => setPageH(parseFloat(e.target.value) || 0)} style={{ width: 80 }} />
            </>
          ) : null}
          <button className="icon-btn" onClick={() => { setPreset(preset === 'A4' ? 'A4' : preset) }}>Format</button>
        </div>
        <div>
          <button className="icon-btn" onClick={handleExport}>Export PDF</button>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: 8 }}>Close</button>
        </div>
      </div>

      <div className="template-main">
        <div className="template-image-strip">
          {images.map(img => {
            const rd = renderData[img.id]
            const size = computeItemSize(img, rd, mmPerUnit)
            return (
              <div key={img.id} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                <img src={img.src} alt={img.filename} style={{ width: '100%', height: 60, objectFit: 'contain', background: '#fff', border: '1px solid #ddd' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="icon-btn" onClick={() => addInstance(img.id)} disabled={!size}>{size ? 'Add +' : 'Processing…'}</button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="template-canvas-area" ref={containerRef}>
          <div className="template-paper" ref={paperRef} style={{ width: pageW * displayScale, height: pageH * displayScale }}>
            {items.map(it => {
              const entry = images.find(i => i.id === it.imageId)!
              const borderThickness = entry.borderThickness ?? 0
              const scaleX = Math.abs(entry.transform.scaleX)
              const scaleY = Math.abs(entry.transform.scaleY)
              const padXmm = borderThickness * scaleX * mmPerUnit
              const padYmm = borderThickness * scaleY * mmPerUnit
              const imageWidthMm = Math.max(0, it.widthMm - padXmm * 2)
              const imageHeightMm = Math.max(0, it.heightMm - padYmm * 2)
              return (
                <div
                  key={it.instanceId}
                  className="template-item"
                  style={{
                    left: it.x * displayScale,
                    top: it.y * displayScale,
                    width: it.widthMm * displayScale,
                    height: it.heightMm * displayScale,
                    transform: `rotate(${it.rotationRad}rad)`,
                  }}
                  onPointerDown={e => onPointerDown(e, it)}
                >
                  <img
                    src={entry.src}
                    alt={entry.filename}
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: padXmm * displayScale,
                      top: padYmm * displayScale,
                      width: imageWidthMm * displayScale,
                      height: imageHeightMm * displayScale,
                      objectFit: 'fill',
                      display: 'block',
                      transform: `scale(${entry.transform.scaleX < 0 ? -1 : 1}, ${entry.transform.scaleY < 0 ? -1 : 1})`,
                      transformOrigin: 'center',
                      pointerEvents: 'none',
                    }}
                  />
                  <button className="template-item__remove icon-btn" onPointerDown={e => e.stopPropagation()} onClick={() => removeInstance(it.instanceId)} style={{ position: 'absolute', right: 6, top: 6 }}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
