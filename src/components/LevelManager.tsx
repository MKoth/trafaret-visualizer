import React from 'react'
import type { Level } from '../types'
import { DEFAULT_LEVEL_COLOR, DEFAULT_LEVEL_THICKNESS, DEFAULT_LEVEL_Z_OFFSET } from '../store/db'

type Props = {
  levels: Level[]
  onAdd: () => void
  onChange: (level: Level) => void
  onDelete: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export default function LevelManager({ levels, onAdd, onChange, onDelete, onReorder }: Props) {
  const update = (id: string, patch: Partial<Level>) => {
    const existing = levels.find(l => l.id === id)
    if (!existing) return
    onChange({ ...existing, ...patch })
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Levels ({levels.length})</p>
        <button onClick={onAdd} style={{ fontSize: 12 }}>+ Add level</button>
      </div>

      {levels.length === 0 && (
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          No levels yet. Add one to group images and control thickness.
        </p>
      )}

      <div className="level-list">
        {levels.map((level, idx) => (
          <div key={level.id} className="level-item">
            {/* Name + color + reorder + delete */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input
                type="color"
                value={level.color}
                title="Layer color"
                style={{ width: 28, height: 24, padding: 0, border: 'none', cursor: 'pointer' }}
                onChange={e => update(level.id, { color: e.target.value })}
              />
              <input
                type="text"
                value={level.name}
                placeholder="Level name"
                style={{ flex: 1, fontSize: 13, padding: '2px 6px' }}
                onChange={e => update(level.id, { name: e.target.value })}
              />
              <button
                className="icon-btn"
                title="Move up"
                disabled={idx === 0}
                onClick={() => onReorder(idx, idx - 1)}
              >▲</button>
              <button
                className="icon-btn"
                title="Move down"
                disabled={idx === levels.length - 1}
                onClick={() => onReorder(idx, idx + 1)}
              >▼</button>
              <button
                className="icon-btn icon-btn--danger"
                title="Delete level"
                onClick={() => onDelete(level.id)}
              >
                ✕
              </button>
            </div>

            {/* Z offset */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>Z offset</span>
                <span style={{ fontFamily: 'monospace' }}>{level.zOffset}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={level.zOffset}
                onChange={e => update(level.id, { zOffset: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            {/* Thickness */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>Thickness (extrusion depth)</span>
                <span style={{ fontFamily: 'monospace' }}>{level.thickness}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={30}
                step={0.5}
                value={level.thickness}
                onChange={e => update(level.id, { thickness: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
