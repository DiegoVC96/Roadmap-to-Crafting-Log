import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { database } from './firebase'

function progressDocument(userId: string) {
  return doc(database, 'users', userId, 'progress', 'crafting-log')
}

function readRecipeIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((recipeId): recipeId is string => typeof recipeId === 'string')
    : []
}

export async function loadUserProgress(userId: string) {
  const snapshot = await getDoc(progressDocument(userId))

  if (!snapshot.exists()) {
    return []
  }

  return readRecipeIds(snapshot.data().completedRecipeIds)
}

export async function saveUserProgress(userId: string, completedRecipeIds: string[]) {
  await setDoc(
    progressDocument(userId),
    {
      completedRecipeIds,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
