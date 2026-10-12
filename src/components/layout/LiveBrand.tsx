'use client';

import { useShopLogo } from '@/lib/db/store';
import { Brand } from './Brand';

/**
 * Brand for screens outside the signed-in app (login, customer card, offline):
 * reads the public copy of the shop logo, falling back to the drawn mark.
 */
export function LiveBrand({ compact = false }: { compact?: boolean }) {
  const logo = useShopLogo();
  return <Brand compact={compact} src={logo} />;
}
