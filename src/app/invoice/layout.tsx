import type { ReactNode } from 'react';
import { StaffAuth } from '@/components/providers/StaffAuth';

/** The invoice reads a sale, which only signed-in staff may read. */
export default function InvoiceLayout({ children }: { children: ReactNode }) {
  return <StaffAuth>{children}</StaffAuth>;
}
