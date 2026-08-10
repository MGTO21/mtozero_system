import type { ComponentType, SVGProps } from 'react';
import {
  IconBoxes,
  IconCashRegister,
  IconChart,
  IconDebt,
  IconGauge,
  IconHistory,
  IconReceipt,
  IconShip,
  IconStore,
  IconTag,
  IconUserCircle,
  IconUsers,
  IconWallet,
} from '@/components/ui/Icons';

/** Sidebar sections. Ten flat links were hard to scan; three groups are not. */
export type NavSection = 'daily' | 'stock' | 'admin';

export const SECTION_LABEL: Record<NavSection, string> = {
  daily: 'العمل اليومي',
  stock: 'البضاعة',
  admin: 'الإدارة',
};

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  section: NavSection;
  /** Owner-only routes are hidden from employees and blocked by the route guard. */
  ownerOnly?: boolean;
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: IconGauge, section: 'daily' },
  { href: '/sell', label: 'بيع سريع', icon: IconTag, section: 'daily' },
  { href: '/sales', label: 'المبيعات', icon: IconReceipt, section: 'daily' },
  { href: '/close', label: 'تقفيل اليوم', icon: IconCashRegister, section: 'daily' },
  { href: '/customers', label: 'العملاء', icon: IconUserCircle, section: 'daily' },
  { href: '/debts', label: 'الديون', icon: IconDebt, section: 'daily' },

  { href: '/inventory', label: 'المخزون', icon: IconBoxes, section: 'stock' },
  { href: '/shipments', label: 'الشحنات', icon: IconShip, section: 'stock' },

  { href: '/expenses', label: 'المصروفات', icon: IconWallet, section: 'admin' },
  { href: '/reports', label: 'التقارير', icon: IconChart, section: 'admin', ownerOnly: true },
  { href: '/activity', label: 'سجل النشاط', icon: IconHistory, section: 'admin', ownerOnly: true },
  { href: '/team', label: 'الفريق', icon: IconUsers, section: 'admin', ownerOnly: true },
  { href: '/settings', label: 'إعدادات المتجر', icon: IconStore, section: 'admin', ownerOnly: true },
];

export const SECTION_ORDER: NavSection[] = ['daily', 'stock', 'admin'];

/** Routes an employee must never reach, enforced in the app shell guard. */
export const OWNER_ONLY_ROUTES = NAV.filter((n) => n.ownerOnly).map((n) => n.href);

export function visibleNav(isOwner: boolean): NavItem[] {
  return NAV.filter((n) => isOwner || !n.ownerOnly);
}

/** The four tabs plus the sell button that make up the mobile bottom bar. */
export const MOBILE_TABS = ['/dashboard', '/inventory', '/sales', '/debts'] as const;
