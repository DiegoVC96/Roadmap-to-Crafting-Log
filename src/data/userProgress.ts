import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { database } from './firebase'
import type { MarketScope } from './marketBoard'

function progressDocument(userId: string) {
  return doc(database, 'users', userId, 'progress', 'crafting-log')
}

function readRecipeIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((recipeId): recipeId is string => typeof recipeId === 'string')
    : []
}

function readInventory(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([itemId, quantity]) =>
        /^\d+$/.test(itemId) &&
        typeof quantity === 'number' &&
        Number.isFinite(quantity) &&
        quantity >= 0,
    ),
  ) as Record<string, number>
}

function readItemIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (itemId): itemId is number =>
          typeof itemId === 'number' && Number.isSafeInteger(itemId) && itemId > 0,
      )
    : []
}

function readMarketScope(value: unknown): MarketScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const scope = value as { type?: unknown; name?: unknown }

  return (scope.type === 'world' || scope.type === 'dataCenter') &&
    typeof scope.name === 'string' &&
    scope.name.length > 0
    ? { type: scope.type, name: scope.name }
    : null
}

export type UserProgress = {
  completedRecipeIds: string[]
  inventoryByItemId: Record<string, number>
  farmingSessionItemIds: number[]
  marketScope: MarketScope | null
}

export async function loadUserProgress(userId: string) {
  const snapshot = await getDoc(progressDocument(userId))

  if (!snapshot.exists()) {
    return {
      completedRecipeIds: [],
      inventoryByItemId: {},
      farmingSessionItemIds: [],
      marketScope: null,
    }
  }

  const data = snapshot.data()

  return {
    completedRecipeIds: readRecipeIds(data.completedRecipeIds),
    inventoryByItemId: readInventory(data.inventoryByItemId),
    farmingSessionItemIds: readItemIds(data.farmingSessionItemIds),
    marketScope: readMarketScope(data.marketScope),
  }
}

export async function saveUserProgress(userId: string, progress: UserProgress) {
  await setDoc(
    progressDocument(userId),
    {
      completedRecipeIds: progress.completedRecipeIds,
      inventoryByItemId: progress.inventoryByItemId,
      farmingSessionItemIds: progress.farmingSessionItemIds,
      marketScope: progress.marketScope,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
