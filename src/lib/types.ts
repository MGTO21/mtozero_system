import type { Timestamp } from 'firebase/firestore';

/**
 * A product category id. The owner manages the list (storefront/categories);
 * 'shoes' and 'clothing' are the two the shop started with and always exist,
 * so every product and sale written before categories were editable still
 * resolves.
 */
export type Category = string;

/** How a category is sized — drives the size presets and the size guide. */
export type SizeKind = 'shoes' | 'clothing' | 'none';

export interface CategoryDef {
  /** Stable id stored on products; never changes once created. */
  id: string;
  name: string;
  sizeKind: SizeKind;
  /** Hidden from the website's menus (products still sell in the shop). */
  hidden: boolean;
}

export const BUILTIN_CATEGORIES: CategoryDef[] = [
  { id: 'shoes', name: 'أحذية', sizeKind: 'shoes', hidden: false },
  { id: 'clothing', name: 'ملابس', sizeKind: 'clothing', hidden: false },
];

export const SIZE_KIND_LABEL: Record<SizeKind, { title: string; hint: string }> = {
  shoes: { title: 'مقاسات أحذية', hint: 'أرقام زي 36 – 45' },
  clothing: { title: 'مقاسات ملابس', hint: 'S – XXL أو أرقام البناطلين' },
  none: { title: 'بدون مقاسات', hint: 'عطور، شنط، إكسسوارات — مقاس واحد' },
};
export type Role = 'owner' | 'employee';
export type PaymentStatus = 'paid' | 'debt' | 'partial';
export type Channel = 'whatsapp' | 'facebook' | 'in_person' | 'website' | 'other';

/**
 * One batch of a single size that arrived together.
 *
 * Lots live inside the product document on purpose: a sale then reads and writes
 * exactly one document, so stock deduction stays atomic and needs no extra reads
 * inside the transaction.
 */
export interface StockLot {
  /** null for stock added by hand without naming a shipment. */
  shipmentId: string | null;
  qty: number;
  /** What this particular batch cost per unit — shipments differ in price. */
  costPrice: number;
  /**
   * Arrival time in epoch millis. Plain number rather than Timestamp so lots can
   * be sorted for FIFO without leaving the document.
   */
  receivedAt: number;
}

/**
 * A size row inside a product. `qty` is the on-hand count and MUST always equal
 * the sum of `lots[].qty` — `reconcileSize` in db/products.ts is the only place
 * allowed to rebuild it.
 */
export interface SizeStock {
  size: string;
  qty: number;
  lots: StockLot[];
}

/**
 * What a form edits: just the size and how many. Lots are derived by the data
 * layer, never typed in by hand.
 */
export interface SizeInput {
  size: string;
  qty: number;
}

/** The lots a single sale consumed, kept so a return goes back where it came from. */
export interface ConsumedLot {
  shipmentId: string | null;
  qty: number;
  costPrice: number;
  /** Original arrival time, so a returned unit keeps its place in the FIFO queue. */
  receivedAt: number;
}

