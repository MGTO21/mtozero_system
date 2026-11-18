import type { ReactNode } from 'react';
import { StaffAuth } from '@/components/providers/StaffAuth';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <StaffAuth>{children}</StaffAuth>;
}
