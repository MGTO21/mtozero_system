import type { Timestamp } from 'firebase/firestore';

export type Category = 'shoes' | 'clothing';
export type Role = 'owner' | 'employee';
export type PaymentStatus = 'paid' | 'debt' | 'partial';
export type Channel = 'whatsapp' | 'facebook' | 'in_person' | 'other';

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
}

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
  /** Referral credit spent on this sale; reduces what the customer owes. */
  creditUsed: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  soldBy: string;
  soldByName: string;
  channel: Channel;
  note?: string;
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
  | 'edited_settings';

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
  invoiceFooter: 'شكراً لثقتك بينا 🤍',
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
  refundAmount: number;
  reason: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  shoes: 'أحذية',
  clothing: 'ملابس',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'واتساب',
  facebook: 'فيسبوك',
  in_person: 'في المحل',
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
  edited_settings: 'تعديل إعدادات المتجر',
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
