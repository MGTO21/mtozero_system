import type { SVGProps } from 'react';

/**
 * The shop's own icon set, drawn for this app — not a library.
 *
 * Style: solid "stamp" shapes with cut-outs, like the rubber stamps and printed
 * forms of a shop ledger. Solid glyphs read at a glance on a phone in daylight,
 * where hairline outline icons wash out — and they do not look like every other
 * template on the web.
 *
 * Every icon is used for one specific meaning in the app. Nothing decorative:
 * if a concept has no icon it stays as text.
 */
type IconProps = SVGProps<SVGSVGElement>;

/** Filled glyph. Holes are cut with even-odd so they show whatever is behind. */
function Solid({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

/** Line glyph, for the few marks that are lines by nature (arrows, ×, +). */
function Line({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
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

/** Home / today's briefing: a gauge — "how is the shop doing right now". */
export const IconGauge = (p: IconProps) => (
  <Solid {...p}>
    <path d="M2 18a10 10 0 0 1 20 0v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1Z M12 15.8a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z M13.3 16.3l3.6-5.7-1-.6-3.6 5.7Z" />
  </Solid>
);

/** Inventory: shoeboxes on a shelf. */
export const IconBoxes = (p: IconProps) => (
  <Solid {...p}>
    <path d="M4.5 4h15v6.5h-15Z M10 6.4h4v1.5h-4Z" />
    <path d="M3 12.5h18V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z M9.5 15.3h5v1.7h-5Z" />
  </Solid>
);

/** Selling: a price tag. */
export const IconTag = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 12.6V4a1 1 0 0 1 1-1h8.6a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-8.6 8.6a1 1 0 0 1-1.4 0L3.3 13.3a1 1 0 0 1-.3-.7Z M7.6 5.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z" />
  </Solid>
);

/** Sales log: a till receipt with a torn edge. */
export const IconReceipt = (p: IconProps) => (
  <Solid {...p}>
    <path d="M5 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v18.2l-2.33-1.5-2.33 1.5-2.34-1.5-2.33 1.5-2.34-1.5L5 21.2Z M8 6.5h8v1.8H8Z M8 10.5h8v1.8H8Z M8 14.5h4.5v1.8H8Z" />
  </Solid>
);

/** Reports: comparison bars on a baseline. */
export const IconChart = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 19.5h18V21H3Z M5 11h3.6v7H5Z M10.2 4.5h3.6V18h-3.6Z M15.4 13.5H19V18h-3.6Z" />
  </Solid>
);

/** Expenses: a wallet with its clasp. */
export const IconWallet = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 6.5a2 2 0 0 1 2-2h11.5a1 1 0 0 1 1 1V7H19a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M14.5 11.5H21v4h-6.5a2 2 0 0 1 0-4Z M16.4 12.7a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z" />
  </Solid>
);

/** Debts: stacked coins with a minus — money still owed. */
export const IconDebt = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 9.2a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v1.3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M3 13.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M3 17.8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M17 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z M14.8 7.2h4.4v1.6h-4.4Z" />
  </Solid>
);

/** Team: two people. */
export const IconUsers = (p: IconProps) => (
  <Solid {...p}>
    <circle cx="9" cy="7.5" r="3.4" />
    <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0v.5h-13Z" />
    <circle cx="16.8" cy="6.6" r="2.7" />
    <path d="M15 13.1a5.6 5.6 0 0 1 6.5 5.4v1h-4.3a8.2 8.2 0 0 0-2.2-6.4Z" />
  </Solid>
);

/** Activity log: a clock face. */
export const IconHistory = (p: IconProps) => (
  <Solid {...p}>
    <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Z M11.1 6.5h1.8v5.1l3.2 1.9-.9 1.5-4.1-2.5Z" />
  </Solid>
);

/** More: four tiles — the rest of the app. */
export const IconGrid = (p: IconProps) => (
  <Solid {...p}>
    <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.4" />
    <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.4" />
    <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.4" />
    <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.4" />
  </Solid>
);

/* ---------- actions ---------- */

export const IconSearch = (p: IconProps) => (
  <Line {...p}>
    <circle cx="10.5" cy="10.5" r="6.2" />
    <path d="M15.5 15.5 20 20" strokeWidth={3} />
  </Line>
);

