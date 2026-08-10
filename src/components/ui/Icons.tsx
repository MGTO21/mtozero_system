import type { SVGProps } from 'react';

/**
 * Every icon here is used for one specific meaning in the app. Nothing decorative:
 * if a concept has no icon it stays as text.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ---------- navigation ---------- */

/** Dashboard: a gauge — "how is the shop doing right now". */
export const IconGauge = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 14.5 16 9" />
    <circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    <path d="M3.5 17.5a9.5 9.5 0 1 1 17 0" />
    <path d="M3.5 17.5h3M17.5 17.5h3" />
  </Base>
);

/** Inventory: a stacked shoebox. */
export const IconBoxes = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 8.5 12 5l9 3.5-9 3.5-9-3.5Z" />
    <path d="M3 8.5v7L12 19l9-3.5v-7" />
    <path d="M12 12v7" />
  </Base>
);

/** Quick sale: price tag being handed over. */
export const IconTag = (p: IconProps) => (
  <Base {...p}>
    <path d="M13.6 3.4H20v6.4l-9.3 9.3a2 2 0 0 1-2.9 0l-3.5-3.5a2 2 0 0 1 0-2.9l9.3-9.3Z" />
    <circle cx="16.6" cy="6.9" r="1.3" fill="currentColor" stroke="none" />
  </Base>
);

/** Sales log: a receipt roll. */
export const IconReceipt = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h12v16.5a1.5 1.5 0 0 1-2.3 1.3L12 18.6l-3.7 2.2A1.5 1.5 0 0 1 6 19.5V3Z" />
    <path d="M9.5 7.5h5M9.5 11h5" />
  </Base>
);

/** Reports: comparison bars. */
export const IconChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <path d="M7 20V11M12 20V5M17 20v-6" />
  </Base>
);

/** Expenses: cash leaving the drawer. */
export const IconWallet = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5.5A2.5 2.5 0 0 1 3 15.5v-7Z" />
    <path d="M3 10h12" />
    <circle cx="17.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </Base>
);

/** Debts: an IOU note. */
export const IconDebt = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9L20 9.5v9A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13Z" />
    <path d="M14 4v6h6" />
    <path d="M8.5 15.5h6M11.5 12.5v6" />
  </Base>
);

/** Team: two people. */
export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.9c1.9.6 3.2 2.3 3.2 4.6" />
  </Base>
);

/** Activity log: clock turning back. */
export const IconHistory = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5V9H8" />
    <path d="M12 8v4.4l3 1.8" />
  </Base>
);

/* ---------- actions ---------- */

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.4 15.4 20 20" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconMinus = (p: IconProps) => (
  <Base {...p} strokeWidth={2.2}>
    <path d="M5 12h14" />
  </Base>
);

export const IconEdit = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h4L19.2 8.8a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" />
    <path d="M14.5 6.5 17.5 9.5" />
  </Base>
);

/** Archive (never a trash can — products are archived, not deleted). */
export const IconArchive = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 6.5h17v3h-17z" />
    <path d="M5 9.5v9A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-9" />
    <path d="M10 13.5h4" />
  </Base>
);

export const IconRestore = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 1 1 2.5 5.8" />
    <path d="M4 17.5V12h5.5" />
    <path d="M12 9v3.5l2.5 1.5" />
  </Base>
);

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12" />
  </Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v11" />
    <path d="M8 11.5 12 15.5 16 11.5" />
    <path d="M4.5 19.5h15" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p} strokeWidth={2.4}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Base>
);

export const IconX = (p: IconProps) => (
  <Base {...p} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconChevronLeft = (p: IconProps) => (
  <Base {...p} strokeWidth={2.2}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p} strokeWidth={2.2}>
    <path d="M5.5 9.5 12 16l6.5-6.5" />
  </Base>
);

export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6.5h16M7 12h10M10 17.5h4" />
  </Base>
);

export const IconLogout = (p: IconProps) => (
  <Base {...p}>
    <path d="M14.5 4.5h-8A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h8" />
    <path d="M12 12h8M17 8.5 20.5 12 17 15.5" />
  </Base>
);

export const IconMoon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4A8.5 8.5 0 1 0 20 14.2Z" />
  </Base>
);

export const IconSun = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Base>
);

export const IconImage = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l4.5-4.5 3.5 3.5 3-3 5 5" />
  </Base>
);

export const IconPhone = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.2 3.7 8.9 4.4a1.5 1.5 0 0 1 1.1 1.2l.4 2.2a1.5 1.5 0 0 1-.6 1.5l-1.2.9a10.5 10.5 0 0 0 5.2 5.2l.9-1.2a1.5 1.5 0 0 1 1.5-.6l2.2.4a1.5 1.5 0 0 1 1.2 1.1l.7 2.7a1.5 1.5 0 0 1-1.5 1.9C10.4 19.7 4.3 13.6 4.3 5.2a1.5 1.5 0 0 1 1.9-1.5Z" />
  </Base>
);