/** A delivery of goods. Several can be grouped while staying individually visible. */
export interface Shipment {
  id: string;
  code: string;
  name: string;
  supplier?: string;
  /** Freight, customs and handling — spread over the shipment, not per item. */
  extraCost: number;
  arrivedAt: Timestamp | null;
  note?: string;
  /** Set when this shipment was merged into a group for combined reporting. */
  groupId?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

/** A named bundle of shipments. Members keep their own identity inside it. */
export interface ShipmentGroup {
  id: string;
  name: string;
  note?: string;
  createdAt: Timestamp | null;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  brand?: string;
  costPrice: number;
  sellPrice: number;
  sizes: SizeStock[];
  /**
   * Small JPEG data URI (~30 KB) held in this document. It is what every screen
   * renders, and it keeps working with no connection.
   */
  thumbData?: string;
  /** Full-resolution copy on Cloudinary, when that integration is configured. */
  imageUrl?: string;
  imagePublicId?: string;
  sku?: string;
  supplier?: string;
  lowStockThreshold: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  isArchived: boolean;
  /** Set on every sale so the stale-stock report needs no cross-collection scan. */
  lastSoldAt?: Timestamp | null;
  /** Shown to customers on the product page of the online store. */
  description?: string;
  /** False hides the product from the online store; absent means shown. */
  onStore: boolean;
  /** Price before the discount, shown struck through on the store. 0/absent = no sale. */
  compareAtPrice?: number;
  /** Pinned to the store's "picks" section and shown first in its shelf. */
  featured?: boolean;
  /** Short custom label on the store tile ("حصري", "أصلي"). */
  storeBadge?: string;
  /**
   * Extra pictures for the store's product page. Only ids and hashes live here;
   * each picture is its own catalogThumbs/{productId}_g{id} document, so this
   * collection — kept live on every staff device — stays light.
   */
  gallery?: ProductPhoto[];
  /**
   * Hash of the sharp store copy of the main picture (catalogThumbs/{id}_hd).
   * thumbData stays small because every staff device keeps every product live;
   * the website shows this copy wherever the picture is large.
   */
  hdHash?: string;
}

export interface ProductPhoto {
  id: string;
  /** Changes with the picture, so cached copies refresh. */
  hash: string;
}

/** At most this many extra pictures per product. */
export const MAX_GALLERY = 5;

/* ---------- online store ---------- */

/**
 * How a size reads to a customer. Exact counts stay private — "last pieces"
 * creates urgency without telling competitors how deep the stock is.
 */
export type StoreSizeState = 'in' | 'last' | 'out';

/**
 * The public face of a product: catalog/{productId}. Never carries cost,
 * supplier, lots or quantities — it is readable by anyone.
 */
export interface CatalogItem {
  id: string;
  name: string;
  brand?: string;
  category: Category;
  price: number;
  sizes: { size: string; state: StoreSizeState }[];
  description?: string;
  /** Full-size Cloudinary picture when there is one; otherwise /img/{id} serves the thumbnail. */
  imageUrl: string | null;
  /** Changes whenever the thumbnail does, so cached images refresh. */
  thumbHash: string;
  /** Listed on the store: in stock, has a picture, not archived or hidden. */
  listed: boolean;
  createdAtMs: number;
  lastSoldAtMs: number;
  /** Struck-through price before the discount; 0 when the product is not on sale. */
  compareAtPrice: number;
  featured: boolean;
  badge: string;
  /** Extra pictures after the main one. */
  gallery: ProductPhoto[];
  /** Sharp copy of the main picture; empty for products photographed before it existed. */
  hdHash: string;
}

/** The two looks of the public website. */
export type StoreLook = 'light' | 'luxe';

/** A block of the store's home page, in the order the owner arranged them. */
export type HomeSectionType =
  | 'hero'
  | 'promise'
  | 'categories'
  | 'offers'
  | 'featured'
  | 'sale'
  | 'new'
  | 'mysize'
  | 'trending'
  | 'recent'
  | 'howto'
  | 'brands';

export interface HomeSection {
  type: HomeSectionType;
  enabled: boolean;
  /** Heading shown on the site; empty uses the default. */
  title: string;
}

export const HOME_SECTION_LABEL: Record<HomeSectionType, { title: string; hint: string }> = {
  hero: { title: 'البانر الرئيسي', hint: 'صور البانرات المتحركة — أو عنوان كبير لو ما في بانر' },
  promise: { title: 'شريط الضمانات', hint: 'الدفع عند الاستلام، التوصيل، الاستبدال' },
  categories: { title: 'الأقسام', hint: 'أحذية وملابس بصورة كبيرة' },
  offers: { title: 'أكواد الخصم', hint: 'الكوبونات المعلنة من صفحة العروض' },
  featured: { title: 'مختارات المحل', hint: 'المنتجات المعلّمة «مميز» في المخزون' },
  sale: { title: 'تخفيضات', hint: 'المنتجات اللي عندها سعر قبل الخصم' },
  new: { title: 'وصل جديد', hint: 'أحدث المنتجات' },
  mysize: { title: 'متوفر في مقاسك', hint: 'يظهر للزبون اللي حفظ مقاسو' },
  trending: { title: 'الناس بتطلب', hint: 'الأكثر مبيعاً مؤخراً' },
  recent: { title: 'شاهدتها مؤخراً', hint: 'آخر منتجات فتحها الزبون في جهازو' },
  howto: { title: 'كيف تطلب', hint: 'تلات خطوات للطلب' },
  brands: { title: 'الماركات', hint: 'شريط متحرك بأسماء الماركات المتوفرة — كل اسم بيفتح منتجاتها' },
};

export const DEFAULT_SECTIONS: HomeSection[] = (
  ['hero', 'promise', 'categories', 'brands', 'offers', 'featured', 'sale', 'new', 'mysize', 'trending', 'recent', 'howto'] as const
).map((type) => ({ type, enabled: true, title: '' }));

/** A home-page banner. Its picture lives in storefront/banner_{id}, served at /banner/{id}. */
export interface StoreBanner {
  id: string;
  title: string;
  subtitle: string;
  /** Button text; empty hides the button. */
  cta: string;
  /** Where the banner leads: a store path such as /shop?c=shoes. */
  href: string;
  /** Changes with the picture, so cached images refresh. Empty = no picture yet. */
  imageHash: string;
  /** Text colour over the picture. */
  tone: 'light' | 'dark';
}

/** Store-wide settings shown to customers: storefront/config. */
export interface StoreConfig {
  shopName: string;
  tagline: string;
  /** WhatsApp number orders are sent to, 249… form. */
  whatsapp: string;
  address: string;
  deliveryFee: number;
  /** Order subtotal from which delivery is free. 0 = never free. */
  freeDeliveryOver: number;
  pickupEnabled: boolean;
  heroTitle: string;
  heroSubtitle: string;
  about: string;
  returnPolicy: string;
  /** False pauses ordering (holidays, stock-take) while the site stays up. */
  acceptingOrders: boolean;
  /** The look visitors get first. */
  look: StoreLook;
  /** Lets visitors switch between the two looks. */
  lookToggle: boolean;
  /** Rotating messages in the top bar; empty shows the delivery rule. */
  announcements: string[];
  sections: HomeSection[];
  banners: StoreBanner[];
  /** Products added within this many days carry a "new" tag. 0 = never. */
  newDays: number;
  instagram: string;
  facebook: string;
  tiktok: string;
  /** Size guide lines shown on product pages, one row per line ("42 = 27 سم"). */
  sizeGuideShoes: string;
  sizeGuideClothing: string;
}

export const DEFAULT_STORE: StoreConfig = {
  shopName: 'MTOZERO',
  tagline: 'WEAR YOUR IDENTITY',
  whatsapp: '',
  address: 'الأبيض — شمال كردفان',
  deliveryFee: 3000,
  freeDeliveryOver: 100000,
  pickupEnabled: true,
  heroTitle: 'لبس يشبهك',
  heroSubtitle: 'أحذية وملابس أصلية بمقاسات كاملة — اطلب من تلفونك ونوصلك لحدي الباب، والدفع عند الاستلام.',
  about: 'MTOZERO متجر أحذية وملابس في الأبيض. نختار القطع بعناية ونوصلها لحدي بابك.',
  returnPolicy: 'الاستبدال خلال 3 أيام بالفاتورة، والقطعة بحالتها الأصلية.',
  acceptingOrders: true,
  look: 'light',
  lookToggle: true,
  announcements: [],
  sections: DEFAULT_SECTIONS,
  banners: [],
  newDays: 14,
  instagram: '',
  facebook: '',
  tiktok: '',
  sizeGuideShoes: [
    '39 = 25 سم',
    '40 = 25.5 سم',
    '41 = 26 سم',
    '42 = 27 سم',
    '43 = 27.5 سم',
    '44 = 28.5 سم',
    '45 = 29 سم',
  ].join('\n'),
  sizeGuideClothing: [
    'S = صدر 88–94 سم',
    'M = صدر 94–100 سم',
    'L = صدر 100–106 سم',
    'XL = صدر 106–112 سم',
    'XXL = صدر 112–118 سم',
  ].join('\n'),
};

/** A visitor asked to be told when a sold-out size is back: restockRequests/{id}. */
export interface RestockRequest {
  id: string;
  productId: string;
  productName: string;
  size: string;
  name: string;
  phone: string;
  status: 'open' | 'notified';
  createdAt: Timestamp | null;
  notifiedAt?: Timestamp | null;
  notifiedByName?: string;
}

export type OrderStatus = 'new' | 'confirmed' | 'out' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: string;
  name: string;
  size: string;
  qty: number;
  /** Price the customer saw when ordering. */
  price: number;
}