export const IconPlus = (p: IconProps) => (
  <Line {...p} strokeWidth={2.6}>
    <path d="M12 5v14M5 12h14" />
  </Line>
);

export const IconMinus = (p: IconProps) => (
  <Line {...p} strokeWidth={2.6}>
    <path d="M5 12h14" />
  </Line>
);

export const IconEdit = (p: IconProps) => (
  <Solid {...p}>
    <path d="M15.6 3.6a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L9 19.8 3.5 21l1.2-5.5Z M14.2 6.8l3 3-1.2 1.2-3-3Z" />
  </Solid>
);

/** Archive — never a trash can: products are archived, not deleted. */
export const IconArchive = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 4.5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1V8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <path d="M4.5 10.5h15V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19Z M9.5 13h5v1.8h-5Z" />
  </Solid>
);

export const IconRestore = (p: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M5.2 12a7 7 0 1 1 2 4.9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    <path d="M2 9.5h6.4L5.2 14Z" fill="currentColor" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <Solid {...p}>
    <path d="M4 5.5h16v2H4Z M9.5 2.8h5v2h-5Z" />
    <path d="M5.8 8.5h12.4l-.9 11.6a1.5 1.5 0 0 1-1.5 1.4H8.2a1.5 1.5 0 0 1-1.5-1.4Z M9.4 11h1.6v7.5H9.4Z M13 11h1.6v7.5H13Z" />
  </Solid>
);

export const IconDownload = (p: IconProps) => (
  <Solid {...p}>
    <path d="M10.8 3h2.4v8.2l2.9-2.9 1.7 1.7L12 15.8 6.2 10l1.7-1.7 2.9 2.9Z" />
    <path d="M3 15h2.6v3.4h12.8V15H21v4.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5Z" />
  </Solid>
);

export const IconCopy = (p: IconProps) => (
  <Solid {...p}>
    <path d="M4 4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2H8.5a2 2 0 0 0-2 2v8H5a1 1 0 0 1-1-1Z" />
    <path d="M8.5 8.5a1 1 0 0 1 1-1H19a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1Z" />
  </Solid>
);

export const IconCheck = (p: IconProps) => (
  <Line {...p} strokeWidth={2.8}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Line>
);

export const IconX = (p: IconProps) => (
  <Line {...p} strokeWidth={2.6}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Line>
);

export const IconChevronLeft = (p: IconProps) => (
  <Line {...p} strokeWidth={2.6}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Line>
);

export const IconChevronDown = (p: IconProps) => (
  <Line {...p} strokeWidth={2.6}>
    <path d="M5.5 9.5 12 16l6.5-6.5" />
  </Line>
);

export const IconFilter = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 5.4h18v2.2H3Z M6.5 10.9h11v2.2h-11Z M10 16.4h4v2.2h-4Z" />
  </Solid>
);

export const IconLogout = (p: IconProps) => (
  <Solid {...p}>
    <path d="M4 3.5a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1V8h-2.2V4.7H6.2v14.6h6.1V16h2.2v4.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
    <path d="M10 10.9h7.3l-2-2 1.5-1.5L21.3 12l-4.5 4.6-1.5-1.5 2-2H10Z" />
  </Solid>
);

export const IconMoon = (p: IconProps) => (
  <Solid {...p}>
    <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5 9 9 0 1 0 20.5 14.6Z" />
  </Solid>
);

export const IconSun = (p: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="4.4" fill="currentColor" />
    <path
      d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5"
      stroke="currentColor"
      strokeWidth={2.3}
      strokeLinecap="round"
    />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z M5 6h14v10.2l-3.8-3.8-3 3-4.3-4.3L5 14.2Z M15 7.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" />
  </Solid>
);

export const IconPhone = (p: IconProps) => (
  <Solid {...p}>
    <path d="M6.2 3.2 9 3.9a1.5 1.5 0 0 1 1.1 1.2l.5 2.5a1.5 1.5 0 0 1-.6 1.5l-1.3 1a11 11 0 0 0 5.2 5.2l1-1.3a1.5 1.5 0 0 1 1.5-.6l2.5.5a1.5 1.5 0 0 1 1.2 1.1l.7 2.8a1.5 1.5 0 0 1-1.5 1.9C10.2 20.2 3.8 13.8 3.8 4.7a1.5 1.5 0 0 1 1.9-1.5Z" />
  </Solid>
);

