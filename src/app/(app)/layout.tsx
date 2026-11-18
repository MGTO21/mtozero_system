'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { StaffAuth } from '@/components/providers/StaffAuth';
import { SetupNotice } from '@/components/SetupNotice';
import { isFirebaseConfigured } from '@/lib/firebase';

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isFirebaseConfigured) return <SetupNotice />;
  return (
    <StaffAuth>
      <AppShell>{children}</AppShell>
    </StaffAuth>
  );
}
