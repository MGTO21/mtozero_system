'use client';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
import { isNetworkError } from '@/lib/offline/write';
import type { AppUser, Role } from '@/lib/types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: AppUser | null;
  loading: boolean;
  /** Signed in with Firebase but the users/{uid} document is missing or deactivated. */
  profileError: string | null;
  isOwner: boolean;
  /** Owner always sees profit; an employee only if the owner granted it. */
  canSeeProfit: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The single bootstrap rule: whoever signs in with this address gets the owner
 * role the first time their profile document is created. Must match the email
 * hard-coded in firestore.rules.
 */
const OWNER_EMAIL = (process.env.NEXT_PUBLIC_OWNER_EMAIL ?? '').trim().toLowerCase();

/**
 * The last profile this device saw, so the app can open at once with no signal.
 * Firebase only reports the stored session after its start-up checks, which on a
 * weak connection can take a long time; the shop cannot wait on that to sell.
 * It is a display hint only — firestore.rules still judge every write.
 */
const PROFILE_CACHE_KEY = 'mtozero:lastProfile';
/** How long start-up waits for Firebase before opening from the cached profile. */
const OFFLINE_START_MS = 2500;

function readCachedProfile(): AppUser | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AppUser) : null;
    return parsed?.uid ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(value: AppUser | null) {
  try {
    if (value) {
      const { uid, name, email, role, canSeeProfit, isActive } = value;
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, name, email, role, canSeeProfit, isActive }));
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Storage blocked: the app simply waits for Firebase as before.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const instance = auth();

    let unsubProfile: (() => void) | null = null;
    let authResolved = false;

    // Weak or no signal: open from the last profile instead of a loading screen.
    const offlineStart = window.setTimeout(() => {
      if (authResolved) return;
      const cached = readCachedProfile();
      if (!cached) return;
      setProfile(cached);
      setLoading(false);
    }, OFFLINE_START_MS);

    const unsubAuth = onAuthStateChanged(instance, (fbUser) => {
      authResolved = true;
      window.clearTimeout(offlineStart);
      unsubProfile?.();
      unsubProfile = null;
      setFirebaseUser(fbUser);
      setProfileError(null);

      if (!fbUser) {
        writeCachedProfile(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // Cached profile of this same account opens the app now; the snapshot
      // below replaces it with the live one.
      const cached = readCachedProfile();
      if (cached?.uid === fbUser.uid) {
        setProfile(cached);
        setLoading(false);
      }

      const ref = doc(db(), 'users', fbUser.uid);
      // Self-heal: create the profile on first sign-in. Runs beside the
      // subscription, never in front of it — it needs the server.
      void (async () => {
        try {
          const snap = await getDoc(ref);
          if (snap.exists()) return;
          const email = (fbUser.email ?? '').toLowerCase();
          const role: Role = OWNER_EMAIL && email === OWNER_EMAIL ? 'owner' : 'employee';
          await setDoc(ref, {
            uid: fbUser.uid,
            name: fbUser.displayName || (fbUser.email ?? '').split('@')[0] || 'مستخدم',
            email: fbUser.email ?? '',
            role,
            canSeeProfit: role === 'owner',
            isActive: true,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          // No connection is not an account problem: the self-heal waits for a signal.
          if (!isNetworkError(err)) {
            setProfileError(
              err instanceof Error && err.message.includes('permission')
                ? 'حسابك غير مُصرَّح له. اطلب من المالك إضافتك للنظام.'
                : 'تعذّر تحميل بيانات حسابك.',
            );
            setLoading(false);
          }
        }
      })();

      // Live subscription so a role change by the owner applies without re-login.
      unsubProfile = onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snap) => {
          if (!snap.exists()) {
            // "Not in the offline cache" is not "does not exist" — wait for the
            // server before telling someone their account is gone.
            if (snap.metadata.fromCache) return;
            writeCachedProfile(null);
            setProfile(null);
            setProfileError('لا يوجد ملف مستخدم لهذا الحساب. تواصل مع المالك.');
          } else {
            const data = snap.data() as AppUser;
            if (data.isActive === false) {
              writeCachedProfile(null);
              setProfile(null);
              setProfileError('تم إيقاف هذا الحساب. تواصل مع المالك.');
            } else {
              const next = { ...data, uid: snap.id };
              writeCachedProfile(next);
              setProfile(next);
              setProfileError(null);
            }
          }
          setLoading(false);
        },
        (err) => {
          if (isNetworkError(err)) return;
          setProfileError('تعذّر الوصول لبيانات الحساب. تحقّق من الاتصال أو الصلاحيات.');
          setLoading(false);
        },
      );
    });

    return () => {
      window.clearTimeout(offlineStart);
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const isOwner = profile?.role === 'owner';
    return {
      firebaseUser,
      profile,
      loading,
      profileError,
      isOwner,
      canSeeProfit: isOwner || profile?.canSeeProfit === true,
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth(), email.trim(), password);
      },
      signOut: async () => {
        await fbSignOut(auth());
      },
    };
  }, [firebaseUser, profile, loading, profileError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Current actor stamped onto every write, for the activity log. */
export function useActor(): { uid: string; name: string } {
  const { profile, firebaseUser } = useAuth();
  return {
    uid: profile?.uid ?? firebaseUser?.uid ?? 'unknown',
    name: profile?.name ?? firebaseUser?.email ?? 'مستخدم',
  };
}