/** Printing an invoice. */
export const IconPrinter = (p: IconProps) => (
  <Solid {...p}>
    <path d="M7 2.5h10V7H7Z" />
    <path d="M3 9a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2v-3.5H6V18H4a1 1 0 0 1-1-1Z" />
    <path d="M7.5 15.5h9v6h-9Z M9.5 17.6h5v1.3h-5Z" />
  </Solid>
);

/** Stock-take: a clipboard with a tick — counting the shelves against the record. */
export const IconClipboard = (p: IconProps) => (
  <Solid {...p}>
    <path d="M5 4.5a1 1 0 0 1 1-1h2.2v1.3a1.2 1.2 0 0 0 1.2 1.2h5.2a1.2 1.2 0 0 0 1.2-1.2V3.5H18a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z M8.3 12.6l1.3-1.3 2 2 4.1-4.1 1.3 1.3-5.4 5.4Z M8.5 17.5h7v1.6h-7Z" />
    <path d="M9.4 1.8h5.2v2.8H9.4Z" />
  </Solid>
);

/** Campaigns: a megaphone — one message going out to many. */
export const IconMegaphone = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 9.5a1 1 0 0 1 1-1h3.5L18 3.8a.7.7 0 0 1 1 .6v15.2a.7.7 0 0 1-1 .6L7.5 15.5h-.7l1 4.3a.8.8 0 0 1-.8 1H5.6a.8.8 0 0 1-.8-.6l-1.1-4.7H4a1 1 0 0 1-1-1Z" />
    <path d="M20.4 9.5H22v5h-1.6Z" />
  </Solid>
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

/** Shop settings: a shopfront with its awning. */
export const IconStore = (p: IconProps) => (
  <Solid {...p}>
    <path d="M2.5 9 4.6 3.5h14.8L21.5 9v.4a2.6 2.6 0 0 1-4.7 1.5 2.6 2.6 0 0 1-4.8 0 2.6 2.6 0 0 1-4.8 0A2.6 2.6 0 0 1 2.5 9.4Z" />
    <path d="M4 12.7a4 4 0 0 0 3.2-.4 4 4 0 0 0 4.8.2 4 4 0 0 0 4.8-.2 4 4 0 0 0 3.2.4V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z M10 15.5h4V21h-4Z" />
  </Solid>
);

/** Shipments: a cargo crate on a pallet. */
export const IconShip = (p: IconProps) => (
  <Solid {...p}>
    <path d="M4 3h16a1 1 0 0 1 1 1v11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M5 8.9h6.2v1.4H5Z M12.8 8.9H19v1.4h-6.2Z M11.3 5h1.4v9.5h-1.4Z" />
    <path d="M2.5 18h19v1.5h-19Z M4 19.5h2.5V21H4Z M10.75 19.5h2.5V21h-2.5Z M17.5 19.5H20V21h-2.5Z" />
  </Solid>
);

/** A single customer, distinct from the team icon which shows two people. */
export const IconUserCircle = (p: IconProps) => (
  <Solid {...p}>
    <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Z M12 6a3.3 3.3 0 1 0 0 6.6A3.3 3.3 0 0 0 12 6Z M5.9 17.9a7 7 0 0 1 12.2 0 8 8 0 0 1-12.2 0Z" />
  </Solid>
);

/** Referral: one customer bringing in two. */
export const IconShare = (p: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M8.2 10.9 15.8 7M8.2 13.1l7.6 3.9" stroke="currentColor" strokeWidth={2.2} />
    <circle cx="6" cy="12" r="3.1" fill="currentColor" />
    <circle cx="18" cy="5.8" r="3.1" fill="currentColor" />
    <circle cx="18" cy="18.2" r="3.1" fill="currentColor" />
  </svg>
);

/** Waiting to be sent: a stack with a clock — work held on this device. */
export const IconQueue = (p: IconProps) => (
  <Solid {...p}>
    <path d="M3 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1.6H3Z" />
    <path d="M3 9.2h9.6a7 7 0 0 0-1.4 3.4H3Z" />
    <path d="M3 15.2h8.3a7 7 0 0 0 .8 3.4H4a1 1 0 0 1-1-1Z" />
    <path d="M17.5 9.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z M16.8 12h1.4v3l1.9 1.2-.7 1.2-2.6-1.6Z" />
  </Solid>
);