/** An order placed on the online store: orders/{id}. */
export interface StoreOrder {
  id: string;
  number: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  promoCode: string;
  fulfilment: 'delivery' | 'pickup';
  customer: { name: string; phone: string; area: string; address: string; notes: string };
  createdAt: Timestamp | null;
  /** When the status last changed, and by whom. */
  statusAt: Timestamp | null;
  handledByName?: string;
  /** The sale recorded when the order was delivered. */
  saleId?: string;
  cancelReason?: string;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'جديد',
  confirmed: 'مؤكَّد',
  out: 'في الطريق',
  delivered: 'اتسلّم',
  cancelled: 'ملغي',
};

/**
 * One line on an invoice: a product in a size, at the price actually charged.
 *
 * Returns are tracked per line, not per invoice, because a customer who brings
 * back one of three shoes must not invalidate the rest of the ticket.
 */
export interface SaleItem {
  productId: string;
  productName: string; // snapshot at sale time
  size: string;
  qty: number;
  sellPrice: number; // actual unit price charged (may differ from product default)
  /**
   * The product's list price at the moment of sale, so the invoice can show the
   * customer what they saved. Equals `sellPrice` on sales recorded before this.
   */
  listPrice: number;
  /** Weighted average unit cost of the lots consumed — for display only. */
  costPrice: number;
  /** Exact: sellPrice*qty minus the real cost of each lot taken. */
  profit: number;
  /** Which batches this line drew from, newest-arriving last. */
  lots: ConsumedLot[];
  /** Units of this line given back; the line keeps qty - returnedQty. */
  returnedQty: number;
}

