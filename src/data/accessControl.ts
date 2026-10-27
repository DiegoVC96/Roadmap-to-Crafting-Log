import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { database } from './firebase'

export type AccessStatus = 'approved' | 'pending' | 'rejected'

export type AccessState = {
  status: AccessStatus
  isAdmin: boolean
}

export type AccessRequest = {
  uid: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
}

function requestDocument(userId: string) {
  return doc(database, 'accessRequests', userId)
}

function approvalDocument(userId: string) {
  return doc(database, 'approvedUsers', userId)
}

function adminDocument(userId: string) {
  return doc(database, 'admins', userId)
}

export async function requestAccess(userId: string, email: string) {
  const requestRef = requestDocument(userId)
  const existingRequest = await getDoc(requestRef)

  if (existingRequest.exists()) {
    return
  }

  await setDoc(requestRef, {
    email,
    status: 'pending',
    requestedAt: serverTimestamp(),
  })
}

export async function loadAccessState(userId: string): Promise<AccessState> {
  const [approvalSnapshot, adminSnapshot, requestSnapshot] = await Promise.all([
    getDoc(approvalDocument(userId)),
    getDoc(adminDocument(userId)),
    getDoc(requestDocument(userId)),
  ])

  if (approvalSnapshot.exists()) {
    return { status: 'approved', isAdmin: adminSnapshot.exists() }
  }

  return {
    status: requestSnapshot.data()?.status === 'rejected' ? 'rejected' : 'pending',
    isAdmin: adminSnapshot.exists(),
  }
}

export async function loadAccessRequests() {
  const requestsQuery = query(
    collection(database, 'accessRequests'),
    orderBy('requestedAt', 'desc'),
  )
  const snapshot = await getDocs(requestsQuery)

  return snapshot.docs.map((request) => {
    const data = request.data()

    return {
      uid: request.id,
      email: typeof data.email === 'string' ? data.email : 'Sin correo',
      status:
        data.status === 'approved' || data.status === 'rejected'
          ? data.status
          : 'pending',
    } satisfies AccessRequest
  })
}

export function subscribeToAccessRequests(
  onRequests: (requests: AccessRequest[]) => void,
  onError: () => void,
) {
  const requestsQuery = query(
    collection(database, 'accessRequests'),
    orderBy('requestedAt', 'desc'),
  )

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      onRequests(
        snapshot.docs.map((request) => {
          const data = request.data()

          return {
            uid: request.id,
            email: typeof data.email === 'string' ? data.email : 'Sin correo',
            status:
              data.status === 'approved' || data.status === 'rejected'
                ? data.status
                : 'pending',
          } satisfies AccessRequest
        }),
      )
    },
    () => onError(),
  )
}

export async function approveAccessRequest(request: AccessRequest, reviewerId: string) {
  const batch = writeBatch(database)

  batch.set(approvalDocument(request.uid), {
    email: request.email,
    approvedAt: serverTimestamp(),
    approvedBy: reviewerId,
  })
  batch.update(requestDocument(request.uid), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerId,
  })

  await batch.commit()
}

export async function rejectAccessRequest(request: AccessRequest, reviewerId: string) {
  await updateDoc(requestDocument(request.uid), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerId,
  })
}