/** Syncing with the server: two arrows chasing each other. */
export const IconSync = (p: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path
      d="M19 10.5A7.2 7.2 0 0 0 6.3 7.4M5 13.5a7.2 7.2 0 0 0 12.7 3.1"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
    />
    <path d="M20.6 4.4v6.5h-6.5Z M3.4 19.6v-6.5h6.5Z" fill="currentColor" />
  </svg>
);

/* ---------- stock state (distinct shapes, not just colour) ---------- */

/** A size that is in stock: solid square with a tick. */
export const IconSizeIn = (p: IconProps) => (
  <Solid {...p}>
    <path d="M5.5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z M7.6 12.4l1.4-1.4 2.2 2.2 4.1-4.2 1.4 1.4-5.5 5.6Z" />
  </Solid>
);

/** A size that is sold out: dashed, empty square — reads differently even in greyscale. */
export const IconSizeOut = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeDasharray="3.2 2.6" aria-hidden="true" {...p}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
  </svg>
);

/** Low stock warning: triangle. Used only where an action is needed. */
export const IconAlert = (p: IconProps) => (
  <Solid {...p}>
    <path d="M12 2.8a1.4 1.4 0 0 1 1.2.7l8.4 14.8a1.4 1.4 0 0 1-1.2 2.1H3.6a1.4 1.4 0 0 1-1.2-2.1L10.8 3.5a1.4 1.4 0 0 1 1.2-.7Z M11 8.5h2v6h-2Z M12 15.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
  </Solid>
);

/** Stale stock: an hourglass with the sand run down. */
export const IconHourglass = (p: IconProps) => (
  <Solid {...p}>
    <path d="M5 2.5h14v2H5Z M5 19.5h14v2H5Z" />
    <path d="M6.5 4.5h11v2.2c0 2.3-3.4 3.8-3.4 5.3s3.4 3 3.4 5.3v2.2h-11v-2.2c0-2.3 3.4-3.8 3.4-5.3S6.5 9 6.5 6.7Z M8.6 6.5h6.8c-.3 1.1-2.2 2.2-3.4 3-1.2-.8-3.1-1.9-3.4-3Z" />
  </Solid>
);

/** Return / exchange: arrow turning back. */
export const IconReturn = (p: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M6 10.5h8.5a4.5 4.5 0 0 1 0 9H11" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    <path d="M9.5 5.2v10.6L3 10.5Z" fill="currentColor" />
  </svg>
);

/** Daily close: the cash register. */
export const IconCashRegister = (p: IconProps) => (
  <Solid {...p}>
    <path d="M6 2.5h12a1 1 0 0 1 1 1V8H5V3.5a1 1 0 0 1 1-1Z M7.5 4.4h9V6h-9Z" />
    <path d="M3 10a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6H3Z M6 11h2v1.6H6Z M9.5 11h2v1.6h-2Z M13 11h2v1.6h-2Z M6 13.5h2v1.6H6Z M9.5 13.5h2v1.6h-2Z M13 13.5h2v1.6h-2Z" />
    <path d="M3 17.3h18V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z M10 18.5h4v1.3h-4Z" />
  </Solid>
);

export const IconInstall = (p: IconProps) => (
  <Solid {...p}>
    <path d="M7 2h10a1.5 1.5 0 0 1 1.5 1.5v17A1.5 1.5 0 0 1 17 22H7a1.5 1.5 0 0 1-1.5-1.5v-17A1.5 1.5 0 0 1 7 2Z M11.1 5.5h1.8v5.3l1.9-1.9 1.3 1.3L12 14.3l-4.1-4.1 1.3-1.3 1.9 1.9Z M10.5 17.8h3v1.4h-3Z" />
  </Solid>
);

/** No connection: a cloud struck through. */
export const IconOffline = (p: IconProps) => (
  <Solid {...p}>
    <path d="M7 19a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 19Z M3.9 2.7l17.4 17.4-1.3 1.3L2.6 4Z" />
  </Solid>
);
