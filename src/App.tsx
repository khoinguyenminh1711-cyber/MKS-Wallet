import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  BookmarkCheck,
  Calendar,
  CalendarPlus,
  Camera,
  Scan,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  FilePlus2,
  FileSpreadsheet,
  GripVertical,
  Key,
  Landmark,
  LayoutGrid,
  Menu,
  Moon,
  MoreVertical,
  Pencil,
  PieChart as PieChartIcon,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  User as UserIcon,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import {
  ASSET_WALLETS,
  AssetKey,
  DEBT_ACCOUNTS,
  DebtKey,
  DebtMeta,
  DEFAULT_ASSET_WALLETS,
  DEFAULT_DEBT_ACCOUNTS,
  DEFAULT_FIXED_PRESETS,
  ExpenseVoucher,
  FinancialGoal,
  FixedPresetItem,
  IncomeVoucher,
  InitialBalanceVoucher,
  MonthlySheet,
  RULE_50_30_20_META,
  RuleCategory,
  SavingsVoucher,
  WalletMeta,
  BottomNavItemKey,
  DEFAULT_BOTTOM_NAV_ITEMS,
  BOTTOM_NAV_ITEM_CONFIG,
} from './types/finance';
import { DEFAULT_MONTHLY_SHEETS } from './data/defaultSheets';
import { PieChart503020 } from './components/PieChart503020';
import {
  googleSignIn,
  logout,
  initAuth,
  AppGoogleUser,
  getSavedAuthSession,
  clearAuthSession,
  clearAuthTokenOnly,
  isTokenExpired,
  markTokenExpired,
  isGoogleOAuthToken,
  isGoogleOAuthTokenExpired,
  getAccessToken,
  GOOGLE_AUTH_TOKEN_KEY,
  GOOGLE_AUTH_EXPIRES_AT_KEY,
  GOOGLE_AUTH_USER_KEY,
  CUSTOM_CLIENT_ID_KEY,
} from './services/googleAuth';
import {
  findOrCreateSpreadsheet,
  appendExpenseToGoogleSheet,
  appendIncomeToGoogleSheet,
  appendSavingsToGoogleSheet,
  bulkSyncSheet,
  syncAllDataToGoogleSheet,
  fetchDataFromGoogleSheet,
  GoogleSpreadsheetInfo,
  FullSyncPayload,
  ExpenseRowPayload,
  IncomeRowPayload,
  SavingsRowPayload,
  PresetRowPayload,
  ProportionRowPayload,
  InitialAccountRowPayload,
  parseSheetNumber,
} from './services/googleSheets';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ProfileModal } from './components/ProfileModal';
import { OAuthSettingsModal } from './components/OAuthSettingsModal';
import {
  SegmentedProportionBar,
  ProportionSegment,
  DEFAULT_SEGMENTS,
  COLOR_PALETTE,
} from './components/SegmentedProportionBar';
import { GeminiChatbot, FinancialContext, VoucherAction } from './components/GeminiChatbot';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import { FinancialGoalsView } from './components/FinancialGoalsView';
import { NavSettingsModal } from './components/NavSettingsModal';

const ONBOARDING_STORAGE_KEY = 'mks_wallet_onboarding_v3';
const STORAGE_KEY = 'mks_wallet_sheets_clean_v5';
const PRESETS_STORAGE_KEY = 'mks_wallet_presets_clean_v5';
const PROPORTIONS_STORAGE_KEY = 'mks_wallet_segmented_proportions_v1';
const WALLETS_STORAGE_KEY = 'mks_wallet_wallets_v3';
const DEBTS_STORAGE_KEY = 'mks_wallet_debts_v3';
const GOALS_STORAGE_KEY = 'mks_wallet_financial_goals_v1';
const THEME_STORAGE_KEY = 'mks_wallet_theme_v1';
const BOTTOM_NAV_STORAGE_KEY = 'mks_wallet_bottom_nav_order_v1';

export type ActiveSection =
  | 'dashboard'
  | 'initial_voucher'
  | 'expense_vouchers'
  | 'fixed_presets'
  | 'financial_goals';
type LedgerFilter = 'all' | 'income_plus' | 'savings_transfer' | RuleCategory;

export function normalizePresetTitle(title: string): string {
  return (title || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, ' ')
    .trim();
}

export function deduplicatePresets(items: FixedPresetItem[]): FixedPresetItem[] {
  const dedupMap = new Map<string, FixedPresetItem>();
  (items || []).forEach((p) => {
    if (!p || !p.title) return;
    const normTitle = normalizePresetTitle(p.title);
    if (!normTitle) return;
    const key = `${p.type}_${normTitle}`;
    const rawAmt = p.amount !== undefined && p.amount !== null ? String(p.amount) : '0';
    const numAmt = typeof p.amount === 'number' ? (isNaN(p.amount) ? 0 : p.amount) : parseSheetNumber(rawAmt) || 0;

    if (!dedupMap.has(key)) {
      dedupMap.set(key, {
        ...p,
        title: p.title.normalize('NFC').trim(),
        amount: numAmt,
      });
    } else {
      const existing = dedupMap.get(key)!;
      const existAmt = typeof existing.amount === 'number' ? existing.amount : parseSheetNumber(existing.amount) || 0;
      if (numAmt > 0 && existAmt === 0) {
        dedupMap.set(key, {
          ...p,
          title: p.title.normalize('NFC').trim(),
          amount: numAmt,
        });
      }
    }
  });
  return Array.from(dedupMap.values());
}

