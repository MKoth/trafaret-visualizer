import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { jsPDF } from 'jspdf'
import type { ImageEntry, ImageRenderData, TemplateItem } from '../types'
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
      const rot = it.rotationRad || 0
      if (Math.abs(rot) < 0.0001) {
        pdf.addImage(imgEl, 'PNG', it.x, it.y, it.widthMm, it.heightMm)
      } else {
        // draw to offscreen canvas with rotation
        const dpi = 96
        const mmToPx = (mm: number) => Math.round(mm * (dpi / 25.4))
        const wpx = mmToPx(it.widthMm)
        const hpx = mmToPx(it.heightMm)
        const bboxW = Math.abs(Math.cos(rot)) * wpx + Math.abs(Math.sin(rot)) * hpx
        const bboxH = Math.abs(Math.sin(rot)) * wpx + Math.abs(Math.cos(rot)) * hpx
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(bboxW)
        canvas.height = Math.ceil(bboxH)
        const ctx = canvas.getContext('2d')!
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate(rot)
        ctx.drawImage(imgEl, -wpx / 2, -hpx / 2, wpx, hpx)
        const data = canvas.toDataURL('image/png')
        // convert back to mm
        const bboxWmm = (canvas.width / dpi) * 25.4
        const bboxHmm = (canvas.height / dpi) * 25.4
        // adjust position so rotated center aligns
        const x = it.x - (bboxWmm - it.widthMm) / 2
        const y = it.y - (bboxHmm - it.heightMm) / 2
        pdf.addImage(data, 'PNG', x, y, bboxWmm, bboxHmm)
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
                  <img src={entry.src} alt={entry.filename} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />
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
