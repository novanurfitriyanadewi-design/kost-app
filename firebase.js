import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const defaultConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

let firebaseState = {
  app: null,
  db: null,
  initialized: false,
  error: null
};

function getFirebaseConfig() {
  const providedConfig = window.__KOST_KITA_FIREBASE_CONFIG__ || window.firebaseConfig || {};
  return { ...defaultConfig, ...providedConfig };
}

export function initializeFirebase() {
  if (firebaseState.initialized && firebaseState.db) {
    return firebaseState;
  }

  try {
    const config = getFirebaseConfig();
    const hasPlaceholder = Object.values(config).some((value) => typeof value === 'string' && value.includes('YOUR_'));

    if (hasPlaceholder) {
      throw new Error('Firebase config masih memakai placeholder. Isi nilai apiKey, projectId, authDomain, storageBucket, messagingSenderId, dan appId terlebih dahulu.');
    }

    const app = initializeApp(config);
    const db = getFirestore(app);

    firebaseState = { app, db, initialized: true, error: null };
    console.log('Firebase berhasil diinisialisasi');
    return firebaseState;
  } catch (error) {
    console.error('Gagal menginisialisasi Firebase:', error);
    firebaseState.error = error;
    return firebaseState;
  }
}

export async function fetchCollectionDocs(collectionName, options = {}) {
  const { db, error } = initializeFirebase();

  if (error) {
    throw error;
  }

  if (!db) {
    throw new Error('Firebase belum siap.');
  }

  console.log(`Mengambil data collection: ${collectionName}`);

  const pathSegments = collectionName.split('/').filter(Boolean);
  const collectionRef = collection(db, ...pathSegments);
  let queryRef = collectionRef;

  if (options.orderByField) {
    queryRef = query(collectionRef, orderBy(options.orderByField, options.direction || 'desc'));
  }

  if (options.whereField) {
    queryRef = query(collectionRef, where(options.whereField, '==', options.whereValue));
  }

  try {
    const snapshot = await getDocs(queryRef);
    console.log(`[Firestore] ${collectionName} size:`, snapshot.size);
    console.log(`[Firestore] ${collectionName} docs:`, snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(`[Firestore] Gagal mengambil ${collectionName}:`, error);

    if (error?.code === 'permission-denied') {
      throw new Error('Firestore Rules memblokir akses. Periksa rules Firestore untuk collection ini.');
    }

    if (error?.message?.includes('not-found')) {
      throw new Error(`Collection atau subcollection ${collectionName} tidak ditemukan.`);
    }

    throw error;
  }
}

export function watchCollection(collectionName, onSuccess, onError, options = {}) {
  const { db, error } = initializeFirebase();

  if (error) {
    onError(error);
    return () => {};
  }

  if (!db) {
    onError(new Error('Firebase belum siap.'));
    return () => {};
  }

  const pathSegments = collectionName.split('/').filter(Boolean);
  const collectionRef = collection(db, ...pathSegments);
  let queryRef = collectionRef;

  if (options.orderByField) {
    queryRef = query(collectionRef, orderBy(options.orderByField, options.direction || 'desc'));
  }

  if (options.whereField) {
    queryRef = query(collectionRef, where(options.whereField, '==', options.whereValue));
  }

  console.log(`Menghubungkan realtime ke collection: ${collectionName}`);

  return onSnapshot(
    queryRef,
    (snapshot) => {
      console.log(`[Firestore realtime] ${collectionName} size:`, snapshot.size);
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      onSuccess(docs, snapshot);
    },
    (firestoreError) => {
      console.error(`[Firestore realtime] Gagal menghubungi ${collectionName}:`, firestoreError);
      onError(firestoreError);
    }
  );
}