export const IconWhatsApp = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12.05 2.5A9.44 9.44 0 0 0 3.9 16.8L2.5 21.5l4.86-1.37a9.44 9.44 0 1 0 4.69-17.63Zm0 1.72a7.72 7.72 0 0 1 0 15.44 7.65 7.65 0 0 1-3.9-1.07l-.34-.2-2.88.81.83-2.79-.2-.35a7.72 7.72 0 0 1 6.49-11.84Zm-3.4 3.66c-.2 0-.5.07-.74.34-.25.27-.9.88-.9 2.13s.92 2.47 1.05 2.64c.13.18 1.8 2.86 4.4 3.88 2.17.85 2.61.68 3.08.64.47-.05 1.53-.63 1.75-1.24.22-.6.22-1.13.15-1.24-.06-.11-.24-.18-.5-.31l-1.72-.83c-.23-.11-.4-.07-.55.11l-.77.96c-.13.16-.27.18-.5.07a6.87 6.87 0 0 1-2-1.24 7.55 7.55 0 0 1-1.4-1.72c-.14-.24-.02-.38.1-.5l.5-.6c.12-.16.16-.27.24-.45.08-.18.04-.34-.02-.47l-.72-1.74c-.19-.46-.39-.47-.55-.48h-.2Z" />
  </svg>
);

export const IconFacebook = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M13.5 21v-7.9h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H16.7V3.7c-.29-.04-1.3-.13-2.47-.13-2.45 0-4.13 1.5-4.13 4.24V10H7.4v3.1h2.7V21h3.4Z" />
  </svg>
);

export const IconStore = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5" />
    <path d="M3 9.5 5 4h14l2 5.5a2.6 2.6 0 0 1-4.5 1.7 2.6 2.6 0 0 1-4.5 0 2.6 2.6 0 0 1-4.5 0A2.6 2.6 0 0 1 3 9.5Z" />
  </Base>
);

/** Shipments: a cargo crate on a pallet. */
export const IconShip = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 4.5h12v9H6z" />
    <path d="M6 8.5h12" />
    <path d="M12 4.5v9" />
    <path d="M3.5 17.5h17" />
    <path d="M6.5 17.5V20M17.5 17.5V20" />
  </Base>
);

/** A single customer, distinct from the team icon which shows two people. */
export const IconUserCircle = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="9.2" r="3.4" />
    <path d="M5.4 19.6a6.8 6.8 0 0 1 13.2 0" />
    <circle cx="12" cy="12" r="9.2" />
  </Base>
);

/** Referral: one node branching into two. */
export const IconShare = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="6" r="2.6" />
    <circle cx="18" cy="18" r="2.6" />
    <path d="M8.4 10.8 15.6 7.2M8.4 13.2l7.2 3.6" />
  </Base>
);

/* ---------- stock state (distinct shapes, not just colour) ---------- */

/** A size that is in stock: solid, closed square. */
export const IconSizeIn = (p: IconProps) => (
  <Base {...p}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
    <path d="M8.5 12.2 11 14.7 15.8 9.5" />
  </Base>
);

/** A size that is sold out: dashed, open square — reads differently even in greyscale. */
export const IconSizeOut = (p: IconProps) => (
  <Base {...p} strokeDasharray="3 2.6">
    <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
  </Base>
);

/** Low stock warning: triangle. Used only where an action is needed. */
export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4.2 21 19.5H3L12 4.2Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
  </Base>
);

/** Stale stock: hourglass. */
export const IconHourglass = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 3.5h10M7 20.5h10" />
    <path d="M8 3.5v3.2c0 2 4 3.6 4 5.3s-4 3.3-4 5.3v3.2" />
    <path d="M16 3.5v3.2c0 2-4 3.6-4 5.3s4 3.3 4 5.3v3.2" />
  </Base>
);

/** Return / exchange: arrow curving back into the box. */
export const IconReturn = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 5.5 5.5 9.5 9.5 13.5" />
    <path d="M5.5 9.5h9a4.5 4.5 0 0 1 0 9H10" />
  </Base>
);

export const IconInstall = (p: IconProps) => (
  <Base {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M12 7.5v6M9.5 11 12 13.5 14.5 11" />
  </Base>
);

export const IconOffline = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4l16 16" />
    <path d="M8.6 8.7A6.5 6.5 0 0 0 5 11" />
    <path d="M12.5 5.6c2.6.15 5 1.3 6.7 3.1" />
    <path d="M8.2 13.8a4 4 0 0 1 1.6-1.1M14 12.9c.6.2 1.2.5 1.7 1" />
    <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
  </Base>
);
