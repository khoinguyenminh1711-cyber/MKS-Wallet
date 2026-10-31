export type AssetKey = string;
export type DebtKey = string;
export type RuleCategory = 'needs_50' | 'wants_30' | 'savings_debt_20';

export interface WalletMeta {
  key: string;
  name: string;
  shortName: string;
  bankCode: string;
  isCustom?: boolean;
}

export interface DebtMeta {
  key: string;
  name: string;
  shortName: string;
  provider: string;
  isCustom?: boolean;
}

export const DEFAULT_ASSET_WALLETS: WalletMeta[] = [
  { key: 'cash', name: 'Tiền mặt', shortName: 'Tiền mặt', bankCode: 'CASH' },
  { key: 'bank', name: 'Tài khoản Ngân hàng', shortName: 'Ngân hàng', bankCode: 'BANK' },
  { key: 'savings', name: 'Tiết kiệm', shortName: 'Tiết kiệm', bankCode: 'SAVINGS' },
  { key: 'savings_emergency', name: 'Quỹ khẩn cấp', shortName: 'Khẩn cấp', bankCode: 'SAVINGS' },
];

export const ASSET_WALLETS: WalletMeta[] = DEFAULT_ASSET_WALLETS;

export const DEFAULT_DEBT_ACCOUNTS: DebtMeta[] = [
  { key: 'creditCard', name: 'Thẻ tín dụng', shortName: 'Tín dụng', provider: 'Credit Card' },
];

export const DEBT_ACCOUNTS: DebtMeta[] = DEFAULT_DEBT_ACCOUNTS;

export interface FixedPresetItem {
  id: string;
  type: 'inflow' | 'outflow' | 'savings';
  title: string;
  amount: number | string;
  /** Dành cho Inflow: nguồn tiền nhận mặc định */
  targetWallet?: AssetKey;
  /** Dành cho Outflow: phân loại mặc định (theo mục điều chỉnh tỷ lệ) */
  category?: RuleCategory;
  categoryLabel?: string;
  subCategory?: string;
  /** Dành cho Savings: nguồn trích và nguồn nhận tiết kiệm mặc định */
  fromWallet?: AssetKey;
  toWallet?: AssetKey;
}

export const DEFAULT_FIXED_PRESETS: FixedPresetItem[] = [];

export interface InitialBalanceVoucher {
  creditCard?: number | string;
  shopeePayLater?: number | string;
  updatedAt: string;
  note?: string;
  cash?: number | string;
  bank?: number | string;
  savings?: number | string;
  [key: string]: any;
}

export interface IncomeVoucher {
  id: string;
  sheetId: string;
  presetId?: string;
  title: string;
  amount: number;
  targetWallet: AssetKey;
  date: string;
  note?: string;
}

export interface ExpenseVoucher {
  id: string;
  sheetId: string;
  presetId?: string;
  title: string;
  amount: number;
  category: RuleCategory;
  subCategory: string;
  sourceWallet?: AssetKey;
  debtTarget?: DebtKey | 'savings_fund';
  debtAction?: 'spend' | 'pay';
  date: string;
  note?: string;
}

export interface SavingsVoucher {
  id: string;
  sheetId: string;
  title: string;
  amount: number;
  fromWallet: AssetKey;
  toWallet: AssetKey;
  date: string;
  note?: string;
}

export interface MonthlySheet {
  id: string; // e.g., "2026-10"
  month: number; // 1 - 12
  year: number;
  label: string; // e.g., "Tháng 10/2026"
  createdAt: string;
  rolledOverFrom?: string;
  initialBalances: InitialBalanceVoucher;
  incomeVouchers?: IncomeVoucher[];
  vouchers: ExpenseVoucher[];
  savingsVouchers?: SavingsVoucher[];
}

export const RULE_50_30_20_META: Record<
  RuleCategory,
  {
    code: RuleCategory;
    label: string;
    shortLabel: string;
    targetPercent: number;
    description: string;
    colorHex: string;
    subCategories: string[];
  }
