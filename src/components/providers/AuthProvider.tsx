'use client';

import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db, isFirebaseConfigured } from '@/lib/firebase';
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
    void setPersistence(instance, browserLocalPersistence);

    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(instance, async (fbUser) => {
      unsubProfile?.();
      unsubProfile = null;
      setFirebaseUser(fbUser);
      setProfileError(null);

      if (!fbUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const ref = doc(db(), 'users', fbUser.uid);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          // Self-heal: create the profile on first sign-in.
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
        }
      } catch (err) {
        setProfileError(
          err instanceof Error && err.message.includes('permission')
            ? 'حسابك غير مُصرَّح له. اطلب من المالك إضافتك للنظام.'
            : 'تعذّر تحميل بيانات حسابك.',
        );
      }

      // Live subscription so a role change by the owner applies without re-login.
      unsubProfile = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setProfile(null);
            setProfileError('لا يوجد ملف مستخدم لهذا الحساب. تواصل مع المالك.');
          } else {
            const data = snap.data() as AppUser;
            if (data.isActive === false) {
              setProfile(null);
              setProfileError('تم إيقاف هذا الحساب. تواصل مع المالك.');
            } else {
              setProfile({ ...data, uid: snap.id });
              setProfileError(null);
            }
          }
          setLoading(false);
        },
        () => {
          setProfileError('تعذّر الوصول لبيانات الحساب. تحقّق من الاتصال أو الصلاحيات.');
          setLoading(false);
        },
      );
    });

    return () => {
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
