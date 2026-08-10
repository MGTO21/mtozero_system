'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { SetupNotice } from '@/components/SetupNotice';
import { isFirebaseConfigured } from '@/lib/firebase';

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isFirebaseConfigured) return <SetupNotice />;
  return <AppShell>{children}</AppShell>;
}