export function removeTwinDuplicateVouchers<T extends { id: string; title: string; amount: number; date: string; category?: string }>(list: T[]): T[] {
  if (!Array.isArray(list)) return [];
  const result: T[] = [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const item of list) {
    if (!item) continue;
    if (seenIds.has(item.id)) continue;

    const normTitle = (item.title || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\s\u00A0]+/g, ' ')
      .trim();
    const roundedAmt = Math.round(Number(item.amount) || 0);
    const dateStr = (item.date || '').trim();
    const cat = (item.category || '').trim();
    const fp = `${dateStr}|${normTitle}|${roundedAmt}|${cat}`;

    if (seenFingerprints.has(fp)) {
      continue;
    }

    seenIds.add(item.id);
    seenFingerprints.add(fp);
    result.push(item);
  }
  return result;
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved !== null) {
        return saved === 'dark';
      }
    } catch {
      // ignore
    }
    return true;
  });
  const [sheets, setSheets] = useState<MonthlySheet[]>(() => {
    try {
      const auth = getSavedAuthSession();
      // Restore previous sheets if user has a saved Google account
      if (auth.user) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((s: MonthlySheet) => ({
              ...s,
              vouchers: removeTwinDuplicateVouchers(s.vouchers || []),
              incomeVouchers: removeTwinDuplicateVouchers(s.incomeVouchers || []),
              savingsVouchers: removeTwinDuplicateVouchers(s.savingsVouchers || []),
            }));
          }
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_MONTHLY_SHEETS;
  });

  const [fixedPresets, setFixedPresets] = useState<FixedPresetItem[]>(() => {
    try {
      const auth = getSavedAuthSession();
      // Only restore presets if user has an active authenticated session
      if (auth.user) {
        const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = deduplicatePresets(parsed);
            try {
              localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(cleaned));
            } catch {
              // ignore
            }
            return cleaned;
          }
        }
      }
    } catch {
      // ignore
    }
    // Guest starts with completely empty presets
    return [];
  });

  const isSavingsWallet = (w: WalletMeta) =>
    w.key === 'savings' ||
    w.bankCode === 'SAVINGS' ||
    w.name.toLowerCase().includes('tiết kiệm') ||
    w.key.startsWith('savings_');

  const [wallets, setWallets] = useState<WalletMeta[]>(() => {
    try {
      const auth = getSavedAuthSession();
      // Load user's wallets if account is authenticated
      if (auth.user) {
        const saved = localStorage.getItem(WALLETS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            let updated = [...parsed];
            const savingsItems = updated.filter(isSavingsWallet);
            if (savingsItems.length === 0) {
              updated.push(
                { key: 'savings', name: 'Tiết kiệm', shortName: 'Tiết kiệm', bankCode: 'SAVINGS' },
                { key: 'savings_emergency', name: 'Quỹ khẩn cấp', shortName: 'Khẩn cấp', bankCode: 'SAVINGS', isCustom: true }
              );
            } else if (savingsItems.length === 1) {
              updated.push({
                key: 'savings_emergency',
                name: 'Quỹ khẩn cấp',
                shortName: 'Khẩn cấp',
                bankCode: 'SAVINGS',
                isCustom: true,
              });
            }
            return updated;
          }
        }
        return DEFAULT_ASSET_WALLETS;
      }
    } catch {
      // ignore
    }
    // Guest starts with completely empty wallets list
    return [];
  });

  const [debts, setDebts] = useState<DebtMeta[]>(() => {
    try {
      const auth = getSavedAuthSession();
      // Load user's debts if account is authenticated
      if (auth.user) {
        const saved = localStorage.getItem(DEBTS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
        return DEFAULT_DEBT_ACCOUNTS;
      }
    } catch {
      // ignore
    }
    // Guest starts with completely empty debts list
    return [];
  });

  const [proportions, setProportions] = useState<ProportionSegment[]>(() => {
    try {
      const auth = getSavedAuthSession();
      // Only load custom saved proportions if user is already authenticated
      if (auth.user) {
        const userKey = `mks_wallet_proportions_${auth.user.uid}`;
        const saved = localStorage.getItem(userKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
        }
      }
    } catch {
      // ignore
    }
    // Guest mode or brand new accounts: strictly default to 50 30 20
    return DEFAULT_SEGMENTS;
  });

  // Debt Management Modals State
  const [isAddDebtModalOpen, setIsAddDebtModalOpen] = useState<boolean>(false);
  const [newDebtName, setNewDebtName] = useState<string>('');
  const [newDebtShortName, setNewDebtShortName] = useState<string>('');
  const [newDebtInitialAmount, setNewDebtInitialAmount] = useState<string>('');

  const [editingDebt, setEditingDebt] = useState<DebtMeta | null>(null);
  const [editDebtName, setEditDebtName] = useState<string>('');
  const [editDebtShortName, setEditDebtShortName] = useState<string>('');

  const [debtToDelete, setDebtToDelete] = useState<DebtMeta | null>(null);

  // Wallet Management Modals State
  const [isAddFixedPresetModalOpen, setIsAddFixedPresetModalOpen] = useState<boolean>(false);
  const [isAddWalletModalOpen, setIsAddWalletModalOpen] = useState<boolean>(false);
  const [newWalletName, setNewWalletName] = useState<string>('');
  const [newWalletBankCode, setNewWalletBankCode] = useState<string>('');
  const [newWalletInitialAmount, setNewWalletInitialAmount] = useState<string>('');

  const [editingWallet, setEditingWallet] = useState<WalletMeta | null>(null);
  const [editWalletName, setEditWalletName] = useState<string>('');
  const [editWalletBankCode, setEditWalletBankCode] = useState<string>('');

  const [walletToDelete, setWalletToDelete] = useState<WalletMeta | null>(null);

  // Savings Management Modals State
  const [isAddSavingsModalOpen, setIsAddSavingsModalOpen] = useState<boolean>(false);
  const [newSavingsName, setNewSavingsName] = useState<string>('');

  const [activeSheetId, setActiveSheetId] = useState<string>(() => {
    return DEFAULT_MONTHLY_SHEETS[DEFAULT_MONTHLY_SHEETS.length - 1].id;
  });

  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');
  const [isVoucherSearchOpen, setIsVoucherSearchOpen] = useState<boolean>(false);
  const [isFixedPresetsSectionOpen, setIsFixedPresetsSectionOpen] = useState<boolean>(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState<boolean>(false);
  const [isNavSettingsModalOpen, setIsNavSettingsModalOpen] = useState<boolean>(false);
  const [bottomNavOrder, setBottomNavOrder] = useState<BottomNavItemKey[]>(() => {
    try {
      const saved = localStorage.getItem(BOTTOM_NAV_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) {
          const sanitized = parsed.filter(
            (k: any) => k !== 'financial_analytics' && DEFAULT_BOTTOM_NAV_ITEMS.includes(k)
          );
          if (sanitized.length === 5) {
            return sanitized as BottomNavItemKey[];
          }
        }
      }
    } catch {}
    return [...DEFAULT_BOTTOM_NAV_ITEMS];
  });

  // Modals state
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState<boolean>(false);
  const [isInflowPresetsExpanded, setIsInflowPresetsExpanded] = useState<boolean>(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);
  const [isOutflowPresetsExpanded, setIsOutflowPresetsExpanded] = useState<boolean>(false);
  const [isSavingsModalOpen, setIsSavingsModalOpen] = useState<boolean>(false);
  const [isSavingsPresetsExpanded, setIsSavingsPresetsExpanded] = useState<boolean>(false);
  const [savingsTitle, setSavingsTitle] = useState<string>('Gửi tiết kiệm tích lũy');
  const [savingsAmount, setSavingsAmount] = useState<string>('');
  const [savingsFromWallet, setSavingsFromWallet] = useState<AssetKey>('cash');
  const [savingsToWallet, setSavingsToWallet] = useState<AssetKey>('savings');
  const [savingsDate, setSavingsDate] = useState<string>('');
  const [savingsNote, setSavingsNote] = useState<string>('');

  const [isNewMonthModalOpen, setIsNewMonthModalOpen] = useState<boolean>(false);
  const [isDeleteMonthModalOpen, setIsDeleteMonthModalOpen] = useState<boolean>(false);
  const [monthToDeleteId, setMonthToDeleteId] = useState<string>('');

  // Financial Goals state - guest starts with completely empty goals
  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    try {
      const auth = getSavedAuthSession();
      if (auth.user) {
        const storageKey = `${GOALS_STORAGE_KEY}_${auth.user.uid}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {
      // ignore
    }
    // Guest starts with completely empty goals
    return [];
  });

  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = useState<boolean>(false);

  // Google Sheets & Drive Integration State (requires Gmail login on every web entry)
  const [googleUser, setGoogleUser] = useState<AppGoogleUser | null>(() => {
    try {
      return getSavedAuthSession().user;
    } catch {
      return null;
    }
  });
  const [googleToken, setGoogleToken] = useState<string | null>(() => {
    try {
      return getSavedAuthSession().token;
    } catch {
      return null;
    }
  });
  const [isConnectingGoogle, setIsConnectingGoogle] = useState<boolean>(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [needsTokenReauth, setNeedsTokenReauth] = useState<boolean>(false);
  const isPullingRemoteRef = useRef<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [autoSyncToSheets, setAutoSyncToSheets] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mks_auto_sync_sheets');
      return saved !== 'false';
    } catch {
      return true;
    }
  });
  const [spreadsheetInfo, setSpreadsheetInfo] = useState<GoogleSpreadsheetInfo | null>(() => {
    try {
      const saved = localStorage.getItem('mks_google_sheet_info');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });
  const [sheetSyncToast, setSheetSyncToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const [isResetAllDataConfirmOpen, setIsResetAllDataConfirmOpen] = useState<boolean>(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(() => {
    try {
      const auth = getSavedAuthSession();
      if (auth.user) {
        // If user is logged in but their Google token is expired or missing, auto-open startup screen to renew!
        if (isGoogleOAuthTokenExpired() || !auth.token) {
          return true;
        }
        return false;
      }
      if (localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true') {
        return false;
      }
    } catch {
      // ignore
    }
    return true;
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState<boolean>(false);

  const handleFinishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    if (!googleUser) {
      // Guest mode: ensure 100% clean template without any personal data & default 50 30 20
      setSheets(DEFAULT_MONTHLY_SHEETS);
      setFixedPresets([]);
      setWallets(DEFAULT_ASSET_WALLETS);
      setDebts(DEFAULT_DEBT_ACCOUNTS);
      setProportions(DEFAULT_SEGMENTS);
      setSpreadsheetInfo(null);
    }
    setShowOnboardingModal(false);
  };

  const handleReopenOnboarding = () => {
    setIsProfileModalOpen(false);
    setShowOnboardingModal(true);
  };

  const showSyncToast = (msg: string) => {
    setSheetSyncToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setSheetSyncToast(null);
    }, 4500);
  };

  const hasInitialSyncedRef = useRef<boolean>(false);
  const lastSyncedPayloadHashRef = useRef<string>('');
  const lastActiveUidRef = useRef<string | null>(getSavedAuthSession().user?.uid || null);

  const sheetsRef = useRef<MonthlySheet[]>(sheets);
  sheetsRef.current = sheets;
  const walletsRef = useRef<WalletMeta[]>(wallets);
  walletsRef.current = wallets;
  const debtsRef = useRef<DebtMeta[]>(debts);
  debtsRef.current = debts;
  const fixedPresetsRef = useRef<FixedPresetItem[]>(fixedPresets);
  fixedPresetsRef.current = fixedPresets;
  const proportionsRef = useRef<ProportionSegment[]>(proportions);
  proportionsRef.current = proportions;

  const isSyncingSheetsRef = useRef<boolean>(false);
  isSyncingSheetsRef.current = isSyncingSheets;
  const pendingSyncRef = useRef<boolean>(false);
  const lastExecutedActionHashRef = useRef<{ hash: string; timestamp: number }>({ hash: '', timestamp: 0 });

  const handleAuthOrTokenExpiry = useCallback((err: any): boolean => {
    const is401 =
      err?.status === 401 ||
      err?.code === 'UNAUTHENTICATED' ||
      err?.message?.includes('401') ||
      err?.message?.includes('UNAUTHENTICATED') ||
      err?.message?.includes('invalid authentication') ||
      err?.message?.includes('Token Google đã hết hạn') ||
      err?.message?.includes('Token missing or expired');

    if (is401) {
      console.warn('Google Sheets sync notice (401 token expired or unauthenticated)');
      setSyncStatus('error');
      setNeedsTokenReauth(true);
      setGoogleToken(null);
      markTokenExpired();
      showSyncToast('Phiên đăng nhập đã hết hạn. Đang mở trang khởi động để gia hạn...');
      setIsProfileModalOpen(false);
      setIsOAuthModalOpen(false);
      setShowOnboardingModal(true);
      return true;
    }
    return false;
  }, []);

  /**
   * Clears localStorage completely before loading data from Google Sheets upon login or token renewal.
   * Preserves only the active Google OAuth credentials and key system settings.
   */
  const clearLocalStorageOnAuthOrRenew = useCallback((user?: AppGoogleUser | null, token?: string | null) => {
    try {
      console.log('[Auth] Clearing localStorage before loading data from Google Sheet...');
      const savedToken = token || (typeof window !== 'undefined' ? localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY) : null);
      const savedExpires = typeof window !== 'undefined' ? localStorage.getItem(GOOGLE_AUTH_EXPIRES_AT_KEY) : null;
      const savedUser = user ? JSON.stringify(user) : (typeof window !== 'undefined' ? localStorage.getItem(GOOGLE_AUTH_USER_KEY) : null);
      const savedClientId = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_CLIENT_ID_KEY) : null;
      const savedTheme = typeof window !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
      const lastLoginEmail = user?.email || (typeof window !== 'undefined' ? localStorage.getItem('mks_last_login_email') : null);

      // Perform complete wipe of localStorage
      localStorage.clear();

      // Restore active authentication session & core configuration
      if (savedToken) localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, savedToken);
      if (savedExpires) localStorage.setItem(GOOGLE_AUTH_EXPIRES_AT_KEY, savedExpires);
      if (savedUser) localStorage.setItem(GOOGLE_AUTH_USER_KEY, savedUser);
      if (savedClientId) localStorage.setItem(CUSTOM_CLIENT_ID_KEY, savedClientId);
      if (savedTheme) localStorage.setItem(THEME_STORAGE_KEY, savedTheme);
      if (lastLoginEmail) localStorage.setItem('mks_last_login_email', lastLoginEmail);
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');

      // Reset in-memory state so nothing stale is left in state or refs
      setSheets(DEFAULT_MONTHLY_SHEETS);
      sheetsRef.current = DEFAULT_MONTHLY_SHEETS;
      setFixedPresets([]);
      fixedPresetsRef.current = [];
      setWallets(DEFAULT_ASSET_WALLETS);
      walletsRef.current = DEFAULT_ASSET_WALLETS;
      setDebts(DEFAULT_DEBT_ACCOUNTS);
      debtsRef.current = DEFAULT_DEBT_ACCOUNTS;
      setProportions(DEFAULT_SEGMENTS);
      lastSyncedPayloadHashRef.current = '';
      hasInitialSyncedRef.current = false;
    } catch (e) {
      console.warn('Notice clearing localStorage on auth/renew:', e);
    }
  }, []);

  /**
   * Bi-directional Sync: Pulls existing data from user's Google Sheet into the application state
   */
  const syncFromGoogleSheetToApp = useCallback(
    async (
      token: string,
      sheetId: string,
      isInitialLogin: boolean = false
    ): Promise<{ totalItems: number; mergedSheets: MonthlySheet[]; unsyncedCount: number; remoteVouchersCount: number }> => {
      if (isPullingRemoteRef.current) {
        return { totalItems: 0, mergedSheets: sheetsRef.current, unsyncedCount: 0, remoteVouchersCount: 0 };
      }
      isPullingRemoteRef.current = true;
      try {
        setIsSyncingSheets(true);
        setSyncStatus('syncing');
        if (!isInitialLogin) {
          showSyncToast('Đang tải dữ liệu từ Google Sheet về ứng dụng...');
        }

        const pulled = await fetchDataFromGoogleSheet(token, sheetId, walletsRef.current, debtsRef.current);

        // Get current local sheets (from React ref, state, or localStorage)
        // When logging in or renewing (isInitialLogin === true), we always start clean from DEFAULT_MONTHLY_SHEETS
        // so that data from Google Sheet is loaded cleanly without obsolete local vouchers
        let baseSheets = isInitialLogin ? DEFAULT_MONTHLY_SHEETS : sheetsRef.current;
        if (!isInitialLogin && (!baseSheets || baseSheets.length === 0 || !baseSheets.some((s) => (s.vouchers?.length || 0) > 0 || (s.incomeVouchers?.length || 0) > 0))) {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                baseSheets = parsed;
              }
            }
          } catch {}
        }
        if (!baseSheets || baseSheets.length === 0) {
          baseSheets = DEFAULT_MONTHLY_SHEETS;
        }

        // 1. Gather all unique sheet IDs across both local sheets and remote sheets
        const allSheetIds = Array.from(
          new Set([
            ...baseSheets.map((s) => s.id),
            ...Object.keys(pulled.groupedBySheet || {}),
          ])
        );

        // Build global lookup maps for remote expenses/incomes/savings to prevent any cross-sheet duplicates
        const remoteExpIdSet = new Set<string>();
        const remoteExpFpSet = new Set<string>();
        (pulled.expenses || []).forEach((e) => {
          if (e?.id) remoteExpIdSet.add(e.id);
          const normTitle = (e.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
          const amt = Math.round(Number(e.amount) || 0);
          const d = (e.date || '').trim();
          const cat = (e.category || '').trim();
          remoteExpFpSet.add(`${d}|${normTitle}|${amt}|${cat}`);
        });

        const remoteIncIdSet = new Set<string>();
        const remoteIncFpSet = new Set<string>();
        (pulled.incomes || []).forEach((i) => {
          if (i?.id) remoteIncIdSet.add(i.id);
          const normTitle = (i.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
          const amt = Math.round(Number(i.amount) || 0);
          const d = (i.date || '').trim();
          remoteIncFpSet.add(`${d}|${normTitle}|${amt}`);
        });

        const remoteSavIdSet = new Set<string>();
        const remoteSavFpSet = new Set<string>();
        (pulled.savings || []).forEach((s) => {
          if (s?.id) remoteSavIdSet.add(s.id);
          const normTitle = (s.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
          const amt = Math.round(Number(s.amount) || 0);
          const d = (s.date || '').trim();
          remoteSavFpSet.add(`${d}|${normTitle}|${amt}`);
        });

        let totalUnsyncedCount = 0;
        const updatedSheets: MonthlySheet[] = [];

        for (const sId of allSheetIds) {
          const group = pulled.groupedBySheet?.[sId];
          const localSheet = baseSheets.find((s) => s.id === sId);

          if (localSheet) {
            // Merge expenses: Remote first (cloud ground truth), then any local items not present in remote
            const mergedExpenses: ExpenseVoucher[] = [];
            const seenExpIds = new Set<string>();
            const seenExpFps = new Set<string>();

            (group?.expenses || []).forEach((rv) => {
              const normTitle = (rv.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
              const amt = Math.round(Number(rv.amount) || 0);
              const d = (rv.date || '').trim();
              const cat = (rv.category || '').trim();
              const fp = `${d}|${normTitle}|${amt}|${cat}`;
              if (!seenExpIds.has(rv.id) && !seenExpFps.has(fp)) {
                seenExpIds.add(rv.id);
                seenExpFps.add(fp);
                mergedExpenses.push(rv);
              }
            });

            (localSheet.vouchers || []).forEach((lv) => {
              const normTitle = (lv.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
              const amt = Math.round(Number(lv.amount) || 0);
              const d = (lv.date || '').trim();
              const cat = (lv.category || '').trim();
              const fp = `${d}|${normTitle}|${amt}|${cat}`;

              if (seenExpIds.has(lv.id) || seenExpFps.has(fp) || remoteExpIdSet.has(lv.id) || remoteExpFpSet.has(fp)) {
                // Already present on remote sheet, do not duplicate
                return;
              }
              // Unsynced local voucher created before renewal/sync!
              seenExpIds.add(lv.id);
              seenExpFps.add(fp);
              mergedExpenses.push(lv);
              totalUnsyncedCount++;
            });

            // Merge incomes: Remote first, then any local items not present in remote
            const mergedIncomes: IncomeVoucher[] = [];
            const seenIncIds = new Set<string>();
            const seenIncFps = new Set<string>();

            (group?.incomes || []).forEach((ri) => {
              const normTitle = (ri.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
              const amt = Math.round(Number(ri.amount) || 0);
              const d = (ri.date || '').trim();
              const fp = `${d}|${normTitle}|${amt}`;
              if (!seenIncIds.has(ri.id) && !seenIncFps.has(fp)) {
                seenIncIds.add(ri.id);
                seenIncFps.add(fp);
                mergedIncomes.push(ri);
              }
            });

            (localSheet.incomeVouchers || []).forEach((li) => {
              const normTitle = (li.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
              const amt = Math.round(Number(li.amount) || 0);
              const d = (li.date || '').trim();
              const fp = `${d}|${normTitle}|${amt}`;

              if (seenIncIds.has(li.id) || seenIncFps.has(fp) || remoteIncIdSet.has(li.id) || remoteIncFpSet.has(fp)) {
                // Already present on remote sheet, do not duplicate
                return;
              }
              // Unsynced local income voucher!
              seenIncIds.add(li.id);
              seenIncFps.add(fp);
              mergedIncomes.push(li);
              totalUnsyncedCount++;
            });

            // Merge savings: Remote first, then any local items not present in remote
            const mergedSavings: SavingsVoucher[] = [];
            const seenSavIds = new Set<string>();
            const seenSavFps = new Set<string>();

            (group?.savings || []).forEach((rs) => {
              const normTitle = (rs.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
              const amt = Math.round(Number(rs.amount) || 0);
              const d = (rs.date || '').trim();
              const fp = `${d}|${normTitle}|${amt}`;
              if (!seenSavIds.has(rs.id) && !seenSavFps.has(fp)) {
                seenSavIds.add(rs.id);
                seenSavFps.add(fp);
                mergedSavings.push(rs);
              }
            });

            (localSheet.savingsVouchers || []).forEach((ls) => {
              const normTitle = (ls.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
              const amt = Math.round(Number(ls.amount) || 0);
              const d = (ls.date || '').trim();
              const fp = `${d}|${normTitle}|${amt}`;

              if (seenSavIds.has(ls.id) || seenSavFps.has(fp) || remoteSavIdSet.has(ls.id) || remoteSavFpSet.has(fp)) {
                // Already present on remote sheet, do not duplicate
                return;
              }
              // Unsynced local savings voucher!
              seenSavIds.add(ls.id);
              seenSavFps.add(fp);
              mergedSavings.push(ls);
              totalUnsyncedCount++;
            });

            const mergedInit = {
              ...localSheet.initialBalances,
              ...(group?.initialBalances || {}),
            };

            updatedSheets.push({
              ...localSheet,
              initialBalances: mergedInit,
              vouchers: removeTwinDuplicateVouchers(mergedExpenses),
              incomeVouchers: removeTwinDuplicateVouchers(mergedIncomes),
              savingsVouchers: removeTwinDuplicateVouchers(mergedSavings),
            });
          } else if (group) {
            // Brand new sheet from Google Sheet
            const initBal: Record<string, any> = {
              ...(group.initialBalances || {}),
              updatedAt: new Date().toISOString(),
              note: 'Đồng bộ từ Google Sheet',
            };
            walletsRef.current.forEach((w) => {
              if (initBal[w.key] === undefined) initBal[w.key] = 0;
            });
            debtsRef.current.forEach((d) => {
              if (initBal[d.key] === undefined) initBal[d.key] = 0;
            });

            updatedSheets.push({
              id: sId,
              month: group.month,
              year: group.year,
              label: group.label,
              createdAt: new Date().toISOString(),
              initialBalances: initBal as any,
              vouchers: removeTwinDuplicateVouchers(group.expenses || []),
              incomeVouchers: removeTwinDuplicateVouchers(group.incomes || []),
              savingsVouchers: removeTwinDuplicateVouchers(group.savings || []),
            });
          }
        }

        updatedSheets.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
        setSheets(updatedSheets);
        sheetsRef.current = updatedSheets;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSheets));
        } catch {
          // ignore
        }

          // Update draftInitial if the active sheet has updated initial balances from Google Sheet
          const activeGroup = pulled.groupedBySheet[activeSheetId];
          if (activeGroup?.initialBalances) {
            setDraftInitial((prev) => ({
              ...prev,
              ...activeGroup.initialBalances,
            }));
          }

          // Check if active sheet should switch to the month with data
          const sheetIdsWithData = Object.keys(pulled.groupedBySheet).filter(
            (id) =>
              pulled.groupedBySheet[id].expenses.length > 0 ||
              pulled.groupedBySheet[id].incomes.length > 0 ||
              pulled.groupedBySheet[id].savings.length > 0
          );
          if (sheetIdsWithData.length > 0) {
            setActiveSheetId((currId) => {
              if (sheetIdsWithData.includes(currId)) {
                return currId;
              }
              return sheetIdsWithData[sheetIdsWithData.length - 1];
            });
          }

          if (pulled.presets && pulled.presets.length > 0) {
            const cleanRemotePresets = deduplicatePresets(pulled.presets);
            const seenPresets = new Set<string>();
            const mergedPresets: FixedPresetItem[] = [];

            cleanRemotePresets.forEach((p) => {
              const key = `${p.type}_${(p.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim()}`;
              if (!seenPresets.has(key)) {
                seenPresets.add(key);
                mergedPresets.push(p);
              }
            });

            if (!isInitialLogin) {
              (fixedPresetsRef.current || []).forEach((lp) => {
                const key = `${lp.type}_${(lp.title || '').normalize('NFC').toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim()}`;
                if (!seenPresets.has(key)) {
                  seenPresets.add(key);
                  mergedPresets.push(lp);
                  totalUnsyncedCount++;
                }
              });
            }

            setFixedPresets(mergedPresets);
            try {
              localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(mergedPresets));
            } catch {
              // ignore
            }
          }

          if (pulled.proportions && pulled.proportions.length >= 2) {
            const mappedProps: ProportionSegment[] = pulled.proportions.map((p, idx) => ({
              id: p.id || `seg-${idx}`,
              name: p.name,
              percentage: p.percentage,
              colorHex: p.colorHex || COLOR_PALETTE[idx % COLOR_PALETTE.length].colorHex,
              gradient: p.gradient || COLOR_PALETTE[idx % COLOR_PALETTE.length].gradient,
            }));
            setProportions(mappedProps);
            try {
              if (lastActiveUidRef.current) {
                localStorage.setItem(`mks_wallet_proportions_${lastActiveUidRef.current}`, JSON.stringify(mappedProps));
              }
            } catch {
              // ignore
            }
          } else {
            // Brand new account or new sheet without proportions: strictly default to 50 30 20
            setProportions(DEFAULT_SEGMENTS);
          }

          // Restore and synchronize wallets (Nguồn tiền, Tiết kiệm) directly from Google Sheet
          if (pulled.discoveredWallets && pulled.discoveredWallets.length > 0) {
            setWallets((prevWallets) => {
              let updated = [...prevWallets];
              pulled.discoveredWallets!.forEach((dw) => {
                const idx = updated.findIndex(
                  (w) =>
                    w.key.toLowerCase() === dw.key.toLowerCase() ||
                    w.name.toLowerCase() === dw.name.toLowerCase()
                );
                if (idx >= 0) {
                  // Update existing wallet name and details to match Google Sheet
                  updated[idx] = {
                    ...updated[idx],
                    name: dw.name,
                    shortName: dw.shortName || dw.name,
                    bankCode: dw.bankCode || updated[idx].bankCode,
                  };
                } else {
                  // Add new wallet from Google Sheet
                  updated.push(dw);
                }
              });

              // Ensure Tiết kiệm is present and at least 2 savings targets
              const savingsItems = updated.filter(isSavingsWallet);
              if (savingsItems.length === 0) {
                updated.push(
                  {
                    key: 'savings',
                    name: 'Tiết kiệm',
                    shortName: 'Tiết kiệm',
                    bankCode: 'SAVINGS',
                  },
                  {
                    key: 'savings_emergency',
                    name: 'Quỹ khẩn cấp',
                    shortName: 'Khẩn cấp',
                    bankCode: 'SAVINGS',
                    isCustom: true,
                  }
                );
              } else if (savingsItems.length === 1) {
                updated.push({
                  key: 'savings_emergency',
                  name: 'Quỹ khẩn cấp',
                  shortName: 'Khẩn cấp',
                  bankCode: 'SAVINGS',
                  isCustom: true,
                });
              }

              try {
                localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(updated));
              } catch {
                // ignore
              }
              return updated;
            });
          }

          // Fallback discovery for any additional wallet keys referenced in transactions
          const discoveredWalletKeys = new Set<string>();
          pulled.expenses.forEach((e) => {
            if (e.sourceWallet) discoveredWalletKeys.add(e.sourceWallet);
          });
          pulled.incomes.forEach((i) => {
            if (i.targetWallet) discoveredWalletKeys.add(i.targetWallet);
          });
          pulled.savings.forEach((s) => {
            if (s.fromWallet) discoveredWalletKeys.add(s.fromWallet);
            if (s.toWallet) discoveredWalletKeys.add(s.toWallet);
          });
          (pulled.presets || []).forEach((p) => {
            if (p.targetWallet) discoveredWalletKeys.add(p.targetWallet);
            if (p.fromWallet) discoveredWalletKeys.add(p.fromWallet);
            if (p.toWallet) discoveredWalletKeys.add(p.toWallet);
          });

          if (discoveredWalletKeys.size > 0) {
            setWallets((prevWallets) => {
              const updated = [...prevWallets];
              discoveredWalletKeys.forEach((wKey) => {
                const trimmed = wKey.trim();
                if (!trimmed) return;
                const exists = updated.some(
                  (w) =>
                    w.key.toLowerCase() === trimmed.toLowerCase() ||
                    w.name.toLowerCase() === trimmed.toLowerCase()
                );
                if (!exists) {
                  updated.push({
                    key: trimmed,
                    name: trimmed,
                    shortName: trimmed,
                    bankCode: trimmed.toLowerCase().includes('tiết kiệm')
                      ? 'SAVINGS'
                      : trimmed.toLowerCase().includes('tiền mặt')
                      ? 'CASH'
                      : 'BANK',
                    isCustom: true,
                  });
                }
              });
              try {
                localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(updated));
              } catch {
                // ignore
              }
              return updated;
            });
          }

          // Restore and synchronize debts (Công nợ) directly from Google Sheet
          if (pulled.discoveredDebts && pulled.discoveredDebts.length > 0) {
            setDebts((prevDebts) => {
              let updated = [...prevDebts];
              pulled.discoveredDebts!.forEach((dd) => {
                const idx = updated.findIndex(
                  (d) =>
                    d.key.toLowerCase() === dd.key.toLowerCase() ||
                    d.name.toLowerCase() === dd.name.toLowerCase()
                );
                if (idx >= 0) {
                  // Update existing debt name to match Google Sheet
                  updated[idx] = {
                    ...updated[idx],
                    name: dd.name,
                    shortName: dd.shortName || dd.name,
                    provider: dd.provider || updated[idx].provider,
                  };
                } else {
                  // Add new debt from Google Sheet
                  updated.push(dd);
                }
              });

              try {
                localStorage.setItem(DEBTS_STORAGE_KEY, JSON.stringify(updated));
              } catch {
                // ignore
              }
              return updated;
            });
          }

          // Fallback discovery for any additional debt keys referenced in transactions
          const discoveredDebtKeys = new Set<string>();
          pulled.expenses.forEach((e) => {
            if (
              e.debtTarget &&
              !e.debtTarget.toLowerCase().includes('trực tiếp') &&
              !e.debtTarget.toLowerCase().includes('khả dụng') &&
              e.debtTarget !== 'none'
            ) {
              discoveredDebtKeys.add(e.debtTarget.trim());
            }
          });
          if (discoveredDebtKeys.size > 0) {
            setDebts((prevDebts) => {
              const updated = [...prevDebts];
              discoveredDebtKeys.forEach((dKey) => {
                const trimmed = dKey.trim();
                if (!trimmed) return;
                const exists = updated.some(
                  (d) =>
                    d.key.toLowerCase() === trimmed.toLowerCase() ||
                    d.name.toLowerCase() === trimmed.toLowerCase()
                );
                if (!exists) {
                  updated.push({
                    key: trimmed,
                    name: trimmed,
                    shortName: trimmed,
                    provider: 'Credit',
                    isCustom: true,
                  });
                }
              });
              try {
                localStorage.setItem(DEBTS_STORAGE_KEY, JSON.stringify(updated));
              } catch {
                // ignore
              }
              return updated;
            });
          }

          // Restore and synchronize bottom navigation order directly from Google Sheet
          if (pulled.bottomNavOrder && pulled.bottomNavOrder.length === 5) {
            setBottomNavOrder(pulled.bottomNavOrder);
            try {
              localStorage.setItem(BOTTOM_NAV_STORAGE_KEY, JSON.stringify(pulled.bottomNavOrder));
            } catch {
              // ignore
            }
          }

          // Restore and synchronize financial goals directly from Google Sheet
          if (Array.isArray(pulled.goals) && pulled.goals.length > 0) {
            setGoals(pulled.goals);
            try {
              const auth = getSavedAuthSession();
              const storageKey = auth.user ? `${GOALS_STORAGE_KEY}_${auth.user.uid}` : GOALS_STORAGE_KEY;
              localStorage.setItem(storageKey, JSON.stringify(pulled.goals));
            } catch {}
          }

          setSyncStatus('synced');
          setNeedsTokenReauth(false);
          setLastSyncTime(new Date());
          if (!isInitialLogin) {
            if (pulled.totalItems > 0) {
              showSyncToast(`Đã tải về thành công ${pulled.totalItems} mục từ Google Sheet!`);
            } else {
              showSyncToast('Google Sheet hiện chưa có dữ liệu mới để tải về.');
            }
          }
          const remoteVouchersCount =
            (pulled.expenses?.length || 0) + (pulled.incomes?.length || 0) + (pulled.savings?.length || 0);
          return {
            totalItems: pulled.totalItems,
            mergedSheets: updatedSheets,
            unsyncedCount: totalUnsyncedCount,
            remoteVouchersCount,
          };
      } catch (err: any) {
        if (!handleAuthOrTokenExpiry(err)) {
          // If sheet was not found or permission denied (e.g. user switching Google accounts), re-create/find sheet in this user's Drive
          if (
            err?.status === 404 ||
            err?.status === 403 ||
            err?.message?.includes('404') ||
            err?.message?.includes('403') ||
            err?.message?.includes('permission')
          ) {
            console.warn('Sheet ID inaccessible for current account, finding or creating personal sheet in user Drive...');
            try {
              const newInfo = await findOrCreateSpreadsheet(token);
              setSpreadsheetInfo(newInfo);
              const userSheetKey = `mks_google_sheet_info_${lastActiveUidRef.current || 'user'}`;
              localStorage.setItem(userSheetKey, JSON.stringify(newInfo));
              localStorage.setItem('mks_google_sheet_info', JSON.stringify(newInfo));
              isPullingRemoteRef.current = false;
              return await syncFromGoogleSheetToApp(token, newInfo.id, isInitialLogin);
            } catch (createErr) {
              console.warn('Could not recreate sheet for user:', createErr);
            }
          }
          console.warn('Sync from Google Sheet info:', err?.message);
          setSyncStatus('error');
          showSyncToast(`Lỗi khi tải từ Google Sheet: ${err?.message || 'Vui lòng thử lại'}`);
        }
        return { totalItems: 0, mergedSheets: sheetsRef.current, unsyncedCount: 0, remoteVouchersCount: 0 };
      } finally {
        setIsSyncingSheets(false);
        setTimeout(() => {
          isPullingRemoteRef.current = false;
        }, 1200);
      }
    },
    [handleAuthOrTokenExpiry]
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        // Multi-user safety: Check if user switched accounts or completed redirect sign-in
        const prevUid = lastActiveUidRef.current;
        const isRedirectSignIn = typeof window !== 'undefined' && sessionStorage.getItem('mks_pending_redirect_signin') === 'true';
        if (isRedirectSignIn) {
          try {
            sessionStorage.removeItem('mks_pending_redirect_signin');
          } catch {}
        }

        if ((prevUid && prevUid !== user.uid) || isRedirectSignIn) {
          console.log(`[initAuth] Account switch or redirect sign-in from ${prevUid} to ${user.uid}, clearing localStorage before loading sheet...`);
          clearLocalStorageOnAuthOrRenew(user, token);
        }
        lastActiveUidRef.current = user.uid;

        setGoogleUser(user);
        const hasValidToken = token && isGoogleOAuthToken(token) && !isGoogleOAuthTokenExpired();
        if (hasValidToken) {
          setGoogleToken(token);
          setNeedsTokenReauth(false);
          if (localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true') {
            setShowOnboardingModal(false);
          }
        } else {
          setGoogleToken(null);
          setNeedsTokenReauth(true);
          setShowOnboardingModal(true);
        }

        // Restore user wallets & debts from storage if they were cleared during guest mode
        setWallets((prev) => {
          if (prev.length > 0) return prev;
          try {
            const saved = localStorage.getItem(WALLETS_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch {
            // ignore
          }
          return DEFAULT_ASSET_WALLETS;
        });

        setDebts((prev) => {
          if (prev.length > 0) return prev;
          try {
            const saved = localStorage.getItem(DEBTS_STORAGE_KEY);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
          } catch {
            // ignore
          }
          return DEFAULT_DEBT_ACCOUNTS;
        });

        if (hasValidToken && token) {
          try {
            let info: GoogleSpreadsheetInfo | null = null;
            const userSheetKey = `mks_google_sheet_info_${user.uid}`;
            const saved = localStorage.getItem(userSheetKey);
            if (saved) {
              try {
                info = JSON.parse(saved);
              } catch {
                info = null;
              }
            }
            if (!info) {
              showSyncToast('Đang kết nối và khởi tạo Google Sheets trên Google Drive của bạn...');
              info = await findOrCreateSpreadsheet(token);
              setSpreadsheetInfo(info);
              localStorage.setItem(userSheetKey, JSON.stringify(info));
              localStorage.setItem('mks_google_sheet_info', JSON.stringify(info));
              showSyncToast(`Đã kết nối thành công file: ${info.name}`);
            } else {
              setSpreadsheetInfo(info);
            }
            // Load sheet data into the app upon login / session restore (once per session)
            if (info && !hasInitialSyncedRef.current) {
              hasInitialSyncedRef.current = false;
              const syncResult = await syncFromGoogleSheetToApp(token, info.id, true);
              if (syncResult && syncResult.mergedSheets) {
                const payload = buildFullSyncPayload(syncResult.mergedSheets);
                const totalLocalVouchers =
                  payload.expenses.length + payload.incomes.length + payload.savings.length;
                const remoteVouchers = syncResult.remoteVouchersCount ?? 0;
                const shouldPush =
                  syncResult.unsyncedCount > 0 ||
                  (remoteVouchers === 0 && totalLocalVouchers > 0) ||
                  totalLocalVouchers > remoteVouchers;
                if (shouldPush) {
                  console.log(`[initAuth] Pushing unsynced local data (${syncResult.unsyncedCount || totalLocalVouchers} items) to Google Sheet...`);
                  try {
                    await syncAllDataToGoogleSheet(token, info.id, payload);
                    showSyncToast(`Đã tự động đẩy ${syncResult.unsyncedCount || totalLocalVouchers} phiếu lưu trên máy vào Google Sheet!`);
                  } catch (pushErr) {
                    console.warn('[initAuth] Could not push unsynced items:', pushErr);
                  }
                }
                lastSyncedPayloadHashRef.current = JSON.stringify(payload);
              }
              hasInitialSyncedRef.current = true;
              setSyncStatus('synced');
              setNeedsTokenReauth(false);
            }
          } catch (err: any) {
            if (!handleAuthOrTokenExpiry(err)) {
              console.warn('Auto connect & sync sheet notice:', err?.message || err);
            }
          }
        }
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setNeedsTokenReauth(false);
        hasInitialSyncedRef.current = false;
        lastActiveUidRef.current = null;
        try {
          if (localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true') {
            setShowOnboardingModal(true);
          }
        } catch {}
      }
    );

    return () => unsubscribe();
  }, [syncFromGoogleSheetToApp, handleAuthOrTokenExpiry]);

  // Proactively detect expired Google OAuth tokens and auto-open OnboardingScreen to renew
  useEffect(() => {
    if (!googleUser) return;

    const checkTokenExpiryAndAutoOpen = () => {
      const isExpired = isGoogleOAuthTokenExpired() || (googleToken && !isGoogleOAuthToken(googleToken));
      if (isExpired) {
        setNeedsTokenReauth(true);
        setGoogleToken(null);
        setIsProfileModalOpen(false);
        setIsOAuthModalOpen(false);
        setShowOnboardingModal(true);
      }
    };

    checkTokenExpiryAndAutoOpen();
    const interval = setInterval(checkTokenExpiryAndAutoOpen, 15000);
    window.addEventListener('focus', checkTokenExpiryAndAutoOpen);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkTokenExpiryAndAutoOpen);
    };
  }, [googleUser, googleToken]);


  // Sync dark mode class on <html> & persist to localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  // Dropdown states for Workspace toolbar
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState<boolean>(false);
  const [pickerYear, setPickerYear] = useState<number>(() => {
    return DEFAULT_MONTHLY_SHEETS[DEFAULT_MONTHLY_SHEETS.length - 1].year;
  });

  const monthPickerRef = useRef<HTMLDivElement>(null);
  const monthMenuRef = useRef<HTMLDivElement>(null);
  const monthMenuMobileRef = useRef<HTMLDivElement>(null);
  const ledgerFilterRef = useRef<HTMLDivElement>(null);
  const [isLedgerFilterDropdownOpen, setIsLedgerFilterDropdownOpen] = useState<boolean>(false);
  const incDatePickerRef = useRef<HTMLDivElement>(null);
  const [isIncDatePickerOpen, setIsIncDatePickerOpen] = useState<boolean>(false);
  const txDatePickerRef = useRef<HTMLDivElement>(null);
  const [isTxDatePickerOpen, setIsTxDatePickerOpen] = useState<boolean>(false);
  const savingsDatePickerRef = useRef<HTMLDivElement>(null);
  const [isSavingsDatePickerOpen, setIsSavingsDatePickerOpen] = useState<boolean>(false);
  const voucherSearchRef = useRef<HTMLDivElement>(null);
  const voucherSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVoucherSearchOpen) {
      if (voucherSearchInputRef.current) {
        voucherSearchInputRef.current.focus();
      }
      const timer = setTimeout(() => {
        if (voucherSearchInputRef.current) {
          voucherSearchInputRef.current.focus();
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isVoucherSearchOpen]);

  // Close popups on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        monthPickerRef.current &&
        !monthPickerRef.current.contains(target)
      ) {
        setIsMonthPickerOpen(false);
      }
      const inDesktop = monthMenuRef.current?.contains(target);
      const inMobile = monthMenuMobileRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setIsMonthMenuOpen(false);
      }
      if (
        ledgerFilterRef.current &&
        !ledgerFilterRef.current.contains(target)
      ) {
        setIsLedgerFilterDropdownOpen(false);
      }
      if (
        incDatePickerRef.current &&
        !incDatePickerRef.current.contains(target)
      ) {
        setIsIncDatePickerOpen(false);
      }
      if (
        txDatePickerRef.current &&
        !txDatePickerRef.current.contains(target)
      ) {
        setIsTxDatePickerOpen(false);
      }
      if (
        savingsDatePickerRef.current &&
        !savingsDatePickerRef.current.contains(target)
      ) {
        setIsSavingsDatePickerOpen(false);
      }
      if (
        voucherSearchRef.current &&
        !voucherSearchRef.current.contains(target) &&
        !voucherSearchQuery.trim()
      ) {
        setIsVoucherSearchOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMonthPickerOpen(false);
        setIsMonthMenuOpen(false);
        setIsLedgerFilterDropdownOpen(false);
        setIsIncDatePickerOpen(false);
        setIsTxDatePickerOpen(false);
        setIsSavingsDatePickerOpen(false);
        if (isVoucherSearchOpen) {
          setVoucherSearchQuery('');
          setIsVoucherSearchOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchend', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchend', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [voucherSearchQuery]);

  // Clear obsolete legacy test data keys on mount so guest state is guaranteed 100% clean
  useEffect(() => {
    const legacyKeys = [
      'mks_monthly_sheets',
      'mks_wallet_sheets_v1',
      'mks_wallet_sheets_clean_v1',
      'mks_wallet_sheets_clean_v2',
      'mks_wallet_sheets_clean_v3',
      'mks_wallet_sheets_clean_v4',
      'mks_wallet_presets_clean_v1',
      'mks_wallet_presets_clean_v2',
      'mks_fixed_presets',
      'mks_sample_data',
      PROPORTIONS_STORAGE_KEY,
      'mks_wallet_segmented_proportions_v1',
      'mks_wallet_gemini_chat_history_v1',
      'mks_wallet_gemini_chat_history_v2',
      'mks_wallet_gemini_chat_history_v3',
      'mks_wallet_gemini_chat_history_v4',
      'mks_wallet_gemini_chat_history_v5',
    ];
    legacyKeys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });
  }, []);

  // Persist sheets to localStorage (only persist when signed in with Google to maintain clean guest state)
  useEffect(() => {
    try {
      if (googleUser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sheets));
      }
    } catch {
      // ignore
    }
  }, [sheets, googleUser]);

  // Persist fixed presets to localStorage
  useEffect(() => {
    try {
      if (googleUser) {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(fixedPresets));
      }
    } catch {
      // ignore
    }
  }, [fixedPresets, googleUser]);

  // Persist wallets to localStorage (only when signed in)
  useEffect(() => {
    try {
      if (googleUser) {
        localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(wallets));
      }
    } catch {
      // ignore
    }
  }, [wallets, googleUser]);

  // Persist debts to localStorage (only when signed in)
  useEffect(() => {
    try {
      if (googleUser) {
        localStorage.setItem(DEBTS_STORAGE_KEY, JSON.stringify(debts));
      }
    } catch {
      // ignore
    }
  }, [debts, googleUser]);

  // Persist proportions to localStorage (only persist when signed in with Google to maintain clean 50 30 20 default for guest)
  useEffect(() => {
    try {
      if (googleUser) {
        localStorage.setItem(`mks_wallet_proportions_${googleUser.uid}`, JSON.stringify(proportions));
      }
    } catch {
      // ignore
    }
  }, [proportions, googleUser]);

  const activeSheet = useMemo(() => {
    return sheets.find((s) => s.id === activeSheetId) || sheets[sheets.length - 1];
  }, [sheets, activeSheetId]);

  const inflowPresets = useMemo(
    () => deduplicatePresets(fixedPresets.filter((p) => p.type === 'inflow')),
    [fixedPresets]
  );

  const outflowPresets = useMemo(
    () => deduplicatePresets(fixedPresets.filter((p) => p.type === 'outflow')),
    [fixedPresets]
  );

  const savingsPresets = useMemo(
    () => deduplicatePresets(fixedPresets.filter((p) => p.type === 'savings')),
    [fixedPresets]
  );

  // Financial Calculations for the active Monthly Sheet
  const metrics = useMemo(() => {
    const init = activeSheet.initialBalances;
    const incomeList = activeSheet.incomeVouchers || [];

    const totalInitialAssets = wallets.reduce(
      (sum, w) => sum + (Number(init[w.key]) || 0),
      0
    );
    const totalInitialDebts = debts.reduce(
      (sum, d) => sum + (Number(init[d.key]) || 0),
      0
    );
    const initialNetWorth = totalInitialAssets - totalInitialDebts;

    // Cộng tiền theo từng nguồn tiền
    const addedByWallet: Record<string, number> = {};
    wallets.forEach((w) => {
      addedByWallet[w.key] = 0;
    });

    let totalAddedIncome = 0;
    incomeList.forEach((inc) => {
      const k = inc.targetWallet || (wallets[0]?.key ?? 'cash');
      addedByWallet[k] = (addedByWallet[k] || 0) + inc.amount;
      totalAddedIncome += inc.amount;
    });

    // Danh sách phiếu chuyển tiền tiết kiệm trong tháng
    const savingsList = activeSheet.savingsVouchers || [];
    const directSavingsTotal = savingsList.reduce((sum, s) => sum + s.amount, 0);
    const expenseSavingsFundTotal = activeSheet.vouchers
      .filter((v) => v.debtTarget === 'savings_fund')
      .reduce((sum, v) => sum + v.amount, 0);
    const totalSavingsInMonth = directSavingsTotal + expenseSavingsFundTotal;

    // Số tiền thực tế ở từng nguồn (Đầu tháng + Phiếu cộng tiền + Chuyển tiết kiệm)
    const walletTotalBySource: Record<string, number> = {};
    wallets.forEach((w) => {
      let balance = (Number(init[w.key]) || 0) + (addedByWallet[w.key] || 0);
      savingsList.forEach((sv) => {
        if (sv.fromWallet === w.key) balance -= sv.amount;
        if (sv.toWallet === w.key) balance += sv.amount;
      });
      if ((w.key === 'savings' || w.bankCode === 'SAVINGS') && expenseSavingsFundTotal > 0) {
        balance += expenseSavingsFundTotal;
      }
      walletTotalBySource[w.key] = balance;
    });

    // Tài khoản tiết kiệm: số tiền đầu tháng và số dư hiện tại (đầu tháng + gửi tiết kiệm trong tháng)
    const savingsWallets = wallets.filter(
      (w) =>
        w.key === 'savings' ||
        w.bankCode === 'SAVINGS' ||
        w.name.toLowerCase().includes('tiết kiệm')
    );
    const initialSavings =
      savingsWallets.length > 0
        ? savingsWallets.reduce((sum, w) => sum + (Number(init[w.key]) || 0), 0)
        : Number(init['savings']) || 0;

    const currentSavingsBalance =
      savingsWallets.length > 0
        ? savingsWallets.reduce(
            (sum, w) => sum + (walletTotalBySource[w.key] ?? 0),
            0
          )
        : initialSavings + totalSavingsInMonth;

    const totalGrossAssets = totalInitialAssets + totalAddedIncome;

    // Chi tiêu và công nợ:
    // 1. debtPaid: Số tiền đã thanh toán nợ (TT Tín dụng, TT PayLater) -> trừ trực tiếp tiền tài khoản, giảm nợ
    // 2. debtSpent: Số tiền phát sinh do dùng thẻ/PayLater (Tín dụng, PayLater) -> CỘNG vào nợ, KHÔNG trừ tiền mặt/tài khoản trực tiếp
    const debtPaid: Record<string, number> = {};
    const debtSpent: Record<string, number> = {};
    debts.forEach((d) => {
      debtPaid[d.key] = 0;
      debtSpent[d.key] = 0;
    });

    let directSpentMoney = 0; // Tiền mặt / tài khoản ngân hàng thực tế bị trừ
    let directExpenseTotal = 0; // Chi tiêu trực tiếp (không phải trả nợ)

    activeSheet.vouchers.forEach((v) => {
      if (v.debtTarget && v.debtTarget !== 'savings_fund') {
        if (v.debtAction === 'spend') {
          // Sử dụng thẻ tín dụng / PayLater: CỘNG VÀO NỢ, không trừ tiền trực tiếp
          if (debtSpent[v.debtTarget] !== undefined) {
            debtSpent[v.debtTarget] += v.amount;
          }
        } else {
          // Thanh toán nợ (TT Tín dụng, TT PayLater): trừ tiền trực tiếp để trả nợ
          if (debtPaid[v.debtTarget] !== undefined) {
            debtPaid[v.debtTarget] += v.amount;
          }
          directSpentMoney += v.amount;
        }
      } else {
        // Chi tiêu trực tiếp bằng tiền mặt / tài khoản ngân hàng
        directSpentMoney += v.amount;
        directExpenseTotal += v.amount;
      }
    });

    const remainingDebt: Record<string, number> = {};
    let totalRemainingDebts = 0;
    debts.forEach((d) => {
      const initAmount = Number(init[d.key]) || 0;
      // Dư nợ = Nợ đầu tháng + Chi tiêu qua thẻ/PayLater trong tháng - Đã thanh toán nợ trong tháng
      const rem = Math.max(0, initAmount + (debtSpent[d.key] || 0) - (debtPaid[d.key] || 0));
      remainingDebt[d.key] = rem;
      totalRemainingDebts += rem;
    });

    // Tổng số tiền tiêu thực tế trong tháng:
    // = Chi tiêu trực tiếp
    // + Chi tiêu qua thẻ tín dụng / PayLater (debtSpent)
    // + Khoản trả nợ cũ vượt quá số tiền quẹt thẻ trong tháng (nếu trả nợ cũ từ tháng trước)
    // Đảm bảo: Dùng 70k thẻ tín dụng trước rồi trả lại vào thẻ đúng 70k thì tổng tiền tiêu vẫn là 70k, không bị nhân đôi lên 140k.
    let totalCreditSpent = 0;
    let extraDebtPaidBeyondCredit = 0;
    debts.forEach((d) => {
      const spent = debtSpent[d.key] || 0;
      const paid = debtPaid[d.key] || 0;
      totalCreditSpent += spent;
      extraDebtPaidBeyondCredit += Math.max(0, paid - spent);
    });

    const totalSpent = directExpenseTotal + totalCreditSpent + extraDebtPaidBeyondCredit;
    const totalSpentWithInitialDebt = totalSpent;

    // Danh sách phiếu chi tính vào biểu đồ phân bổ 50-30-20 (bù trừ khoản thanh toán nợ với các khoản đã quẹt thẻ)
    const creditOffsetAvailable: Record<string, number> = {};
    debts.forEach((d) => {
      creditOffsetAvailable[d.key] = debtSpent[d.key] || 0;
    });

    const chartVouchers: ExpenseVoucher[] = [];
    activeSheet.vouchers.forEach((v) => {
      if (v.debtTarget && v.debtTarget !== 'savings_fund') {
        if (v.debtAction === 'spend') {
          // Phiếu quẹt thẻ: là chi tiêu thực tế (xăng, ăn uống, vv)
          chartVouchers.push(v);
        } else {
          // Phiếu thanh toán nợ: chỉ đưa vào biểu đồ phần trả nợ cũ vượt quá số tiền đã quẹt thẻ
          const availableOffset = creditOffsetAvailable[v.debtTarget] || 0;
          const offset = Math.min(v.amount, availableOffset);
          creditOffsetAvailable[v.debtTarget] = availableOffset - offset;
          const uncreditedAmount = v.amount - offset;
          if (uncreditedAmount > 0) {
            chartVouchers.push({ ...v, amount: uncreditedAmount });
          }
        }
      } else {
        // Phiếu chi trực tiếp
        chartVouchers.push(v);
      }
    });

    // Tổng số tiền thực tế còn lại = Tổng (Đầu tháng + Phiếu cộng tiền) - Tiền chi trực tiếp (bao gồm thanh toán nợ, KHÔNG trừ chi tiêu qua thẻ)
    // Lưu ý: Chuyển tiền tiết kiệm là điều chuyển nội bộ giữa các ví, không làm thay đổi tổng tiền thực tế
    const totalActualMoneyRemaining = totalGrossAssets - directSpentMoney;

    // Tài sản ròng thực tế = Tổng số tiền thực tế còn lại - Tổng nợ còn lại
    const currentNetWorth = totalActualMoneyRemaining - totalRemainingDebts;

    // Lương của tháng: ưu tiên phiếu Inflow Lương trong tháng, nếu chưa nhập thì lấy theo mức Lương cố định đã cài đặt
    const salaryInflowsInMonth = incomeList.filter(
      (inc) =>
        inc.presetId === 'preset-inflow-salary' ||
        inc.title.trim().toLowerCase().includes('lương')
    );
    const salaryFromMonthInflow = salaryInflowsInMonth.reduce(
      (sum, inc) => sum + inc.amount,
      0
    );
    const configuredSalaryPreset = inflowPresets.find(
      (p) =>
        p.id === 'preset-inflow-salary' ||
        p.title.trim().toLowerCase().includes('lương')
    );
    const monthlySalary =
      salaryFromMonthInflow > 0
        ? salaryFromMonthInflow
        : configuredSalaryPreset
          ? Number(configuredSalaryPreset.amount) || 0
          : totalAddedIncome;

    return {
      totalInitialAssets,
      totalInitialDebts,
      initialNetWorth,
      addedByWallet,
      walletTotalBySource,
      totalAddedIncome,
      totalGrossAssets,
      debtPaid,
      debtSpent,
      remainingDebt,
      totalSpent,
      totalSpentWithInitialDebt,
      chartVouchers,
      directSpentMoney,
      totalActualMoneyRemaining,
      totalRemainingDebts,
      currentNetWorth,
      // Tiền sử dụng còn lại = Số tiền thực tế + Số nợ hiện tại - Số tiền tiết kiệm
      remainingUsableMoney: currentNetWorth + totalRemainingDebts - currentSavingsBalance,
      monthlySalary,
      initialSavings,
      currentSavingsBalance,
      totalSavingsInMonth,
      savingsList,
    };
  }, [activeSheet, inflowPresets, wallets, debts]);

  // Initial Balance Form State (synced when activeSheet changes)
  const [draftInitial, setDraftInitial] = useState<InitialBalanceVoucher>(
    activeSheet.initialBalances
  );
  const [initialSavedFeedback, setInitialSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    setDraftInitial(activeSheet.initialBalances);
  }, [activeSheet]);

  // Income Voucher ("+ Inflow") Modal Form State
  const [selectedInflowPresetId, setSelectedInflowPresetId] = useState<string>('');
  const [incTitle, setIncTitle] = useState<string>('');
  const [incAmount, setIncAmount] = useState<string>('');
  const [incWallet, setIncWallet] = useState<AssetKey>('cash');
  const [incDate, setIncDate] = useState<string>(() => {
    return `${activeSheet.id}-${String(new Date().getDate()).padStart(2, '0')}`;
  });
  const [incPickerYear, setIncPickerYear] = useState<number>(activeSheet.year);
  const [incPickerMonth, setIncPickerMonth] = useState<number>(activeSheet.month);

  useEffect(() => {
    if (incDate) {
      const parts = incDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setIncPickerYear(parts[0]);
        setIncPickerMonth(parts[1]);
      }
    }
  }, [incDate]);

  // Expense Voucher ("− Outflow") Modal Form State
  const [selectedOutflowPresetId, setSelectedOutflowPresetId] = useState<string>('');
  const [txTitle, setTxTitle] = useState<string>('');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txCategory, setTxCategory] = useState<RuleCategory>('needs_50');
  const [txSubCategory, setTxSubCategory] = useState<string>(
    RULE_50_30_20_META.needs_50.subCategories[0]
  );
  const [txDeduction, setTxDeduction] = useState<string>('none');
  const [txDate, setTxDate] = useState<string>(() => {
    return `${activeSheet.id}-${String(new Date().getDate()).padStart(2, '0')}`;
  });
  const [txPickerYear, setTxPickerYear] = useState<number>(activeSheet.year);
  const [txPickerMonth, setTxPickerMonth] = useState<number>(activeSheet.month);

  useEffect(() => {
    if (txDate) {
      const parts = txDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setTxPickerYear(parts[0]);
        setTxPickerMonth(parts[1]);
      }
    }
  }, [txDate]);

  const [savingsPickerYear, setSavingsPickerYear] = useState<number>(activeSheet.year);
  const [savingsPickerMonth, setSavingsPickerMonth] = useState<number>(activeSheet.month);

  useEffect(() => {
    if (savingsDate) {
      const parts = savingsDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setSavingsPickerYear(parts[0]);
        setSavingsPickerMonth(parts[1]);
      }
    }
  }, [savingsDate]);

  // Danh sách các mục cố định cho Chọn nhanh (không tự động ẩn khi bấm chọn hoặc khi đã sử dụng)
  const availableInflowPresets = inflowPresets;
  const availableOutflowPresets = outflowPresets;

  const [selectedSavingsPresetId, setSelectedSavingsPresetId] = useState<string>('');
  const availableSavingsPresets = savingsPresets;

  // Fixed Preset Editor State (for adding/editing fixed items in the "Cố định" tab)
  const [editingPreset, setEditingPreset] = useState<FixedPresetItem | null>(null);
  const [newPresetType, setNewPresetType] = useState<'inflow' | 'outflow' | 'savings'>('outflow');
  const [newPresetTitle, setNewPresetTitle] = useState<string>('');
  const [newPresetAmount, setNewPresetAmount] = useState<string>('');
  const [newPresetWallet, setNewPresetWallet] = useState<AssetKey>('cash');
  const [newPresetFromWallet, setNewPresetFromWallet] = useState<AssetKey>('cash');
  const [newPresetToWallet, setNewPresetToWallet] = useState<AssetKey>('savings');
  const [newPresetCategory, setNewPresetCategory] = useState<RuleCategory>('needs_50');
  const [newPresetSubCategory, setNewPresetSubCategory] = useState<string>(
    RULE_50_30_20_META.needs_50.subCategories[0]
  );
  const [managingFixedCategory, setManagingFixedCategory] = useState<'inflow' | 'outflow' | 'savings' | null>(null);
  const [fixedCategoryToDelete, setFixedCategoryToDelete] = useState<'inflow' | 'outflow' | 'savings' | null>(null);
  const [draggedPresetId, setDraggedPresetId] = useState<string | null>(null);
  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);

  // New Month Sheet Modal State
  const [newMonthNum, setNewMonthNum] = useState<number>(() =>
    activeSheet.month === 12 ? 1 : activeSheet.month + 1
  );
  const [newYearNum, setNewYearNum] = useState<number | string>(() =>
    activeSheet.month === 12 ? activeSheet.year + 1 : activeSheet.year
  );
  const [rolloverMode, setRolloverMode] = useState<'rollover' | 'fresh'>('rollover');

  const formatVND = (amount: number | string): string => {
    return new Intl.NumberFormat('vi-VN').format(Number(amount) || 0) + ' ₫';
  };

  const formatVietnameseDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getProportionLabelForCategory = useCallback(
    (cat?: string): string => {
      if (!cat) return '';
      const props = proportions && proportions.length > 0 ? proportions : DEFAULT_SEGMENTS;
      if (cat === 'needs_50') {
        const p = props.find(
          (pr) =>
            pr.id === 'seg-needs' ||
            pr.name.toLowerCase().includes('thiết yếu') ||
            pr.name.toLowerCase().includes('nhu cầu')
        ) || props[0];
        return p ? `${p.name} (${p.percentage}%)` : 'Thiết yếu (50%)';
      }
      if (cat === 'wants_30') {
        const p = props.find(
          (pr) =>
            pr.id === 'seg-wants' ||
            pr.name.toLowerCase().includes('linh hoạt') ||
            pr.name.toLowerCase().includes('cá nhân')
        ) || props[1];
        return p ? `${p.name} (${p.percentage}%)` : 'Linh hoạt (30%)';
      }
      if (cat === 'savings_debt_20') {
        const p = props.find(
          (pr) =>
            pr.id === 'seg-savings' ||
            pr.name.toLowerCase().includes('tiết kiệm') ||
            pr.name.toLowerCase().includes('đầu tư')
        ) || props[2];
        return p ? `${p.name} (${p.percentage}%)` : 'Tiết kiệm & Đầu tư (20%)';
      }
      const custom = props.find((pr) => pr.id === cat || pr.name === cat);
      return custom ? `${custom.name} (${custom.percentage}%)` : cat;
    },
    [proportions]
  );

  const financialContext: FinancialContext = useMemo(() => {
    return {
      activeSheetId: activeSheet?.id,
      todayDate: new Date().toISOString().split('T')[0],
      currentMonthName: activeSheet?.label || 'Tháng hiện tại',
      monthlySalary: metrics.monthlySalary,
      totalIncome: metrics.totalAddedIncome,
      totalSpent: metrics.totalSpent,
      remainingBalance: metrics.remainingUsableMoney,
      remainingUsableMoney: metrics.remainingUsableMoney,
      currentSavingsBalance: metrics.currentSavingsBalance,
      totalActualMoneyRemaining: metrics.totalActualMoneyRemaining,
      currentNetWorth: metrics.currentNetWorth,
      vouchersCount: (activeSheet?.vouchers?.length || 0) + (activeSheet?.incomeVouchers?.length || 0),
      proportions: proportions.map((p) => ({
        name: p.name,
        percentage: p.percentage,
      })),
      wallets: wallets.map((w) => ({ key: w.key, name: w.name })),
      debts: debts.map((d) => ({ key: d.key, name: d.name })),
      totalRemainingDebts: metrics.totalRemainingDebts,
      remainingDebtBreakdown: metrics.remainingDebt,
      fixedPresets: fixedPresets.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title,
        amount: Math.round(Number(p.amount) || 0),
        targetWallet: p.targetWallet,
        category: p.category,
        subCategory: p.subCategory,
        fromWallet: p.fromWallet,
        toWallet: p.toWallet,
      })),
    };
  }, [activeSheet, metrics, proportions, wallets, debts, fixedPresets]);

  const handleSelectInflowPreset = (preset: FixedPresetItem) => {
    setSelectedInflowPresetId(preset.id);
    setIncTitle(preset.title);
    setIncAmount(String(preset.amount));
    if (preset.targetWallet) {
      setIncWallet(preset.targetWallet);
    }
  };

  const handleSelectOutflowPreset = (preset: FixedPresetItem) => {
    setSelectedOutflowPresetId(preset.id);
    setTxTitle(preset.title);
    setTxAmount(String(preset.amount));
    const cat = preset.category || 'needs_50';
    setTxCategory(cat);
    const sub =
      preset.subCategory || RULE_50_30_20_META[cat].subCategories[0];
    setTxSubCategory(sub);
    if (cat === 'savings_debt_20') {
      setTxDeduction('none');
    } else if (sub.includes('Trả nợ') || sub.includes('Tất toán') || sub.includes('Thẻ tín dụng') || sub.includes('Pay Later') || sub.includes('PayLater')) {
      if (sub.includes('Thẻ tín dụng') || sub.includes('tín dụng')) {
        setTxDeduction('pay:creditCard');
      } else if (sub.includes('Shopee Pay Later') || sub.includes('Pay Later') || sub.includes('PayLater')) {
        setTxDeduction('pay:shopeePayLater');
      } else {
        setTxDeduction('none');
      }
    } else {
      setTxDeduction('none');
    }
  };

  const handleSelectSavingsPreset = (preset: FixedPresetItem) => {
    setSelectedSavingsPresetId(preset.id);
    setSavingsTitle(preset.title);
    setSavingsAmount(String(preset.amount));
    if (preset.fromWallet) {
      setSavingsFromWallet(preset.fromWallet);
    }
    if (preset.toWallet) {
      setSavingsToWallet(preset.toWallet);
    }
  };

  const handleOpenAddFixedPreset = () => {
    setEditingPreset(null);
    setNewPresetType('outflow');
    setNewPresetTitle('');
    setNewPresetAmount('');
    setNewPresetWallet(wallets[0]?.key || 'cash');
    setNewPresetFromWallet(wallets[0]?.key || 'cash');
    setNewPresetToWallet('savings');
    setNewPresetCategory('needs_50');
    setNewPresetSubCategory(RULE_50_30_20_META.needs_50.subCategories[0]);
    setIsAddFixedPresetModalOpen(true);
  };

  const handleOpenAddFixedPresetForType = (type: 'inflow' | 'outflow' | 'savings') => {
    setEditingPreset(null);
    setNewPresetType(type);
    setNewPresetTitle('');
    setNewPresetAmount('');
    setNewPresetWallet(wallets[0]?.key || 'cash');
    setNewPresetFromWallet(wallets[0]?.key || 'cash');
    setNewPresetToWallet('savings');
    setNewPresetCategory('needs_50');
    setNewPresetSubCategory(RULE_50_30_20_META.needs_50.subCategories[0]);
    setIsAddFixedPresetModalOpen(true);
  };

  const handleConfirmDeleteFixedCategory = (type: 'inflow' | 'outflow' | 'savings') => {
    setFixedPresets((prev) => prev.filter((p) => p.type !== type));
    setFixedCategoryToDelete(null);
  };

  const handleOpenEditFixedPreset = (preset: FixedPresetItem) => {
    setEditingPreset(preset);
    setNewPresetType(preset.type);
    setNewPresetTitle(preset.title);
    setNewPresetAmount(
      preset.amount !== undefined && preset.amount !== null ? String(preset.amount) : ''
    );
    if (preset.type === 'inflow') {
      if (preset.targetWallet) setNewPresetWallet(preset.targetWallet);
    } else if (preset.type === 'savings') {
      if (preset.fromWallet) setNewPresetFromWallet(preset.fromWallet);
      if (preset.toWallet) setNewPresetToWallet(preset.toWallet);
    } else {
      if (preset.category) {
        setNewPresetCategory(preset.category);
        setNewPresetSubCategory(
          preset.subCategory || RULE_50_30_20_META[preset.category].subCategories[0]
        );
      }
    }
    setIsAddFixedPresetModalOpen(true);
  };

  const handleAddFixedPreset = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(newPresetAmount);
    if (!newPresetTitle.trim() || !numericAmount || numericAmount <= 0) return;

    if (editingPreset) {
      setFixedPresets((prev) =>
        prev.map((p) => {
          if (p.id !== editingPreset.id) return p;
          const updated: FixedPresetItem = {
            id: p.id,
            type: newPresetType,
            title: newPresetTitle.trim(),
            amount: numericAmount,
          };
          if (newPresetType === 'inflow') {
            updated.targetWallet = newPresetWallet;
          } else if (newPresetType === 'savings') {
            updated.fromWallet = newPresetFromWallet;
            updated.toWallet = newPresetToWallet;
          } else {
            updated.category = newPresetCategory;
            updated.categoryLabel = getProportionLabelForCategory(newPresetCategory);
            updated.subCategory = newPresetSubCategory;
          }
          return updated;
        })
      );
      setEditingPreset(null);
      setNewPresetTitle('');
      setNewPresetAmount('');
      setIsAddFixedPresetModalOpen(false);
      return;
    }

    let item: FixedPresetItem;
    if (newPresetType === 'inflow') {
      item = {
        id: `preset-${Date.now()}`,
        type: 'inflow',
        title: newPresetTitle.trim(),
        amount: numericAmount,
        targetWallet: newPresetWallet,
      };
    } else if (newPresetType === 'savings') {
      item = {
        id: `preset-${Date.now()}`,
        type: 'savings',
        title: newPresetTitle.trim(),
        amount: numericAmount,
        fromWallet: newPresetFromWallet,
        toWallet: newPresetToWallet,
      };
    } else {
      item = {
        id: `preset-${Date.now()}`,
        type: 'outflow',
        title: newPresetTitle.trim(),
        amount: numericAmount,
        category: newPresetCategory,
        categoryLabel: getProportionLabelForCategory(newPresetCategory),
        subCategory: newPresetSubCategory,
      };
    }

    setFixedPresets((prev) =>
      deduplicatePresets([
        ...prev.filter(
          (p) =>
            p.type !== newPresetType ||
            normalizePresetTitle(p.title) !== normalizePresetTitle(newPresetTitle)
        ),
        item,
      ])
    );
    setNewPresetTitle('');
    setNewPresetAmount('');
    setIsAddFixedPresetModalOpen(false);
  };

  const handleUpdateFixedPresetAmount = (id: string, newAmount: number | string) => {
    setFixedPresets((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              amount:
                newAmount === ''
                  ? ''
                  : typeof newAmount === 'number'
                  ? Math.max(0, newAmount)
                  : Math.max(0, Number(newAmount) || 0),
            }
          : p
      )
    );
  };

  const handleDeleteFixedPreset = (id: string) => {
    setFixedPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const handleReorderFixedPresets = (
    type: 'inflow' | 'outflow' | 'savings',
    sourceId: string,
    targetId: string
  ) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setFixedPresets((prev) => {
      const typeItems = prev.filter((p) => p.type === type);
      const sourceIndex = typeItems.findIndex((p) => p.id === sourceId);
      const targetIndex = typeItems.findIndex((p) => p.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev;

      const reordered = [...typeItems];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      let reorderIdx = 0;
      return prev.map((item) => {
        if (item.type === type) {
          const updated = reordered[reorderIdx];
          reorderIdx++;
          return updated;
        }
        return item;
      });
    });
  };

  const handleOpenAddWallet = () => {
    setNewWalletName('');
    setNewWalletBankCode('');
    setNewWalletInitialAmount('');
    setIsAddWalletModalOpen(true);
  };

  const handleAddWallet = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWalletName.trim();
    if (!name) return;
    const key = `wallet_${Date.now()}`;
    const initialAmount = 0;

    const newWallet: WalletMeta = {
      key,
      name,
      shortName: name,
      bankCode: '',
      isCustom: true,
    };

    setWallets((prev) => [...prev, newWallet]);

    setDraftInitial((prev) => ({
      ...prev,
      [key]: initialAmount,
    }));

    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              initialBalances: {
                ...s.initialBalances,
                [key]: initialAmount,
              },
            }
          : s
      )
    );

    setIsAddWalletModalOpen(false);
  };

  const handleOpenAddSavingsWallet = () => {
    setNewSavingsName('');
    setIsAddSavingsModalOpen(true);
  };

  const handleAddSavingsWallet = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSavingsName.trim();
    if (!name) return;
    const key = `savings_${Date.now()}`;
    const initialAmount = 0;

    const newWallet: WalletMeta = {
      key,
      name,
      shortName: name,
      bankCode: 'SAVINGS',
      isCustom: true,
    };

    setWallets((prev) => [...prev, newWallet]);

    setDraftInitial((prev) => ({
      ...prev,
      [key]: initialAmount,
    }));

    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              initialBalances: {
                ...s.initialBalances,
                [key]: initialAmount,
              },
            }
          : s
      )
    );

    setIsAddSavingsModalOpen(false);
  };

  const handleOpenEditWallet = (wallet: WalletMeta) => {
    setEditingWallet(wallet);
    setEditWalletName(wallet.name);
    setEditWalletBankCode(wallet.bankCode || '');
  };

  const handleSaveEditWallet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWallet) return;
    const name = editWalletName.trim();
    if (!name) return;

    setWallets((prev) =>
      prev.map((w) =>
        w.key === editingWallet.key
          ? { ...w, name, shortName: name, bankCode: editingWallet.bankCode || (isSavingsWallet(editingWallet) ? 'SAVINGS' : '') }
          : w
      )
    );
    setEditingWallet(null);
  };

  const handleConfirmDeleteWallet = () => {
    if (!walletToDelete) {
      setWalletToDelete(null);
      return;
    }
    const walletKey = walletToDelete.key;
    const isSavings = isSavingsWallet(walletToDelete);

    if (isSavings) {
      const remainingSavings = wallets.filter((w) => isSavingsWallet(w) && w.key !== walletKey);
      if (remainingSavings.length === 0) {
        alert('Bạn cần giữ lại ít nhất 1 mục tiết kiệm trong danh sách.');
        setWalletToDelete(null);
        return;
      }
    } else {
      const remainingRegular = wallets.filter((w) => !isSavingsWallet(w) && w.key !== walletKey);
      if (remainingRegular.length === 0) {
        alert('Bạn cần giữ lại ít nhất 1 nguồn tiền trong danh sách.');
        setWalletToDelete(null);
        return;
      }
    }

    const remainingWallets = wallets.filter((w) => w.key !== walletKey);
    setWallets(remainingWallets);

    if (incWallet === walletKey && remainingWallets.length > 0) {
      setIncWallet(remainingWallets[0].key);
    }

    setDraftInitial((prev) => {
      const updated = { ...prev };
      delete updated[walletKey];
      return updated;
    });

    setSheets((prev) =>
      prev.map((s) => {
        const updatedInit = { ...s.initialBalances };
        delete updatedInit[walletKey];
        return { ...s, initialBalances: updatedInit };
      })
    );

    setWalletToDelete(null);
  };

  const handleOpenAddDebt = () => {
    setNewDebtName('');
    setNewDebtShortName('');
    setNewDebtInitialAmount('');
    setIsAddDebtModalOpen(true);
  };

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDebtName.trim();
    if (!name) return;
    const key = `debt_${Date.now()}`;
    const initialAmount = 0;

    const newDebt: DebtMeta = {
      key,
      name,
      shortName: name,
      provider: name,
      isCustom: true,
    };

    setDebts((prev) => [...prev, newDebt]);

    setDraftInitial((prev) => ({
      ...prev,
      [key]: initialAmount,
    }));

    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              initialBalances: {
                ...s.initialBalances,
                [key]: initialAmount,
              },
            }
          : s
      )
    );

    setIsAddDebtModalOpen(false);
  };

  const handleOpenEditDebt = (debt: DebtMeta) => {
    setEditingDebt(debt);
    setEditDebtName(debt.name);
    setEditDebtShortName(debt.shortName || debt.provider || '');
  };

  const handleSaveEditDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebt) return;
    const name = editDebtName.trim();
    if (!name) return;

    setDebts((prev) =>
      prev.map((d) =>
        d.key === editingDebt.key
          ? { ...d, name, shortName: name, provider: name }
          : d
      )
    );
    setEditingDebt(null);
  };

  const handleConfirmDeleteDebt = () => {
    if (!debtToDelete) return;
    const debtKey = debtToDelete.key;
    if (debts.length <= 1) {
      alert('Bạn cần giữ lại ít nhất 1 khoản nợ trong danh sách.');
      return;
    }

    const remainingDebts = debts.filter((d) => d.key !== debtKey);
    setDebts(remainingDebts);

    if (txDeduction.endsWith(`:${debtKey}`) || txDeduction === debtKey) {
      setTxDeduction('none');
    }

    setDraftInitial((prev) => {
      const updated = { ...prev };
      delete updated[debtKey];
      return updated;
    });

    setSheets((prev) =>
      prev.map((s) => {
        const updatedInit = { ...s.initialBalances };
        delete updatedInit[debtKey];
        return { ...s, initialBalances: updatedInit };
      })
    );

    setDebtToDelete(null);
  };

  const handleSaveInitialBalances = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: InitialBalanceVoucher = {
      ...draftInitial,
      updatedAt: new Date().toISOString(),
    };
    wallets.forEach((w) => {
      updated[w.key] = Number(draftInitial[w.key]) || 0;
    });
    debts.forEach((d) => {
      updated[d.key] = Number(draftInitial[d.key]) || 0;
    });
    setDraftInitial(updated);
    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.id === activeSheet.id
          ? { ...sheet, initialBalances: updated }
          : sheet
      )
    );
    setInitialSavedFeedback(true);
    setTimeout(() => setInitialSavedFeedback(false), 2500);
  };

  const handleCreateIncomeVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(incAmount);
    if (!incTitle.trim() || !numericAmount || numericAmount <= 0) return;

    const newIncome: IncomeVoucher = {
      id: `inc-${Date.now()}`,
      sheetId: activeSheet.id,
      presetId: selectedInflowPresetId || undefined,
      title: incTitle.trim(),
      amount: numericAmount,
      targetWallet: incWallet,
      date: incDate || `${activeSheet.id}-15`,
    };

    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.id === activeSheet.id
          ? {
              ...sheet,
              incomeVouchers: [newIncome, ...(sheet.incomeVouchers || [])],
            }
          : sheet
      )
    );

    // Auto-sync income to Google Sheets if connected
    if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
      appendIncomeToGoogleSheet(googleToken, spreadsheetInfo.id, {
        id: newIncome.id,
        date: newIncome.date,
        title: newIncome.title,
        amount: newIncome.amount,
        targetWalletName: wallets.find((w) => w.key === newIncome.targetWallet)?.name || newIncome.targetWallet,
      })
        .then(() => {
          showSyncToast('Đã tự động đẩy phiếu thu lên Google Sheet trên Google Drive!');
        })
        .catch((err) => {
          if (!handleAuthOrTokenExpiry(err)) {
            console.warn('Auto sync income notice:', err?.message || err);
          }
        });
    }

    setSelectedInflowPresetId('');
    setIncTitle('');
    setIncAmount('');
    setIsIncomeModalOpen(false);
    setIsIncDatePickerOpen(false);
  };

  const handleCreateExpenseVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(txAmount);
    if (!txTitle.trim() || !numericAmount || numericAmount <= 0) return;

    let resolvedDebtTarget: DebtKey | 'savings_fund' | undefined = undefined;
    let resolvedDebtAction: 'spend' | 'pay' | undefined = undefined;

    const isDebtRepayment = txDeduction.startsWith('pay:');
    if (isDebtRepayment) {
      resolvedDebtTarget = txDeduction.replace('pay:', '');
      resolvedDebtAction = 'pay';
    } else if (txCategory === 'savings_debt_20') {
      resolvedDebtTarget = 'savings_fund';
    } else if (txDeduction.startsWith('spend:')) {
      resolvedDebtTarget = txDeduction.replace('spend:', '');
      resolvedDebtAction = 'spend';
    } else if (txDeduction !== 'none') {
      resolvedDebtTarget = txDeduction;
      resolvedDebtAction = 'pay';
    }

    const effectiveCategory: RuleCategory = isDebtRepayment
      ? 'savings_debt_20'
      : txCategory === 'savings_debt_20'
      ? 'needs_50'
      : txCategory;

    const effectiveSubCategory = isDebtRepayment
      ? txDeduction === 'pay:creditCard'
        ? 'Trả nợ thẻ tín dụng'
        : txDeduction === 'pay:shopeePayLater'
        ? 'Tất toán PayLater'
        : 'Thanh toán nợ'
      : txSubCategory || RULE_50_30_20_META[effectiveCategory]?.subCategories[0] || 'Chi tiêu';

    const newVoucher: ExpenseVoucher = {
      id: `v-${Date.now()}`,
      sheetId: activeSheet.id,
      presetId: selectedOutflowPresetId || undefined,
      title: txTitle.trim(),
      amount: numericAmount,
      category: effectiveCategory,
      subCategory: effectiveSubCategory,
      debtTarget: resolvedDebtTarget,
      debtAction: resolvedDebtAction,
      date: txDate || `${activeSheet.id}-15`,
    };

    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.id === activeSheet.id
          ? { ...sheet, vouchers: [newVoucher, ...sheet.vouchers] }
          : sheet
      )
    );

    // Auto-sync expense to Google Sheets on Google Drive
    if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
      const categoryLabel = RULE_50_30_20_META[newVoucher.category]?.label || newVoucher.category;
      const debtTargetLabel =
        newVoucher.debtAction === 'spend'
          ? (newVoucher.debtTarget === 'creditCard'
              ? 'Tín dụng'
              : newVoucher.debtTarget === 'shopeePayLater'
              ? 'PayLater'
              : debts.find((d) => d.key === newVoucher.debtTarget)?.name || 'Tín dụng')
          : newVoucher.debtTarget === 'creditCard'
          ? 'TT Tín dụng'
          : newVoucher.debtTarget === 'shopeePayLater'
          ? 'TT PayLater'
          : newVoucher.debtTarget === 'savings_fund'
          ? 'Quỹ tiết kiệm'
          : newVoucher.debtTarget
          ? `TT ${debts.find((d) => d.key === newVoucher.debtTarget)?.name || newVoucher.debtTarget}`
          : 'Trực tiếp (Số tiền có thể sử dụng)';

      appendExpenseToGoogleSheet(googleToken, spreadsheetInfo.id, {
        id: newVoucher.id,
        date: newVoucher.date,
        title: newVoucher.title,
        amount: newVoucher.amount,
        categoryLabel,
        subCategory: newVoucher.subCategory,
        debtTargetLabel,
      })
        .then(() => {
          showSyncToast('Đã tự động đẩy phiếu chi lên Google Sheet trên Google Drive!');
        })
        .catch((err) => {
          if (!handleAuthOrTokenExpiry(err)) {
            console.warn('Auto sync expense notice:', err?.message || err);
            showSyncToast('Chưa đẩy được lên Google Sheet (vui lòng thử lại)');
          }
        });
    }

    setSelectedOutflowPresetId('');
    setTxTitle('');
    setTxAmount('');
    setTxDeduction('none');
    setIsExpenseModalOpen(false);
    setIsTxDatePickerOpen(false);
  };

  const handleDeleteExpenseVoucher = (voucherId: string) => {
    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.id === activeSheet.id
          ? {
              ...sheet,
              vouchers: sheet.vouchers.filter((v) => v.id !== voucherId),
            }
          : sheet
      )
    );
  };

  const handleDeleteIncomeVoucher = (incomeId: string) => {
    setSheets((prev) =>
      prev.map((sheet) =>
        sheet.id === activeSheet.id
          ? {
              ...sheet,
              incomeVouchers: (sheet.incomeVouchers || []).filter(
                (inc) => inc.id !== incomeId
              ),
            }
          : sheet
      )
    );
  };

  const handleOpenSavingsModal = () => {
    setSavingsTitle('Gửi tiết kiệm tích lũy');
    setSavingsAmount('');
    const nonSavings = wallets.find(
      (w) => w.key !== 'savings' && !w.name.toLowerCase().includes('tiết kiệm')
    );
    setSavingsFromWallet(nonSavings ? nonSavings.key : wallets[0]?.key || 'cash');
    const targetSavings = wallets.find(
      (w) => w.key === 'savings' || w.name.toLowerCase().includes('tiết kiệm')
    );
    setSavingsToWallet(
      targetSavings ? targetSavings.key : wallets[1]?.key || 'savings'
    );
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const initialDate = todayStr.startsWith(activeSheet.id) ? todayStr : `${activeSheet.id}-15`;
    setSavingsDate(initialDate);
    const dateParts = initialDate.split('-').map(Number);
    if (dateParts.length === 3 && !isNaN(dateParts[0]) && !isNaN(dateParts[1])) {
      setSavingsPickerYear(dateParts[0]);
      setSavingsPickerMonth(dateParts[1]);
    } else {
      setSavingsPickerYear(activeSheet.year);
      setSavingsPickerMonth(activeSheet.month);
    }
    setIsSavingsDatePickerOpen(false);
    setSavingsNote('');
    setIsSavingsModalOpen(true);
  };

  const handleSaveSavingsVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(savingsAmount);
    if (!numericAmount || numericAmount <= 0) return;
    if (savingsFromWallet === savingsToWallet) {
      alert('Nguồn trích tiền và nơi gửi tiết kiệm phải khác nhau.');
      return;
    }

    const newSavings: SavingsVoucher = {
      id: `sav-${Date.now()}`,
      sheetId: activeSheet.id,
      title: savingsTitle.trim() || 'Gửi tiết kiệm tích lũy',
      amount: numericAmount,
      fromWallet: savingsFromWallet,
      toWallet: savingsToWallet,
      date: savingsDate || `${activeSheet.id}-15`,
      note: savingsNote.trim() || undefined,
    };

    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              savingsVouchers: [newSavings, ...(s.savingsVouchers || [])],
            }
          : s
      )
    );

    // Auto-sync savings to Google Sheets if connected
    if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
      appendSavingsToGoogleSheet(googleToken, spreadsheetInfo.id, {
        id: newSavings.id,
        date: newSavings.date,
        title: newSavings.title,
        amount: newSavings.amount,
        fromWalletName: wallets.find((w) => w.key === newSavings.fromWallet)?.name || newSavings.fromWallet,
        toWalletName: wallets.find((w) => w.key === newSavings.toWallet)?.name || newSavings.toWallet,
      })
        .then(() => {
          showSyncToast('Đã tự động đẩy phiếu gửi tiết kiệm lên Google Sheet!');
        })
        .catch((err) => {
          if (!handleAuthOrTokenExpiry(err)) {
            console.warn('Auto sync savings notice:', err?.message || err);
          }
        });
    }

    setIsSavingsDatePickerOpen(false);
    setIsSavingsModalOpen(false);
  };

  const handleDeleteSavingsVoucher = (id: string) => {
    setSheets((prev) =>
      prev.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              savingsVouchers: (s.savingsVouchers || []).filter((sv) => sv.id !== id),
            }
          : s
      )
    );
  };

  const handleAddGoal = (goalData: Omit<FinancialGoal, 'id' | 'createdAt'>) => {
    const newGoal: FinancialGoal = {
      ...goalData,
      id: `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setGoals((prev) => {
      const updated = [...prev, newGoal];
      try {
        const auth = getSavedAuthSession();
        const storageKey = auth.user ? `${GOALS_STORAGE_KEY}_${auth.user.uid}` : GOALS_STORAGE_KEY;
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showSyncToast(`Đã thêm mục tiêu: ${newGoal.title}`);
  };

  const handleUpdateGoal = (updatedGoal: FinancialGoal) => {
    setGoals((prev) => {
      const updated = prev.map((g) => (g.id === updatedGoal.id ? updatedGoal : g));
      try {
        const auth = getSavedAuthSession();
        const storageKey = auth.user ? `${GOALS_STORAGE_KEY}_${auth.user.uid}` : GOALS_STORAGE_KEY;
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showSyncToast(`Đã cập nhật mục tiêu: ${updatedGoal.title}`);
  };

  const handleDeleteGoal = (goalId: string) => {
    setGoals((prev) => {
      const updated = prev.filter((g) => g.id !== goalId);
      try {
        const auth = getSavedAuthSession();
        const storageKey = auth.user ? `${GOALS_STORAGE_KEY}_${auth.user.uid}` : GOALS_STORAGE_KEY;
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showSyncToast('Đã xóa mục tiêu tài chính.');
  };

  const handleSaveScannedVoucher = (data: {
    type: 'expense' | 'income';
    title: string;
    amount: number;
    date: string;
    category?: RuleCategory;
    subCategory?: string;
    sourceWallet?: AssetKey;
    targetWallet?: AssetKey;
    bankName?: string;
    bankCode?: string;
    debtTarget?: DebtKey;
    debtAction?: 'spend' | 'pay';
    note?: string;
  }) => {
    const targetSheetId = activeSheet.id;

    // Tự động tìm hoặc liên kết ví theo đúng ngân hàng phát hiện trên bill
    let resolvedWallet = data.type === 'income' ? data.targetWallet : data.sourceWallet;

    if (data.bankName && !data.debtTarget) {
      const bankNorm = data.bankName.toLowerCase().replace(/[\s\-_]/g, '');
      const codeNorm = (data.bankCode || '').toLowerCase().replace(/[\s\-_]/g, '');

      const matched = wallets.find((w) => {
        const wNorm = w.name.toLowerCase().replace(/[\s\-_]/g, '');
        const wCode = (w.bankCode || '').toLowerCase().replace(/[\s\-_]/g, '');
        const wShort = (w.shortName || '').toLowerCase().replace(/[\s\-_]/g, '');
        const wKey = w.key.toLowerCase().replace(/[\s\-_]/g, '');
        return (
          (codeNorm && wCode && wCode === codeNorm) ||
          (codeNorm && wKey.includes(codeNorm)) ||
          wNorm.includes(bankNorm) ||
          bankNorm.includes(wNorm) ||
          (codeNorm && wShort.includes(codeNorm))
        );
      });

      if (matched) {
        resolvedWallet = matched.key;
      } else {
        // Tự động thêm ví ngân hàng này vào danh sách ví tài sản để tiện theo dõi
        const newKey = `wallet_${(data.bankCode || data.bankName).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const newWallet: WalletMeta = {
          key: newKey,
          name: data.bankName,
          shortName: data.bankCode || data.bankName,
          bankCode: data.bankCode || '',
          isCustom: true,
        };
        setWallets((prev) => {
          if (prev.some((w) => w.key === newKey || w.name.toLowerCase() === data.bankName!.toLowerCase())) {
            return prev;
          }
          const updated = [...prev, newWallet];
          try {
            localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
        resolvedWallet = newKey;
      }
    }

    if (data.type === 'income') {
      const finalTargetWallet = resolvedWallet || wallets.find((w) => w.key === 'bank')?.key || wallets[0]?.key || 'bank';
      const newInc: IncomeVoucher = {
        id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sheetId: targetSheetId,
        title: data.title,
        amount: data.amount,
        targetWallet: finalTargetWallet,
        date: data.date,
        note: data.note,
      };
      setSheets((prev) =>
        prev.map((s) =>
          s.id === targetSheetId
            ? {
                ...s,
                incomeVouchers: [newInc, ...(s.incomeVouchers || [])],
              }
            : s
        )
      );
      showSyncToast(`Đã ghi nhận phiếu thu: ${newInc.title} (+${formatVND(newInc.amount)})`);

      if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
        appendIncomeToGoogleSheet(googleToken, spreadsheetInfo.id, {
          id: newInc.id,
          date: newInc.date,
          title: newInc.title,
          amount: newInc.amount,
          targetWalletName: wallets.find((w) => w.key === newInc.targetWallet)?.name || data.bankName || newInc.targetWallet,
        }).catch((err) => {
          if (!handleAuthOrTokenExpiry(err)) {
            console.warn('Scanned income auto-sync notice:', err?.message || err);
          }
        });
      }
    } else {
      const isCardDebt = Boolean(data.debtTarget);
      const finalSourceWallet = isCardDebt ? undefined : (resolvedWallet || wallets.find((w) => w.key === 'bank')?.key || wallets[0]?.key || 'bank');
      const newExp: ExpenseVoucher = {
        id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sheetId: targetSheetId,
        title: data.title,
        amount: data.amount,
        category: data.category || 'needs_50',
        subCategory: data.subCategory || 'Ăn uống hàng ngày',
        sourceWallet: finalSourceWallet,
        debtTarget: data.debtTarget,
        debtAction: data.debtAction,
        date: data.date,
        note: data.note,
      };
      setSheets((prev) =>
        prev.map((s) =>
          s.id === targetSheetId
            ? {
                ...s,
                vouchers: [newExp, ...s.vouchers],
              }
            : s
        )
      );
      showSyncToast(`Đã ghi nhận phiếu chi: ${newExp.title} (-${formatVND(newExp.amount)})`);

      if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
        const categoryLabel = RULE_50_30_20_META[newExp.category]?.label || newExp.category;
        const debtTargetLabel =
          newExp.debtAction === 'spend'
            ? (newExp.debtTarget === 'creditCard'
                ? 'Tín dụng'
                : debts.find((d) => d.key === newExp.debtTarget)?.name || 'Tín dụng')
            : 'Trực tiếp';

        appendExpenseToGoogleSheet(googleToken, spreadsheetInfo.id, {
          id: newExp.id,
          date: newExp.date,
          title: newExp.title,
          amount: newExp.amount,
          categoryLabel,
          subCategory: newExp.subCategory,
          debtTargetLabel,
        }).catch((err) => {
          if (!handleAuthOrTokenExpiry(err)) {
            console.warn('Scanned expense auto-sync notice:', err?.message || err);
          }
        });
      }
    }
  };

  /**
   * Helper function giúp chatbot tìm kiếm và cập nhật dòng tiền cố định thay vì tạo phiếu mới.
   * So sánh `title` và `type` để xác định đúng preset cần sửa, sau đó gọi `setFixedPresets` để cập nhật `amount` mới.
   */
  const updateFixedPresetFromChatbot = useCallback(
    (
      title: string,
      type: 'inflow' | 'outflow' | 'savings',
      amount: number,
      options?: {
        targetWallet?: string;
        category?: RuleCategory;
        subCategory?: string;
        fromWallet?: string;
        toWallet?: string;
      }
    ): { success: boolean; presetTitle: string; updatedAmount: number; isNew: boolean } => {
      const rawAmount = Math.max(0, Math.round(Number(amount) || 0));
      const searchTitle = String(title || '').trim().toLowerCase();
      let matchedTitle = title || (type === 'inflow' ? 'Lương' : 'Khoản cố định');
      let isNew = false;

      setFixedPresets((prevPresets) => {
        const updated = [...prevPresets];

        // So sánh `title` và `type` để xác định đúng preset cần sửa
        const matchIndex = updated.findIndex((p) => {
          if (p.type !== type) return false;
          const pTitle = String(p.title || '').trim().toLowerCase();
          return pTitle === searchTitle || pTitle.includes(searchTitle) || searchTitle.includes(pTitle);
        });

        if (matchIndex >= 0) {
          const matched = updated[matchIndex];
          matchedTitle = matched.title;
          updated[matchIndex] = {
            ...matched,
            amount: rawAmount,
            ...(options?.targetWallet ? { targetWallet: options.targetWallet } : {}),
            ...(options?.category ? { category: options.category } : {}),
            ...(options?.subCategory ? { subCategory: options.subCategory } : {}),
          };
        } else {
          isNew = true;
          const newPreset: FixedPresetItem = {
            id: `preset-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            type,
            title: matchedTitle,
            amount: rawAmount,
            targetWallet: options?.targetWallet || (type === 'inflow' ? (wallets[0]?.key || 'cash') : undefined),
            category: options?.category || (type === 'outflow' ? 'needs_50' : undefined),
            subCategory: options?.subCategory || (type === 'outflow' ? 'Nhu cầu thiết yếu' : undefined),
            fromWallet: options?.fromWallet || (type === 'savings' ? (wallets[0]?.key || 'cash') : undefined),
            toWallet: options?.toWallet || (type === 'savings' ? 'savings' : undefined),
          };
          updated.push(newPreset);
        }

        const cleanUpdated = deduplicatePresets(updated);
        try {
          if (googleUser) {
            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(cleanUpdated));
          }
        } catch {
          // ignore
        }
        return cleanUpdated;
      });

      return {
        success: true,
        presetTitle: matchedTitle,
        updatedAmount: rawAmount,
        isNew,
      };
    },
    [wallets, googleUser]
  );

  const handleExecuteVoucherActions = useCallback(
    (actions: VoucherAction[]): string[] => {
      const results: string[] = [];
      if (!actions || actions.length === 0) return results;

      // Debounce rapid duplicate invocations of the identical action batch
      const payloadHash = JSON.stringify(actions);
      const now = Date.now();
      if (
        lastExecutedActionHashRef.current.hash === payloadHash &&
        now - lastExecutedActionHashRef.current.timestamp < 3500
      ) {
        console.warn('[VoucherAction] Duplicate execution debounced within 3.5s');
        return [];
      }
      lastExecutedActionHashRef.current = { hash: payloadHash, timestamp: now };

      // Deduplicate actions within the received batch to ensure 1 requested expense = 1 voucher
      const uniqueActions: VoucherAction[] = [];
      const seenActionKeys = new Set<string>();
      for (const act of actions) {
        const actKey = `${act.type}_${(act.title || '').trim().toLowerCase()}_${act.amount}_${act.date || ''}_${act.category || ''}_${act.debtTarget || ''}_${act.debtAction || ''}`;
        if (!seenActionKeys.has(actKey)) {
          seenActionKeys.add(actKey);
          uniqueActions.push(act);
        }
      }

      const today = new Date();
      const fallbackDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Handle proportion adjustments from Gemini AI
      const propAction = uniqueActions.find((a) => a.type === 'update_proportions');
      if (propAction && Array.isArray(propAction.segments) && propAction.segments.length >= 2) {
        const validSegments = propAction.segments.map((seg, idx) => {
          const rawPct = Math.max(2, Math.round(Number(seg.percentage) || 0));
          return {
            name: (seg.name || `Phần ${idx + 1}`).trim(),
            percentage: rawPct,
          };
        });

        const currentTotal = validSegments.reduce((sum, s) => sum + s.percentage, 0);
        if (currentTotal !== 100) {
          const diff = 100 - currentTotal;
          const lastIdx = validSegments.length - 1;
          validSegments[lastIdx].percentage = Math.max(2, validSegments[lastIdx].percentage + diff);
          const adjustedTotal = validSegments.reduce((sum, s) => sum + s.percentage, 0);
          if (adjustedTotal !== 100) {
            validSegments[lastIdx].percentage += (100 - adjustedTotal);
          }
        }

        setProportions((prevProportions) => {
          const mapped: ProportionSegment[] = validSegments.map((item, idx) => {
            const itemNameLower = String(item?.name || '').toLowerCase().trim();
            const existingMatch =
              prevProportions.find(
                (p) => String(p?.name || '').toLowerCase().trim() === itemNameLower
              ) || prevProportions[idx];

            const paletteColor = COLOR_PALETTE[idx % COLOR_PALETTE.length];
            return {
              id: existingMatch?.id || `seg-${Date.now()}-${idx}`,
              name: item.name,
              percentage: item.percentage,
              colorHex: existingMatch?.colorHex || paletteColor.colorHex,
              gradient: existingMatch?.gradient || paletteColor.gradient,
            };
          });

          try {
            localStorage.setItem(PROPORTIONS_STORAGE_KEY, JSON.stringify(mapped));
            if (googleUser) {
              localStorage.setItem(`mks_wallet_proportions_${googleUser.uid}`, JSON.stringify(mapped));
            }
          } catch {
            // ignore
          }

          return mapped;
        });

        const segSummary = validSegments.map((s) => `${s.name}: ${s.percentage}%`).join(' / ');
        results.push(`Tỷ lệ: ${segSummary}`);
      }

      // Handle updating fixed cashflow presets from Gemini AI via helper function
      const fixedPresetActions = uniqueActions.filter((a) => a.type === 'update_fixed_preset');
      if (fixedPresetActions.length > 0) {
        fixedPresetActions.forEach((fAct) => {
          const rawAmount = Math.max(0, Math.round(Number(fAct.amount) || 0));
          if (rawAmount <= 0) return;
          const searchTitle = String(fAct.title || '').trim();
          const targetType = fAct.presetType || (searchTitle.toLowerCase().includes('lương') ? 'inflow' : 'outflow');

          const updateResult = updateFixedPresetFromChatbot(
            searchTitle || (targetType === 'inflow' ? 'Lương' : 'Khoản cố định'),
            targetType,
            rawAmount,
            {
              targetWallet: fAct.targetWallet,
              category: fAct.category as RuleCategory,
              subCategory: fAct.subCategory,
              fromWallet: fAct.fromWallet,
              toWallet: fAct.toWallet,
            }
          );

          if (updateResult.isNew) {
            results.push(`Dòng tiền cố định: Thêm ${updateResult.presetTitle} (${formatVND(rawAmount)}/kỳ)`);
          } else {
            results.push(`Dòng tiền cố định: Cập nhật ${updateResult.presetTitle} (${formatVND(rawAmount)}/kỳ)`);
          }
        });
      }

      const hasVouchers = uniqueActions.some(
        (a) => a.type === 'create_income' || a.type === 'create_expense' || a.type === 'create_savings'
      );
      if (hasVouchers) {
        setSheets((prev) =>
        prev.map((sheet) => {
          if (sheet.id !== activeSheet.id) return sheet;

          let newIncomeList = [...(sheet.incomeVouchers || [])];
          let newExpenseList = [...(sheet.vouchers || [])];
          let newSavingsList = [...(sheet.savingsVouchers || [])];

          uniqueActions.forEach((act) => {
            const rawAmount = Math.max(0, Number(act.amount) || 0);
            if (rawAmount <= 0) return;
            const actDate = act.date || (fallbackDate.startsWith(sheet.id) ? fallbackDate : `${sheet.id}-15`);

            if (act.type === 'create_income') {
              const isDuplicateIncome = newIncomeList.some(
                (existing) =>
                  existing.title.trim().toLowerCase() === (act.title || '').trim().toLowerCase() &&
                  Math.round(existing.amount) === Math.round(rawAmount) &&
                  existing.date === actDate &&
                  Math.abs(Date.now() - (Number(existing.id.split('-')[1]) || 0)) < 6000
              );
              if (isDuplicateIncome) return;

              const defaultWallet = wallets[0]?.key || 'cash';
              const targetWalletSearch = String(act.targetWallet || '').toLowerCase().trim();
              const matchedWallet = wallets.find(
                (w) =>
                  String(w?.key || '').toLowerCase() === targetWalletSearch ||
                  (targetWalletSearch && String(w?.name || '').toLowerCase().includes(targetWalletSearch))
              );
              const targetWallet = matchedWallet ? matchedWallet.key : defaultWallet;

              const newInc: IncomeVoucher = {
                id: `inc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                sheetId: sheet.id,
                title: act.title || 'Khoản thu nhập mới',
                amount: rawAmount,
                targetWallet,
                date: actDate,
                note: act.note,
              };
              newIncomeList = [newInc, ...newIncomeList];
              results.push(`Thu nhập: ${newInc.title} (+${formatVND(newInc.amount)})`);

              if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
                appendIncomeToGoogleSheet(googleToken, spreadsheetInfo.id, {
                  id: newInc.id,
                  date: newInc.date,
                  title: newInc.title,
                  amount: newInc.amount,
                  targetWalletName: wallets.find((w) => w.key === newInc.targetWallet)?.name || newInc.targetWallet,
                }).catch((err) => {
                  if (!handleAuthOrTokenExpiry(err)) {
                    console.warn('Chatbot income auto-sync notice:', err?.message || err);
                  }
                });
              }
            } else if (act.type === 'create_expense') {
              // Check if user specifically requested debt repayment vs debt spending
              const isDebtRepay = Boolean(
                act.debtAction === 'pay' ||
                /thanh toán nợ|trả nợ|tất toán|trả bớt nợ|thanh toán thẻ|trả thẻ/i.test(
                  `${act.title} ${act.note || ''}`
                )
              );

              const isDebtSpend = !isDebtRepay && Boolean(
                act.debtAction === 'spend' ||
                act.debtTarget ||
                act.isDebt ||
                /trừ vào nợ|trừ nợ|quẹt thẻ|thẻ tín dụng|tín dụng|paylater|spaylater|shopee paylater|ghi nợ/i.test(
                  `${act.title} ${act.note || ''} ${act.debtTarget || ''}`
                )
              );

              let resolvedDebtTarget: string | undefined = undefined;
              let resolvedDebtAction: 'spend' | 'pay' | undefined = undefined;

              if (isDebtRepay || isDebtSpend) {
                resolvedDebtAction = isDebtRepay ? 'pay' : 'spend';
                const targetStr = `${act.debtTarget || ''} ${act.title || ''} ${act.note || ''}`.toLowerCase();
                if (targetStr.includes('paylater') || targetStr.includes('spaylater') || targetStr.includes('shopee')) {
                  resolvedDebtTarget = 'shopeePayLater';
                } else if (targetStr.includes('tín dụng') || targetStr.includes('credit') || targetStr.includes('thẻ')) {
                  resolvedDebtTarget = 'creditCard';
                } else if (act.debtTarget && debts.some((d) => d.key === act.debtTarget)) {
                  resolvedDebtTarget = act.debtTarget;
                } else if (debts.length > 0) {
                  resolvedDebtTarget = debts[0].key;
                } else {
                  resolvedDebtTarget = 'creditCard';
                }

                // Ensure the debt account exists in debts state so that remaining debts track it
                setDebts((prevDebts) => {
                  if (prevDebts.some((d) => d.key === resolvedDebtTarget)) return prevDebts;
                  const newMeta: DebtMeta =
                    resolvedDebtTarget === 'shopeePayLater'
                      ? {
                          key: 'shopeePayLater',
                          name: 'Shopee PayLater',
                          shortName: 'PayLater',
                          provider: 'Shopee',
                          isCustom: true,
                        }
                      : {
                          key: resolvedDebtTarget || 'creditCard',
                          name: 'Thẻ tín dụng',
                          shortName: 'Tín dụng',
                          provider: 'Credit Card',
                          isCustom: true,
                        };
                  const updated = [...prevDebts, newMeta];
                  try {
                    localStorage.setItem(DEBTS_STORAGE_KEY, JSON.stringify(updated));
                  } catch {
                    // ignore
                  }
                  return updated;
                });
              }

              const cat: RuleCategory = isDebtRepay
                ? 'savings_debt_20'
                : act.category === 'wants_30' || act.category === 'savings_debt_20'
                ? act.category
                : 'needs_50';

              const subCat =
                act.subCategory ||
                (isDebtRepay
                  ? (resolvedDebtTarget === 'shopeePayLater' ? 'Tất toán PayLater' : 'Trả nợ Thẻ tín dụng')
                  : isDebtSpend
                  ? (resolvedDebtTarget === 'shopeePayLater' ? 'Chi tiêu PayLater' : 'Chi tiêu Thẻ tín dụng')
                  : RULE_50_30_20_META[cat]?.subCategories[0] || 'Chi tiêu');

              // Source wallet for payment:
              const sourceWallet = isDebtSpend
                ? undefined
                : act.sourceWallet ||
                  wallets.find((w) => w?.key === 'bank' || String(w?.name || '').toLowerCase().includes('ngân hàng'))?.key ||
                  wallets[0]?.key ||
                  'cash';

              const isDuplicateExpense = newExpenseList.some(
                (existing) =>
                  existing.title.trim().toLowerCase() === (act.title || '').trim().toLowerCase() &&
                  Math.round(existing.amount) === Math.round(rawAmount) &&
                  existing.date === actDate &&
                  Math.abs(Date.now() - (Number(existing.id.split('-')[1]) || 0)) < 6000
              );
              if (isDuplicateExpense) {
                console.warn('[handleExecuteVoucherActions] Ignored duplicate expense within 6s:', act.title, rawAmount);
                return;
              }

              const newExp: ExpenseVoucher = {
                id: `v-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                sheetId: sheet.id,
                title:
                  act.title ||
                  (isDebtRepay
                    ? (resolvedDebtTarget === 'shopeePayLater' ? 'Tất toán PayLater' : 'Thanh toán Thẻ tín dụng')
                    : isDebtSpend
                    ? 'Chi tiêu ghi nợ'
                    : 'Khoản chi tiêu mới'),
                amount: rawAmount,
                category: cat,
                subCategory: subCat,
                sourceWallet: sourceWallet,
                debtTarget: resolvedDebtTarget,
                debtAction: resolvedDebtAction,
                date: actDate,
                note: act.note,
              };
              newExpenseList = [newExp, ...newExpenseList];

              const debtName =
                resolvedDebtTarget === 'shopeePayLater'
                  ? 'PayLater'
                  : debts.find((d) => d.key === resolvedDebtTarget)?.name || 'Thẻ tín dụng';

              if (isDebtRepay) {
                results.push(`Thanh toán nợ: ${newExp.title} (-${formatVND(newExp.amount)} giảm nợ ${debtName})`);
              } else if (isDebtSpend) {
                results.push(`Ghi nợ: ${newExp.title} (+${formatVND(newExp.amount)} vào ${debtName}, không trừ tiền mặt)`);
              } else {
                results.push(`Chi tiêu: ${newExp.title} (-${formatVND(newExp.amount)})`);
              }

              if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
                const categoryLabel = RULE_50_30_20_META[newExp.category]?.label || newExp.category;
                const debtTargetLabel =
                  resolvedDebtAction === 'spend'
                    ? (resolvedDebtTarget === 'creditCard'
                        ? 'Tín dụng'
                        : resolvedDebtTarget === 'shopeePayLater'
                        ? 'PayLater'
                        : debts.find((d) => d.key === resolvedDebtTarget)?.name || 'Tín dụng')
                    : resolvedDebtAction === 'pay'
                    ? (resolvedDebtTarget === 'creditCard'
                        ? 'TT Tín dụng'
                        : resolvedDebtTarget === 'shopeePayLater'
                        ? 'TT PayLater'
                        : `TT ${debtName}`)
                    : 'Trực tiếp (Số tiền có thể sử dụng)';

                appendExpenseToGoogleSheet(googleToken, spreadsheetInfo.id, {
                  id: newExp.id,
                  date: newExp.date,
                  title: newExp.title,
                  amount: newExp.amount,
                  categoryLabel,
                  subCategory: newExp.subCategory,
                  debtTargetLabel,
                }).catch((err) => {
                  if (!handleAuthOrTokenExpiry(err)) {
                    console.warn('Chatbot expense auto-sync notice:', err?.message || err);
                  }
                });
              }
            } else if (act.type === 'create_savings') {
              const isDuplicateSavings = newSavingsList.some(
                (existing) =>
                  existing.title.trim().toLowerCase() === (act.title || '').trim().toLowerCase() &&
                  Math.round(existing.amount) === Math.round(rawAmount) &&
                  existing.date === actDate &&
                  Math.abs(Date.now() - (Number(existing.id.split('-')[1]) || 0)) < 6000
              );
              if (isDuplicateSavings) {
                console.warn('[handleExecuteVoucherActions] Ignored duplicate savings within 6s:', act.title, rawAmount);
                return;
              }

              const defaultFrom =
                wallets.find((w) => w?.key !== 'savings' && !String(w?.name || '').toLowerCase().includes('tiết kiệm'))?.key ||
                wallets[0]?.key ||
                'cash';
              const defaultTo =
                wallets.find((w) => w?.key === 'savings' || String(w?.name || '').toLowerCase().includes('tiết kiệm'))?.key ||
                'savings';

              const newSav: SavingsVoucher = {
                id: `sav-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                sheetId: sheet.id,
                title: act.title || 'Gửi tiết kiệm tích lũy',
                amount: rawAmount,
                fromWallet: act.fromWallet || defaultFrom,
                toWallet: act.toWallet || defaultTo,
                date: actDate,
                note: act.note,
              };
              newSavingsList = [newSav, ...newSavingsList];
              results.push(`Tiết kiệm: ${newSav.title} (${formatVND(newSav.amount)})`);

              if (googleUser && googleToken && spreadsheetInfo && autoSyncToSheets && !needsTokenReauth) {
                appendSavingsToGoogleSheet(googleToken, spreadsheetInfo.id, {
                  id: newSav.id,
                  date: newSav.date,
                  title: newSav.title,
                  amount: newSav.amount,
                  fromWalletName: wallets.find((w) => w.key === newSav.fromWallet)?.name || newSav.fromWallet,
                  toWalletName: wallets.find((w) => w.key === newSav.toWallet)?.name || newSav.toWallet,
                }).catch((err) => {
                  if (!handleAuthOrTokenExpiry(err)) {
                    console.warn('Chatbot savings auto-sync notice:', err?.message || err);
                  }
                });
              }
            }
          });

          return {
            ...sheet,
            incomeVouchers: removeTwinDuplicateVouchers(newIncomeList),
            vouchers: removeTwinDuplicateVouchers(newExpenseList),
            savingsVouchers: removeTwinDuplicateVouchers(newSavingsList),
          };
        })
      );
    }

    if (results.length > 0) {
      showSyncToast(`✨ Gemini: ${results.join(' · ')}`);
    }

    return results;
    },
    [activeSheet.id, wallets, googleUser, googleToken, spreadsheetInfo, autoSyncToSheets, formatVND, needsTokenReauth, handleAuthOrTokenExpiry]
  );

  // Google Sheets & Drive Action Handlers
  const handleGoogleSignIn = async (andSyncImmediately: boolean = true) => {
    setIsConnectingGoogle(true);
    try {
      const res = await googleSignIn();
      if (res && res.user) {
        setGoogleUser(res.user);
        if (res.accessToken) {
          setGoogleToken(res.accessToken);
        }
        setNeedsTokenReauth(false);
        setSyncStatus('idle');
        // CLEAR LOCAL STORAGE FIRST BEFORE PULLING FRESH DATA FROM GOOGLE SHEET
        clearLocalStorageOnAuthOrRenew(res.user, res.accessToken);
        setShowOnboardingModal(false);

        const effectiveToken = res.accessToken || (await getAccessToken());

        if (effectiveToken && isGoogleOAuthToken(effectiveToken)) {
          setGoogleToken(effectiveToken);
          setNeedsTokenReauth(false);
          setSyncStatus('syncing');
          showSyncToast('Đã đăng nhập & gia hạn tài khoản! Đang đồng bộ dữ liệu...');
          try {
            const userSheetKey = `mks_google_sheet_info_${res.user.uid}`;
            let info: GoogleSpreadsheetInfo | null = null;
            const saved = localStorage.getItem(userSheetKey);
            if (saved) {
              try {
                info = JSON.parse(saved);
              } catch {
                info = null;
              }
            }
            if (!info) {
              info = await findOrCreateSpreadsheet(effectiveToken);
            }
            setSpreadsheetInfo(info);
            localStorage.setItem(userSheetKey, JSON.stringify(info));
            localStorage.setItem('mks_google_sheet_info', JSON.stringify(info));

            // Pull remote data from Google Sheet first
            hasInitialSyncedRef.current = false;
            setIsSyncingSheets(true);
            const syncResult = await syncFromGoogleSheetToApp(effectiveToken, info.id, true);

            if (syncResult && syncResult.mergedSheets) {
              const payload = buildFullSyncPayload(syncResult.mergedSheets);
              const totalLocalVouchers =
                payload.expenses.length + payload.incomes.length + payload.savings.length;
              const remoteVouchers = syncResult.remoteVouchersCount ?? 0;
              const shouldPush =
                syncResult.unsyncedCount > 0 ||
                (remoteVouchers === 0 && totalLocalVouchers > 0) ||
                totalLocalVouchers > remoteVouchers;

              if (shouldPush) {
                const countToPush = syncResult.unsyncedCount > 0 ? syncResult.unsyncedCount : totalLocalVouchers;
                showSyncToast(`Đang đẩy ${countToPush} phiếu đã tạo trước đó lên Google Sheet...`);
                const pushRes = await syncAllDataToGoogleSheet(effectiveToken, info.id, payload);
                lastSyncedPayloadHashRef.current = JSON.stringify(payload);
                hasInitialSyncedRef.current = true;
                setSyncStatus('synced');
                setNeedsTokenReauth(false);
                setLastSyncTime(new Date());
                showSyncToast(
                  `Đã đăng nhập, gia hạn tài khoản và đồng bộ thành công ${pushRes.totalItems} mục lên Google Sheet.`
                );
              } else {
                lastSyncedPayloadHashRef.current = JSON.stringify(payload);
                hasInitialSyncedRef.current = true;
                setSyncStatus('synced');
                setNeedsTokenReauth(false);
                setLastSyncTime(new Date());
                showSyncToast(`Đã đăng nhập, gia hạn tài khoản và đồng bộ ${syncResult.totalItems} mục từ Google Sheet!`);
              }
            }
          } catch (err: any) {
            console.warn('Warning finding/creating spreadsheet:', err?.message);
            showSyncToast('Đã đăng nhập và gia hạn thành công. Đang kết nối file Google Sheet...');
          } finally {
            setIsSyncingSheets(false);
          }
        } else {
          setSyncStatus('synced');
          setNeedsTokenReauth(false);
          showSyncToast('Đã đăng nhập tài khoản Google thành công!');
        }
      } else if (res && res.error) {
        showSyncToast(`Đăng nhập Google: ${res.error}`);
      } else {
        showSyncToast('Đang chuyển hướng sang Google để đăng nhập...');
      }
    } catch (err: any) {
      console.warn('Sign-in status info:', err?.message || err);
      showSyncToast(`Đăng nhập Google: ${err?.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logout();
      setGoogleUser(null);
      setGoogleToken(null);
      setNeedsTokenReauth(false);
      setSyncStatus('idle');
      setSpreadsheetInfo(null);
      hasInitialSyncedRef.current = false;
      lastActiveUidRef.current = null;
      lastSyncedPayloadHashRef.current = '';
      localStorage.removeItem('mks_google_sheet_info');
      // Reset all sheets, presets, wallets and debts back to completely empty guest state
      setSheets(DEFAULT_MONTHLY_SHEETS);
      setFixedPresets([]);
      setWallets([]);
      setDebts([]);
      setProportions(DEFAULT_SEGMENTS);
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PRESETS_STORAGE_KEY);
        localStorage.removeItem(WALLETS_STORAGE_KEY);
        localStorage.removeItem(DEBTS_STORAGE_KEY);
        localStorage.removeItem(ONBOARDING_STORAGE_KEY);
        localStorage.removeItem(PROPORTIONS_STORAGE_KEY);
        localStorage.removeItem('mks_wallet_segmented_proportions_v1');
        localStorage.removeItem('mks_wallet_gemini_chat_history_v5');
        sessionStorage.removeItem('mks_wallet_gemini_chat_session');
      } catch {
        // ignore
      }
      setIsProfileModalOpen(false);
      setShowOnboardingModal(true);
      showSyncToast('Đã đăng xuất Google.');
    } catch (err) {
      console.warn('Sign-out notice:', err);
    }
  };

  const handleToggleAutoSync = () => {
    const nextVal = !autoSyncToSheets;
    setAutoSyncToSheets(nextVal);
    localStorage.setItem('mks_auto_sync_sheets', String(nextVal));
    showSyncToast(
      nextVal
        ? 'Đã bật tự động đẩy phiếu chi lên Google Sheet'
        : 'Đã tắt tự động đẩy phiếu chi'
    );
  };

  // Continuous Auto-Sync states
  const isInitialMount = useRef<boolean>(true);
  const syncTimeoutRef = useRef<any>(null);

  // Helper to compile full payload across all sheets and presets
  const buildFullSyncPayload = useCallback((customSheets?: MonthlySheet[]): FullSyncPayload => {
    const allExpenses: ExpenseRowPayload[] = [];
    const allIncomes: IncomeRowPayload[] = [];
    const allSavings: SavingsRowPayload[] = [];

    const targetSheets = customSheets || sheets;
    targetSheets.forEach((sheet) => {
      const monthLabel = `Tháng ${String(sheet.month).padStart(2, '0')}/${sheet.year}`;

      (sheet.vouchers || []).forEach((v) => {
        const categoryLabel = (v.category && RULE_50_30_20_META[v.category]?.label) || v.category || '50% Thiết yếu';
        const debtTargetLabel =
          v.debtAction === 'spend'
            ? (v.debtTarget === 'creditCard'
                ? 'Tín dụng'
                : v.debtTarget === 'shopeePayLater'
                ? 'PayLater'
                : debts.find((d) => d.key === v.debtTarget)?.name || 'Tín dụng')
            : v.debtTarget === 'creditCard'
            ? 'TT Tín dụng'
            : v.debtTarget === 'shopeePayLater'
            ? 'TT PayLater'
            : v.debtTarget === 'savings_fund'
            ? 'Quỹ tiết kiệm'
            : v.debtTarget
            ? `TT ${debts.find((d) => d.key === v.debtTarget)?.name || v.debtTarget}`
            : 'Trực tiếp (Số tiền có thể sử dụng)';

        allExpenses.push({
          id: v.id,
          monthLabel,
          date: v.date,
          title: v.title,
          amount: Number(v.amount) || 0,
          categoryLabel,
          subCategory: v.subCategory,
          sourceWalletName: wallets.find((w) => w.key === v.sourceWallet)?.name || v.sourceWallet,
          debtTargetLabel,
        });
      });

      (sheet.incomeVouchers || []).forEach((inc) => {
        allIncomes.push({
          id: inc.id,
          monthLabel,
          date: inc.date,
          title: inc.title,
          amount: Number(inc.amount) || 0,
          targetWalletName: wallets.find((w) => w.key === inc.targetWallet)?.name || inc.targetWallet,
        });
      });

      (sheet.savingsVouchers || []).forEach((s) => {
        allSavings.push({
          id: s.id,
          monthLabel,
          date: s.date,
          title: s.title,
          amount: Number(s.amount) || 0,
          fromWalletName: wallets.find((w) => w.key === s.fromWallet)?.name || s.fromWallet,
          toWalletName: wallets.find((w) => w.key === s.toWallet)?.name || s.toWallet,
        });
      });
    });

    const presetPayload: PresetRowPayload[] = deduplicatePresets(fixedPresets || []).map((p) => {
      const walletKey = p.targetWallet || p.fromWallet;
      let catLabel = p.categoryLabel || '';
      if (p.type === 'outflow' && (!catLabel || catLabel.trim() === '')) {
        catLabel = getProportionLabelForCategory(p.category);
      }
      return {
        id: p.id,
        type: p.type,
        typeLabel: p.type === 'inflow' ? 'Thu nhập' : p.type === 'outflow' ? 'Chi tiêu' : 'Tiết kiệm',
        category: p.category,
        categoryLabel: catLabel,
        title: p.title,
        amount: Number(p.amount) || 0,
        walletName: walletKey ? wallets.find((w) => w.key === walletKey)?.name || walletKey : undefined,
      };
    });

    const proportionPayload: ProportionRowPayload[] = (proportions || []).map((p) => ({
      id: p.id,
      name: p.name,
      percentage: p.percentage,
      colorHex: p.colorHex,
      gradient: p.gradient,
    }));

    const initialAccountsPayload: InitialAccountRowPayload[] = [];
    const targetSheetsList = (targetSheets && targetSheets.length > 0) ? targetSheets : (sheets.length > 0 ? sheets : [activeSheet]);

    targetSheetsList.forEach((sheet) => {
      const monthLabel = `Tháng ${String(sheet.month).padStart(2, '0')}/${sheet.year}`;
      const initBal = sheet.initialBalances || {};

      // Nguồn tiền & Tiết kiệm
      wallets.forEach((w) => {
        const isSavings = w.key === 'savings' || w.bankCode === 'SAVINGS' || w.name.toLowerCase().includes('tiết kiệm');
        initialAccountsPayload.push({
          id: w.key,
          type: isSavings ? 'Tiết kiệm' : 'Nguồn tiền',
          name: w.name,
          shortName: w.shortName || w.bankCode || '',
          monthLabel,
          initialAmount: Number(initBal[w.key]) || 0,
        });
      });

      // Công nợ
      debts.forEach((d) => {
        initialAccountsPayload.push({
          id: d.key,
          type: 'Công nợ',
          name: d.name,
          shortName: d.shortName || d.provider || '',
          monthLabel,
          initialAmount: Number(initBal[d.key]) || 0,
        });
      });
    });

    return {
      expenses: removeTwinDuplicateVouchers(allExpenses),
      incomes: removeTwinDuplicateVouchers(allIncomes),
      savings: removeTwinDuplicateVouchers(allSavings),
      presets: presetPayload,
      proportions: proportionPayload,
      initialAccounts: initialAccountsPayload,
      bottomNavOrder,
      goals: goals || [],
    };
  }, [sheets, activeSheet, wallets, debts, fixedPresets, proportions, bottomNavOrder, goals, getProportionLabelForCategory]);

  const handleSaveBottomNavOrder = async (newOrder: BottomNavItemKey[]) => {
    setBottomNavOrder(newOrder);
    try {
      localStorage.setItem(BOTTOM_NAV_STORAGE_KEY, JSON.stringify(newOrder));
    } catch {
      // ignore
    }

    if (googleUser && googleToken && spreadsheetInfo?.id) {
      try {
        setIsSyncingSheets(true);
        const payload = buildFullSyncPayload();
        payload.bottomNavOrder = newOrder;
        await syncAllDataToGoogleSheet(googleToken, spreadsheetInfo.id, payload);
        lastSyncedPayloadHashRef.current = JSON.stringify(payload);
        setLastSyncTime(new Date());
        showSyncToast('Đã lưu & đồng bộ vị trí thanh điều hướng lên Google Sheet!');
      } catch (err: any) {
        console.warn('Sync nav order error:', err);
      } finally {
        setIsSyncingSheets(false);
      }
    } else {
      showSyncToast('Đã cập nhật vị trí thanh điều hướng!');
    }
  };

  // Continuous Auto-Sync to Google Sheets whenever any financial data changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!googleUser || !googleToken || needsTokenReauth || !autoSyncToSheets) {
      return;
    }

    // CRITICAL: Never auto-sync until initial download from Google Sheet has finished!
    if (!hasInitialSyncedRef.current || isPullingRemoteRef.current) {
      return;
    }

    // Immediately show in UI that new changes are queued for auto-syncing
    setSyncStatus('syncing');

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      if (!hasInitialSyncedRef.current || isPullingRemoteRef.current || needsTokenReauth || !googleToken) {
        setSyncStatus('idle');
        return;
      }

      if (isSyncingSheetsRef.current) {
        pendingSyncRef.current = true;
        return;
      }

      try {
        const payload = buildFullSyncPayload();
        const payloadStr = JSON.stringify(payload);

        // Dirty checking: Skip API call if data has not changed since last successful sync
        if (payloadStr === lastSyncedPayloadHashRef.current) {
          setSyncStatus('synced');
          return;
        }

        setIsSyncingSheets(true);
        isSyncingSheetsRef.current = true;

        let sheetToUse = spreadsheetInfo;
        if (!sheetToUse) {
          sheetToUse = await findOrCreateSpreadsheet(googleToken);
          setSpreadsheetInfo(sheetToUse);
          localStorage.setItem('mks_google_sheet_info', JSON.stringify(sheetToUse));
        }

        await syncAllDataToGoogleSheet(googleToken, sheetToUse.id, payload);
        lastSyncedPayloadHashRef.current = payloadStr;

        setSyncStatus('synced');
        setNeedsTokenReauth(false);
        setLastSyncTime(new Date());
      } catch (err: any) {
        if (!handleAuthOrTokenExpiry(err)) {
          console.warn('Continuous auto-sync to Google Sheets notice:', err?.message || err);
          setSyncStatus('error');
        }
      } finally {
        setIsSyncingSheets(false);
        isSyncingSheetsRef.current = false;
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false;
          // Re-trigger auto-sync with latest data
          if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = setTimeout(async () => {
            if (!googleToken) return;
            const newPayload = buildFullSyncPayload();
            const newPayloadStr = JSON.stringify(newPayload);
            if (newPayloadStr !== lastSyncedPayloadHashRef.current) {
              setIsSyncingSheets(true);
              isSyncingSheetsRef.current = true;
              setSyncStatus('syncing');
              try {
                let sheet = spreadsheetInfo;
                if (!sheet) {
                  sheet = await findOrCreateSpreadsheet(googleToken);
                  setSpreadsheetInfo(sheet);
                }
                await syncAllDataToGoogleSheet(googleToken, sheet.id, newPayload);
                lastSyncedPayloadHashRef.current = newPayloadStr;
                setSyncStatus('synced');
                setLastSyncTime(new Date());
              } catch (e: any) {
                if (!handleAuthOrTokenExpiry(e)) setSyncStatus('error');
              } finally {
                setIsSyncingSheets(false);
                isSyncingSheetsRef.current = false;
              }
            }
          }, 300);
        }
      }
    }, 1000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [sheets, wallets, debts, fixedPresets, proportions, bottomNavOrder, goals, googleUser, googleToken, spreadsheetInfo, autoSyncToSheets, buildFullSyncPayload, handleAuthOrTokenExpiry, needsTokenReauth]);

  const handlePullFromSheet = async () => {
    if (!googleUser || !googleToken) {
      handleGoogleSignIn();
      return;
    }
    try {
      let sheetToUse = spreadsheetInfo;
      if (!sheetToUse) {
        sheetToUse = await findOrCreateSpreadsheet(googleToken);
        setSpreadsheetInfo(sheetToUse);
        localStorage.setItem('mks_google_sheet_info', JSON.stringify(sheetToUse));
      }
      const syncResult = await syncFromGoogleSheetToApp(googleToken, sheetToUse.id, false);
      if (syncResult && syncResult.mergedSheets) {
        const payload = buildFullSyncPayload(syncResult.mergedSheets);
        const totalLocalVouchers = payload.expenses.length + payload.incomes.length + payload.savings.length;
        const remoteVouchers = syncResult.remoteVouchersCount ?? 0;
        const shouldPush =
          syncResult.unsyncedCount > 0 ||
          (remoteVouchers === 0 && totalLocalVouchers > 0) ||
          totalLocalVouchers > remoteVouchers;
        if (shouldPush) {
          await syncAllDataToGoogleSheet(googleToken, sheetToUse.id, payload);
          showSyncToast(`Đã đồng bộ & đẩy ${syncResult.unsyncedCount || totalLocalVouchers} phiếu lưu trên máy vào Google Sheet!`);
        }
        lastSyncedPayloadHashRef.current = JSON.stringify(payload);
      }
    } catch (err: any) {
      if (!handleAuthOrTokenExpiry(err)) {
        console.warn('Manual pull from sheet notice:', err?.message || err);
      }
    }
  };

  const handleTriggerSyncNow = async () => {
    if (isSyncingSheets) return;

    if (!googleUser || !googleToken || needsTokenReauth) {
      showSyncToast('Đang kết nối tài khoản Google để tự động đồng bộ ngay...');
      await handleGoogleSignIn(true);
      return;
    }

    setIsSyncingSheets(true);
    setSyncStatus('syncing');
    showSyncToast('Đang tự động đồng bộ ngay với Google Sheet...');
    try {
      let sheetToUse = spreadsheetInfo;
      if (!sheetToUse) {
        sheetToUse = await findOrCreateSpreadsheet(googleToken);
        setSpreadsheetInfo(sheetToUse);
        localStorage.setItem('mks_google_sheet_info', JSON.stringify(sheetToUse));
      }

      // Step 1: Pull from Google Sheet into App to sync any remote edits
      const syncResult = await syncFromGoogleSheetToApp(googleToken, sheetToUse.id, true);

      // Step 2: Push complete merged data from App back to Google Sheet
      const payload = buildFullSyncPayload(syncResult.mergedSheets);
      const res = await syncAllDataToGoogleSheet(
        googleToken,
        sheetToUse.id,
        payload
      );
      lastSyncedPayloadHashRef.current = JSON.stringify(payload);
      setSyncStatus('synced');
      setNeedsTokenReauth(false);
      setLastSyncTime(new Date());
      showSyncToast(
        `Đã tự động đồng bộ thành công ${res.totalItems} mục với Google Sheet!`
      );
    } catch (err: any) {
      if (!handleAuthOrTokenExpiry(err)) {
        console.warn('Sync notice:', err?.message || err);
        setSyncStatus('error');
        showSyncToast(`Lỗi đồng bộ: ${err?.message || 'Vui lòng thử lại'}`);
      }
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleConfirmBulkSync = handleTriggerSyncNow;

  const handleResetAllData = () => {
    const zeroBalances: Record<string, any> = {
      updatedAt: new Date().toISOString(),
      note: 'Đã xóa dữ liệu về 0',
    };
    wallets.forEach((w) => {
      zeroBalances[w.key] = 0;
    });
    debts.forEach((d) => {
      zeroBalances[d.key] = 0;
    });

    const zeroSheets: MonthlySheet[] = [
      {
        id: activeSheet.id,
        month: activeSheet.month,
        year: activeSheet.year,
        label: activeSheet.label,
        createdAt: new Date().toISOString(),
        initialBalances: zeroBalances as any,
        incomeVouchers: [],
        vouchers: [],
        savingsVouchers: [],
      },
    ];
    setSheets(zeroSheets);
    setDraftInitial(zeroBalances as any);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zeroSheets));
    setIsResetAllDataConfirmOpen(false);
    showSyncToast('Đã xóa toàn bộ dữ liệu phiếu và số dư ví về 0!');
  };

  const handleCreateNewMonthlySheet = (e: React.FormEvent) => {
    e.preventDefault();
    const validYear = Number(newYearNum) || new Date().getFullYear();
    const newId = `${validYear}-${String(newMonthNum).padStart(2, '0')}`;
    const existing = sheets.find((s) => s.id === newId);
    if (existing) {
      setActiveSheetId(existing.id);
      setIsNewMonthModalOpen(false);
      return;
    }

    const newInitial: InitialBalanceVoucher =
      rolloverMode === 'rollover'
        ? {
            creditCard: Math.max(0, metrics.remainingDebt.creditCard),
            shopeePayLater: Math.max(0, metrics.remainingDebt.shopeePayLater),
            updatedAt: new Date().toISOString(),
            note: `Kết chuyển tổng số tiền thực tế còn lại từ ${activeSheet.label}`,
          }
        : {
            creditCard: 0,
            shopeePayLater: 0,
            updatedAt: new Date().toISOString(),
            note: `Phiếu khởi tạo mới cho Tháng ${String(newMonthNum).padStart(2, '0')}/${validYear}`,
          };

    wallets.forEach((w, idx) => {
      newInitial[w.key] =
        rolloverMode === 'rollover' && idx === 0
          ? Math.max(0, metrics.totalActualMoneyRemaining)
          : 0;
    });

    const newSheet: MonthlySheet = {
      id: newId,
      month: newMonthNum,
      year: validYear,
      label: `Tháng ${String(newMonthNum).padStart(2, '0')}/${validYear}`,
      createdAt: new Date().toISOString(),
      rolledOverFrom: rolloverMode === 'rollover' ? activeSheet.id : undefined,
      initialBalances: newInitial,
      incomeVouchers: [],
      vouchers: [],
    };

    setSheets((prev) =>
      [...prev, newSheet].sort((a, b) => a.id.localeCompare(b.id))
    );
    setActiveSheetId(newId);
    setIsNewMonthModalOpen(false);
    setActiveSection('initial_voucher');
  };

  const handleDeleteMonthlySheet = (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = monthToDeleteId || activeSheet.id;
    if (sheets.length <= 1) {
      setSheets((prev) =>
        prev.map((s) =>
          s.id === targetId
            ? {
                ...s,
                initialBalances: {
                  mb: 0,
                  ocb: 0,
                  acb: 0,
                  cash: 0,
                  creditCard: 0,
                  shopeePayLater: 0,
                  updatedAt: new Date().toISOString(),
                  note: '',
                },
                incomeVouchers: [],
                vouchers: [],
              }
            : s
        )
      );
      setIsDeleteMonthModalOpen(false);
      return;
    }

    const remaining = sheets.filter((s) => s.id !== targetId);
    setSheets(remaining);
    if (activeSheetId === targetId) {
      setActiveSheetId(remaining[remaining.length - 1].id);
    }
    setIsDeleteMonthModalOpen(false);
  };

  const incomeList = activeSheet.incomeVouchers || [];
  const savingsList = activeSheet.savingsVouchers || [];

  const filteredExpenseVouchers = useMemo(() => {
    if (ledgerFilter === 'income_plus') return [];
    if (ledgerFilter === 'savings_transfer') {
      return activeSheet.vouchers.filter((v) => v.category === 'savings_debt_20');
    }
    return activeSheet.vouchers.filter((v) => {
      if (ledgerFilter !== 'all' && v.category !== ledgerFilter) return false;
      return true;
    });
  }, [activeSheet.vouchers, ledgerFilter]);

  const filteredIncomeVouchers = useMemo(() => {
    if (ledgerFilter !== 'all' && ledgerFilter !== 'income_plus') return [];
    return incomeList;
  }, [incomeList, ledgerFilter]);

  const filteredSavingsVouchers = useMemo(() => {
    if (
      ledgerFilter !== 'all' &&
      ledgerFilter !== 'savings_transfer' &&
      ledgerFilter !== 'savings_debt_20'
    )
      return [];
    return savingsList;
  }, [savingsList, ledgerFilter]);

  // Bộ lọc tra cứu phiếu tức thì đa năng (tên phiếu, số tiền, ngày dd/mm/yyyy, ví/nguồn tiền, thẻ tín dụng, paylater, ghi chú...)
  const matchesSearch = useCallback(
    (item: {
      title?: string;
      amount?: number;
      date?: string;
      category?: RuleCategory;
      subCategory?: string;
      sourceWallet?: string;
      targetWallet?: string;
      fromWallet?: string;
      toWallet?: string;
      debtTarget?: string;
      debtAction?: string;
      note?: string;
      notes?: string;
      [key: string]: any;
    }) => {
      if (!voucherSearchQuery.trim()) return true;
      const rawQ = voucherSearchQuery.trim().toLowerCase();
      const q = rawQ.replace(/\s+/g, ' ');

      // 1. Tên phiếu (Title)
      if (item.title && item.title.toLowerCase().includes(q)) return true;

      // 2. Ghi chú (Note / Notes)
      if (item.note && item.note.toLowerCase().includes(q)) return true;
      if (item.notes && item.notes.toLowerCase().includes(q)) return true;

      // 3. Số tiền (Amount):
      // Hỗ trợ tìm kiếm theo số thô: "500000", có dấu chấm/phẩy: "500.000",
      // hoặc viết tắt tiếng Việt thông dụng như: "50k", "500k", "1tr", "1.5tr", "2m"...
      const itemAmount = Number(item.amount) || 0;
      const itemAmountStr = String(itemAmount);
      const formattedAmount = formatVND(itemAmount).toLowerCase();

      // Check direct format match (e.g. "500.000" or "500.000 đ")
      if (formattedAmount.includes(q)) return true;

      // Check numeric without currency/dots
      const numOnlyQ = q.replace(/[.,\sđvnd₫]/gi, '');
      if (numOnlyQ && itemAmountStr.includes(numOnlyQ)) return true;

      // Check k / tr / triệu / m shorthand
      const shorthandMatch = q.match(/^(\d+(?:[.,]\d+)?)\s*(k|tr|triệu|m)$/);
      if (shorthandMatch) {
        const val = parseFloat(shorthandMatch[1].replace(',', '.'));
        const unit = shorthandMatch[2];
        let targetNum = 0;
        if (unit === 'k') targetNum = val * 1000;
        else if (unit === 'tr' || unit === 'triệu' || unit === 'm') targetNum = val * 1000000;
        if (targetNum > 0 && Math.abs(itemAmount - targetNum) < 1) return true;
      }

      // 4. Ngày tháng (dd/mm/yyyy, yyyy-mm-dd, dd/mm, etc.)
      if (item.date) {
        const rawDate = item.date.trim(); // e.g. "2026-10-29"
        if (rawDate.includes(q)) return true;

        const dateParts = rawDate.split('-');
        if (dateParts.length === 3) {
          const yyyy = dateParts[0];
          const mm = dateParts[1];
          const dd = dateParts[2];
          const numDay = String(parseInt(dd, 10));
          const numMonth = String(parseInt(mm, 10));

          const dateFormats = [
            `${dd}/${mm}/${yyyy}`,
            `${numDay}/${numMonth}/${yyyy}`,
            `${dd}/${mm}`,
            `${numDay}/${numMonth}`,
            `${mm}/${yyyy}`,
            `${numMonth}/${yyyy}`,
            `${dd}-${mm}-${yyyy}`,
            `${dd}-${mm}`,
            `${dd}.${mm}.${yyyy}`,
            `${dd}.${mm}`,
            `ngày ${dd}`,
            `ngày ${numDay}`,
            `tháng ${mm}`,
            `tháng ${numMonth}`,
            `t${mm}`,
            `t${numMonth}`,
          ];

          for (const df of dateFormats) {
            if (df.includes(q) || q.includes(df)) return true;
          }
        }
      }

      // 5. Nguồn tiền / Ví (Wallets: targetWallet, sourceWallet, fromWallet, toWallet)
      const walletKeys = [item.targetWallet, item.sourceWallet, item.fromWallet, item.toWallet].filter(Boolean) as string[];
      for (const wKey of walletKeys) {
        if (wKey.toLowerCase().includes(q)) return true;
        const wMeta = wallets.find((w) => w.key.toLowerCase() === wKey.toLowerCase());
        if (wMeta) {
          if (wMeta.name.toLowerCase().includes(q)) return true;
          if (wMeta.shortName.toLowerCase().includes(q)) return true;
          if (wMeta.bankCode && wMeta.bankCode.toLowerCase().includes(q)) return true;
        }
        if (wKey === 'cash' && ('tiền mặt'.includes(q) || 'cash'.includes(q))) return true;
        if (wKey === 'bank' && ('ngân hàng'.includes(q) || 'tài khoản'.includes(q) || 'bank'.includes(q) || 'ck'.includes(q) || 'chuyển khoản'.includes(q))) return true;
        if ((wKey === 'savings' || wKey.includes('saving')) && ('tiết kiệm'.includes(q) || 'tích lũy'.includes(q) || 'savings'.includes(q))) return true;
      }

      // 6. Thẻ tín dụng, PayLater (debtTarget, debtAction)
      if (item.debtTarget) {
        const dt = item.debtTarget.toLowerCase();
        if (dt.includes(q)) return true;

        const dMeta = debts.find((d) => d.key.toLowerCase() === dt);
        if (dMeta) {
          if (dMeta.name.toLowerCase().includes(q)) return true;
          if (dMeta.shortName.toLowerCase().includes(q)) return true;
          if (dMeta.provider && dMeta.provider.toLowerCase().includes(q)) return true;
        }

        // Specific shortcuts for Credit Card
        if (dt === 'creditcard' || dt.includes('credit')) {
          if ('thẻ tín dụng'.includes(q) || 'tín dụng'.includes(q) || 'credit card'.includes(q) || 'creditcard'.includes(q) || 'thẻ'.includes(q)) {
            return true;
          }
        }

        // Specific shortcuts for Shopee PayLater
        if (dt === 'shopeepaylater' || dt.includes('paylater') || dt.includes('spaylater')) {
          if ('shopee'.includes(q) || 'paylater'.includes(q) || 'spaylater'.includes(q) || 'mua trước trả sau'.includes(q) || 'shopee paylater'.includes(q)) {
            return true;
          }
        }

        // Savings fund as debt target
        if (dt === 'savings_fund' && ('quỹ tiết kiệm'.includes(q) || 'tiết kiệm'.includes(q))) {
          return true;
        }
      }

      // Check debtAction (quẹt thẻ / chi tiêu vs trả nợ)
      if (item.debtAction) {
        if (item.debtAction === 'spend' && ('quẹt thẻ'.includes(q) || 'chi tiêu nợ'.includes(q) || 'tiêu thẻ'.includes(q))) return true;
        if (item.debtAction === 'pay' && ('trả nợ'.includes(q) || 'thanh toán thẻ'.includes(q) || 'trả thẻ'.includes(q))) return true;
      }

      // 7. Phân loại / Hạng mục (SubCategory & Category)
      if (item.subCategory && item.subCategory.toLowerCase().includes(q)) return true;
      if (item.category) {
        const catLabel = getProportionLabelForCategory(item.category).toLowerCase();
        if (catLabel.includes(q)) return true;
        if (item.category.toLowerCase().includes(q)) return true;
        if (item.category === 'needs_50' && ('thiết yếu'.includes(q) || 'needs'.includes(q) || '50%'.includes(q))) return true;
        if (item.category === 'wants_30' && ('linh hoạt'.includes(q) || 'cá nhân'.includes(q) || 'wants'.includes(q) || '30%'.includes(q))) return true;
        if (item.category === 'savings_debt_20' && ('tiết kiệm'.includes(q) || 'trả nợ'.includes(q) || 'savings'.includes(q) || '20%'.includes(q))) return true;
      }

      return false;
    },
    [voucherSearchQuery, formatVND, wallets, debts, getProportionLabelForCategory]
  );

  const searchedIncomeVouchers = useMemo(() => {
    const source = voucherSearchQuery.trim() ? incomeList : filteredIncomeVouchers;
    return source.filter(matchesSearch);
  }, [incomeList, filteredIncomeVouchers, matchesSearch, voucherSearchQuery]);

  const searchedSavingsVouchers = useMemo(() => {
    const source = voucherSearchQuery.trim() ? savingsList : filteredSavingsVouchers;
    return source.filter(matchesSearch);
  }, [savingsList, filteredSavingsVouchers, matchesSearch, voucherSearchQuery]);

  const searchedExpenseVouchers = useMemo(() => {
    const source = voucherSearchQuery.trim() ? activeSheet.vouchers : filteredExpenseVouchers;
    return source.filter(matchesSearch);
  }, [activeSheet.vouchers, filteredExpenseVouchers, matchesSearch, voucherSearchQuery]);

  const searchedTotalCount =
    searchedIncomeVouchers.length +
    searchedExpenseVouchers.length +
    searchedSavingsVouchers.length;



  const ledgerFilterOptions = useMemo<
    {
      id: LedgerFilter;
      label: string;
      count?: number;
      activeClass: string;
    }[]
  >(
    () => {
      const needsCount = (activeSheet.vouchers || []).filter(
        (v) => v.category === 'needs_50'
      ).length;
      const wantsCount = (activeSheet.vouchers || []).filter(
        (v) => v.category === 'wants_30'
      ).length;
      const savingsExpenseCount = (activeSheet.vouchers || []).filter(
        (v) => v.category === 'savings_debt_20'
      ).length;
      const savingsTotalCount = savingsList.length + savingsExpenseCount;

      return [
        {
          id: 'all',
          label: 'Tất cả',
          count:
            (activeSheet.vouchers?.length || 0) +
            (incomeList.length || 0) +
            (savingsList.length || 0),
          activeClass: 'bg-teal-600 text-white',
        },
        {
          id: 'income_plus',
          label: 'Inflow',
          count: incomeList.length,
          activeClass: 'bg-emerald-600 text-white',
        },
        {
          id: 'savings_transfer',
          label: 'Tiết kiệm',
          count: savingsTotalCount,
          activeClass: 'bg-amber-400 text-slate-900 font-bold',
        },
        {
          id: 'needs_50',
          label:
            proportions.find(
              (p) =>
                p.id === 'seg-needs' ||
                p.name.toLowerCase().includes('thiết yếu') ||
                p.name.toLowerCase().includes('nhu cầu')
            )?.name || 'Thiết yếu',
          count: needsCount,
          activeClass: 'bg-teal-600 text-white',
        },
        {
          id: 'wants_30',
          label:
            proportions.find(
              (p) =>
                p.id === 'seg-wants' ||
                p.name.toLowerCase().includes('linh hoạt') ||
                p.name.toLowerCase().includes('cá nhân')
            )?.name || 'Cá nhân',
          count: wantsCount,
          activeClass: 'bg-sky-600 text-white',
        },
      ];
    },
    [activeSheet.vouchers, incomeList.length, savingsList.length, proportions]
  );

  const currentFilterIndex = Math.max(
    0,
    ledgerFilterOptions.findIndex((opt) => opt.id === ledgerFilter)
  );

  const handlePrevLedgerFilter = () => {
    const nextIdx =
      (currentFilterIndex - 1 + ledgerFilterOptions.length) %
      ledgerFilterOptions.length;
    setLedgerFilter(ledgerFilterOptions[nextIdx].id);
  };

  const handleNextLedgerFilter = () => {
    const nextIdx = (currentFilterIndex + 1) % ledgerFilterOptions.length;
    setLedgerFilter(ledgerFilterOptions[nextIdx].id);
  };

  const renderActionMenu = (ref: React.RefObject<HTMLDivElement | null>) => (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setIsMonthMenuOpen(!isMonthMenuOpen);
          setIsMonthPickerOpen(false);
        }}
        aria-label="Tùy chọn"
        className={`min-h-[38px] px-2.5 py-2 rounded-xl border transition-colors flex items-center justify-center cursor-pointer ${
          isMonthMenuOpen
            ? 'border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400 shadow-xs'
            : 'border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-teal-500/50'
        }`}
        title="Tùy chọn"
      >
        <ChevronDown
          className={`w-4 h-4 sm:w-5 sm:h-5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
            isMonthMenuOpen ? 'rotate-180 text-teal-500' : ''
          }`}
        />
      </button>

      {/* Action Dropdown Menu Content */}
      {isMonthMenuOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
          {/* Option 1: Tạo tháng mới */}
          <button
            type="button"
            onClick={() => {
              setIsMonthMenuOpen(false);
              setNewMonthNum(activeSheet.month === 12 ? 1 : activeSheet.month + 1);
              setNewYearNum(activeSheet.month === 12 ? activeSheet.year + 1 : activeSheet.year);
              setIsNewMonthModalOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-teal-600 dark:hover:text-teal-400 transition-colors text-left cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <CalendarPlus className="w-4 h-4" />
            </div>
            <span>Tạo tháng mới</span>
          </button>

          {/* Option 2: Xóa dữ liệu tháng */}
          <button
            type="button"
            onClick={() => {
              setIsMonthMenuOpen(false);
              setMonthToDeleteId(activeSheet.id);
              setIsDeleteMonthModalOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <span>Xóa dữ liệu tháng</span>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {/* Option 3: Chế độ nền (Theme Toggle) */}
          <button
            type="button"
            onClick={() => {
              setDarkMode(!darkMode);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              </div>
              <span>Chế độ nền</span>
            </div>
            <div className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {darkMode ? 'BẬT' : 'TẮT'}
            </div>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {/* Option: Mở Sheet */}
          <button
            type="button"
            onClick={() => {
              setIsMonthMenuOpen(false);
              if (spreadsheetInfo?.url) {
                window.open(spreadsheetInfo.url, '_blank', 'noopener,noreferrer');
              } else {
                showSyncToast('Chưa có file Google Sheet. Vui lòng kết nối tài khoản Google trước.');
              }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-left cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span>Mở Sheet</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 md:pb-12 transition-colors overflow-x-hidden w-full max-w-full">
      {/* TOP BAR */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 w-full overflow-hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-1 sm:gap-4 px-2.5 sm:px-6 h-14">
          {/* Zone 1: Menu icon on the left & MKS Wallet wordmark */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsNavMenuOpen(true)}
              title="Menu danh mục"
              className="p-1.5 -ml-1 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveSection('dashboard');
              }}
              className="text-lg sm:text-2xl font-bold tracking-tight text-teal-600 dark:text-teal-400 hover:text-teal-500 transition-colors whitespace-nowrap shrink-0"
            >
              MKS Wallet
            </a>
          </div>

          {/* Zone 2: Navigation links - ONLY visible on extra large screens (xl:flex), hidden on tablet/mobile so tablet never overflows */}
          <nav className="hidden xl:flex items-center gap-3 xl:gap-5 text-xs lg:text-sm font-medium text-slate-600 dark:text-slate-400">
            <button
              onClick={() => setActiveSection('dashboard')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'dashboard'
                  ? 'text-teal-600 dark:text-teal-400 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Tổng quan
            </button>
            <button
              onClick={() => setActiveSection('initial_voucher')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'initial_voucher'
                  ? 'text-teal-600 dark:text-teal-400 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Phiếu Đầu tháng
            </button>
            <button
              onClick={() => setActiveSection('expense_vouchers')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'expense_vouchers'
                  ? 'text-teal-600 dark:text-teal-400 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sổ Phiếu<span className="hidden 2xl:inline"> ({activeSheet.vouchers.length + incomeList.length + savingsList.length})</span>
            </button>
            <button
              onClick={() => setActiveSection('fixed_presets')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'fixed_presets'
                  ? 'text-teal-600 dark:text-teal-400 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Cố định<span className="hidden 2xl:inline"> ({fixedPresets.length})</span>
            </button>
            <button
              onClick={() => setActiveSection('financial_goals')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'financial_goals'
                  ? 'text-teal-600 dark:text-teal-400 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Mục tiêu<span className="hidden 2xl:inline"> ({goals.length})</span>
            </button>
          </nav>

          {/* Zone 3: Inflow, Outflow, Savings, Quét Bill, Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 1. Inflow (+ Thu nhập) */}
            <button
              type="button"
              onClick={() => setIsIncomeModalOpen(true)}
              title="Thu nhập (+ Inflow)"
              aria-label="Thu nhập"
              className="h-8 w-8 sm:h-9 sm:w-9 text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shrink-0 cursor-pointer inline-flex items-center justify-center shadow-xs active:scale-95 box-border"
            >
              <ArrowDownLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0 stroke-[2.5]" />
            </button>

            {/* 2. Outflow (− Chi tiêu) */}
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              title="Chi tiêu (− Outflow)"
              aria-label="Chi tiêu"
              className="h-8 w-8 sm:h-9 sm:w-9 text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors shrink-0 cursor-pointer inline-flex items-center justify-center shadow-xs active:scale-95 box-border"
            >
              <ArrowUpRight className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0 stroke-[2.5]" />
            </button>

            {/* 3. Tiết kiệm (Giữ nguyên con heo) */}
            <button
              type="button"
              onClick={handleOpenSavingsModal}
              title="Tiết kiệm (Savings)"
              aria-label="Tiết kiệm"
              className="h-8 w-8 sm:h-9 sm:w-9 text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shrink-0 cursor-pointer inline-flex items-center justify-center shadow-xs active:scale-95 box-border"
            >
              <PiggyBank className="w-4 h-4 shrink-0" />
            </button>

            {/* Profile / Hồ sơ button (opens Google Drive & Profile modal) */}
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              title="Hồ sơ & Đồng bộ Google Drive"
              className="h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-2xs box-border"
            >
              {googleUser ? (
                <>
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || 'Google'}
                      className="w-5 h-5 sm:w-4 sm:h-4 rounded-full object-cover shrink-0 border border-emerald-400"
                    />
                  ) : (
                    <div className="w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {(googleUser.displayName || googleUser.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline font-semibold">Hồ sơ</span>
                  {isSyncingSheets ? (
                    <RefreshCw className="w-2.5 h-2.5 text-teal-500 animate-spin shrink-0" />
                  ) : syncStatus === 'error' || needsTokenReauth ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 hidden sm:inline-block" title="Google Sheets cần gia hạn phiên" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0 hidden sm:inline-block" title="Google Drive đã kết nối" />
                  )}
                </>
              ) : (
                <>
                  <UserIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="hidden sm:inline font-semibold">Hồ sơ</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-8">
        {/* WORKSPACE TOOLBAR: Month Selector and Action Menu */}
        <section className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {/* Title replaced by Month Picker Trigger with big formatting */}
            <div className="relative" ref={monthPickerRef}>
              <button
                type="button"
                onClick={() => {
                  setPickerYear(activeSheet.year);
                  setIsMonthPickerOpen(!isMonthPickerOpen);
                  setIsMonthMenuOpen(false);
                }}
                title="Mở lịch chọn tháng chi tiết"
                aria-label="Mở lịch chọn tháng chi tiết"
                className="group px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl border-2 border-teal-500 dark:border-teal-400 bg-teal-500/5 dark:bg-teal-500/10 hover:bg-teal-500/15 dark:hover:bg-teal-500/20 hover:border-teal-600 dark:hover:border-teal-300 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 transition-all cursor-pointer text-left shadow-xs inline-flex items-center"
              >
                <span>
                  Tháng {String(activeSheet.month).padStart(2, '0')}/{activeSheet.year}
                </span>
              </button>

              {/* Month Picker: Centered modal on mobile (<sm), anchored dropdown on desktop/tablet (sm:) */}
              {isMonthPickerOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs sm:bg-transparent sm:backdrop-blur-none sm:p-0 sm:inset-auto sm:left-0 sm:top-full sm:mt-2 sm:absolute sm:block"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setIsMonthPickerOpen(false);
                    }
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-xs sm:w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                  >
                    {/* Year Header with Prev/Next Controls & Mobile Close Button */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPickerYear((y) => y - 1)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Năm trước"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white flex items-center justify-center">
                        <span>{pickerYear}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPickerYear((y) => y + 1)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Năm sau"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsMonthPickerOpen(false)}
                          className="sm:hidden p-1.5 ml-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Đóng lịch"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 12 Months Grid */}
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const sheetIdForMonth = `${pickerYear}-${String(m).padStart(2, '0')}`;
                        const existingSheet = sheets.find((s) => s.id === sheetIdForMonth);
                        const isCurrentActive = activeSheet.id === sheetIdForMonth;

                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              if (existingSheet) {
                                setActiveSheetId(existingSheet.id);
                                setIsMonthPickerOpen(false);
                              } else {
                                // If sheet doesn't exist, prompt to create this month
                                setNewMonthNum(m);
                                setNewYearNum(pickerYear);
                                setIsNewMonthModalOpen(true);
                                setIsMonthPickerOpen(false);
                              }
                            }}
                            className={`relative py-2 sm:py-2.5 px-1 sm:px-2 rounded-xl text-xs font-medium font-mono text-center transition-all cursor-pointer ${
                              isCurrentActive
                                ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20 ring-2 ring-teal-500 ring-offset-2 dark:ring-offset-slate-900'
                                : existingSheet
                                ? 'bg-slate-100 dark:bg-slate-800/80 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 hover:border-teal-500/40 border border-slate-200 dark:border-slate-700 font-semibold'
                                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800'
                            }`}
                            title={
                              isCurrentActive
                                ? `Đang chọn Tháng ${m}/${pickerYear}`
                                : existingSheet
                                ? `Chuyển tới Tháng ${m}/${pickerYear}`
                                : `Tạo dữ liệu cho Tháng ${m}/${pickerYear}`
                            }
                          >
                            <div className="text-xs sm:text-sm font-semibold">T{m}</div>
                            {existingSheet && !isCurrentActive && (
                              <span className="block w-1 h-1 rounded-full bg-teal-500 mx-auto mt-0.5" />
                            )}
                            {!existingSheet && (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block leading-none mt-0.5 font-sans">
                                + Tạo
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Footer Helpers */}
                    <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          const currentId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                          const match = sheets.find((s) => s.id === currentId);
                          if (match) {
                            setActiveSheetId(match.id);
                          } else {
                            setNewMonthNum(now.getMonth() + 1);
                            setNewYearNum(now.getFullYear());
                            setIsNewMonthModalOpen(true);
                          }
                          setIsMonthPickerOpen(false);
                        }}
                        className="hover:text-teal-600 dark:hover:text-teal-400 font-medium cursor-pointer"
                      >
                        Tháng hiện tại
                      </button>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                        <span>Có dữ liệu</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Unified Action Dropdown Menu */}
          <div>
            {renderActionMenu(monthMenuRef)}
          </div>
        </section>

        {/* KPI SUMMARY STRIP: NET WORTH & MONTHLY SPENDING */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Dominant Anchor: Remaining Usable Money */}
          <div
            className="p-5 rounded-2xl bg-gradient-to-br from-teal-600 to-sky-700 text-white shadow-sm"
            title="Tiền sử dụng còn lại = Số tiền thực tế + Số nợ hiện tại - Số tiền tiết kiệm"
          >
            <div className="text-xs font-medium text-teal-100">
              Tiền sử dụng còn lại
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1.5">
              {formatVND(metrics.remainingUsableMoney)}
            </div>
            <div className="flex items-center justify-between text-xs text-teal-100/90 mt-2 font-mono tabular-nums">
              <span>Tiền thực tế:</span>
              <span className="font-semibold text-right">{formatVND(metrics.currentNetWorth)}</span>
            </div>
          </div>

          {/* Total Monthly Spending */}
          <div
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            title={`Tổng số tiền tiêu trong tháng: ${formatVND(metrics.totalSpent)}`}
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tổng số tiền tiêu trong tháng
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1.5">
              {formatVND(metrics.totalSpent)}
            </div>
            <div className="mt-2 space-y-1.5 text-xs font-mono tabular-nums">
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                <span>Inflow:</span>
                <span className="font-semibold text-right">{formatVND(metrics.totalAddedIncome)}</span>
              </div>
              <div
                className="flex items-center justify-between text-amber-500 dark:text-amber-400 font-medium"
                title="Số dư hiện tại của tài khoản tiết kiệm (Số tiền đầu tháng + Tiền gửi tiết kiệm trong tháng)"
              >
                <span>Savings:</span>
                <span className="font-semibold text-right">{formatVND(metrics.currentSavingsBalance)}</span>
              </div>
              <div
                className="flex items-center justify-between text-rose-500 dark:text-rose-400 font-medium"
                title="Tổng số nợ hiện tại (Dư nợ còn lại chưa thanh toán)"
              >
                <span>Debt:</span>
                <span className="font-semibold text-right">{formatVND(metrics.totalRemainingDebts)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: FIXED PRESETS MANAGER ("CỐ ĐỊNH") */}
        {activeSection === 'fixed_presets' && (
          <section className="space-y-6">
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all">
              <div
                className={`flex items-center justify-between cursor-pointer select-none transition-all ${
                  isFixedPresetsSectionOpen
                    ? 'pb-5 border-b border-slate-200 dark:border-slate-800'
                    : ''
                }`}
                onClick={() => setIsFixedPresetsSectionOpen(!isFixedPresetsSectionOpen)}
              >
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Dòng tiền cố định
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFixedPresetsSectionOpen(!isFixedPresetsSectionOpen);
                  }}
                  title={isFixedPresetsSectionOpen ? 'Thu gọn các mục bên dưới' : 'Hiện các mục bên dưới'}
                  aria-label="Mở rộng / thu gọn dòng tiền cố định"
                  className="w-10 h-10 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-xs"
                >
                  <ChevronDown
                    className={`w-5 h-5 transition-transform duration-300 ${
                      isFixedPresetsSectionOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Three Columns: Thu nhập vs Chi tiêu vs Tiết kiệm - hiện ra khi bấm mở */}
              {isFixedPresetsSectionOpen && (
                <div className="animate-in fade-in zoom-in-95 duration-150">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-5">
                {/* Fixed Inflow List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        Thu nhập
                      </h3>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                        ({inflowPresets.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAddFixedPresetForType('inflow')}
                        title="Thêm mục Thu nhập cố định mới"
                        aria-label="Thêm mục Thu nhập cố định mới"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setManagingFixedCategory('inflow')}
                        title="Chỉnh sửa / quản lý các mục Thu nhập"
                        aria-label="Chỉnh sửa / quản lý các mục Thu nhập"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFixedCategoryToDelete('inflow')}
                        title="Xóa các mục Thu nhập"
                        aria-label="Xóa các mục Thu nhập"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {inflowPresets.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      Chưa có mục thu nhập cố định nào.
                    </p>
                  ) : (
                    inflowPresets.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700 flex flex-col gap-2.5 transition-all shadow-xs"
                      >
                        <div className="flex items-center justify-between min-w-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditFixedPreset(item)}
                            className="text-left text-sm font-bold text-slate-900 dark:text-white truncate hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer flex-1"
                            title={`Bấm để chỉnh sửa ${item.title}`}
                          >
                            {item.title}
                          </button>
                        </div>

                        <div className="flex items-center justify-end">
                          <span className="font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {formatVND(item.amount || 0)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Fixed Outflow List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
                        Chi tiêu
                      </h3>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                        ({outflowPresets.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAddFixedPresetForType('outflow')}
                        title="Thêm mục Chi tiêu cố định mới"
                        aria-label="Thêm mục Chi tiêu cố định mới"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setManagingFixedCategory('outflow')}
                        title="Chỉnh sửa / quản lý các mục Chi tiêu"
                        aria-label="Chỉnh sửa / quản lý các mục Chi tiêu"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFixedCategoryToDelete('outflow')}
                        title="Xóa các mục Chi tiêu"
                        aria-label="Xóa các mục Chi tiêu"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {outflowPresets.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      Chưa có mục chi tiêu cố định nào.
                    </p>
                  ) : (
                    outflowPresets.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700 flex flex-col gap-2.5 transition-all shadow-xs"
                      >
                        <div className="flex items-center justify-between min-w-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditFixedPreset(item)}
                            className="text-left text-sm font-bold text-slate-900 dark:text-white truncate hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer flex-1"
                            title={`Bấm để chỉnh sửa ${item.title}`}
                          >
                            {item.title}
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          {item.category ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {getProportionLabelForCategory(item.category)}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span className="font-mono tabular-nums text-xs font-bold text-rose-600 dark:text-rose-400">
                            {formatVND(item.amount || 0)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Fixed Savings List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400">
                        Tiết kiệm
                      </h3>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                        ({savingsPresets.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAddFixedPresetForType('savings')}
                        title="Thêm mục Tiết kiệm cố định mới"
                        aria-label="Thêm mục Tiết kiệm cố định mới"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 cursor-pointer transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setManagingFixedCategory('savings')}
                        title="Chỉnh sửa / quản lý các mục Tiết kiệm"
                        aria-label="Chỉnh sửa / quản lý các mục Tiết kiệm"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 cursor-pointer transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFixedCategoryToDelete('savings')}
                        title="Xóa các mục Tiết kiệm"
                        aria-label="Xóa các mục Tiết kiệm"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {savingsPresets.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      Chưa có mục tiết kiệm cố định nào.
                    </p>
                  ) : (
                    savingsPresets.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700 flex flex-col gap-2.5 transition-all shadow-xs"
                      >
                        <div className="flex items-center justify-between min-w-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditFixedPreset(item)}
                            className="text-left text-sm font-bold text-slate-900 dark:text-white truncate hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer flex-1"
                            title={`Bấm để chỉnh sửa ${item.title}`}
                          >
                            {item.title}
                          </button>
                        </div>

                        <div className="flex items-center justify-end">
                          <span className="font-mono tabular-nums text-xs font-bold text-amber-600 dark:text-amber-400">
                            {formatVND(item.amount || 0)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ĐIỀU CHỈNH TỶ LỆ (SEGMENTED PROPORTION BAR) */}
        <SegmentedProportionBar
          segments={proportions}
          onSegmentsChange={setProportions}
        />
      </section>
    )}


        {/* INITIAL BALANCE VOUCHER EDITOR */}
        {activeSection === 'initial_voucher' && (
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {(() => {
              const draftTotalAssets = wallets.reduce(
                (sum, w) => sum + (Number(draftInitial[w.key]) || 0),
                0
              );
              const draftTotalDebts = debts.reduce(
                (sum, d) => sum + (Number(draftInitial[d.key]) || 0),
                0
              );

              return (
                <>
                  <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Thống kê {activeSheet.label.toLowerCase().startsWith('tháng') ? activeSheet.label.toLowerCase() : 'tháng ' + activeSheet.label}
                    </h2>
                  </div>

                  {/* Summary Cards: Tổng Tài Sản Đầu Tháng, Tổng Nợ Đầu Tháng & Tài sản ròng đầu tháng dự kiến */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Tổng Tài Sản Đầu Tháng
                      </div>
                      <div className="text-right font-mono tabular-nums text-base font-bold text-teal-600 dark:text-teal-400 mt-1 whitespace-nowrap">
                        {formatVND(draftTotalAssets)}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Tổng Nợ Đầu Tháng
                      </div>
                      <div className="text-right font-mono tabular-nums text-base font-bold text-rose-600 dark:text-rose-400 mt-1 whitespace-nowrap">
                        {formatVND(draftTotalDebts)}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Tài sản ròng đầu tháng dự kiến
                      </div>
                      <div className={`text-right font-mono tabular-nums text-base font-bold mt-1 whitespace-nowrap ${
                        draftTotalAssets - draftTotalDebts >= 0
                          ? 'text-teal-600 dark:text-teal-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {formatVND(draftTotalAssets - draftTotalDebts)}
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSaveInitialBalances} className="mt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Assets Input Group */}
                      <div className="space-y-6">
                        {/* Nguồn tiền */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-1">
                            <h3 className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                              Nguồn tiền
                            </h3>
                            <button
                              type="button"
                              onClick={handleOpenAddWallet}
                              title="Thêm nguồn tiền mới"
                              aria-label="Thêm nguồn tiền"
                              className="p-1 rounded-lg bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          {wallets.filter((w) => !isSavingsWallet(w)).length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {googleUser
                                  ? 'Chưa có nguồn tiền nào. Hãy bấm "+" để thêm nguồn tiền mới.'
                                  : 'Chưa có nguồn tiền nào trong chế độ khách. Đăng nhập Google để đồng bộ nguồn tiền của bạn, hoặc bấm "+" để tự thêm.'}
                              </p>
                              <button
                                type="button"
                                onClick={handleOpenAddWallet}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm nguồn tiền mới</span>
                              </button>
                            </div>
                          ) : (
                            wallets
                              .filter((w) => !isSavingsWallet(w))
                              .map((wallet, _, regularList) => (
                                <div
                                  key={wallet.key}
                                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 transition-colors hover:border-teal-500/30"
                                >
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                      {wallet.name}
                                    </label>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditWallet(wallet)}
                                        title="Đổi tên nguồn tiền"
                                        className="p-1 rounded-md text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-500/10 transition-colors cursor-pointer"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      {regularList.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => setWalletToDelete(wallet)}
                                          title="Xóa nguồn tiền này"
                                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="0"
                                    value={
                                      draftInitial[wallet.key] !== undefined && draftInitial[wallet.key] !== null
                                        ? draftInitial[wallet.key]
                                        : ''
                                    }
                                    onFocus={(e) => {
                                      if (e.target.value === '0') e.target.select();
                                    }}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDraftInitial((prev) => ({
                                        ...prev,
                                        [wallet.key]: val,
                                      }));
                                    }}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                                  />
                                </div>
                              ))
                          )}
                        </div>

                        {/* Tiết kiệm */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-1">
                            <h3 className="text-sm font-semibold text-amber-500 dark:text-amber-400">
                              Tiết kiệm
                            </h3>
                            <button
                              type="button"
                              onClick={handleOpenAddSavingsWallet}
                              title="Thêm mục tiết kiệm mới"
                              aria-label="Thêm mục tiết kiệm"
                              className="p-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          {wallets.filter(isSavingsWallet).length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-amber-300 dark:border-amber-800 text-center space-y-2">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Chưa có mục tiết kiệm nào. Hãy bấm "+" để thêm mục tiết kiệm mới.
                              </p>
                              <button
                                type="button"
                                onClick={handleOpenAddSavingsWallet}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Thêm mục tiết kiệm</span>
                              </button>
                            </div>
                          ) : (
                            wallets
                              .filter(isSavingsWallet)
                              .map((wallet, _, savingsList) => (
                                <div
                                  key={wallet.key}
                                  className="p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-2 transition-colors hover:border-amber-500/40"
                                >
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                      {wallet.name}
                                    </label>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditWallet(wallet)}
                                        title="Đổi tên mục tiết kiệm"
                                        className="p-1 rounded-md text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      {savingsList.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => setWalletToDelete(wallet)}
                                          title="Xóa mục tiết kiệm này"
                                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="0"
                                    value={
                                      draftInitial[wallet.key] !== undefined && draftInitial[wallet.key] !== null
                                        ? draftInitial[wallet.key]
                                        : ''
                                    }
                                    onFocus={(e) => {
                                      if (e.target.value === '0') e.target.select();
                                    }}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDraftInitial((prev) => ({
                                        ...prev,
                                        [wallet.key]: val,
                                      }));
                                    }}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Liabilities Input Group */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-1">
                          <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                            Công nợ
                          </h3>
                          <button
                            type="button"
                            onClick={handleOpenAddDebt}
                            title="Thêm khoản nợ mới"
                            aria-label="Thêm khoản nợ"
                            className="p-1 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        {debts.length === 0 ? (
                          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {googleUser
                                ? 'Chưa có khoản nợ nào. Hãy bấm "+" để thêm khoản nợ mới.'
                                : 'Chưa có khoản nợ nào trong chế độ khách. Đăng nhập Google để đồng bộ dữ liệu, hoặc bấm "+" để tự thêm.'}
                            </p>
                            <button
                              type="button"
                              onClick={handleOpenAddDebt}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm khoản nợ mới</span>
                            </button>
                          </div>
                        ) : (
                          debts.map((debt) => (
                            <div
                              key={debt.key}
                              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 transition-colors hover:border-rose-500/30"
                            >
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {debt.name}
                                </label>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDebt(debt)}
                                    title="Đổi tên / sửa khoản nợ"
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  {debts.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setDebtToDelete(debt)}
                                      title="Xóa khoản nợ này"
                                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                placeholder="0"
                                value={
                                  draftInitial[debt.key] !== undefined && draftInitial[debt.key] !== null
                                    ? draftInitial[debt.key]
                                    : ''
                                }
                                onFocus={(e) => {
                                  if (e.target.value === '0') e.target.select();
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDraftInitial((prev) => ({
                                    ...prev,
                                    [debt.key]: val,
                                  }));
                                }}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      {initialSavedFeedback && (
                        <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                          Đã cập nhật Phiếu số dư đầu tháng thành công!
                        </span>
                      )}
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Lưu Phiếu Đầu Tháng
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </section>
        )}

        {/* 50-30-20 PIE CHART & VISUAL ANALYTICS */}
        {activeSection === 'dashboard' && (
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Biểu Đồ Phân Bổ Chi Tiêu
              </h2>
            </div>

            <div className="mt-5">
              <PieChart503020
                vouchers={metrics.chartVouchers}
                savingsAmount={metrics.totalSavingsInMonth}
                monthlySalary={metrics.monthlySalary}
                formatVND={formatVND}
                proportions={proportions}
              />
            </div>
          </section>
        )}

        {/* VOUCHERS LEDGER (BOTH INFLOW + AND OUTFLOW -) */}
        {(activeSection === 'dashboard' || activeSection === 'expense_vouchers') && (
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            {/* Header: Tiêu đề + Bộ lọc ngang & Thanh tra cứu */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800 transition-all">
              {/* Tiêu đề "Phiếu trong tháng" - Luôn luôn hiển thị */}
              <div className="flex items-center gap-2 shrink-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white shrink-0">
                  Phiếu trong tháng
                </h2>
                {voucherSearchQuery.trim() && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/80">
                    Đang lọc: &ldquo;{voucherSearchQuery}&rdquo;
                  </span>
                )}
              </div>

              {/* Khu vực bên phải: Cụm thanh lọc + Nút kính lúp HOẶC Bung rộng ô tìm kiếm khi bấm */}
              <div className="flex items-center gap-2 w-full sm:w-80 md:w-96 lg:w-[420px] shrink-0 justify-end">
                {!isVoucherSearchOpen ? (
                  <div className="w-full flex items-center gap-2 animate-in fade-in duration-150">
                    {/* Horizontal Arrow Selector (Cụm thanh lọc mở rộng bằng ô search) */}
                    <div ref={ledgerFilterRef} className="relative flex-1 min-w-0">
                      <div className="h-10 flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
                        {/* Left Arrow Button */}
                        <button
                          type="button"
                          onClick={handlePrevLedgerFilter}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                          title="Mục trước"
                          aria-label="Mục trước"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        {/* Active Option Display (Clickable to open dropdown) */}
                        <button
                          type="button"
                          onClick={() => setIsLedgerFilterDropdownOpen((prev) => !prev)}
                          className={`flex-1 min-w-0 h-8 px-2.5 sm:px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-between gap-1.5 cursor-pointer shadow-xs ${ledgerFilterOptions[currentFilterIndex].activeClass}`}
                          title="Bấm để xem tất cả lựa chọn"
                        >
                          <span className="truncate">
                            {ledgerFilterOptions[currentFilterIndex].label}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {ledgerFilterOptions[currentFilterIndex].count !== undefined && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/20 text-current font-mono">
                                {ledgerFilterOptions[currentFilterIndex].count}
                              </span>
                            )}
                            <ChevronDown className="w-3 h-3 opacity-70" />
                          </div>
                        </button>

                        {/* Right Arrow Button */}
                        <button
                          type="button"
                          onClick={handleNextLedgerFilter}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                          title="Mục tiếp theo"
                          aria-label="Mục tiếp theo"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Dropdown Menu when clicking active option */}
                      {isLedgerFilterDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1.5 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Chọn bộ lọc phiếu
                          </div>
                          {ledgerFilterOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setLedgerFilter(opt.id);
                                setIsLedgerFilterDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                ledgerFilter === opt.id
                                  ? 'bg-slate-100 dark:bg-slate-800 text-teal-600 dark:text-teal-400 font-bold'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {opt.count !== undefined && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                                  {opt.count}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Nút Tìm kiếm [ 🔍 ] */}
                    <button
                      type="button"
                      onClick={() => setIsVoucherSearchOpen(true)}
                      className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-all cursor-pointer shadow-xs shrink-0 ${
                        voucherSearchQuery.trim()
                          ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500/60 text-teal-600 dark:text-teal-400 ring-2 ring-teal-500/20'
                          : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                      }`}
                      title={voucherSearchQuery.trim() ? `Đang lọc: "${voucherSearchQuery}" (Bấm để bung tìm kiếm)` : 'Tìm kiếm phiếu'}
                      aria-label="Tìm kiếm phiếu"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Khi bấm vào kính lúp: Cụm thanh lọc tự động thu gọn, ô search bung rộng, cùng kích thước chiều ngang */
                  <div
                    ref={voucherSearchRef}
                    className="w-full flex items-center gap-2 animate-in fade-in duration-150"
                  >
                    <div className="relative flex-1 flex items-center h-10 min-w-0">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400 pointer-events-none" />
                      <input
                        ref={voucherSearchInputRef}
                        type="text"
                        value={voucherSearchQuery}
                        onChange={(e) => setVoucherSearchQuery(e.target.value)}
                        placeholder="Tìm theo tên, tiền (500k, 1tr...), ngày (dd/mm/yyyy)..."
                        className="w-full h-full pl-9 pr-20 sm:pr-24 text-xs sm:text-sm bg-slate-100 dark:bg-slate-950 border border-teal-500/60 dark:border-teal-500/60 ring-2 ring-teal-500/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:bg-white dark:focus:bg-slate-900 transition-all shadow-inner"
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setVoucherSearchQuery('');
                            setIsVoucherSearchOpen(false);
                          }
                        }}
                      />

                      {/* Vùng chỉ báo số kết quả & nút xóa nhanh từ khóa bên trong input */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {voucherSearchQuery.trim() && (
                          <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800/80 px-1.5 py-0.5 rounded-md hidden xs:inline-block font-mono">
                            {searchedTotalCount} kết quả
                          </span>
                        )}
                        {voucherSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setVoucherSearchQuery('')}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Xóa từ khóa tìm kiếm"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Nút [✕] đóng nhanh và xóa từ khóa, khôi phục lại cụm thanh lọc */}
                    <button
                      type="button"
                      onClick={() => {
                        setVoucherSearchQuery('');
                        setIsVoucherSearchOpen(false);
                      }}
                      className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer shrink-0 shadow-xs"
                      title="Đóng tìm kiếm & khôi phục thanh lọc (Esc)"
                      aria-label="Đóng tìm kiếm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>



            {/* Vouchers List */}
            {searchedTotalCount === 0 ? (
              <div className="py-12 text-center">
                {voucherSearchQuery.trim() ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Không tìm thấy phiếu nào khớp với từ khóa &ldquo;<strong className="text-slate-800 dark:text-slate-200">{voucherSearchQuery}</strong>&rdquo;.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setVoucherSearchQuery('');
                        setIsVoucherSearchOpen(false);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      Xóa từ khóa tra cứu
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Chưa có phiếu nào khớp với bộ lọc hiện tại trong {activeSheet.label}.
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <button
                        onClick={() => setIsIncomeModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                        <span>Inflow</span>
                      </button>
                      <button
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                        <span>Outflow</span>
                      </button>
                      <button
                        onClick={handleOpenSavingsModal}
                        title="Tiết kiệm (Savings)"
                        className="p-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 transition-colors cursor-pointer flex items-center justify-center shadow-xs"
                      >
                        <PiggyBank className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 mt-2">
                {/* Render Income Vouchers First */}
                {searchedIncomeVouchers.map((inc) => {
                  return (
                    <div
                      key={inc.id}
                      className="py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-950/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-xs shrink-0 bg-emerald-500" />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {inc.title}
                            </span>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 text-right sm:hidden">
                            {formatVietnameseDate(inc.date)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                        <span className="hidden sm:inline-block text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatVietnameseDate(inc.date)}
                        </span>
                        <span className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatVND(inc.amount)}
                        </span>
                        <button
                          onClick={() => handleDeleteIncomeVoucher(inc.id)}
                          title="Xóa phiếu Inflow này"
                          className="min-h-[36px] min-w-[36px] p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Render Savings Vouchers */}
                {searchedSavingsVouchers.map((sav) => {
                  return (
                    <div
                      key={sav.id}
                      className="py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-950/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-xs shrink-0 bg-amber-400" />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {sav.title}
                            </span>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 text-right sm:hidden">
                            {formatVietnameseDate(sav.date)}
                          </span>
                        </div>
                        {sav.note && (
                          <div className="text-[11px] text-slate-400 italic truncate">
                            {sav.note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                        <span className="hidden sm:inline-block text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatVietnameseDate(sav.date)}
                        </span>
                        <span className="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          ⇄ {formatVND(sav.amount)}
                        </span>
                        <button
                          onClick={() => handleDeleteSavingsVoucher(sav.id)}
                          title="Xóa phiếu Savings này"
                          className="min-h-[36px] min-w-[36px] p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Render Expense Vouchers */}
                {searchedExpenseVouchers.map((voucher) => {
                  const catMeta = RULE_50_30_20_META[voucher.category] || RULE_50_30_20_META.needs_50;

                  return (
                    <div
                      key={voucher.id}
                      className="py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-950/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: catMeta.colorHex }}
                            />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {voucher.title}
                            </span>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0 text-right sm:hidden">
                            {formatVietnameseDate(voucher.date)}
                          </span>
                        </div>
                        {voucher.debtTarget && voucher.debtTarget !== 'savings_fund' && (
                          <div className="flex items-center gap-1.5 text-[11px] mt-0.5 truncate">
                            {voucher.debtAction === 'spend' ? (
                              <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                                Thanh toán qua:{' '}
                                {voucher.debtTarget === 'creditCard'
                                  ? 'Tín dụng'
                                  : voucher.debtTarget === 'shopeePayLater'
                                  ? 'PayLater'
                                  : debts.find((d) => d.key === voucher.debtTarget)?.shortName ||
                                    debts.find((d) => d.key === voucher.debtTarget)?.name ||
                                    voucher.debtTarget}
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                                  (+nợ)
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                Khấu trừ:{' '}
                                {voucher.debtTarget === 'creditCard'
                                  ? 'TT Tín dụng'
                                  : voucher.debtTarget === 'shopeePayLater'
                                  ? 'TT PayLater'
                                  : `TT ${
                                      debts.find((d) => d.key === voucher.debtTarget)?.shortName ||
                                      debts.find((d) => d.key === voucher.debtTarget)?.name ||
                                      voucher.debtTarget
                                    }`}
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                                  (-nợ)
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0">
                        <span className="hidden sm:inline-block text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatVietnameseDate(voucher.date)}
                        </span>
                        <span className="text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                          {formatVND(voucher.amount)}
                        </span>
                        <button
                          onClick={() => handleDeleteExpenseVoucher(voucher.id)}
                          title="Xóa phiếu Outflow này"
                          className="min-h-[36px] min-w-[36px] p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* FINANCIAL GOALS VIEW */}
        {activeSection === 'financial_goals' && (
          <section className="space-y-6">
            <FinancialGoalsView
              goals={goals}
              onAddGoal={handleAddGoal}
              onUpdateGoal={handleUpdateGoal}
              onDeleteGoal={handleDeleteGoal}
              wallets={wallets}
              debts={debts}
              sheets={sheets}
              activeSheetId={activeSheet.id}
            />
          </section>
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR (Tùy chỉnh 5 vị trí & đồng bộ Google Sheet) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center h-16 px-1 shadow-lg select-none">
        {bottomNavOrder.map((key, index) => {
          if (key === 'scan') {
            return (
              <div key={`${key}-${index}`} className="flex flex-col items-center justify-center h-full">
                <button
                  type="button"
                  onClick={() => {
                    setIsReceiptScannerOpen(true);
                    setIsNavMenuOpen(false);
                  }}
                  title="Scan biên lai / hóa đơn & tạo phiếu tự động"
                  className="w-10 h-10 -mt-2.5 rounded-full bg-gradient-to-tr from-teal-600 via-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/35 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer border-2 border-white dark:border-slate-900"
                >
                  <Scan className="w-5 h-5 text-white" />
                </button>
                <span className="text-[9px] font-bold text-teal-600 dark:text-teal-400 tracking-tight mt-0.5">Scan</span>
              </div>
            );
          }

          if (key === 'dashboard') {
            return (
              <button
                key={`${key}-${index}`}
                type="button"
                onClick={() => {
                  setActiveSection('dashboard');
                  setIsNavMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center h-full cursor-pointer transition-colors ${
                  activeSection === 'dashboard'
                    ? 'text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <PieChartIcon className="w-4 h-4" />
                <span className="text-[10px] tracking-tight mt-1 truncate max-w-[56px] text-center">Tổng quan</span>
              </button>
            );
          }

          if (key === 'initial_voucher') {
            return (
              <button
                key={`${key}-${index}`}
                type="button"
                onClick={() => {
                  setActiveSection('initial_voucher');
                  setIsNavMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center h-full cursor-pointer transition-colors ${
                  activeSection === 'initial_voucher'
                    ? 'text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span className="text-[10px] tracking-tight mt-1 truncate max-w-[56px] text-center">Phiếu Đầu</span>
              </button>
            );
          }

          if (key === 'fixed_presets') {
            return (
              <button
                key={`${key}-${index}`}
                type="button"
                onClick={() => {
                  setActiveSection('fixed_presets');
                  setIsNavMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center h-full cursor-pointer transition-colors relative ${
                  activeSection === 'fixed_presets'
                    ? 'text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <BookmarkCheck className="w-4 h-4" />
                <span className="text-[10px] tracking-tight mt-1 truncate max-w-[56px] text-center">Cố định</span>
                {fixedPresets.length > 0 && (
                  <span className="absolute top-1.5 right-2 px-1 min-w-[14px] h-3.5 text-[8px] font-bold rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                    {fixedPresets.length}
                  </span>
                )}
              </button>
            );
          }

          if (key === 'expense_vouchers') {
            const totalVouchersCount = activeSheet.vouchers.length + incomeList.length + savingsList.length;
            return (
              <button
                key={`${key}-${index}`}
                type="button"
                onClick={() => {
                  setActiveSection('expense_vouchers');
                  setIsNavMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center h-full cursor-pointer transition-colors relative ${
                  activeSection === 'expense_vouchers'
                    ? 'text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ReceiptText className="w-4 h-4" />
                <span className="text-[10px] tracking-tight mt-1 truncate max-w-[56px] text-center">Sổ phiếu</span>
                {totalVouchersCount > 0 && (
                  <span className="absolute top-1.5 right-2 px-1 min-w-[14px] h-3.5 text-[8px] font-bold rounded-full bg-teal-500 text-white flex items-center justify-center">
                    {totalVouchersCount}
                  </span>
                )}
              </button>
            );
          }

          if (key === 'financial_goals') {
            return (
              <button
                key={`${key}-${index}`}
                type="button"
                onClick={() => {
                  setActiveSection('financial_goals');
                  setIsNavMenuOpen(false);
                }}
                className={`flex flex-col items-center justify-center h-full cursor-pointer transition-colors relative ${
                  activeSection === 'financial_goals'
                    ? 'text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Target className="w-4 h-4" />
                <span className="text-[10px] tracking-tight mt-1 truncate max-w-[56px] text-center">Mục tiêu</span>
                {goals.length > 0 && (
                  <span className="absolute top-1.5 right-2 px-1 min-w-[14px] h-3.5 text-[8px] font-bold rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                    {goals.length}
                  </span>
                )}
              </button>
            );
          }

          return null;
        })}
      </nav>

      {/* NAVIGATION DRAWER MENU (Mở từ icon Menu ở góc trên bên trái màn hình) */}
      {isNavMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer"
            onClick={() => setIsNavMenuOpen(false)}
          />

          {/* Drawer Sheet */}
          <div className="relative w-full max-w-xs sm:max-w-sm bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 border-r border-slate-200 dark:border-slate-800 select-none">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Danh mục tính năng</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNavMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation links inside menu */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {/* 1. Tổng quan */}
              <button
                type="button"
                onClick={() => {
                  setActiveSection('dashboard');
                  setIsNavMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  activeSection === 'dashboard'
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      activeSection === 'dashboard'
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <PieChartIcon className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Tổng quan</span>
                </div>
                {activeSection === 'dashboard' && (
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                )}
              </button>

              {/* 2. Phiếu Đầu */}
              <button
                type="button"
                onClick={() => {
                  setActiveSection('initial_voucher');
                  setIsNavMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  activeSection === 'initial_voucher'
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      activeSection === 'initial_voucher'
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Wallet className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Phiếu Đầu</span>
                </div>
                {activeSection === 'initial_voucher' && (
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                )}
              </button>

              {/* 3. Sổ Phiếu */}
              <button
                type="button"
                onClick={() => {
                  setActiveSection('expense_vouchers');
                  setIsNavMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  activeSection === 'expense_vouchers'
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      activeSection === 'expense_vouchers'
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <ReceiptText className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Sổ Phiếu</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {activeSheet.vouchers.length + incomeList.length + savingsList.length}
                </span>
              </button>

              {/* 4. Cố định */}
              <button
                type="button"
                onClick={() => {
                  setActiveSection('fixed_presets');
                  setIsNavMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  activeSection === 'fixed_presets'
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      activeSection === 'fixed_presets'
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <BookmarkCheck className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Cố định</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {fixedPresets.length}
                </span>
              </button>

              {/* 5. Mục tiêu tài chính */}
              <button
                type="button"
                onClick={() => {
                  setActiveSection('financial_goals');
                  setIsNavMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  activeSection === 'financial_goals'
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      activeSection === 'financial_goals'
                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Mục tiêu tài chính</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {goals.length}
                </span>
              </button>

              <div className="py-1.5">
                <div className="h-px bg-slate-100 dark:bg-slate-800" />
              </div>

              {/* 7. Scan */}
              <button
                type="button"
                onClick={() => {
                  setIsNavMenuOpen(false);
                  setIsReceiptScannerOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    <Scan className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Scan</span>
                </div>
              </button>

              {/* 8. Hồ sơ & Google Drive */}
              <button
                type="button"
                onClick={() => {
                  setIsNavMenuOpen(false);
                  setIsProfileModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <UserIcon className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Hồ sơ & Google Drive</span>
                </div>
              </button>

              {/* 9. Cài đặt thanh điều hướng */}
              <button
                type="button"
                onClick={() => {
                  setIsNavMenuOpen(false);
                  setIsNavSettingsModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <SlidersHorizontal className="w-4 h-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">Cài đặt thanh điều hướng</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 0: CREATE INFLOW VOUCHER ("+ INFLOW" - GREEN) */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  Phiếu thu nhập
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsIncomeModalOpen(false);
                  setIsIncDatePickerOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncomeVoucher} className="mt-5 space-y-4">
              {/* Quick Fixed Inflow Presets (Auto-hidden once clicked/used in the current month) */}
              {availableInflowPresets.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Chọn nhanh
                      </label>
                      {availableInflowPresets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setIsInflowPresetsExpanded((prev) => !prev)}
                          className="p-1 rounded-md text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
                          title={isInflowPresetsExpanded ? "Thu gọn danh mục" : "Xem thêm danh mục"}
                          aria-label={isInflowPresetsExpanded ? "Thu gọn danh mục" : "Xem thêm danh mục"}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isInflowPresetsExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsIncomeModalOpen(false);
                        setIsIncDatePickerOpen(false);
                        setActiveSection('fixed_presets');
                      }}
                      title="Cài đặt số tiền cố định"
                      aria-label="Cài đặt số tiền cố định"
                      className="p-1 rounded-lg text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(isInflowPresetsExpanded || availableInflowPresets.length <= 1
                      ? availableInflowPresets
                      : availableInflowPresets.some((p) => p.id === selectedInflowPresetId)
                      ? availableInflowPresets.filter((p) => p.id === selectedInflowPresetId)
                      : availableInflowPresets.slice(0, 1)
                    ).map((preset) => {
                      const isSelected = selectedInflowPresetId === preset.id;
                      return (
                        <button
                          type="button"
                          key={preset.id}
                          onClick={() => handleSelectInflowPreset(preset)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500/40'
                          }`}
                        >
                          <div className="text-xs font-bold truncate">{preset.title}</div>
                          <div className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {formatVND(preset.amount)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Chọn nguồn
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsIncomeModalOpen(false);
                      handleOpenAddWallet();
                    }}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Thêm nguồn mới</span>
                  </button>
                </div>
                {wallets.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Chưa có nguồn tiền nào</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsIncomeModalOpen(false);
                        handleOpenAddWallet();
                      }}
                      className="text-teal-600 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
                    >
                      + Thêm ngay
                    </button>
                  </div>
                ) : (
                  <select
                    value={incWallet}
                    onChange={(e) => setIncWallet(e.target.value as AssetKey)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {wallets.map((w) => (
                      <option key={w.key} value={w.key}>
                        {w.name} (Hiện có: {formatVND(metrics.walletTotalBySource[w.key] || 0)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nội dung
                </label>
                <input
                  type="text"
                  required
                  value={incTitle}
                  onChange={(e) => setIncTitle(e.target.value)}
                  placeholder="VD: Lương, Thưởng dự án, Tiền hoàn..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Số tiền (VNĐ)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={incAmount}
                    onFocus={(e) => {
                      if (e.target.value === '0') e.target.select();
                    }}
                    onChange={(e) => setIncAmount(e.target.value)}
                    placeholder="VD: 18500000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div ref={incDatePickerRef}>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Ngày ghi nhận
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isIncDatePickerOpen && incDate) {
                          const parts = incDate.split('-').map(Number);
                          if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                            setIncPickerYear(parts[0]);
                            setIncPickerMonth(parts[1]);
                          }
                        }
                        setIsIncDatePickerOpen((prev) => !prev);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm flex items-center justify-between text-left transition-colors cursor-pointer font-mono ${
                        isIncDatePickerOpen
                          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white hover:border-emerald-500/50'
                      }`}
                    >
                      <span className="tabular-nums font-medium">
                        {formatVietnameseDate(incDate) || 'Chọn ngày'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
                        <ChevronUp
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                            isIncDatePickerOpen ? 'text-emerald-500' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Calendar Popover: displays days in month to pick (opens upwards) */}
                    {isIncDatePickerOpen && (
                      <div className="absolute right-0 bottom-full mb-2 z-50 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 origin-bottom">
                      {/* Month & Year header with Prev/Next buttons */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            if (incPickerMonth === 1) {
                              setIncPickerMonth(12);
                              setIncPickerYear((y) => y - 1);
                            } else {
                              setIncPickerMonth((m) => m - 1);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Tháng trước"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          Tháng {String(incPickerMonth).padStart(2, '0')}/{incPickerYear}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (incPickerMonth === 12) {
                              setIncPickerMonth(1);
                              setIncPickerYear((y) => y + 1);
                            } else {
                              setIncPickerMonth((m) => m + 1);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Tháng sau"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Day-of-week headers */}
                      <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((dw) => (
                          <div
                            key={dw}
                            className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 py-0.5"
                          >
                            {dw}
                          </div>
                        ))}
                      </div>

                      {/* Days grid */}
                      {(() => {
                        const daysInMonth = new Date(incPickerYear, incPickerMonth, 0).getDate();
                        const firstDayOfWeek = new Date(incPickerYear, incPickerMonth - 1, 1).getDay();
                        const startOffset = (firstDayOfWeek + 6) % 7;
                        const cells = [];

                        for (let i = 0; i < startOffset; i++) {
                          cells.push(
                            <div key={`empty-${i}`} className="w-8 h-8" />
                          );
                        }

                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateStr = `${incPickerYear}-${String(incPickerMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const isSelected = incDate === dateStr;
                          const today = new Date();
                          const isToday =
                            today.getFullYear() === incPickerYear &&
                            today.getMonth() + 1 === incPickerMonth &&
                            today.getDate() === day;

                          cells.push(
                            <button
                              key={`day-${day}`}
                              type="button"
                              onClick={() => {
                                setIncDate(dateStr);
                                setIsIncDatePickerOpen(false);
                              }}
                              className={`w-8 h-8 rounded-lg text-xs font-mono tabular-nums transition-colors flex items-center justify-center cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                                  : isToday
                                  ? 'border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        }

                        return (
                          <div className="grid grid-cols-7 gap-1 place-items-center">
                            {cells}
                          </div>
                        );
                      })()}

                      {/* Footer shortcuts */}
                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const tStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            setIncDate(tStr);
                            setIncPickerYear(today.getFullYear());
                            setIncPickerMonth(today.getMonth() + 1);
                            setIsIncDatePickerOpen(false);
                          }}
                          className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Hôm nay
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsIncDatePickerOpen(false)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsIncomeModalOpen(false);
                    setIsIncDatePickerOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE OUTFLOW VOUCHER ("− OUTFLOW" - RED, DIRECT TOTAL DEDUCTION) */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
                  Phiếu chi tiêu
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsExpenseModalOpen(false);
                  setIsTxDatePickerOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpenseVoucher} className="mt-5 space-y-4">
              {/* Quick Fixed Outflow Presets (Auto-hidden once clicked/used in the current month) */}
              {availableOutflowPresets.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Chọn nhanh
                      </label>
                      {availableOutflowPresets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setIsOutflowPresetsExpanded((prev) => !prev)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
                          title={isOutflowPresetsExpanded ? "Thu gọn danh mục" : "Xem thêm danh mục"}
                          aria-label={isOutflowPresetsExpanded ? "Thu gọn danh mục" : "Xem thêm danh mục"}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isOutflowPresetsExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsExpenseModalOpen(false);
                        setActiveSection('fixed_presets');
                      }}
                      title="Cài đặt số tiền cố định"
                      aria-label="Cài đặt số tiền cố định"
                      className="p-1 rounded-lg text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(isOutflowPresetsExpanded || availableOutflowPresets.length <= 1
                      ? availableOutflowPresets
                      : availableOutflowPresets.some((p) => p.id === selectedOutflowPresetId)
                      ? availableOutflowPresets.filter((p) => p.id === selectedOutflowPresetId)
                      : availableOutflowPresets.slice(0, 1)
                    ).map((preset) => {
                      const isSelected = selectedOutflowPresetId === preset.id;
                      return (
                        <button
                          type="button"
                          key={preset.id}
                          onClick={() => handleSelectOutflowPreset(preset)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 ring-2 ring-rose-500/30'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-rose-500/40'
                          }`}
                        >
                          <div className="text-xs font-bold truncate">{preset.title}</div>
                          <div className="text-xs font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
                            {formatVND(preset.amount)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nơi khấu trừ
                </label>
                <select
                  value={txDeduction}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTxDeduction(val);
                    if (val.startsWith('pay:')) {
                      setTxCategory('savings_debt_20');
                    } else if (txCategory === 'savings_debt_20') {
                      setTxCategory('needs_50');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-white"
                >
                  <option value="none" className="text-slate-900 dark:text-white">
                    Trực tiếp
                  </option>

                  {debts.length > 0 && (
                    <>
                      {/* Khi dùng thẻ tín dụng / PayLater: cộng tiền sử dụng vào nợ */}
                      <optgroup label="Dùng thẻ / Trả sau">
                        {debts.map((d) => (
                          <option
                            key={`spend:${d.key}`}
                            value={`spend:${d.key}`}
                            className="text-slate-900 dark:text-white font-medium"
                          >
                            {d.shortName || d.name}
                          </option>
                        ))}
                      </optgroup>

                      {/* Khi thanh toán nợ: TT Tín dụng, TT PayLater */}
                      <optgroup label="Thanh toán nợ">
                        {debts.map((d) => (
                          <option
                            key={`pay:${d.key}`}
                            value={`pay:${d.key}`}
                            className="text-slate-900 dark:text-white"
                          >
                            TT {d.shortName || d.name}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  )}
                </select>

                {(() => {
                  const isDirect = txDeduction === 'none';
                  const debtKey = txDeduction.startsWith('spend:')
                    ? txDeduction.replace('spend:', '')
                    : txDeduction.startsWith('pay:')
                    ? txDeduction.replace('pay:', '')
                    : txDeduction !== 'none'
                    ? txDeduction
                    : null;
                  const currentDebt = debtKey
                    ? (metrics.remainingDebt[debtKey] || 0)
                    : metrics.totalRemainingDebts;

                  return (
                    <div className="flex items-center text-xs mt-1.5 px-1 font-mono">
                      {isDirect ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">Số dư:</span>
                          <span className="font-bold tabular-nums text-teal-600 dark:text-teal-400">
                            {formatVND(metrics.remainingUsableMoney)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">Dư nợ:</span>
                          <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                            {formatVND(currentDebt)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {!txDeduction.startsWith('pay:') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Phân loại chi tiêu
                  </label>
                  <select
                    value={txCategory}
                    onChange={(e) => {
                      const cat = e.target.value as RuleCategory;
                      setTxCategory(cat);
                      const meta = RULE_50_30_20_META[cat];
                      const firstSub = meta.subCategories[0];
                      setTxSubCategory(firstSub);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="needs_50">
                      {proportions.find(
                        (p) =>
                          p.id === 'seg-needs' ||
                          p.name.toLowerCase().includes('thiết yếu') ||
                          p.name.toLowerCase().includes('nhu cầu')
                      )?.name || 'Nhu cầu thiết yếu'}{' '}
                      (
                      {proportions.find(
                        (p) =>
                          p.id === 'seg-needs' ||
                          p.name.toLowerCase().includes('thiết yếu') ||
                          p.name.toLowerCase().includes('nhu cầu')
                      )?.percentage ?? 50}
                      %)
                    </option>
                    <option value="wants_30">
                      {proportions.find(
                        (p) =>
                          p.id === 'seg-wants' ||
                          p.name.toLowerCase().includes('linh hoạt') ||
                          p.name.toLowerCase().includes('cá nhân')
                      )?.name || 'Nhu cầu cá nhân'}{' '}
                      (
                      {proportions.find(
                        (p) =>
                          p.id === 'seg-wants' ||
                          p.name.toLowerCase().includes('linh hoạt') ||
                          p.name.toLowerCase().includes('cá nhân')
                      )?.percentage ?? 30}
                      %)
                    </option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nội dung phiếu
                </label>
                <input
                  type="text"
                  required
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  placeholder="VD: Thanh toán tiền ..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Số tiền trừ (VNĐ)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={txAmount}
                    onFocus={(e) => {
                      if (e.target.value === '0') e.target.select();
                    }}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="VD: 3000000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div ref={txDatePickerRef}>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Ngày giao dịch
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isTxDatePickerOpen && txDate) {
                          const parts = txDate.split('-').map(Number);
                          if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                            setTxPickerYear(parts[0]);
                            setTxPickerMonth(parts[1]);
                          }
                        }
                        setIsTxDatePickerOpen((prev) => !prev);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-sm flex items-center justify-between text-left transition-colors cursor-pointer font-mono ${
                        isTxDatePickerOpen
                          ? 'border-rose-500 ring-2 ring-rose-500/20 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white hover:border-rose-500/50'
                      }`}
                    >
                      <span className="tabular-nums font-medium">
                        {formatVietnameseDate(txDate) || 'Chọn ngày'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-rose-500 shrink-0" />
                        <ChevronUp
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                            isTxDatePickerOpen ? 'text-rose-500' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Calendar Popover: displays days in month to pick (opens upwards) */}
                    {isTxDatePickerOpen && (
                      <div className="absolute right-0 bottom-full mb-2 z-50 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 origin-bottom">
                      {/* Month & Year header with Prev/Next buttons */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            if (txPickerMonth === 1) {
                              setTxPickerMonth(12);
                              setTxPickerYear((y) => y - 1);
                            } else {
                              setTxPickerMonth((m) => m - 1);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Tháng trước"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          Tháng {String(txPickerMonth).padStart(2, '0')}/{txPickerYear}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (txPickerMonth === 12) {
                              setTxPickerMonth(1);
                              setTxPickerYear((y) => y + 1);
                            } else {
                              setTxPickerMonth((m) => m + 1);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Tháng sau"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Day-of-week headers */}
                      <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((dw) => (
                          <div
                            key={dw}
                            className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 py-0.5"
                          >
                            {dw}
                          </div>
                        ))}
                      </div>

                      {/* Days grid */}
                      {(() => {
                        const daysInMonth = new Date(txPickerYear, txPickerMonth, 0).getDate();
                        const firstDayOfWeek = new Date(txPickerYear, txPickerMonth - 1, 1).getDay();
                        const startOffset = (firstDayOfWeek + 6) % 7;
                        const cells = [];

                        for (let i = 0; i < startOffset; i++) {
                          cells.push(
                            <div key={`empty-${i}`} className="w-8 h-8" />
                          );
                        }

                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateStr = `${txPickerYear}-${String(txPickerMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const isSelected = txDate === dateStr;
                          const today = new Date();
                          const isToday =
                            today.getFullYear() === txPickerYear &&
                            today.getMonth() + 1 === txPickerMonth &&
                            today.getDate() === day;

                          cells.push(
                            <button
                              key={`day-${day}`}
                              type="button"
                              onClick={() => {
                                setTxDate(dateStr);
                                setIsTxDatePickerOpen(false);
                              }}
                              className={`w-8 h-8 rounded-lg text-xs font-mono tabular-nums transition-colors flex items-center justify-center cursor-pointer ${
                                isSelected
                                  ? 'bg-rose-600 text-white font-bold shadow-xs'
                                  : isToday
                                  ? 'border border-rose-500/50 text-rose-600 dark:text-rose-400 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        }

                        return (
                          <div className="grid grid-cols-7 gap-1 place-items-center">
                            {cells}
                          </div>
                        );
                      })()}

                      {/* Footer shortcuts */}
                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const tStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            setTxDate(tStr);
                            setTxPickerYear(today.getFullYear());
                            setTxPickerMonth(today.getMonth() + 1);
                            setIsTxDatePickerOpen(false);
                          }}
                          className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                        >
                          Hôm nay
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsTxDatePickerOpen(false)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsExpenseModalOpen(false);
                    setIsTxDatePickerOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1.5: CREATE SAVINGS TRANSFER VOUCHER ("SAVINGS" - SKY, INTERNAL TRANSFER) */}
      {isSavingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-amber-600 dark:text-amber-400">
                  Phiếu gửi tiết kiệm
                </h3>
              </div>
              <button
                onClick={() => setIsSavingsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSavingsVoucher} className="mt-5 space-y-4">
              {/* Quick Fixed Savings Presets */}
              {availableSavingsPresets.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Chọn nhanh
                      </label>
                      {availableSavingsPresets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setIsSavingsPresetsExpanded((prev) => !prev)}
                          className="p-1 rounded-md text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
                          title={isSavingsPresetsExpanded ? "Thu gọn danh mục" : "Xem thêm danh mục"}
                          aria-label={isSavingsPresetsExpanded ? "Thu gọn danh mục" : "Xem thêm danh mục"}
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              isSavingsPresetsExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(isSavingsPresetsExpanded || availableSavingsPresets.length <= 1
                      ? availableSavingsPresets
                      : availableSavingsPresets.some((p) => p.id === selectedSavingsPresetId)
                      ? availableSavingsPresets.filter((p) => p.id === selectedSavingsPresetId)
                      : availableSavingsPresets.slice(0, 1)
                    ).map((preset) => {
                      const isSelected = selectedSavingsPresetId === preset.id;
                      return (
                        <button
                          type="button"
                          key={preset.id}
                          onClick={() => handleSelectSavingsPreset(preset)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer bg-white dark:bg-slate-900 ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/30'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500/40'
                          }`}
                        >
                          <div className="text-xs font-bold truncate">{preset.title}</div>
                          <div className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
                            {formatVND(preset.amount)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên / Nội dung chuyển
                </label>
                <input
                  type="text"
                  required
                  value={savingsTitle}
                  onChange={(e) => setSavingsTitle(e.target.value)}
                  placeholder="Ví dụ: Gửi tiết kiệm tích lũy, Trích quỹ sinh lời..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số tiền chuyển (₫)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step="any"
                  value={savingsAmount}
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select();
                  }}
                  onChange={(e) => setSavingsAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-lg font-bold font-mono text-amber-600 dark:text-amber-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30"
                />
                {Number(savingsAmount) > 0 && (
                  <p className="text-xs font-mono tabular-nums text-slate-500 mt-1">
                    Bằng chữ / Quy đổi: {formatVND(Number(savingsAmount))}
                  </p>
                )}
              </div>

              {wallets.length === 0 ? (
                <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    Chưa có nguồn tiền nào. Vui lòng thêm nguồn tiền trước khi chuyển tiết kiệm.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSavingsModalOpen(false);
                      handleOpenAddWallet();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm nguồn tiền mới</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Trích từ nguồn tiền:
                    </label>
                    <select
                      value={savingsFromWallet}
                      onChange={(e) => setSavingsFromWallet(e.target.value as AssetKey)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      {wallets
                        .filter((w) => !isSavingsWallet(w))
                        .map((w) => (
                          <option key={w.key} value={w.key}>
                            {w.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Gửi vào mục tiết kiệm:
                    </label>
                    <select
                      value={savingsToWallet}
                      onChange={(e) => setSavingsToWallet(e.target.value as AssetKey)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      {wallets
                        .filter(isSavingsWallet)
                        .map((w) => (
                          <option key={w.key} value={w.key}>
                            {w.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div ref={savingsDatePickerRef}>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Ngày thực hiện
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSavingsDatePickerOpen && savingsDate) {
                        const parts = savingsDate.split('-').map(Number);
                        if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                          setSavingsPickerYear(parts[0]);
                          setSavingsPickerMonth(parts[1]);
                        }
                      }
                      setIsSavingsDatePickerOpen((prev) => !prev);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm flex items-center justify-between text-left transition-colors cursor-pointer font-mono ${
                      isSavingsDatePickerOpen
                        ? 'border-amber-500 ring-2 ring-amber-500/20 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white hover:border-amber-500/50'
                    }`}
                  >
                    <span className="tabular-nums font-medium">
                      {formatVietnameseDate(savingsDate) || 'Chọn ngày'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                      <ChevronUp
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                          isSavingsDatePickerOpen ? 'text-amber-500' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Calendar Popover: displays days in month to pick (opens upwards) */}
                  {isSavingsDatePickerOpen && (
                    <div className="absolute right-0 bottom-full mb-2 z-50 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 origin-bottom">
                      {/* Month & Year header with Prev/Next buttons */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            if (savingsPickerMonth === 1) {
                              setSavingsPickerMonth(12);
                              setSavingsPickerYear((y) => y - 1);
                            } else {
                              setSavingsPickerMonth((m) => m - 1);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Tháng trước"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          Tháng {String(savingsPickerMonth).padStart(2, '0')}/{savingsPickerYear}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (savingsPickerMonth === 12) {
                              setSavingsPickerMonth(1);
                              setSavingsPickerYear((y) => y + 1);
                            } else {
                              setSavingsPickerMonth((m) => m + 1);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Tháng sau"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Day-of-week headers */}
                      <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((dw) => (
                          <div
                            key={dw}
                            className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 py-0.5"
                          >
                            {dw}
                          </div>
                        ))}
                      </div>

                      {/* Days grid */}
                      {(() => {
                        const daysInMonth = new Date(savingsPickerYear, savingsPickerMonth, 0).getDate();
                        const firstDayOfWeek = new Date(savingsPickerYear, savingsPickerMonth - 1, 1).getDay();
                        const startOffset = (firstDayOfWeek + 6) % 7;
                        const cells = [];

                        for (let i = 0; i < startOffset; i++) {
                          cells.push(
                            <div key={`empty-${i}`} className="w-8 h-8" />
                          );
                        }

                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateStr = `${savingsPickerYear}-${String(savingsPickerMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const isSelected = savingsDate === dateStr;
                          const today = new Date();
                          const isToday =
                            today.getFullYear() === savingsPickerYear &&
                            today.getMonth() + 1 === savingsPickerMonth &&
                            today.getDate() === day;

                          cells.push(
                            <button
                              key={`day-${day}`}
                              type="button"
                              onClick={() => {
                                setSavingsDate(dateStr);
                                setIsSavingsDatePickerOpen(false);
                              }}
                              className={`w-8 h-8 rounded-lg text-xs font-mono tabular-nums transition-colors flex items-center justify-center cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-900 font-bold shadow-xs'
                                  : isToday
                                  ? 'border border-amber-400/50 text-amber-600 dark:text-amber-400 font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        }

                        return (
                          <div className="grid grid-cols-7 gap-1 place-items-center">
                            {cells}
                          </div>
                        );
                      })()}

                      {/* Footer shortcuts */}
                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const tStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            setSavingsDate(tStr);
                            setSavingsPickerYear(today.getFullYear());
                            setSavingsPickerMonth(today.getMonth() + 1);
                            setIsSavingsDatePickerOpen(false);
                          }}
                          className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Hôm nay
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsSavingsDatePickerOpen(false)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Ghi chú (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={savingsNote}
                  onChange={(e) => setSavingsNote(e.target.value)}
                  placeholder="Kỳ hạn gửi, lãi suất, hoặc mục tiêu..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsSavingsModalOpen(false);
                    setIsSavingsDatePickerOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold transition-colors cursor-pointer"
                >
                  Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW MONTHLY SHEET (ROLLOVER OR FRESH) */}
      {isNewMonthModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tạo Tháng Mới (Luân phiên)
              </h3>
              <button
                onClick={() => setIsNewMonthModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewMonthlySheet} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tháng
                  </label>
                  <select
                    value={newMonthNum}
                    onChange={(e) => setNewMonthNum(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        Tháng {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Năm
                  </label>
                  <input
                    type="number"
                    value={newYearNum}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setNewYearNum(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Phương thức khởi tạo số dư đầu tháng:
                </label>

                <button
                  type="button"
                  onClick={() => setRolloverMode('rollover')}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                    rolloverMode === 'rollover'
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Chuyển Tổng số tiền thực tế còn lại từ {activeSheet.label} sang
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Kết chuyển {formatVND(metrics.totalActualMoneyRemaining)} và dư nợ còn lại sang tháng mới.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRolloverMode('fresh')}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                    rolloverMode === 'fresh'
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <FilePlus2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Làm mới hoàn toàn số liệu (0 ₫)
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Giữ nguyên cấu trúc mẫu 6 nguồn tài sản/nợ nhưng đưa số dư về 0 ₫ để bạn tự nhập mới.
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewMonthModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Khởi Tạo Tháng Mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE MONTHLY SHEET */}
      {isDeleteMonthModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Xóa Dữ Liệu Theo Tháng
              </h3>
              <button
                onClick={() => setIsDeleteMonthModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeleteMonthlySheet} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chọn tháng bạn muốn xóa
                </label>
                <select
                  value={monthToDeleteId || activeSheet.id}
                  onChange={(e) => setMonthToDeleteId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.month).padStart(2, '0')}/{s.year} ({s.vouchers.length} phiếu Outflow)
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {sheets.length > 1
                  ? 'Toàn bộ số dư khởi tạo, Inflow và Outflow của tháng được chọn sẽ bị xóa khỏi danh sách.'
                  : 'Vì đây là tháng duy nhất đang có, hệ thống sẽ làm mới toàn bộ số dư và các phiếu của tháng này về 0 ₫.'}
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeleteMonthModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Xác Nhận Xóa Tháng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD NEW WALLET / MONEY SOURCE */}
      {isAddWalletModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-500" />
                <span>Thêm Nguồn Tiền Mới</span>
              </h3>
              <button
                onClick={() => setIsAddWalletModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddWallet} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên nguồn tiền / Ngân hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                  placeholder="VD: Ngân hàng Techcombank, Ví MoMo, VPBank..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddWalletModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Thêm Nguồn Tiền
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4.5: ADD NEW SAVINGS TARGET / FUND */}
      {isAddSavingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-500" />
                <span>Thêm Mục Tiết Kiệm Mới</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSavingsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSavingsWallet} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên mục tiết kiệm / Quỹ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newSavingsName}
                  onChange={(e) => setNewSavingsName(e.target.value)}
                  placeholder="VD: Quỹ khẩn cấp, Mua xe, Tiết kiệm kinh doanh..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSavingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Thêm Mục Tiết Kiệm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT WALLET */}
      {editingWallet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className={`w-4 h-4 ${isSavingsWallet(editingWallet) ? 'text-amber-500' : 'text-teal-500'}`} />
                <span>{isSavingsWallet(editingWallet) ? 'Chỉnh Sửa Mục Tiết Kiệm' : 'Chỉnh Sửa Nguồn Tiền'}</span>
              </h3>
              <button
                onClick={() => setEditingWallet(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditWallet} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {isSavingsWallet(editingWallet) ? 'Tên mục tiết kiệm / Quỹ' : 'Tên nguồn tiền / Ngân hàng'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editWalletName}
                  onChange={(e) => setEditWalletName(e.target.value)}
                  placeholder={isSavingsWallet(editingWallet) ? 'VD: Quỹ khẩn cấp, Tiết kiệm mua nhà...' : 'VD: Ngân hàng MB, Ví ShopeePay...'}
                  className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none ${
                    isSavingsWallet(editingWallet) ? 'focus:border-amber-500' : 'focus:border-teal-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingWallet(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl ${
                    isSavingsWallet(editingWallet)
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-teal-600 hover:bg-teal-500 text-white font-semibold'
                  } text-xs cursor-pointer`}
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DELETE WALLET CONFIRMATION */}
      {walletToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>{isSavingsWallet(walletToDelete) ? 'Xóa Mục Tiết Kiệm' : 'Xóa Nguồn Tiền'}</span>
              </h3>
              <button
                onClick={() => setWalletToDelete(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Bạn có chắc chắn muốn xóa {isSavingsWallet(walletToDelete) ? 'mục tiết kiệm' : 'nguồn tiền'}{' '}
                <strong className="text-slate-900 dark:text-white">
                  {walletToDelete.name}
                </strong>{' '}
                khỏi danh sách?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSavingsWallet(walletToDelete)
                  ? 'Số dư mục tiết kiệm này sẽ được gỡ khỏi phiếu đầu tháng và các mục tiêu tài chính liên kết.'
                  : 'Số dư nguồn tiền này sẽ được gỡ khỏi phiếu đầu tháng và không còn xuất hiện trong các tùy chọn Inflow.'}
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setWalletToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteWallet}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Xác Nhận Xóa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: ADD NEW DEBT */}
      {isAddDebtModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-500" />
                <span>Thêm Khoản Nợ Mới</span>
              </h3>
              <button
                onClick={() => setIsAddDebtModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDebt} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên khoản nợ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDebtName}
                  onChange={(e) => setNewDebtName(e.target.value)}
                  placeholder="VD: Thẻ tín dụng HSBC, Nợ vay mua xe, Shopee SPay..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddDebtModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Thêm Khoản Nợ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: EDIT DEBT */}
      {editingDebt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-rose-500" />
                <span>Chỉnh Sửa Khoản Nợ</span>
              </h3>
              <button
                onClick={() => setEditingDebt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDebt} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên khoản nợ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editDebtName}
                  onChange={(e) => setEditDebtName(e.target.value)}
                  placeholder="VD: Thẻ tín dụng, Nợ vay..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDebt(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: DELETE DEBT CONFIRMATION */}
      {debtToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>Xóa Khoản Nợ</span>
              </h3>
              <button
                onClick={() => setDebtToDelete(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Bạn có chắc chắn muốn xóa khoản nợ{' '}
                <strong className="text-slate-900 dark:text-white">
                  {debtToDelete.name}
                </strong>{' '}
                khỏi danh sách?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Khoản nợ này sẽ được gỡ khỏi phiếu đầu tháng và không còn xuất hiện trong các tùy chọn khấu trừ nợ.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDebtToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteDebt}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Xác Nhận Xóa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW FIXED PRESET */}
      {isAddFixedPresetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {editingPreset ? (
                  <>
                    <Wrench className="w-5 h-5 text-teal-500" />
                    <span>Chỉnh Sửa Mục Cố Định</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-teal-500" />
                    <span>Thêm Mục Cố Định Mới</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddFixedPresetModalOpen(false);
                  setEditingPreset(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddFixedPreset} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Loại phiếu
                </label>
                <select
                  value={newPresetType}
                  onChange={(e) =>
                    setNewPresetType(e.target.value as 'inflow' | 'outflow' | 'savings')
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="outflow">Chi tiêu (Trừ tiền)</option>
                  <option value="inflow">Thu nhập (Cộng tiền)</option>
                  <option value="savings">Tiết kiệm</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên mục cố định <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPresetTitle}
                  onChange={(e) => setNewPresetTitle(e.target.value)}
                  placeholder={
                    newPresetType === 'savings'
                      ? 'VD: Tiết kiệm hàng tháng, Gửi quỹ sinh lời...'
                      : 'VD: Lương, Gửi tiền về cho mẹ, YouTube Premium...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Số tiền mặc định (VNĐ) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step="any"
                  value={newPresetAmount}
                  onFocus={(e) => {
                    if (e.target.value === '0') e.target.select();
                  }}
                  onChange={(e) => setNewPresetAmount(e.target.value)}
                  placeholder="VD: 3000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              {newPresetType === 'inflow' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nguồn tiền nhận
                  </label>
                  <select
                    value={newPresetWallet}
                    onChange={(e) =>
                      setNewPresetWallet(e.target.value as AssetKey)
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  >
                    {wallets.length === 0 ? (
                      <option value="">(Chưa có nguồn tiền)</option>
                    ) : (
                      wallets.map((w) => (
                        <option key={w.key} value={w.key}>
                          {w.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : newPresetType === 'savings' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Trích từ
                    </label>
                    <select
                      value={newPresetFromWallet}
                      onChange={(e) =>
                        setNewPresetFromWallet(e.target.value as AssetKey)
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    >
                      {wallets.length === 0 ? (
                        <option value="">(Chưa có nguồn tiền)</option>
                      ) : (
                        wallets.map((w) => (
                          <option key={w.key} value={w.key}>
                            {w.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Gửi sang
                    </label>
                    <select
                      value={newPresetToWallet}
                      onChange={(e) =>
                        setNewPresetToWallet(e.target.value as AssetKey)
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    >
                      {wallets.length === 0 ? (
                        <option value="">(Chưa có nguồn tiền)</option>
                      ) : (
                        wallets.map((w) => (
                          <option key={w.key} value={w.key}>
                            {w.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Phân loại
                  </label>
                  <select
                    value={newPresetCategory}
                    onChange={(e) => {
                      const val = e.target.value as RuleCategory;
                      setNewPresetCategory(val);
                      const standardCat: RuleCategory =
                        val === 'wants_30' || val === 'savings_debt_20' ? val : 'needs_50';
                      setNewPresetSubCategory(
                        RULE_50_30_20_META[standardCat]?.subCategories[0] || 'Chi tiêu'
                      );
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  >
                    {(proportions && proportions.length > 0 ? proportions : DEFAULT_SEGMENTS).map((p, idx) => {
                      const optValue =
                        p.id === 'seg-needs' || idx === 0
                          ? 'needs_50'
                          : p.id === 'seg-wants' || idx === 1
                          ? 'wants_30'
                          : p.id === 'seg-savings' || idx === 2
                          ? 'savings_debt_20'
                          : p.id;
                      return (
                        <option key={p.id} value={optValue}>
                          {p.name} ({p.percentage}%)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddFixedPresetModalOpen(false);
                    setEditingPreset(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  {editingPreset ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Lưu Thay Đổi</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Lưu Mục Cố Định</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANAGE FIXED PRESETS CATEGORY */}
      {managingFixedCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-teal-500" />
                <span>
                  Quản lý {managingFixedCategory === 'inflow' ? 'Thu nhập' : managingFixedCategory === 'outflow' ? 'Chi tiêu' : 'Tiết kiệm'} cố định
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setManagingFixedCategory(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Danh sách các mục ({
                  (managingFixedCategory === 'inflow'
                    ? inflowPresets
                    : managingFixedCategory === 'outflow'
                    ? outflowPresets
                    : savingsPresets
                  ).length
                })
              </span>
              <button
                type="button"
                onClick={() => {
                  const targetType = managingFixedCategory;
                  setManagingFixedCategory(null);
                  handleOpenAddFixedPresetForType(targetType);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600/10 hover:bg-teal-600/20 text-teal-600 dark:text-teal-400 text-xs font-semibold border border-teal-500/20 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm mục mới</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {(managingFixedCategory === 'inflow'
                ? inflowPresets
                : managingFixedCategory === 'outflow'
                ? outflowPresets
                : savingsPresets
              ).length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  Chưa có mục cố định nào trong danh mục này.
                </div>
              ) : (
                (managingFixedCategory === 'inflow'
                  ? inflowPresets
                  : managingFixedCategory === 'outflow'
                  ? outflowPresets
                  : savingsPresets
                ).map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', item.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedPresetId(item.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverPresetId !== item.id) {
                        setDragOverPresetId(item.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverPresetId === item.id) {
                        setDragOverPresetId(null);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedPresetId(null);
                      setDragOverPresetId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sourceId = e.dataTransfer.getData('text/plain') || draggedPresetId;
                      if (sourceId && sourceId !== item.id && managingFixedCategory) {
                        handleReorderFixedPresets(managingFixedCategory, sourceId, item.id);
                      }
                      setDraggedPresetId(null);
                      setDragOverPresetId(null);
                    }}
                    className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      draggedPresetId === item.id
                        ? 'opacity-40 border-teal-500 border-dashed bg-teal-50/20'
                        : dragOverPresetId === item.id
                        ? 'border-teal-500 bg-teal-500/10 shadow-sm scale-[1.01]'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors shrink-0"
                        title="Kéo thả để sắp xếp vị trí"
                        aria-label="Kéo thả để sắp xếp vị trí"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          {item.type === 'outflow' && item.category && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                              {getProportionLabelForCategory(item.category)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          {formatVND(item.amount || 0)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setManagingFixedCategory(null);
                          handleOpenEditFixedPreset(item);
                        }}
                        title="Chỉnh sửa mục này"
                        aria-label="Chỉnh sửa mục này"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-500/10 cursor-pointer transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFixedPreset(item.id)}
                        title="Xóa mục này"
                        aria-label="Xóa mục này"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setManagingFixedCategory(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE FIXED PRESETS CATEGORY */}
      {fixedCategoryToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Xóa toàn bộ mục {fixedCategoryToDelete === 'inflow' ? 'Thu nhập' : fixedCategoryToDelete === 'outflow' ? 'Chi tiêu' : 'Tiết kiệm'}?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Bạn có chắc muốn xóa tất cả {
                    (fixedCategoryToDelete === 'inflow'
                      ? inflowPresets
                      : fixedCategoryToDelete === 'outflow'
                      ? outflowPresets
                      : savingsPresets
                    ).length
                  } mục trong danh mục này?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setFixedCategoryToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteFixedCategory(fixedCategoryToDelete)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM RESET ALL DATA TO 0 */}
      {isResetAllDataConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Đặt lại toàn bộ dữ liệu về 0?
                </h3>
                <p className="text-xs text-rose-500">
                  Thao tác này sẽ xóa tất cả các phiếu đã ghi
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Toàn bộ danh sách phiếu chi tiêu, phiếu thu nhập, phiếu gửi tiết kiệm sẽ được làm rỗng. Số dư đầu tháng của tất cả các ví tiền và công nợ sẽ được đưa về con số <b>0 đ</b>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsResetAllDataConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleResetAllData}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Xác nhận xóa về 0
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: PROFILE & GOOGLE DRIVE */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={googleUser}
        spreadsheetInfo={spreadsheetInfo}
        isConnecting={isConnectingGoogle}
        isSyncing={isSyncingSheets}
        autoSync={autoSyncToSheets}
        toastMessage={sheetSyncToast}
        lastSyncTime={lastSyncTime}
        syncStatus={syncStatus}
        needsReauth={needsTokenReauth}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        onToggleAutoSync={handleToggleAutoSync}
        onRequestBulkSync={handleTriggerSyncNow}
        onPullFromSheet={handlePullFromSheet}
        onOpenInitialSyncWindow={handleReopenOnboarding}
      />

      {/* MODAL: OAUTH & REDIRECT URI SETTINGS */}
      <OAuthSettingsModal
        isOpen={isOAuthModalOpen}
        onClose={() => setIsOAuthModalOpen(false)}
        onSignIn={handleGoogleSignIn}
        isConnecting={isConnectingGoogle}
      />

      {/* STARTUP / ONBOARDING SCREEN */}
      {showOnboardingModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950">
          <OnboardingScreen
            user={googleUser}
            spreadsheetInfo={spreadsheetInfo}
            isConnecting={isConnectingGoogle}
            toastMessage={sheetSyncToast}
            isTokenExpired={Boolean(googleUser && (needsTokenReauth || !googleToken || isGoogleOAuthTokenExpired()))}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleGoogleSignOut}
            onEnterDashboard={handleFinishOnboarding}
          />
        </div>
      )}

      {/* FLOATING BOTTOM TOAST NOTIFICATION POPUP (HÌNH 1) */}
      {sheetSyncToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)] sm:w-auto animate-in fade-in slide-in-from-bottom-5 duration-200 pointer-events-auto">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/95 text-white border border-teal-500/30 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                sheetSyncToast.includes('Lỗi') || sheetSyncToast.includes('429')
                  ? 'bg-rose-500/20 text-rose-400'
                  : sheetSyncToast.includes('hết hạn') || sheetSyncToast.includes('giới hạn')
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-teal-500/20 text-teal-400'
              }`}>
                {sheetSyncToast.includes('Lỗi') || sheetSyncToast.includes('429') ? (
                  <AlertCircle className="w-4 h-4" />
                ) : sheetSyncToast.includes('hết hạn') || sheetSyncToast.includes('giới hạn') ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium text-slate-100 leading-snug break-words">
                {sheetSyncToast}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSheetSyncToast(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* GEMINI CHATBOT FLOATING WIDGET (ROUND BUTTON BOTTOM-RIGHT + POPUP CHAT) */}
      <GeminiChatbot
        context={financialContext}
        formatVND={formatVND}
        onExecuteActions={handleExecuteVoucherActions}
      />

      {/* RECEIPT & INVOICE SCANNER MODAL */}
      {isReceiptScannerOpen && (
        <ReceiptScannerModal
          isOpen={isReceiptScannerOpen}
          onClose={() => setIsReceiptScannerOpen(false)}
          wallets={wallets}
          debts={debts}
          onSaveVoucher={handleSaveScannedVoucher}
        />
      )}

      {/* BOTTOM NAVIGATION BAR POSITIONS SETTINGS MODAL */}
      <NavSettingsModal
        isOpen={isNavSettingsModalOpen}
        onClose={() => setIsNavSettingsModalOpen(false)}
        currentOrder={bottomNavOrder}
        onSaveOrder={handleSaveBottomNavOrder}
        isSyncingSheets={isSyncingSheets}
      />
    </div>
  );
}