/**
 * One invoice. A single sale can carry several products and sizes — a customer
 * buying two shoes and a shirt is one ticket, one payment and one debt entry,
 * not three.
 */
export interface Sale {
  id: string;
  items: SaleItem[];
  /** Sum of line profits minus referral credit, kept denormalized for reports. */
  profit: number;
  customerName?: string;
  customerPhone?: string;
  /** Link to the customers collection, set whenever a phone number was given. */
  customerId?: string | null;
  /** Customer wallet credit (referral rewards and gifts) spent on this sale. */
  creditUsed: number;
  /** Discount code applied, if any. */
  promoCode?: string;
  /** What the code took off this invoice, fixed at the moment of sale. */
  promoDiscount: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  soldBy: string;
  soldByName: string;
  channel: Channel;
  note?: string;
  createdAt: Timestamp | null;
  /**
   * Set only on device-side copies of a sale still in the offline queue:
   * 'pending' is waiting for a connection, 'conflict' was refused by the server
   * and needs someone to decide. Never stored in Firestore.
   */
  pending?: SyncState;
}

/** Where a queued operation stands. See lib/offline/outbox.ts. */
export type SyncState = 'pending' | 'conflict';

/**
 * percent — a share off the invoice (Eid: 15% off)
 * fixed   — a flat amount off (5,000 ج off any purchase over 30,000)
 * gift    — a stored-value voucher: the code carries a balance that is spent
 *           down across as many purchases as it takes
 */
export type PromoKind = 'percent' | 'fixed' | 'gift';

/**
 * A discount code, offer or gift voucher. The document id IS the code, so a
 * sale reads it by key inside its transaction and two codes can never collide.
 */
