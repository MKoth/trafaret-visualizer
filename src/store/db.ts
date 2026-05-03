import { openDB, type IDBPDatabase } from 'idb'
import type { Level, ImageEntry, ContourParams, ImageTransform } from '../types'

const DB_NAME = 'trafaret-db'
const DB_VERSION = 2

type StoredImage = Omit<ImageEntry, 'src'>

interface TrafaretDB {
  levels: {
    key: string
    value: Level
  }
  images: {
    key: string
    value: StoredImage
  }
  projects: {
    key: string
    value: Project
  }
}

let _db: IDBPDatabase<TrafaretDB> | null = null

async function getDB(): Promise<IDBPDatabase<TrafaretDB>> {
  if (_db) return _db
  _db = await openDB<TrafaretDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Discard old stores and recreate with projectId indexes (simple migration: drop & recreate)
      if (db.objectStoreNames.contains('levels')) db.deleteObjectStore('levels')
      if (db.objectStoreNames.contains('images')) db.deleteObjectStore('images')
      if (db.objectStoreNames.contains('projects')) db.deleteObjectStore('projects')

      const levelsStore = db.createObjectStore('levels', { keyPath: 'id' })
      levelsStore.createIndex('projectId', 'projectId')

      const imagesStore = db.createObjectStore('images', { keyPath: 'id' })
      imagesStore.createIndex('projectId', 'projectId')

      db.createObjectStore('projects', { keyPath: 'id' })
    },
  })
  return _db
}

// Project CRUD
export type Project = {
  id: string
  name: string
  createdAt: number
}

export async function loadProjects(): Promise<Project[]> {
  const db = await getDB()
  return db.getAll('projects')
}

export async function saveProject(p: Project): Promise<void> {
  const db = await getDB()
  await db.put('projects', p)
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  // delete images and levels that reference this project using the index
  const tx = db.transaction(['images', 'levels', 'projects'], 'readwrite')
  const imagesStore = tx.objectStore('images')
  const imgIndex = imagesStore.index('projectId')
  for await (const cursor of imgIndex.iterate(id)) {
    await imagesStore.delete(cursor.primaryKey as string)
  }
  const levelsStore = tx.objectStore('levels')
  const lvlIndex = levelsStore.index('projectId')
  for await (const cursor of lvlIndex.iterate(id)) {
    await levelsStore.delete(cursor.primaryKey as string)
  }
  await tx.objectStore('projects').delete(id)
  await tx.done
}

export async function loadLevelsByProject(projectId: string): Promise<Level[]> {
  const db = await getDB()
  const idx = db.transaction('levels').objectStore('levels').index('projectId')
  return idx.getAll(projectId)
}

export async function loadImagesByProject(projectId: string): Promise<StoredImage[]> {
  const db = await getDB()
  const idx = db.transaction('images').objectStore('images').index('projectId')
  return idx.getAll(projectId)
}

export async function loadLevels(): Promise<Level[]> {
  const db = await getDB()
  return db.getAll('levels')
}

export async function saveLevel(level: Level): Promise<void> {
  const db = await getDB()
  await db.put('levels', level)
}

export async function deleteLevel(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('levels', id)
}

export async function loadImages(): Promise<StoredImage[]> {
  const db = await getDB()
  return db.getAll('images')
}

export async function saveImage(entry: StoredImage): Promise<void> {
  const db = await getDB()
  await db.put('images', entry)
}

export async function deleteImageFromDB(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('images', id)
}

/** Persist only the changed fields of an image (avoids re-writing full blob on param change) */
export async function updateImageMeta(
  id: string,
  patch: Partial<Pick<StoredImage, 'levelId' | 'params' | 'transform'>>
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('images', 'readwrite')
  const existing = await tx.store.get(id)
  if (existing) {
    await tx.store.put({ ...existing, ...patch })
  }
  await tx.done
}

export const DEFAULT_LEVEL_THICKNESS = 5
export const DEFAULT_LEVEL_Z_OFFSET = 0
export const DEFAULT_LEVEL_COLOR = '#f5f5dc'

export const DEFAULT_TRANSFORM: ImageTransform = {
  x: 0,
  y: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
}

export const DEFAULT_CONTOUR_PARAMS: ContourParams = {
  alphaThreshold: 10,
  isoLevel: 0.5,
  simplifyTolerance: 1.5,
  maxDimension: 0,
  invertAlpha: false,
}
