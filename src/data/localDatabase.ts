import type { FfxivRecipe } from './ffxivApi'

const databaseName = 'roadmap-to-crafting-log'
const databaseVersion = 1
const recipeStoreName = 'recipe-catalog'
// Cambiar la clave obliga a renovar catálogos guardados cuando incorporamos
// nuevas columnas necesarias para clasificar las recetas.
const recipeCatalogKey = 'all-recipes-v4'

type StoredRecipeCatalog = {
  id: string
  recipes: FfxivRecipe[]
  savedAt: number
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(recipeStoreName)) {
        database.createObjectStore(recipeStoreName, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function readRecipeCatalog() {
  const database = await openDatabase()

  return new Promise<FfxivRecipe[] | null>((resolve, reject) => {
    const transaction = database.transaction(recipeStoreName, 'readonly')
    const request = transaction
      .objectStore(recipeStoreName)
      .get(recipeCatalogKey)

    request.onsuccess = () => {
      const storedCatalog = request.result as StoredRecipeCatalog | undefined
      resolve(storedCatalog?.recipes ?? null)
    }

    request.onerror = () => reject(request.error)
  })
}

export async function saveRecipeCatalog(recipes: FfxivRecipe[]) {
  const database = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(recipeStoreName, 'readwrite')

    transaction.objectStore(recipeStoreName).put({
      id: recipeCatalogKey,
      recipes,
      savedAt: Date.now(),
    } satisfies StoredRecipeCatalog)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
