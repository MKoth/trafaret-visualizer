import { openDB, type IDBPDatabase } from 'idb'
import type { Level, ImageEntry, ContourParams } from '../types'

const DB_NAME = 'trafaret-db'
const DB_VERSION = 1

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
}

let _db: IDBPDatabase<TrafaretDB> | null = null

async function getDB(): Promise<IDBPDatabase<TrafaretDB>> {
  if (_db) return _db
  _db = await openDB<TrafaretDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('levels')) {
        db.createObjectStore('levels', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' })
      }
    },
  })
  return _db
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
  patch: Partial<Pick<StoredImage, 'levelId' | 'params'>>
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

export const DEFAULT_CONTOUR_PARAMS: ContourParams = {
  alphaThreshold: 10,
  isoLevel: 0.5,
  simplifyTolerance: 1.5,
  maxDimension: 0,
  invertAlpha: false,
}
