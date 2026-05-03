import React, { useState, useEffect, useCallback } from 'react'
import Upload from './components/Upload'
import Scene from './components/Scene'
import { imageToContours, DEFAULT_PARAMS, ContourParams } from './utils/contour'
import type { ContourShape, ContourNorm } from './utils/contour'

type NumericParam = { [K in keyof ContourParams]: ContourParams[K] extends number ? K : never }[keyof ContourParams]

type SliderDef = {
  key: NumericParam
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

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [params, setParams] = useState<ContourParams>(DEFAULT_PARAMS)
  const [shapes, setShapes] = useState<ContourShape[]>([])
  const [norm, setNorm] = useState<ContourNorm | null>(null)
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    if (!imageSrc) return
    let cancelled = false
    setExtracting(true)
    imageToContours(imageSrc, params)
      .then(r => { if (!cancelled) { setShapes(r.shapes); setNorm(r.norm); setExtracting(false) } })
      .catch(() => { if (!cancelled) { setShapes([]); setNorm(null); setExtracting(false) } })
    return () => { cancelled = true }
  }, [imageSrc, params])

  const setParam = useCallback((key: NumericParam, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }))
  }, [])

  const toggleParam = useCallback((key: keyof ContourParams) => {
    setParams(prev => ({ ...prev, [key]: !(prev[key] as boolean) }))
  }, [])

  return (
    <div className="app">
      <div className="sidebar">
        <h2>Trafaret Visualizer</h2>
        <Upload onLoadImage={src => { setImageSrc(src) }} />

        {imageSrc && (
          <>
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: '0 0 6px' }}>Preview:</p>
              <img src={imageSrc} className="upload-preview" alt="preview" />
            </div>

            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                Extraction params {extracting ? '(updating…)' : `— ${shapes.length} shape${shapes.length !== 1 ? 's' : ''}`}
              </p>
              {SLIDERS.map(({ key, label, min, max, step }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{label}</span>
                    <span style={{ fontFamily: 'monospace' }}>{params[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={params[key]}
                    onChange={e => setParam(key, parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 6px', fontSize: 13 }}>
                <input
                  type="checkbox"
                  id="invertAlpha"
                  checked={params.invertAlpha}
                  onChange={() => toggleParam('invertAlpha')}
                />
                <label htmlFor="invertAlpha">Invert alpha (shape is transparent)</label>
              </div>
              <button
                onClick={() => setParams(DEFAULT_PARAMS)}
                style={{ fontSize: 12, marginTop: 4 }}
              >
                Reset to defaults
              </button>
            </div>
          </>
        )}
      </div>
      <div className="canvas">
        <Scene shapes={shapes} imageSrc={imageSrc} norm={norm} />
      </div>
    </div>
  )
}
