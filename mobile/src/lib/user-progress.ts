import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { database } from '@/lib/firebase';

function progressDocument(userId: string) {
  if (!database) throw new Error('Firebase no está configurado.');
  return doc(database, 'users', userId, 'progress', 'crafting-log');
}

export async function loadUserProgress(userId: string) {
  const snapshot = await getDoc(progressDocument(userId));
  const recipeIds = snapshot.data()?.completedRecipeIds;
  return Array.isArray(recipeIds) ? recipeIds.filter((id): id is string => typeof id === 'string') : [];
}

export async function saveUserProgress(userId: string, completedRecipeIds: string[]) {
  await setDoc(progressDocument(userId), { completedRecipeIds, updatedAt: serverTimestamp() }, { merge: true });
}
