import React, { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Upload from './components/Upload'
import Scene from './components/Scene'
import ImageList from './components/ImageList'
import LevelManager from './components/LevelManager'
import ProjectSwitcher from './components/ProjectSwitcher'
import ConfirmModal from './components/ConfirmModal'
import { imageToContours } from './utils/contour'
import type { ContourParams } from './utils/contour'
import type { Level, ImageEntry, ImageRenderData, ImageTransform, TransformMode } from './types'
import {
  loadProjects,
  saveProject,
  deleteProject,
  loadLevelsByProject,
  loadImagesByProject,
  saveLevel,
  deleteLevel,
  saveImage,
  deleteImageFromDB,
  updateImageMeta,
  DEFAULT_CONTOUR_PARAMS,
  DEFAULT_LEVEL_THICKNESS,
  DEFAULT_LEVEL_COLOR,
  DEFAULT_TRANSFORM,
} from './store/db'
import TemplateEditor from './components/TemplateEditor'

export default function App() {
  const [projects, setProjects] = useState<any[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [levels, setLevels] = useState<Level[]>([])
  const [images, setImages] = useState<ImageEntry[]>([])
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'image' | 'level' | 'project' | null; id?: string }>({ open: false, type: null })
  const [renderData, setRenderData] = useState<Record<string, ImageRenderData>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')
  const [mmPerUnit, setMmPerUnit] = useState(1)
  const [showTemplate, setShowTemplate] = useState(false)

  // Track blob URLs created for images so we can revoke them on removal
  const blobUrlsRef = useRef<Record<string, string>>({})

  // ── Initial load from IndexedDB ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const projs = await loadProjects()
      if (cancelled) return
      setProjects(projs)

      // Choose active project from localStorage if present
      const saved = window.localStorage.getItem('activeProjectId')
      let activeId: string | null = saved && projs.find(p => p.id === saved) ? saved : (projs[0]?.id ?? null)

      // If no projects exist, create a default one
      if (!activeId) {
        const id = uuidv4()
        const p = { id, name: 'My Project', createdAt: Date.now() }
        await saveProject(p)
        setProjects([...(projs || []), p])
        activeId = id
      }

      setActiveProjectId(activeId)
      window.localStorage.setItem('activeProjectId', activeId!)

      // Load levels and images for that project
      const [storedLevels, storedImages] = await Promise.all([loadLevelsByProject(activeId!), loadImagesByProject(activeId!)])
      if (cancelled) return
      setLevels(storedLevels)
      const rehydrated: ImageEntry[] = storedImages.map(si => {
        const src = URL.createObjectURL(si.blob)
        blobUrlsRef.current[si.id] = src
        return { ...si, src, transform: si.transform ?? DEFAULT_TRANSFORM }
      })
      setImages(rehydrated)
      rehydrated.forEach(img => extractContours(img.id, img.src, img.params))
      setReady(true)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Contour extraction ───────────────────────────────────────────────────────
  const extractContours = useCallback(
    (id: string, src: string, params: ContourParams) => {
      setRenderData(prev => ({
        ...prev,
        [id]: { shapes: prev[id]?.shapes ?? [], norm: prev[id]?.norm ?? null, extracting: true },
      }))
      imageToContours(src, params)
        .then(result => {
          setRenderData(prev => ({
            ...prev,
            [id]: { shapes: result.shapes, norm: result.norm, extracting: false },
          }))
        })
        .catch(() => {
          setRenderData(prev => ({
            ...prev,
            [id]: { shapes: [], norm: null, extracting: false },
          }))
        })
    },
    []
  )

  // ── Upload handler ───────────────────────────────────────────────────────────
  const handleLoadImages = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const id = uuidv4()
        const blob = file
        const src = URL.createObjectURL(blob)
        blobUrlsRef.current[id] = src

        const entry: ImageEntry = {
          id,
          filename: file.name,
          blob,
          src,
          levelId: null,
          projectId: activeProjectId ?? '',
          params: { ...DEFAULT_CONTOUR_PARAMS },
          transform: { ...DEFAULT_TRANSFORM },
        }

        setImages(prev => [...prev, entry])
        const { src: _src, ...storable } = entry
        await saveImage(storable)
        extractContours(id, src, entry.params)
      }
    },
    [extractContours, activeProjectId]
  )

  // ── Remove image ─────────────────────────────────────────────────────────────
  const handleRemoveImage = useCallback(async (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id))
    setRenderData(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (blobUrlsRef.current[id]) {
      URL.revokeObjectURL(blobUrlsRef.current[id])
      delete blobUrlsRef.current[id]
    }
    if (selectedId === id) setSelectedId(null)
    await deleteImageFromDB(id)
  }, [selectedId])

  // Show confirm for delete actions
  const confirmDelete = (type: 'image' | 'level' | 'project', id: string) => {
    setConfirm({ open: true, type, id })
  }

  const runConfirmedDelete = async () => {
    if (!confirm.open || !confirm.type || !confirm.id) return
    const id = confirm.id
    if (confirm.type === 'image') {
      await handleRemoveImage(id)
    } else if (confirm.type === 'level') {
      await handleDeleteLevel(id)
    } else if (confirm.type === 'project') {
      // Delete project and cascade
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      // If deleted active, switch
      if (activeProjectId === id) {
        const next = projects.find(p => p.id !== id)
        if (next) {
          window.localStorage.setItem('activeProjectId', next.id)
          window.location.reload()
        } else {
          window.localStorage.removeItem('activeProjectId')
          window.location.reload()
        }
      }
    }
    setConfirm({ open: false, type: null })
  }

  const cancelConfirmedDelete = () => setConfirm({ open: false, type: null })

  // ── Per-image param change ────────────────────────────────────────────────────
  const handleParamChange = useCallback(
    async (imgId: string, key: keyof ContourParams, value: number | boolean) => {
      let updatedParams: ContourParams | undefined
      let imgSrc: string | undefined
      setImages(prev =>
        prev.map(img => {
          if (img.id !== imgId) return img
          updatedParams = { ...img.params, [key]: value }
          imgSrc = img.src
          return { ...img, params: updatedParams! }
        })
      )
      if (!updatedParams || !imgSrc) return
      await updateImageMeta(imgId, { params: updatedParams })
      extractContours(imgId, imgSrc, updatedParams)
    },
    [extractContours]
  )

  // ── Transform change from viewport gizmo ────────────────────────────────────
  const handleTransformChange = useCallback(async (imgId: string, transform: ImageTransform) => {
    setImages(prev => prev.map(img => img.id === imgId ? { ...img, transform } : img))
    await updateImageMeta(imgId, { transform })
  }, [])

  // ── Level assignment on image ─────────────────────────────────────────────────
  const handleLevelChange = useCallback(async (imgId: string, levelId: string | null) => {
    setImages(prev =>
      prev.map(img => (img.id === imgId ? { ...img, levelId } : img))
    )
    await updateImageMeta(imgId, { levelId })
  }, [])

  // ── Add level ─────────────────────────────────────────────────────────────────
  const handleAddLevel = useCallback(async () => {
    setLevels(prev => {
      const level: Level = {
        id: uuidv4(),
        name: `Level ${prev.length + 1}`,
        zOffset: prev.length * (DEFAULT_LEVEL_THICKNESS + 1),
        thickness: DEFAULT_LEVEL_THICKNESS,
        color: DEFAULT_LEVEL_COLOR,
        projectId: activeProjectId ?? '',
      }
      saveLevel(level)
      return [...prev, level]
    })
  }, [activeProjectId])

  // ── Update level ──────────────────────────────────────────────────────────────
  const handleUpdateLevel = useCallback(async (updated: Level) => {
    setLevels(prev => prev.map(l => (l.id === updated.id ? updated : l)))
    await saveLevel(updated)
  }, [])

  // ── Delete level ──────────────────────────────────────────────────────────────
  const handleDeleteLevel = useCallback(async (id: string) => {
    setLevels(prev => prev.filter(l => l.id !== id))
    setImages(prev =>
      prev.map(img => {
        if (img.levelId !== id) return img
        updateImageMeta(img.id, { levelId: null })
        return { ...img, levelId: null }
      })
    )
    await deleteLevel(id)
  }, [])


  if (!ready) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#888' }}>Loading…</span>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h2 style={{ margin: '0 0 12px' }}>Trafaret Visualizer</h2>

        <Upload onLoadImages={handleLoadImages} />

        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId}
          onCreate={async (name: string) => {
            const id = uuidv4()
            const p = { id, name, createdAt: Date.now() }
            await saveProject(p)
            setProjects(prev => [...prev, p])
            // switch to new project
            window.localStorage.setItem('activeProjectId', id)
            window.location.reload()
          }}
          onSwitch={id => {
            window.localStorage.setItem('activeProjectId', id)
            window.location.reload()
          }}
          onDelete={id => confirmDelete('project', id)}
        />

        <LevelManager
          levels={levels}
          onAdd={handleAddLevel}
          onChange={handleUpdateLevel}
          onDelete={id => confirmDelete('level', id)}
        />

        <ImageList
          images={images}
          renderData={renderData}
          levels={levels}
          selectedId={selectedId}
          mmPerUnit={mmPerUnit}
          onSelect={setSelectedId}
          onRemove={id => confirmDelete('image', id)}
          onParamChange={handleParamChange}
          onLevelChange={handleLevelChange}
        />

        <ConfirmModal
          open={confirm.open}
          title={confirm.type === 'project' ? 'Delete project' : confirm.type === 'level' ? 'Delete level' : 'Delete image'}
          message={
            confirm.type === 'project'
              ? 'Are you sure you want to delete this project and all its levels and images? This cannot be undone.'
              : confirm.type === 'level'
              ? 'Are you sure you want to delete this level? Images assigned to it will be unassigned.'
              : 'Are you sure you want to delete this image?'
          }
          onConfirm={runConfirmedDelete}
          onCancel={cancelConfirmedDelete}
        />

        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <label htmlFor="mmPerUnit" style={{ whiteSpace: 'nowrap' }}>1 unit =</label>
            <input
              id="mmPerUnit"
              type="number"
              min={0.001}
              step={0.1}
              value={mmPerUnit}
              onChange={e => setMmPerUnit(parseFloat(e.target.value) || 1)}
              style={{ width: 70, fontSize: 13 }}
            />
            <span>mm</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="icon-btn" onClick={() => setShowTemplate(true)}>Create Template</button>
          </div>
        </div>
      </div>

      <div className="canvas" style={{ position: 'relative' }}>
        {/* Transform mode toolbar */}
        <div className="transform-toolbar">
          {(['translate', 'rotate', 'scale-x', 'scale-y', 'scale-both'] as TransformMode[]).map(mode => (
            <button
              key={mode}
              className={`toolbar-btn${transformMode === mode ? ' toolbar-btn--active' : ''}`}
              onClick={() => setTransformMode(mode)}
              title={mode}
            >
              {mode === 'translate' ? 'Move' :
               mode === 'rotate' ? 'Rotate' :
               mode === 'scale-x' ? 'W' :
               mode === 'scale-y' ? 'H' : 'W+H'}
            </button>
          ))}
        </div>
        <Scene
          images={images}
          renderData={renderData}
          levels={levels}
          selectedId={selectedId}
          transformMode={transformMode}
          onSelect={setSelectedId}
          onTransformChange={handleTransformChange}
        />
      </div>
      {showTemplate && (
        <TemplateEditor
          images={images}
          renderData={renderData}
          mmPerUnit={mmPerUnit}
          onClose={() => setShowTemplate(false)}
        />
      )}
    </div>
  )
}
