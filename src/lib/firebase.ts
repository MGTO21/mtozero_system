import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * The whole app is client-rendered against Firebase. If the keys are missing we
 * must not throw at import time — the UI shows a setup screen instead.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

const APP_NAME = 'mtozero';

function initApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  return initializeApp(firebaseConfig, APP_NAME);
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;

export function app(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured');
  cachedApp ??= initApp();
  return cachedApp;
}

/**
 * Firestore with a persistent (IndexedDB) cache: this is what makes the PWA
 * usable when the connection drops — last-read data still renders, and writes
 * queue until the device is back online.
 */
export function db(): Firestore {
  if (cachedDb) return cachedDb;
  const instance = app();
  if (typeof window === 'undefined') {
    cachedDb = getFirestore(instance);
    return cachedDb;
  }
  try {
    cachedDb = initializeFirestore(instance, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialized (Fast Refresh / duplicate call) — reuse it.
    cachedDb = getFirestore(instance);
  }
  return cachedDb;
}

export function auth(): Auth {
  cachedAuth ??= getAuth(app());
  return cachedAuth;
}

/**
 * A throwaway secondary app used only to create employee accounts.
 * Creating a user on the primary app would replace the owner's own session;
 * doing it on a secondary app leaves the owner signed in.
 */
export function secondaryAuth(): Auth {
  const name = 'mtozero-admin';
  const existing = getApps().find((a) => a.name === name);
  const secondary = existing ?? initializeApp(firebaseConfig, name);
  return getAuth(secondary);
}

export function primaryAppOrNull(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  try {
    return getApps().length ? getApp(APP_NAME) : app();
  } catch {
    return null;
  }
}