export interface Promo {
  code: string;
  name: string;
  kind: PromoKind;
  /** Percent (1–100) for 'percent'; an amount for 'fixed' and the original value for 'gift'. */
  value: number;
  /** Remaining value of a gift voucher. Unused for the other kinds. */
  balance: number;
  /** Invoice total (before the code) the code needs. 0 = none. */
  minTotal: number;
  /** Most a percent code may take off one invoice. 0 = no cap. */
  maxDiscount: number;
  /** Total redemptions allowed. 0 = unlimited. */
  maxUses: number;
  uses: number;
  /** One use per customer phone. */
  oncePerCustomer: boolean;
  /** Phones that already used it, for `oncePerCustomer`. */
  usedBy: string[];
  expiresAt: Timestamp | null;
  active: boolean;
  /** Listed on every customer's card page as a current offer. */
  public: boolean;
  note?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

/**
 * What a customer may see about themselves without signing in. Kept apart from
 * the customer record on purpose: first name only, no phone, no spend history,
 * no debts. Document id is the normalized phone.
 */
export interface CustomerCard {
  firstName: string;
  code: string;
  balance: number;
  earned: number;
  referrals: number;
  updatedAt: Timestamp | null;
}

/** Credit added to a customer's wallet by hand — a gift, an apology, a prize. */
export interface CreditGrant {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  reason: string;
  grantedBy: string;
  grantedByName: string;
  createdAt: Timestamp | null;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: Timestamp | null;
  addedBy: string;
  addedByName: string;
}

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  /** Owner can grant an employee read access to profit figures. */
  canSeeProfit: boolean;
  isActive: boolean;
  createdAt: Timestamp | null;
}

export type ActivityAction =
  | 'sold_product'
  | 'added_product'
  | 'edited_product'
  | 'archived_product'
  | 'restored_product'
  | 'recorded_payment'
  | 'returned_item'
  | 'added_expense'
  | 'deleted_expense'
  | 'added_user'
  | 'edited_user'
  | 'added_shipment'
  | 'received_stock'
  | 'grouped_shipments'
  | 'awarded_referral'
  | 'sent_campaign'
  | 'stock_count'
  | 'stock_adjusted'
  | 'edited_settings'
  | 'sync_conflict'
  | 'sync_discarded'
  | 'saved_promo'
  | 'granted_credit'
  | 'store_order';

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  details: string;
  timestamp: Timestamp | null;
}

/** Partial or full repayment against a sale recorded as debt. */
export interface DebtPayment {
  id: string;
  saleId: string;
  customerName: string;
  amount: number;
  receivedBy: string;
  receivedByName: string;
  createdAt: Timestamp | null;
  /** Device-side only — see `Sale.pending`. */
  pending?: SyncState;
}

/**
 * A person who bought at least once. Created automatically from the phone number
 * entered during a sale, so the marketing list builds itself with no extra work.
 */
export interface Customer {
  id: string;
  name: string;
  /** Normalized to 249XXXXXXXXX so the same person is never stored twice. */
  phone: string;
  note?: string;
  totalSpent: number;
  totalOrders: number;
  lastPurchaseAt: Timestamp | null;
  /** Short code this customer gives to friends. */
  referralCode: string;
  /** The customer whose code brought this one in. */
  referredBy?: string | null;
  referredByName?: string | null;
  /** Earned referral credit still available as a discount. */
  creditBalance: number;
  /** Lifetime credit earned, kept for reporting after credit is spent. */
  creditEarned: number;
  referralCount: number;
  createdAt: Timestamp | null;
}

/** One successful referral: recorded when the referred customer actually buys. */
export interface Referral {
  id: string;
  referrerId: string;
  referrerName: string;
  referredId: string;
  referredName: string;
  saleId: string;
  reward: number;
  createdAt: Timestamp | null;
}

/** One counted size during a stock-take. */
export interface StockCountLine {
  productId: string;
  productName: string;
  size: string;
  /** What the system believed was on the shelf. */
  systemQty: number;
  /** What was actually there. */
  countedQty: number;
  /** Average unit cost at count time, used to value the difference. */
  costPrice: number;
}

/**
 * A physical count and the corrections it produced.
 *
 * Stock always drifts from the system — an unrecorded sale, a miscount on
 * receiving, a damaged piece, a theft. Without a count the valuation slowly
 * becomes fiction, so every count is kept as a permanent record of what was
 * found and what it was worth.
 */
export interface StockCount {
  id: string;
  note?: string;
  lines: StockCountLine[];
  /** Value of what was missing, at cost. */
  shortageValue: number;
  /** Value of what turned up unexpectedly, at cost. */
  surplusValue: number;
  countedBy: string;
  countedByName: string;
  createdAt: Timestamp | null;
}

