import { initializeApp, cert, getApps, getApp  } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { FirebaseError } from 'firebase/app'
import { firebaseConfig, type DbWheelMeta } from '$lib/utils/Firebase'
import { addIdsToEntries } from '$lib/utils/Wheel'
import { readFileSync } from 'fs';
import { GOOGLE_APPLICATION_CREDENTIALS } from '$env/static/private';
import type {
  ApiUser, ApiWheel, CreateWheelMeta, WheelVisibility
} from '$lib/utils/Api'

// Ensure environment variable is set
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set.');
}

// Read service account credentials
const serviceAccount = JSON.parse(readFileSync(GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));

// Initialize Firebase Admin SDK
let app;
if (!getApps().length) {
  app = initializeApp({
    credential: cert(serviceAccount),
  });
} else {
  app = getApp();
}

try {
  initializeApp(firebaseConfig)
} catch (error) {
  if (error instanceof FirebaseError && error.code !== 'app/duplicate-app') {
    console.error(error)
  }
}

const db = getFirestore()

export const getWheel = async (path: string, uid?: string | null) => {
  const metaSnap = await db.doc(`wheel-meta/${path}`).get()
  if (!metaSnap.exists) {
    return null
  }
  const meta = metaSnap.data() as DbWheelMeta
  if (meta.visibility === 'private' && meta.uid !== uid) {
    return null
  }
  const wheelSnap = await db.doc(`wheels/${path}`).get()
  if (wheelSnap.exists) {
    return wheelSnap.data() as ApiWheel
  }
  return null
}

export const getWheels = async (uid: string) => {
  const metaSnap = await db.collection('wheel-meta').where(
    'uid', '==', uid
  ).get()
  const paths = metaSnap.docs.map(doc => (doc.data() as DbWheelMeta).path)
  const wheelSnaps = await db.getAll(
    ...paths.map(path => db.doc(`wheels/${path}`))
  )
  return wheelSnaps.map(snap => snap.data() as ApiWheel)
}

export const getUserWheelsMeta = async (uid: string) => {
  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) {
    return []
  }
  const user = userSnap.data() as ApiUser
  if (!user.wheels.length) {
    return []
  }
  return await getWheelMetaForPaths(user.wheels)
}

export const getWheelMetaForPaths = async (paths: string[]) => {
  const metaSnaps = await db.getAll(
    ...paths.map(path => db.doc(`wheel-meta/${path}`))
  )
  return metaSnaps.map(
    snap => snap.data() as DbWheelMeta
  ).map(meta => ({
    ...meta,
    created: meta.created._seconds * 1000,
    updated: meta.updated ? meta.updated._seconds * 1000 : null
  }))
}

export const saveWheel = async (
  wheel: Omit<ApiWheel, 'path'>, uid: string, visibility: WheelVisibility
) => {
  const userDoc = await db.doc(`users/${uid}`).get()
  if (!userDoc.exists) {
    return null
  }
  const path = await getNewWheelPath()
  await db.collection('wheel-meta').doc(path).create({
    path,
    uid,
    visibility,
    created: new Date(),
    updated: null,
    title: wheel.config.title,
    views: 0
  } satisfies CreateWheelMeta)
  await db.collection('wheels').doc(path).create(
    {
      path,
      config: wheel.config,
      entries: addIdsToEntries(wheel.entries)
    } satisfies ApiWheel
  )
  const user = userDoc.data() as ApiUser
  await db.doc(`users/${uid}`).update({
    wheels: [...user.wheels, path]
  } satisfies Partial<ApiUser>)
  return path
}

export const updateWheel = async (
  path: string,
  wheel: Partial<Omit<ApiWheel, 'path'>>,
  uid: string,
  visibility?: WheelVisibility
) => {
  const metaDoc = db.doc(`wheel-meta/${path}`)
  const metaSnap = await metaDoc.get()
  if (!metaSnap.exists) {
    return null
  }
  const meta = metaSnap.data() as DbWheelMeta
  if (meta.uid !== uid) {
    return null
  }
  const newMeta: Partial<CreateWheelMeta> = { updated: new Date() }
  if (wheel.config && wheel.config.title !== meta.title) {
    newMeta.title = wheel.config.title
  }
  if (visibility) {
    newMeta.visibility = visibility
  }
  await metaDoc.update(newMeta)
  const wheelDoc = db.doc(`wheels/${path}`)
  await wheelDoc.update({
    config: wheel.config,
    entries: wheel.entries ? addIdsToEntries(wheel.entries) : undefined
  } satisfies Partial<ApiWheel>)
  return meta.path
}

export const deleteWheel = async (path: string, uid: string) => {
  const userDoc = await db.doc(`users/${uid}`).get()
  if (!userDoc.exists) {
    return null
  }
  const user = userDoc.data() as ApiUser
  if (!user.wheels.includes(path)) {
    return null
  }
  await Promise.all([
    db.doc(`users/${uid}`).update({
      wheels: user.wheels.filter(wheel => wheel !== path)
    } satisfies Partial<ApiUser>),
    db.doc(`wheel-meta/${path}`).delete(),
    db.doc(`wheels/${path}`).delete()
  ])
  return true
}

const getNewWheelPath = async () => {
  let path: string
  let snap: FirebaseFirestore.DocumentSnapshot
  do {
    path = getRandomPath()
    snap = await db.doc(`wheel-meta/${path}`).get()
  } while (snap.exists)
  return path
}

const getRandomPath = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(
    { length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]
  ).toSpliced(3, 0, '-').join('')
}

export { db };