import React, { useState } from 'react'
import type { Project } from '../store/db'

type Props = {
  projects: Project[]
  activeProjectId: string | null
  onCreate: (name: string) => void
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
}

export default function ProjectSwitcher({ projects, activeProjectId, onCreate, onSwitch, onDelete }: Props) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate(name.trim())
    setName('')
    setCreating(false)
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>Projects</p>
        <button onClick={() => setCreating(v => !v)} style={{ fontSize: 12 }}>{creating ? '✕' : '+ New'}</button>
      </div>

      {creating && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Project name" style={{ flex: 1 }} />
          <button onClick={handleCreate}>Create</button>
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {projects.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={() => onSwitch(p.id)}
              style={{
                flex: 1,
                textAlign: 'left',
                padding: '6px 8px',
                background: p.id === activeProjectId ? '#e6e6e6' : 'transparent',
                border: '1px solid #ddd',
                borderRadius: 4,
              }}
            >
              {p.name}
            </button>
            <button
              className="icon-btn icon-btn--danger"
              title="Delete project"
              onClick={() => onDelete(p.id)}
              style={{ marginLeft: 8 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