/**
 * A marketing blast that was actually sent. Recorded so the owner can see who
 * has already heard this, and avoid messaging the same person twice in a week.
 */
export interface Campaign {
  id: string;
  title: string;
  message: string;
  segment: string;
  /** Customer ids the owner marked as sent while working through the queue. */
  sentTo: string[];
  recipientCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

/** Shop identity used on invoices. Single document at settings/shop. */
export interface ShopSettings {
  shopName: string;
  tagline: string;
  phone: string;
  address: string;
  /** Compressed logo data URI, drawn onto generated invoices. */
  logoData: string | null;
  invoiceFooter: string;
  /** Printed on every invoice; a clear policy settles return arguments before they start. */
  returnPolicy: string;
  /** Credit granted to the referrer per successful referral. */
  referralReward: number;
  updatedAt: Timestamp | null;
}

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'MTOZERO',
  tagline: 'WEAR YOUR IDENTITY',
  phone: '',
  address: 'الأبيض — شمال كردفان',
  logoData: null,
  invoiceFooter: 'شكراً لثقتك بينا',
  returnPolicy: 'الاستبدال خلال 3 أيام بالفاتورة، والقطعة بحالتها الأصلية.',
  referralReward: 1000,
  updatedAt: null,
};

export interface SaleReturn {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  size: string;
  qty: number;
  /** Value of the returned pieces at the price they were sold for. */
  refundAmount: number;
  /**
   * Cash actually handed back, which is only the part the customer had already
   * paid — returning goods still owed for cancels debt instead of moving money.
   * The daily close subtracts this; `refundAmount` would overstate the drawer.
   * Zero on returns recorded before this was tracked.
   */
  cashRefunded: number;
  reason: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
  /** Device-side only — see `Sale.pending`. */
  pending?: SyncState;
}

/**
 * Names of the two built-in categories, for code that has no category list at
 * hand. Anything else should resolve names through `categoryName`.
 */
export const CATEGORY_LABEL: Record<string, string> = {
  shoes: 'أحذية',
  clothing: 'ملابس',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'واتساب',
  facebook: 'فيسبوك',
  in_person: 'في المحل',
  website: 'الموقع',
  other: 'أخرى',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  paid: 'مدفوع',
  partial: 'مدفوع جزئياً',
  debt: 'دين',
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'المالك',
  employee: 'موظف',
};

export const ACTION_LABEL: Record<ActivityAction, string> = {
  sold_product: 'بيع منتج',
  added_product: 'إضافة منتج',
  edited_product: 'تعديل منتج',
  archived_product: 'أرشفة منتج',
  restored_product: 'استرجاع منتج',
  recorded_payment: 'تسجيل تسديد دين',
  returned_item: 'إرجاع قطعة',
  added_expense: 'إضافة مصروف',
  deleted_expense: 'حذف مصروف',
  added_user: 'إضافة مستخدم',
  edited_user: 'تعديل مستخدم',
  added_shipment: 'إضافة شحنة',
  received_stock: 'استلام بضاعة',
  grouped_shipments: 'دمج شحنات',
  awarded_referral: 'مكافأة إحالة',
  sent_campaign: 'حملة تسويقية',
  stock_count: 'جرد مخزون',
  stock_adjusted: 'تعديل كمية يدوي',
  edited_settings: 'تعديل إعدادات المتجر',
  sync_conflict: 'عملية معلّقة تحتاج مراجعة',
  sync_discarded: 'إلغاء عملية معلّقة',
  saved_promo: 'كوبون أو عرض',
  granted_credit: 'هدية رصيد لعميل',
  store_order: 'طلب من الموقع',
};

export const PROMO_KIND_LABEL: Record<PromoKind, string> = {
  percent: 'خصم بنسبة',
  fixed: 'خصم بمبلغ',
  gift: 'قسيمة هدية',
};

export const EXPENSE_CATEGORIES = [
  'إيجار',
  'نقل بضاعة',
  'تغليف',
  'كهرباء وماء',
  'رواتب',
  'إعلانات',
  'أخرى',
] as const;