> = {
  needs_50: {
    code: 'needs_50',
    label: '50% · Nhu cầu thiết yếu',
    shortLabel: 'Thiết yếu (50%)',
    targetPercent: 50,
    description: 'Ăn uống, hóa đơn, nhà cửa, gửi tiền gia đình, trả nợ thẻ tín dụng / SPayLater thiết yếu',
    colorHex: '#14b8a6', // teal-500
    subCategories: [
      'Ăn uống hàng ngày',
      'Tiền nhà & Điện nước',
      'Gửi tiền gia đình',
      'Xăng xe & Di chuyển',
      'Trả nợ Thẻ tín dụng (Thiết yếu)',
      'Tất toán Shopee Pay Later (Thiết yếu)',
      'Hóa đơn Internet/Điện thoại',
      'Nhu yếu phẩm',
    ],
  },
  wants_30: {
    code: 'wants_30',
    label: '30% · Nhu cầu cá nhân',
    shortLabel: 'Cá nhân (30%)',
    targetPercent: 30,
    description: 'Giải trí, mua sắm, cà phê, YouTube Premium, trả nợ thẻ tín dụng / SPayLater cá nhân',
    colorHex: '#0ea5e9', // sky-500
    subCategories: [
      'Cà phê & Gặp gỡ',
      'Mua sắm quần áo/Đồ công nghệ',
      'Giải trí & Xem phim',
      'Trả nợ Thẻ tín dụng (Cá nhân)',
      'Tất toán Shopee Pay Later (Cá nhân)',
      'Du lịch & Thể thao',
      'Sở thích cá nhân',
    ],
  },
  savings_debt_20: {
    code: 'savings_debt_20',
    label: '20% · Tiết kiệm',
    shortLabel: 'Tiết kiệm (20%)',
    targetPercent: 20,
    description: 'Dành riêng cho gửi tiết kiệm, tích lũy tài sản và quỹ dự phòng khẩn cấp',
    colorHex: '#6366f1', // indigo-500
    subCategories: [
      'Gửi tiết kiệm tích lũy',
      'Quỹ dự phòng khẩn cấp',
      'Đầu tư dài hạn',
      'Tiết kiệm mục tiêu cá nhân',
    ],
  },
};

export interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  category: 'savings' | 'debt_payoff' | 'emergency_fund' | 'purchase';
  linkedWalletKey?: AssetKey;
  linkedDebtKey?: DebtKey;
  notes?: string;
  createdAt: string;
}

export interface ReceiptScanResult {
  title: string;
  amount: number;
  date: string;
  voucherType: 'expense' | 'income';
  category?: RuleCategory;
  subCategory?: string;
  suggestedWallet?: string;
  bankName?: string;
  bankCode?: string;
  debtTarget?: DebtKey;
  debtAction?: 'spend' | 'pay';
  confidence?: number;
  merchantName?: string;
  notes?: string;
}

export type BottomNavItemKey =
  | 'dashboard'
  | 'initial_voucher'
  | 'scan'
  | 'fixed_presets'
  | 'expense_vouchers'
  | 'financial_goals';

export const DEFAULT_BOTTOM_NAV_ITEMS: BottomNavItemKey[] = [
  'dashboard',
  'initial_voucher',
  'scan',
  'fixed_presets',
  'expense_vouchers',
];

export const BOTTOM_NAV_ITEM_CONFIG: Record<
  BottomNavItemKey,
  { label: string; shortLabel: string; description: string }
> = {
  dashboard: {
    label: 'Tổng quan',
    shortLabel: 'Tổng quan',
    description: 'Biểu đồ dòng tiền & tài sản hiện có',
  },
  initial_voucher: {
    label: 'Phiếu Đầu',
    shortLabel: 'Phiếu Đầu',
    description: 'Số dư đầu kỳ ví tiền, ngân hàng & công nợ',
  },
  scan: {
    label: 'Scan',
    shortLabel: 'Scan',
    description: 'Scan hóa đơn & biên lai tạo phiếu tự động',
  },
  fixed_presets: {
    label: 'Cố định',
    shortLabel: 'Cố định',
    description: 'Mẫu chi tiêu, thu nhập & tiết kiệm định kỳ',
  },
  expense_vouchers: {
    label: 'Sổ phiếu',
    shortLabel: 'Sổ phiếu',
    description: 'Danh sách chi tiết các phiếu giao dịch',
  },
  financial_goals: {
    label: 'Mục tiêu tài chính',
    shortLabel: 'Mục tiêu',
    description: 'Kế hoạch tiết kiệm & trả nợ',
  },
};

