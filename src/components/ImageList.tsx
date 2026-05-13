import React, { useState } from 'react'
import type { ImageEntry, ImageRenderData, Level, ContourParams, ImageTransform } from '../types'
import { DEFAULT_LEVEL_COLOR, DEFAULT_BORDER_THICKNESS, DEFAULT_BORDER_COLOR } from '../store/db'

type SliderDef = {
  key: keyof ContourParams & string
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderDef[] = [
  { key: 'alphaThreshold',    label: 'Alpha threshold',    min: 1,    max: 254,  step: 1    },
  { key: 'isoLevel',          label: 'Iso level',          min: 0.05, max: 0.95, step: 0.05 },
  { key: 'simplifyTolerance', label: 'Simplify tolerance', min: 0.1,  max: 10,   step: 0.1  },
  { key: 'maxDimension',      label: 'Max dimension (px)', min: 0,    max: 2000, step: 50   },
]

type Props = {
  images: ImageEntry[]
  renderData: Record<string, ImageRenderData>
  levels: Level[]
  selectedId: string | null
  mmPerUnit: number
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onParamChange: (id: string, key: keyof ContourParams, value: number | boolean) => void
  onLevelChange: (id: string, levelId: string | null) => void
  onTransformChange: (id: string, transform: ImageTransform) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onColorChange: (id: string, color: string) => void
  onBorderChange: (id: string, borderThickness: number, borderColor: string) => void
}

export default function ImageList({
  images,
  renderData,
  levels,
  selectedId,
  mmPerUnit,
  onSelect,
  onRemove,
  onParamChange,
  onLevelChange,
  onTransformChange,
  onReorder,
  onColorChange,
  onBorderChange,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (images.length === 0) return null

  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Images ({images.length})</p>
      <div className="image-list">
        {images.map((img, idx) => {
          const rd = renderData[img.id]
          const isSelected = img.id === selectedId
          const isExpanded = !!expanded[img.id]

          return (
            <div
              key={img.id}
              className={`image-item${isSelected ? ' image-item--selected' : ''}`}
              onClick={() => onSelect(img.id)}
            >
              {/* Header row */}
              <div className="image-item__header">
                <img
                  src={img.src}
                  alt={img.filename}
                  className="image-item__thumb"
                />
                <div className="image-item__info">
                  <span className="image-item__name" title={img.filename}>
                    {img.filename}
                  </span>
                  <span className="image-item__status" style={{ fontSize: 11, color: '#888' }}>
                    {rd?.extracting
                      ? 'processing…'
                      : `${rd?.shapes.length ?? 0} shape${(rd?.shapes.length ?? 0) !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <div className="image-item__actions" onClick={e => e.stopPropagation()}>
                  {/* Per-image shape color */}
                  <input
                    type="color"
                    title="Shape color"
                    value={img.shapeColor ?? (img.levelId ? (levels.find(l => l.id === img.levelId)?.color ?? DEFAULT_LEVEL_COLOR) : DEFAULT_LEVEL_COLOR)}
                    onChange={e => onColorChange(img.id, e.target.value)}
                    style={{ width: 24, height: 24, padding: 1, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }}
                  />
                  {/* Reorder */}
                  <button
                    className="icon-btn"
                    title="Move up"
                    disabled={idx === 0}
                    onClick={() => onReorder(idx, idx - 1)}
                  >▲</button>
                  <button
                    className="icon-btn"
                    title="Move down"
                    disabled={idx === images.length - 1}
                    onClick={() => onReorder(idx, idx + 1)}
                  >▼</button>
                  {/* Expand params */}
                  <button
                    className="icon-btn"
                    title="Edit params"
                    onClick={() => toggle(img.id)}
                  >
                    {isExpanded ? '△' : '▽'}
                  </button>
                  {/* Remove */}
                  <button
                    className="icon-btn icon-btn--danger"
                    title="Remove image"
                    onClick={() => onRemove(img.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Size in mm (only when norm is available) */}
              {isSelected && rd?.norm && (
                <div style={{ fontSize: 11, color: '#555', margin: '4px 0 2px', display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <label style={{ fontSize: 11 }}>W:</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    style={{ width: 70, fontSize: 11 }}
                    value={parseFloat((rd.norm.w * rd.norm.scale * img.transform.scaleX * mmPerUnit).toFixed(1))}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v > 0) {
                        const newScaleX = v / (rd.norm!.w * rd.norm!.scale * mmPerUnit)
                        onTransformChange(img.id, { ...img.transform, scaleX: newScaleX })
                      }
                    }}
                  />
                  <span style={{ fontSize: 11 }}>mm</span>
                  <label style={{ fontSize: 11, marginLeft: 8 }}>H:</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    style={{ width: 70, fontSize: 11 }}
                    value={parseFloat((rd.norm.h * rd.norm.scale * img.transform.scaleY * mmPerUnit).toFixed(1))}
                    onChange={e => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v) && v > 0) {
                        const newScaleY = v / (rd.norm!.h * rd.norm!.scale * mmPerUnit)
                        onTransformChange(img.id, { ...img.transform, scaleY: newScaleY })
                      }
                    }}
                  />
                  <span style={{ fontSize: 11 }}>mm</span>
                </div>
              )}

              {/* Level assignment */}
              <div
                className="image-item__level-row"
                onClick={e => e.stopPropagation()}
              >
                <label style={{ fontSize: 12, marginRight: 6 }}>Level:</label>
                <select
                  value={img.levelId ?? ''}
                  onChange={e => onLevelChange(img.id, e.target.value || null)}
                  style={{ fontSize: 12, flex: 1 }}
                >
                  <option value="">— none (defaults) —</option>
                  {levels.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Border */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}
                onClick={e => e.stopPropagation()}
              >
                <label style={{ whiteSpace: 'nowrap' }}>Border:</label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={img.borderThickness ?? DEFAULT_BORDER_THICKNESS}
                  onChange={e => onBorderChange(img.id, parseFloat(e.target.value), img.borderColor ?? DEFAULT_BORDER_COLOR)}
                  style={{ flex: 1 }}
                />
                <span style={{ fontFamily: 'monospace', minWidth: 28 }}>{(img.borderThickness ?? DEFAULT_BORDER_THICKNESS).toFixed(1)}</span>
                {(img.borderThickness ?? DEFAULT_BORDER_THICKNESS) > 0 && (
                  <input
                    type="color"
                    title="Border color"
                    value={img.borderColor ?? DEFAULT_BORDER_COLOR}
                    onChange={e => onBorderChange(img.id, img.borderThickness ?? DEFAULT_BORDER_THICKNESS, e.target.value)}
                    style={{ width: 24, height: 24, padding: 1, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer', flexShrink: 0 }}
                  />
                )}
              </div>

              {/* Collapsible params */}
              {isExpanded && (
                <div
                  className="image-item__params"
                  onClick={e => e.stopPropagation()}
                >
                  {SLIDERS.map(({ key, label, min, max, step }) => (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span>{label}</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          {img.params[key as keyof ContourParams] as number}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={img.params[key as keyof ContourParams] as number}
                        onChange={e => onParamChange(img.id, key as keyof ContourParams, parseFloat(e.target.value))}
                        style={{ width: '100%' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      id={`inv-${img.id}`}
                      checked={img.params.invertAlpha}
                      onChange={() => onParamChange(img.id, 'invertAlpha', !img.params.invertAlpha)}
                    />
                    <label htmlFor={`inv-${img.id}`}>Invert alpha</label>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
