'use client';

import { useMemo } from 'react';
import { useCustomers } from '@/lib/db/customers';
import { makeReferralCode } from '@/lib/db/customers';
import { useSettings } from '@/lib/db/settings';
import { whatsappNumber } from '@/lib/format';
import { buildInvoice, type InvoiceModel } from '@/lib/invoice';
import type { Sale } from '@/lib/types';

/**
 * The invoice for a sale, with the shop's settings and the customer's own
 * referral code filled in.
 *
 * The code is looked up by phone in the customer list already held for the
 * session. A customer typed in offline is not in that list yet — their code is
 * derived the same way the server will create it, so the invoice handed over at
 * the counter already carries the code the customer will actually have.
 */
export function useInvoice(sale: Sale | null): InvoiceModel | null {
  const { settings } = useSettings();
  const { data: customers } = useCustomers();

  return useMemo(() => {
    if (!sale) return null;
    const phone = whatsappNumber(sale.customerPhone);
    let code: string | null = null;
    if (phone) {
      const known = customers.find((c) => c.phone === phone);
      code = known?.referralCode ?? makeReferralCode(sale.customerName?.trim() || 'عميل', phone);
    }
    return buildInvoice(sale, settings, code);
  }, [sale, settings, customers]);
}
