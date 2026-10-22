import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { database } from '@/lib/firebase';

export type AccessStatus = 'approved' | 'pending' | 'rejected';

function getDatabase() {
  if (!database) {
    throw new Error('Firebase no está configurado.');
  }

  return database;
}

export async function requestAccess(userId: string, email: string) {
  const requestRef = doc(getDatabase(), 'accessRequests', userId);
  const existingRequest = await getDoc(requestRef);

  if (!existingRequest.exists()) {
    await setDoc(requestRef, {
      email,
      status: 'pending',
      requestedAt: serverTimestamp(),
    });
  }
}

export async function loadAccessStatus(userId: string): Promise<AccessStatus> {
  const db = getDatabase();
  const [approval, request] = await Promise.all([
    getDoc(doc(db, 'approvedUsers', userId)),
    getDoc(doc(db, 'accessRequests', userId)),
  ]);

  if (approval.exists()) {
    return 'approved';
  }

  return request.data()?.status === 'rejected' ? 'rejected' : 'pending';
}
