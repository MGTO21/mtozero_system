'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './AuthProvider';

/**
 * Firebase Auth for the screens that need a signed-in member: the staff app,
 * the login page and the printable invoice. Kept out of the root layout so the
 * public store never downloads the Firebase SDK — it orders through the server.
 */
export function StaffAuth({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
