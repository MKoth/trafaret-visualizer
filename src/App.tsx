import React, { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import Upload from './components/Upload'
import Scene from './components/Scene'
import ImageList from './components/ImageList'
import LevelManager from './components/LevelManager'
import { imageToContours } from './utils/contour'
import type { ContourParams } from './utils/contour'
import type { Level, ImageEntry, ImageRenderData } from './types'
import {
  loadLevels,
  loadImages,
  saveLevel,
  deleteLevel,
  saveImage,
  deleteImageFromDB,
  updateImageMeta,
  DEFAULT_CONTOUR_PARAMS,
  DEFAULT_LEVEL_THICKNESS,
  DEFAULT_LEVEL_COLOR,
} from './store/db'

export default function App() {
  const [levels, setLevels] = useState<Level[]>([])
  const [images, setImages] = useState<ImageEntry[]>([])
  const [renderData, setRenderData] = useState<Record<string, ImageRenderData>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Track blob URLs created for images so we can revoke them on removal
  const blobUrlsRef = useRef<Record<string, string>>({})

  // ── Initial load from IndexedDB ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [storedLevels, storedImages] = await Promise.all([loadLevels(), loadImages()])
      if (cancelled) return
      setLevels(storedLevels)
      // Regenerate blob URLs from stored Blobs
      const rehydrated: ImageEntry[] = storedImages.map(si => {
        const src = URL.createObjectURL(si.blob)
        blobUrlsRef.current[si.id] = src
        return { ...si, src }
      })
      setImages(rehydrated)
      // Kick off contour extraction for all rehydrated images
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
          params: { ...DEFAULT_CONTOUR_PARAMS },
        }

        setImages(prev => [...prev, entry])
        const { src: _src, ...storable } = entry
        await saveImage(storable)
        extractContours(id, src, entry.params)
      }
    },
    [extractContours]
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
      }
      saveLevel(level)
      return [...prev, level]
    })
  }, [])

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

        <LevelManager
          levels={levels}
          onAdd={handleAddLevel}
          onChange={handleUpdateLevel}
          onDelete={handleDeleteLevel}
        />

        <ImageList
          images={images}
          renderData={renderData}
          levels={levels}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemove={handleRemoveImage}
          onParamChange={handleParamChange}
          onLevelChange={handleLevelChange}
        />
      </div>

      <div className="canvas">
        <Scene images={images} renderData={renderData} levels={levels} />
      </div>
    </div>
  )
}
