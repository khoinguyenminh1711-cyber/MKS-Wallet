import {
  WalletMeta,
  DebtMeta,
  FixedPresetItem,
  ExpenseVoucher,
  IncomeVoucher,
  SavingsVoucher,
  RuleCategory,
  DebtKey,
  RULE_50_30_20_META,
  BottomNavItemKey,
  DEFAULT_BOTTOM_NAV_ITEMS,
  BOTTOM_NAV_ITEM_CONFIG,
  FinancialGoal,
} from '../types/finance';

export interface GoogleSpreadsheetInfo {
  id: string;
  name: string;
  url: string;
}

export interface ProportionRowPayload {
  id: string;
  name: string;
  percentage: number;
  colorHex?: string;
  gradient?: string;
}

export interface PulledSheetData {
  expenses: ExpenseVoucher[];
  incomes: IncomeVoucher[];
  savings: SavingsVoucher[];
  presets: FixedPresetItem[];
  proportions?: ProportionRowPayload[];
  initialAccounts?: InitialAccountRowPayload[];
  discoveredWallets?: WalletMeta[];
  discoveredDebts?: DebtMeta[];
  bottomNavOrder?: BottomNavItemKey[];
  goals?: FinancialGoal[];
  groupedBySheet: Record<
    string,
    {
      month: number;
      year: number;
      label: string;
      expenses: ExpenseVoucher[];
      incomes: IncomeVoucher[];
      savings: SavingsVoucher[];
      initialBalances?: Record<string, number>;
    }
  >;
  totalItems: number;
}

export interface ExpenseRowPayload {
  id: string;
  monthLabel?: string;
  date: string;
  title: string;
  amount: number;
  categoryLabel: string;
  subCategory?: string;
  sourceWalletName?: string;
  debtTargetLabel?: string;
}

export interface IncomeRowPayload {
  id: string;
  monthLabel?: string;
  date: string;
  title: string;
  amount: number;
  targetWalletName?: string;
}

export interface SavingsRowPayload {
  id: string;
  monthLabel?: string;
  date: string;
  title: string;
  amount: number;
  fromWalletName?: string;
  toWalletName?: string;
}

export interface PresetRowPayload {
  id: string;
  type: string;
  typeLabel?: string;
  category?: string;
  categoryLabel?: string;
  title: string;
  amount: number;
  walletName?: string;
}

export interface InitialAccountRowPayload {
  id: string; // key
  type: string; // 'Nguồn tiền' | 'Tiết kiệm' | 'Công nợ'
  name: string;
  shortName?: string;
  monthLabel?: string;
  initialAmount: number;
}

export interface FullSyncPayload {
  expenses: ExpenseRowPayload[];
  incomes: IncomeRowPayload[];
  savings: SavingsRowPayload[];
  presets?: PresetRowPayload[];
  proportions?: ProportionRowPayload[];
  initialAccounts?: InitialAccountRowPayload[];
  bottomNavOrder?: BottomNavItemKey[];
  goals?: FinancialGoal[];
}

export const GOALS_HEADERS = [
  'Mã mục tiêu (ID)',
  'Tên mục tiêu',
  'Số tiền mục tiêu (VND)',
  'Số tiền hiện có (VND)',
  'Phân loại',
  'Hạn chót',
  'Ví liên kết',
  'Công nợ liên kết',
  'Ghi chú',
  'Thời gian cập nhật',
];

export const NAVIGATION_HEADERS = [
  'Vị trí (Thứ tự)',
  'Mã mục (Key)',
  'Tên hiển thị',
  'Thời gian cập nhật',
];

const DEFAULT_SHEET_TITLE = 'MKS Wallet - Sổ Quản Lý Chi Tiêu & Thu Nhập';

export const OUTFLOW_HEADERS = [
  'Mã phiếu',
  'Kỳ / Tháng',
  'Ngày thực hiện',
  'Tiêu đề / Nội dung chi',
  'Số tiền (VND)',
  'Phân loại (50-30-20)',
  'Nhóm chi tiêu',
  'Nguồn ví chi',
  'Nơi khấu trừ',
  'Thời gian đồng bộ',
];

export const INFLOW_HEADERS = [
  'Mã phiếu',
  'Kỳ / Tháng',
  'Ngày nhận tiền',
  'Khoản thu nhập',
  'Số tiền (VND)',
  'Ví nhận tiền',
  'Thời gian đồng bộ',
];

export const SAVINGS_HEADERS = [
  'Mã phiếu',
  'Kỳ / Tháng',
  'Ngày gửi tiết kiệm',
  'Nội dung chuyển',
  'Số tiền (VND)',
  'Ví trích nguồn',
  'Tài khoản nhận',
  'Thời gian đồng bộ',
];

export const PRESETS_HEADERS = [
  'Mã mục',
  'Loại phiếu',
  'Phân loại',
  'Tiêu đề / Danh mục',
  'Số tiền cố định (VND)',
  'Ví mặc định',
  'Thời gian đồng bộ',
];

export const PROPORTIONS_HEADERS = [
  'Mã phân đoạn',
  'Tên danh mục',
  'Tỷ lệ %',
  'Mã màu',
  'Gradient',
  'Thời gian đồng bộ',
];

export const INITIAL_ACCOUNTS_HEADERS = [
  'Mã định danh',
  'Phân loại',
  'Tên nguồn / Khoản nợ',
  'Tên viết tắt / Mã ngân hàng',
  'Kỳ / Tháng',
  'Số dư đầu kỳ (VND)',
  'Thời gian đồng bộ',
];

/**
 * Executes a fetch request with exponential backoff and jitter for handling HTTP 429 & 503
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 3,
  baseDelayMs: number = 1800
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 503) {
        if (attempt < retries) {
          attempt++;
          // Exponential backoff: ~1.8s, ~3.6s, ~7.2s + random jitter
          const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
          console.warn(
            `[Google API ${res.status}] Đạt giới hạn tần suất yêu cầu (Rate Limit/Quota). Đang tạm dừng ${Math.round(delay)}ms và tự động thử lại (lần ${attempt}/${retries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      return res;
    } catch (err: any) {
      if (
        attempt < retries &&
        (err?.name === 'TypeError' ||
          err?.message?.includes('Failed to fetch') ||
          err?.message?.includes('network'))
      ) {
        attempt++;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
        console.warn(`[Google API Network Error] Đang thử lại (lần ${attempt}/${retries}) sau ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

// In-memory cache of verified spreadsheet tabs to avoid redundant metadata queries
const verifiedSpreadsheets = new Set<string>();

export function markSpreadsheetAsVerified(id: string) {
  if (id) verifiedSpreadsheets.add(id);
}

export function invalidateSpreadsheetVerification(id?: string) {
  if (id) {
    verifiedSpreadsheets.delete(id);
  } else {
    verifiedSpreadsheets.clear();
  }
}

/**
 * Handles error responses from Google APIs, cleanly handling 401 unauthenticated and 429 rate limits
 */
export function handleGoogleApiError(res: Response, errText: string, operation: string): Error {
  const is401 =
    res.status === 401 ||
    errText.includes('401') ||
    errText.includes('UNAUTHENTICATED') ||
    errText.includes('invalid authentication') ||
    errText.includes('OAuth 2 access token') ||
    errText.includes('authentication credential');
  if (is401) {
    console.warn(`[Google API 401] Token expired during: ${operation}`);
    const err = new Error('Token Google đã hết hạn (401). Vui lòng bấm Gia hạn phiên để tiếp tục đồng bộ.');
    (err as any).status = 401;
    (err as any).code = 'UNAUTHENTICATED';
    return err;
  }

  const is429 =
    res.status === 429 ||
    errText.includes('RESOURCE_EXHAUSTED') ||
    errText.includes('Quota exceeded') ||
    errText.includes('Too Many Requests');
  if (is429) {
    console.warn(`[Google API 429 Rate Limit] During: ${operation}`);
    const err = new Error('Google Sheets API bị tạm dừng do vượt quá giới hạn tần suất yêu cầu (429 Rate Limit). Vui lòng đợi 30-60 giây rồi thử lại.');
    (err as any).status = 429;
    (err as any).code = 'RATE_LIMIT';
    return err;
  }

  console.warn(`[Google API Status ${res.status}] ${operation}:`, errText);
  let detailMessage = res.statusText || operation;
  try {
    const parsed = JSON.parse(errText);
    if (parsed?.error?.message) {
      detailMessage = parsed.error.message;
    }
  } catch {
    // ignore
  }
  const err = new Error(`Lỗi Google API (${res.status}): ${detailMessage}`);
  (err as any).status = res.status;
  return err;
}

/**
 * Searches user's Google Drive for existing sheet or creates a new one
 */
export async function findOrCreateSpreadsheet(
  accessToken: string,
  customTitle: string = DEFAULT_SHEET_TITLE
): Promise<GoogleSpreadsheetInfo> {
  if (!accessToken || !accessToken.trim()) {
    throw handleGoogleApiError({ status: 401 } as any, 'Token missing or expired', 'Tìm kiếm Google Drive');
  }

  const query = encodeURIComponent(
    `name = '${customTitle}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
  );

  const searchRes = await fetchWithRetry(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw handleGoogleApiError(searchRes, errText, 'Tìm kiếm Google Drive');
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const file = searchData.files[0];
    markSpreadsheetAsVerified(file.id);
    return {
      id: file.id,
      name: file.name,
      url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
    };
  }

  // Create new Spreadsheet with all 4 tabs initialized cleanly
  const createRes = await fetchWithRetry('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: customTitle,
      },
      sheets: [
        {
          properties: {
            title: 'Chi tiêu (Outflow)',
            gridProperties: { rowCount: 200, columnCount: 12, frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Thu nhập (Inflow)',
            gridProperties: { rowCount: 200, columnCount: 10, frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Tiết kiệm (Savings)',
            gridProperties: { rowCount: 200, columnCount: 10, frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Khoản cố định (Presets)',
            gridProperties: { rowCount: 100, columnCount: 8, frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Phiếu đầu (Initial Balances)',
            gridProperties: { rowCount: 100, columnCount: 8, frozenRowCount: 1 },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw handleGoogleApiError(createRes, errText, 'Tạo file Google Sheet mới');
  }

  const createData = await createRes.json();
  const spreadsheetId = createData.spreadsheetId;
  markSpreadsheetAsVerified(spreadsheetId);

  // Set initial header rows
  await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: "'Chi tiêu (Outflow)'!A1:J1",
            values: [OUTFLOW_HEADERS],
          },
          {
            range: "'Thu nhập (Inflow)'!A1:G1",
            values: [INFLOW_HEADERS],
          },
          {
            range: "'Tiết kiệm (Savings)'!A1:H1",
            values: [SAVINGS_HEADERS],
          },
          {
            range: "'Khoản cố định (Presets)'!A1:G1",
            values: [PRESETS_HEADERS],
          },
          {
            range: "'Phiếu đầu (Initial Balances)'!A1:G1",
            values: [INITIAL_ACCOUNTS_HEADERS],
          },
        ],
      }),
    }
  );

  return {
    id: spreadsheetId,
    name: customTitle,
    url: createData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Ensures required tabs exist in the spreadsheet with in-memory caching to minimize quota usage
 */
export async function ensureSheetTabs(
  accessToken: string,
  spreadsheetId: string,
  forceCheck: boolean = false
): Promise<string[]> {
  const neededTabs = [
    'Chi tiêu (Outflow)',
    'Thu nhập (Inflow)',
    'Tiết kiệm (Savings)',
    'Khoản cố định (Presets)',
    'Phiếu đầu (Initial Balances)',
    'Tỷ lệ (Proportions)',
    'Cài đặt điều hướng (Navigation)',
    'Mục tiêu (Goals)',
  ];

  // If already verified in this session, return cached standard tabs to save API requests
  if (!forceCheck && verifiedSpreadsheets.has(spreadsheetId)) {
    return neededTabs;
  }

  const metaRes = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw handleGoogleApiError(metaRes, errText, 'Kiểm tra trang tính Google Sheet');
  }

  const meta = await metaRes.json();
  let existingTitles: string[] = meta.sheets?.map((s: any) => s.properties?.title) || [];
  const missingTabs = neededTabs.filter((t) => !existingTitles.includes(t));

  if (missingTabs.length > 0) {
    try {
      const addRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: missingTabs.map((title) => ({
              addSheet: {
                properties: { title },
              },
            })),
          }),
        }
      );
      if (addRes.ok) {
        existingTitles = [...existingTitles, ...missingTabs];
      } else {
        const addErr = await addRes.text();
        console.warn('Could not add missing tabs to Google Sheet:', addErr);
      }
    } catch (err) {
      console.warn('Could not add missing tabs:', err);
    }
  }

  markSpreadsheetAsVerified(spreadsheetId);
  return existingTitles;
}

/**
 * Appends an expense voucher row to the Google Sheet
 */
export async function appendExpenseToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  payload: ExpenseRowPayload
): Promise<void> {
  if (!accessToken || !accessToken.trim() || !spreadsheetId) {
    console.warn('[appendExpenseToGoogleSheet] Missing accessToken or spreadsheetId, skipping.');
    return;
  }
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const row = [
    payload.id,
    payload.monthLabel || '',
    payload.date,
    payload.title,
    payload.amount,
    payload.categoryLabel,
    payload.subCategory || '',
    payload.sourceWalletName || '',
    payload.debtTargetLabel || 'Trực tiếp (Số tiền có thể sử dụng)',
    now,
  ];

  const range = encodeURIComponent("'Chi tiêu (Outflow)'!A:J");
  const res = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw handleGoogleApiError(res, errText, 'Đẩy dòng chi tiêu vào Google Sheet');
  }
}

/**
 * Appends an income voucher row to the Google Sheet
 */
export async function appendIncomeToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  payload: IncomeRowPayload
): Promise<void> {
  if (!accessToken || !accessToken.trim() || !spreadsheetId) {
    console.warn('[appendIncomeToGoogleSheet] Missing accessToken or spreadsheetId, skipping.');
    return;
  }
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const row = [
    payload.id,
    payload.monthLabel || '',
    payload.date,
    payload.title,
    payload.amount,
    payload.targetWalletName || '',
    now,
  ];

  const range = encodeURIComponent("'Thu nhập (Inflow)'!A:G");
  const res = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw handleGoogleApiError(res, errText, 'Đẩy dòng thu nhập vào Google Sheet');
  }
}

/**
 * Appends a savings voucher row to the Google Sheet
 */
export async function appendSavingsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  payload: SavingsRowPayload
): Promise<void> {
  if (!accessToken || !accessToken.trim() || !spreadsheetId) {
    console.warn('[appendSavingsToGoogleSheet] Missing accessToken or spreadsheetId, skipping.');
    return;
  }
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const row = [
    payload.id,
    payload.monthLabel || '',
    payload.date,
    payload.title,
    payload.amount,
    payload.fromWalletName || '',
    payload.toWalletName || 'Tiết kiệm',
    now,
  ];

  const range = encodeURIComponent("'Tiết kiệm (Savings)'!A:H");
  const res = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw handleGoogleApiError(res, errText, 'Đẩy dòng tiết kiệm vào Google Sheet');
  }
}

/**
 * Full continuous synchronization of all financial data across all monthly sheets
 */
export async function syncAllDataToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  payload: FullSyncPayload,
  isExplicitReset: boolean = false
): Promise<{ success: boolean; totalItems: number; timestamp: string }> {
  // Safety guard: Never wipe remote Google Sheet if incoming payload is empty and not an explicit user reset action
  const totalIncomingItems =
    payload.expenses.length +
    payload.incomes.length +
    payload.savings.length +
    (payload.presets?.length || 0) +
    (payload.initialAccounts?.length || 0);
  if (totalIncomingItems === 0 && !isExplicitReset) {
    console.warn(
      'Safety guard: Aborting syncAllDataToGoogleSheet because payload is completely empty and isExplicitReset is false.'
    );
    return { success: true, totalItems: 0, timestamp: new Date().toISOString() };
  }

  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  // 1. Ensure all tabs exist (cached)
  let existingTabs = await ensureSheetTabs(accessToken, spreadsheetId);

  // 2. Clear old data rows using safe open-ended ranges
  const clearRanges: string[] = [];
  if (existingTabs.includes('Chi tiêu (Outflow)')) clearRanges.push("'Chi tiêu (Outflow)'!A2:J");
  if (existingTabs.includes('Thu nhập (Inflow)')) clearRanges.push("'Thu nhập (Inflow)'!A2:G");
  if (existingTabs.includes('Tiết kiệm (Savings)')) clearRanges.push("'Tiết kiệm (Savings)'!A2:H");
  if (existingTabs.includes('Khoản cố định (Presets)')) clearRanges.push("'Khoản cố định (Presets)'!A2:G");
  if (existingTabs.includes('Phiếu đầu (Initial Balances)')) clearRanges.push("'Phiếu đầu (Initial Balances)'!A2:G");
  if (existingTabs.includes('Tỷ lệ (Proportions)')) clearRanges.push("'Tỷ lệ (Proportions)'!A2:F");
  if (existingTabs.includes('Cài đặt điều hướng (Navigation)')) clearRanges.push("'Cài đặt điều hướng (Navigation)'!A2:D");
  if (existingTabs.includes('Mục tiêu (Goals)')) clearRanges.push("'Mục tiêu (Goals)'!A2:J");

  if (clearRanges.length > 0) {
    let clearRes = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ranges: clearRanges,
        }),
      }
    );

    // If clearing fails due to tab discrepancy, re-check tabs and retry once
    if (!clearRes.ok) {
      invalidateSpreadsheetVerification(spreadsheetId);
      existingTabs = await ensureSheetTabs(accessToken, spreadsheetId, true);
      clearRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ranges: clearRanges,
          }),
        }
      );
      if (!clearRes.ok) {
        const errText = await clearRes.text();
        throw handleGoogleApiError(clearRes, errText, 'Xóa dữ liệu cũ trên Google Sheet');
      }
    }
  }

  // 3. Format rows
  const expenseRows = payload.expenses.map((e) => [
    e.id,
    e.monthLabel || '',
    e.date,
    e.title,
    e.amount,
    e.categoryLabel,
    e.subCategory || '',
    e.sourceWalletName || '',
    e.debtTargetLabel || 'Trực tiếp (Số tiền có thể sử dụng)',
    now,
  ]);

  const incomeRows = payload.incomes.map((i) => [
    i.id,
    i.monthLabel || '',
    i.date,
    i.title,
    i.amount,
    i.targetWalletName || '',
    now,
  ]);

  const savingsRows = payload.savings.map((s) => [
    s.id,
    s.monthLabel || '',
    s.date,
    s.title,
    s.amount,
    s.fromWalletName || '',
    s.toWalletName || 'Tiết kiệm',
    now,
  ]);

  const seenSyncPresets = new Set<string>();
  const deduplicatedPresets: PresetRowPayload[] = [];
  (payload.presets || []).forEach((p) => {
    if (!p || !p.title) return;
    const normTitle = (p.title || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\s\u00A0]+/g, ' ')
      .trim();
    const key = `${p.type}_${normTitle}`;
    if (!seenSyncPresets.has(key)) {
      seenSyncPresets.add(key);
      deduplicatedPresets.push({
        ...p,
        title: (p.title || '').normalize('NFC').trim(),
      });
    }
  });

  const presetRows = deduplicatedPresets.map((p) => [
    p.id,
    p.typeLabel || (p.type === 'inflow' ? 'Thu nhập' : p.type === 'outflow' ? 'Chi tiêu' : 'Tiết kiệm'),
    p.categoryLabel || '',
    p.title,
    p.amount,
    p.walletName || '',
    now,
  ]);

  const updateData: Array<{ range: string; values: (string | number)[][] }> = [];

  if (existingTabs.includes('Chi tiêu (Outflow)')) {
    updateData.push({
      range: "'Chi tiêu (Outflow)'!A1:J1",
      values: [OUTFLOW_HEADERS],
    });
    if (expenseRows.length > 0) {
      updateData.push({
        range: `'Chi tiêu (Outflow)'!A2:J${expenseRows.length + 1}`,
        values: expenseRows,
      });
    }
  }

  if (existingTabs.includes('Thu nhập (Inflow)')) {
    updateData.push({
      range: "'Thu nhập (Inflow)'!A1:G1",
      values: [INFLOW_HEADERS],
    });
    if (incomeRows.length > 0) {
      updateData.push({
        range: `'Thu nhập (Inflow)'!A2:G${incomeRows.length + 1}`,
        values: incomeRows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[6]]),
      });
    }
  }

  if (existingTabs.includes('Tiết kiệm (Savings)')) {
    updateData.push({
      range: "'Tiết kiệm (Savings)'!A1:H1",
      values: [SAVINGS_HEADERS],
    });
    if (savingsRows.length > 0) {
      updateData.push({
        range: `'Tiết kiệm (Savings)'!A2:H${savingsRows.length + 1}`,
        values: savingsRows,
      });
    }
  }

  if (existingTabs.includes('Khoản cố định (Presets)')) {
    updateData.push({
      range: "'Khoản cố định (Presets)'!A1:G1",
      values: [PRESETS_HEADERS],
    });
    if (presetRows.length > 0) {
      updateData.push({
        range: `'Khoản cố định (Presets)'!A2:G${presetRows.length + 1}`,
        values: presetRows,
      });
    }
  }

  if (existingTabs.includes('Phiếu đầu (Initial Balances)')) {
    updateData.push({
      range: "'Phiếu đầu (Initial Balances)'!A1:G1",
      values: [INITIAL_ACCOUNTS_HEADERS],
    });
    const initialAccountRows = (payload.initialAccounts || []).map((acc) => [
      acc.id,
      acc.type,
      acc.name,
      acc.shortName || '',
      acc.monthLabel || '',
      acc.initialAmount || 0,
      now,
    ]);
    if (initialAccountRows.length > 0) {
      updateData.push({
        range: `'Phiếu đầu (Initial Balances)'!A2:G${initialAccountRows.length + 1}`,
        values: initialAccountRows,
      });
    }
  }

  if (existingTabs.includes('Tỷ lệ (Proportions)')) {
    updateData.push({
      range: "'Tỷ lệ (Proportions)'!A1:F1",
      values: [PROPORTIONS_HEADERS],
    });
    const proportionRows = (payload.proportions || []).map((p) => [
      p.id,
      p.name,
      p.percentage,
      p.colorHex || '',
      p.gradient || '',
      now,
    ]);
    if (proportionRows.length > 0) {
      updateData.push({
        range: `'Tỷ lệ (Proportions)'!A2:F${proportionRows.length + 1}`,
        values: proportionRows,
      });
    }
  }

  if (existingTabs.includes('Cài đặt điều hướng (Navigation)')) {
    updateData.push({
      range: "'Cài đặt điều hướng (Navigation)'!A1:D1",
      values: [NAVIGATION_HEADERS],
    });
    const navOrder =
      payload.bottomNavOrder && payload.bottomNavOrder.length === 5
        ? payload.bottomNavOrder
        : DEFAULT_BOTTOM_NAV_ITEMS;
    const navRows = navOrder.map((key, idx) => [
      idx + 1,
      key,
      BOTTOM_NAV_ITEM_CONFIG[key]?.label || key,
      now,
    ]);
    if (navRows.length > 0) {
      updateData.push({
        range: `'Cài đặt điều hướng (Navigation)'!A2:D${navRows.length + 1}`,
        values: navRows,
      });
    }
  }

  if (existingTabs.includes('Mục tiêu (Goals)')) {
    updateData.push({
      range: "'Mục tiêu (Goals)'!A1:J1",
      values: [GOALS_HEADERS],
    });
    const goalRows = (payload.goals || []).map((g) => {
      const catLabel =
        g.category === 'emergency_fund'
          ? 'Quỹ khẩn cấp'
          : g.category === 'debt_payoff'
          ? 'Lộ trình trả nợ'
          : g.category === 'purchase'
          ? 'Mua sắm lớn'
          : 'Mục tiêu tích lũy';

      return [
        g.id,
        g.title,
        g.targetAmount,
        g.currentAmount,
        catLabel,
        g.deadline || '',
        g.linkedWalletKey || '',
        g.linkedDebtKey || '',
        g.notes || '',
        now,
      ];
    });

    if (goalRows.length > 0) {
      updateData.push({
        range: `'Mục tiêu (Goals)'!A2:J${goalRows.length + 1}`,
        values: goalRows,
      });
    }
  }

  const res = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updateData,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw handleGoogleApiError(res, errText, 'Đồng bộ liên tục lên Google Sheet');
  }

  return {
    success: true,
    totalItems:
      expenseRows.length +
      incomeRows.length +
      savingsRows.length +
      presetRows.length +
      (payload.initialAccounts?.length || 0),
    timestamp: now,
  };
}

/**
 * Bulk sync all vouchers in the active monthly sheet to Google Sheets
 */
export async function bulkSyncSheet(
  accessToken: string,
  spreadsheetId: string,
  expenses: ExpenseRowPayload[],
  incomes: IncomeRowPayload[],
  savings: SavingsRowPayload[]
): Promise<void> {
  await syncAllDataToGoogleSheet(accessToken, spreadsheetId, {
    expenses,
    incomes,
    savings,
  });
}

/**
 * Parses numerical values from Google Sheets cells safely
 */
export function parseSheetNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim().replace(/[^\d.,-]/g, '');
  if (!str) return 0;

  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 1.000,50
      return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    } else {
      // 1,000.50
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
  }
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
    return parseFloat(str) || 0;
  }
  if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      return parseFloat(str.replace(/,/g, '')) || 0;
    }
    return parseFloat(str.replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
}

/**
 * Extracts month, year, and formatted labels from monthLabel or date string
 */
export function parseMonthAndYear(
  monthLabel?: string,
  dateStr?: string
): { month: number; year: number; sheetId: string; label: string } {
  let month = 0;
  let year = 0;

  if (monthLabel) {
    const match = String(monthLabel).match(/(?:tháng\s*)?(\d{1,2})[\/\-\.](\d{4})/i);
    if (match) {
      month = parseInt(match[1], 10);
      year = parseInt(match[2], 10);
    }
  }

  if ((!month || !year) && dateStr) {
    const match = String(dateStr).match(/(\d{4})[\/\-\.](\d{1,2})/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
    } else {
      const match2 = String(dateStr).match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
      if (match2) {
        month = parseInt(match2[2], 10);
        year = parseInt(match2[3], 10);
      }
    }
  }

  if (!month || month < 1 || month > 12 || !year) {
    const now = new Date();
    month = now.getMonth() + 1;
    year = now.getFullYear();
  }

  const sheetId = `${year}-${String(month).padStart(2, '0')}`;
  const label = `Tháng ${String(month).padStart(2, '0')}/${year}`;
  return { month, year, sheetId, label };
}

/**
 * Normalizes any date string from Google Sheets to standard YYYY-MM-DD
 */
export function normalizeDate(
  dateVal: any,
  defaultYear: number,
  defaultMonth: number
): string {
  if (!dateVal) {
    return `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-01`;
  }
  const str = String(dateVal).trim();
  // Check Excel / Google Sheets serial date number (e.g. 45580)
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(parseInt(ymdMatch[2], 10)).padStart(2, '0');
    const d = String(parseInt(ymdMatch[3], 10)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  return `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-01`;
}

/**
 * Maps category label back to 50-30-20 RuleCategory
 */
function parseCategory(catStr?: string): RuleCategory {
  if (!catStr) return 'needs_50';
  const lower = String(catStr).toLowerCase();
  if (lower.includes('thiết yếu') || lower.includes('50%') || lower.includes('needs')) {
    return 'needs_50';
  }
  if (lower.includes('linh hoạt') || lower.includes('30%') || lower.includes('wants')) {
    return 'wants_30';
  }
  if (
    lower.includes('tiết kiệm') ||
    lower.includes('trả nợ') ||
    lower.includes('20%') ||
    lower.includes('savings')
  ) {
    return 'savings_debt_20';
  }
  return 'needs_50';
}

/**
 * Maps debt target and action
 */
function parseDebtTarget(
  debtLabel?: string,
  debts: DebtMeta[] = []
): { debtTarget?: DebtKey | 'savings_fund'; debtAction?: 'spend' | 'pay' } {
  if (!debtLabel) return {};
  const lower = String(debtLabel).toLowerCase();
  if (lower.includes('trực tiếp') || lower.includes('sử dụng') || lower === '') {
    return {};
  }
  const isPay =
    lower.includes('tt ') ||
    lower.startsWith('tt') ||
    lower.includes('thanh toán') ||
    lower.includes('trả nợ');

  if (lower.includes('quỹ tiết kiệm') || lower.includes('tiết kiệm')) {
    return { debtTarget: 'savings_fund', debtAction: 'pay' };
  }
  if (lower.includes('paylater') || lower.includes('shopee')) {
    return { debtTarget: 'shopeePayLater', debtAction: isPay ? 'pay' : 'spend' };
  }
  if (lower.includes('tín dụng') || lower.includes('credit')) {
    return { debtTarget: 'creditCard', debtAction: isPay ? 'pay' : 'spend' };
  }

  const matchDebt = debts.find(
    (d) =>
      lower.includes(d.name.toLowerCase()) ||
      lower.includes(d.shortName.toLowerCase()) ||
      lower.includes(d.key.toLowerCase())
  );
  if (matchDebt) {
    return { debtTarget: matchDebt.key, debtAction: isPay ? 'pay' : 'spend' };
  }
  return {};
}

/**
 * Resolves wallet key from sheet string
 */
function parseWalletKey(walletStr?: string, wallets: WalletMeta[] = []): string {
  if (!walletStr) return wallets[0]?.key || 'cash';
  const lower = String(walletStr).trim().toLowerCase();
  const found = wallets.find(
    (w) =>
      w.name.toLowerCase() === lower ||
      w.shortName.toLowerCase() === lower ||
      w.key.toLowerCase() === lower ||
      w.bankCode.toLowerCase() === lower
  );
  if (found) return found.key;

  if (lower.includes('tiền mặt') || lower.includes('cash')) return 'cash';
  if (lower.includes('tiết kiệm') || lower.includes('savings')) return 'savings';
  if (lower.includes('ngân hàng') || lower.includes('bank')) return 'bank';
  return wallets[0]?.key || 'cash';
}

function parsePresetRow(row: any[], wallets: WalletMeta[], idx: number): FixedPresetItem | null {
  if (!row || row.length < 3) return null;
  const firstCell = String(row[0] || '').toLowerCase();
  if (firstCell.includes('mã mục') || firstCell.includes('tiêu đề')) return null;

  let id = String(row[0] || '').trim();
  let typeStr = '';
  let categoryLabel = '';
  let title = '';
  let amount = 0;
  let walletStr = '';

  // 7-column format: [id, type, categoryLabel, title, amount, wallet, now]
  // 6-column legacy: [id, type, title, amount, wallet, now]
  if (row.length >= 7 || (row.length >= 5 && isNaN(parseSheetNumber(row[2])) && typeof parseSheetNumber(row[4]) === 'number' && parseSheetNumber(row[4]) > 0)) {
    typeStr = String(row[1] || '').toLowerCase();
    categoryLabel = String(row[2] || '').trim();
    title = String(row[3] || '').trim();
    amount = parseSheetNumber(row[4]);
    walletStr = row[5] ? String(row[5]).trim() : '';
  } else {
    typeStr = String(row[1] || '').toLowerCase();
    title = String(row[2] || '').trim();
    amount = parseSheetNumber(row[3]);
    walletStr = row[4] ? String(row[4]).trim() : '';
  }

  if (!title || title.toLowerCase().includes('tiêu đề')) return null;

  const type: 'inflow' | 'outflow' | 'savings' = typeStr.includes('thu')
    ? 'inflow'
    : typeStr.includes('tiết kiệm')
    ? 'savings'
    : 'outflow';

  const walletKey = walletStr ? parseWalletKey(walletStr, wallets) : undefined;
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  if (!id) {
    id = `preset_${type}_${titleSlug}_${amount || idx}`;
  }

  let category: RuleCategory | undefined = undefined;
  if (type === 'outflow') {
    const lowCat = categoryLabel.toLowerCase();
    if (lowCat.includes('linh hoạt') || lowCat.includes('cá nhân') || lowCat.includes('30%') || lowCat.includes('wants')) {
      category = 'wants_30';
    } else if (lowCat.includes('tiết kiệm') || lowCat.includes('đầu tư') || lowCat.includes('20%') || lowCat.includes('savings')) {
      category = 'savings_debt_20';
    } else {
      category = 'needs_50';
    }
  }

  return {
    id,
    type,
    title,
    amount,
    category,
    categoryLabel: categoryLabel || undefined,
    targetWallet: type === 'inflow' ? walletKey : undefined,
    fromWallet: type === 'savings' ? walletKey : undefined,
    toWallet: type === 'savings' ? 'savings' : undefined,
  };
}

/**
 * Reads all data from the user's Google Sheet and converts it back into structured app data
 */
export async function fetchDataFromGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  wallets: WalletMeta[] = [],
  debts: DebtMeta[] = []
): Promise<PulledSheetData> {
  if (!accessToken || !accessToken.trim()) {
    throw handleGoogleApiError({ status: 401 } as any, 'Token missing or expired', 'Kiểm tra cấu trúc Google Sheet');
  }

  const result: PulledSheetData = {
    expenses: [],
    incomes: [],
    savings: [],
    presets: [],
    groupedBySheet: {},
    totalItems: 0,
  };

  const standardRanges = [
    { tabName: 'Chi tiêu (Outflow)', range: "'Chi tiêu (Outflow)'!A2:J" },
    { tabName: 'Thu nhập (Inflow)', range: "'Thu nhập (Inflow)'!A2:G" },
    { tabName: 'Tiết kiệm (Savings)', range: "'Tiết kiệm (Savings)'!A2:H" },
    { tabName: 'Khoản cố định (Presets)', range: "'Khoản cố định (Presets)'!A2:G" },
    { tabName: 'Phiếu đầu (Initial Balances)', range: "'Phiếu đầu (Initial Balances)'!A2:G" },
    { tabName: 'Tỷ lệ (Proportions)', range: "'Tỷ lệ (Proportions)'!A2:F" },
    { tabName: 'Cài đặt điều hướng (Navigation)', range: "'Cài đặt điều hướng (Navigation)'!A2:D7" },
    { tabName: 'Mục tiêu (Goals)', range: "'Mục tiêu (Goals)'!A2:J" },
  ];

  let rangesToFetch = standardRanges;

  // If not previously verified, check the sheet properties to know which tabs exist
  if (!verifiedSpreadsheets.has(spreadsheetId)) {
    const metaRes = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      throw handleGoogleApiError(metaRes, errText, 'Kiểm tra cấu trúc Google Sheet');
    }

    const meta = await metaRes.json();
    const existingTitles: string[] = meta.sheets?.map((s: any) => s.properties?.title) || [];
    rangesToFetch = standardRanges.filter((r) => existingTitles.includes(r.tabName));
    markSpreadsheetAsVerified(spreadsheetId);
  }

  if (rangesToFetch.length === 0) {
    return result;
  }

  const queryParams = rangesToFetch
    .map((r) => `ranges=${encodeURIComponent(r.range)}`)
    .join('&');

  let res = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${queryParams}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // If reading fails with 400 (e.g. invalid range because a sheet tab was renamed or removed in the cloud),
  // invalidate cache, query metadata, and retry with available tabs
  if (!res.ok && res.status === 400) {
    invalidateSpreadsheetVerification(spreadsheetId);
    const metaRes = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const existingTitles: string[] = meta.sheets?.map((s: any) => s.properties?.title) || [];
      rangesToFetch = standardRanges.filter((r) => existingTitles.includes(r.tabName));
      if (rangesToFetch.length === 0) return result;
      const retryParams = rangesToFetch
        .map((r) => `ranges=${encodeURIComponent(r.range)}`)
        .join('&');
      res = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${retryParams}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw handleGoogleApiError(res, errText, 'Đọc dữ liệu từ Google Sheet');
  }

  const data = await res.json();
  const valueRanges: Array<{ range: string; values?: any[][] }> = data.valueRanges || [];

  const ensureSheetGroup = (sheetId: string, month: number, year: number, label: string) => {
    if (!result.groupedBySheet[sheetId]) {
      result.groupedBySheet[sheetId] = {
        month,
        year,
        label,
        expenses: [],
        incomes: [],
        savings: [],
      };
    }
    return result.groupedBySheet[sheetId];
  };

  valueRanges.forEach((vr) => {
    const rangeName = vr.range || '';
    const rows = vr.values || [];

    if (rangeName.includes('Chi tiêu') || rangeName.includes('Outflow')) {
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const id = row[0] ? String(row[0]).trim() : `exp-${Date.now()}-${idx}`;
        if (id.toLowerCase().includes('mã phiếu')) return;

        const monthLabel = row[1] ? String(row[1]).trim() : '';
        const rawDate = row[2] ? String(row[2]).trim() : '';
        const title = row[3] ? String(row[3]).trim() : 'Khoản chi';
        const amount = parseSheetNumber(row[4]) || 0;
        const catLabel = row[5] ? String(row[5]).trim() : '';
        const rawSubCategory = row[6] ? String(row[6]).trim() : '';
        const sourceWalletStr = row[7] ? String(row[7]).trim() : '';
        const debtTargetLabel = row[8] ? String(row[8]).trim() : '';

        if (!title && amount === 0) return;

        const { month, year, sheetId, label } = parseMonthAndYear(monthLabel, rawDate);
        const date = normalizeDate(rawDate, year, month);
        const category = parseCategory(catLabel);
        const subCategory = rawSubCategory || (RULE_50_30_20_META[category]?.subCategories?.[0] || 'Chi tiêu khác');
        const sourceWallet = parseWalletKey(sourceWalletStr, wallets);
        const { debtTarget, debtAction } = parseDebtTarget(debtTargetLabel, debts);

        const voucher: ExpenseVoucher = {
          id,
          sheetId,
          title,
          amount,
          category,
          subCategory,
          sourceWallet,
          debtTarget,
          debtAction,
          date,
        };

        result.expenses.push(voucher);
        const group = ensureSheetGroup(sheetId, month, year, label);
        group.expenses.push(voucher);
      });
    } else if (rangeName.includes('Thu nhập') || rangeName.includes('Inflow')) {
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const id = row[0] ? String(row[0]).trim() : `inc-${Date.now()}-${idx}`;
        if (id.toLowerCase().includes('mã phiếu')) return;

        const monthLabel = row[1] ? String(row[1]).trim() : '';
        const rawDate = row[2] ? String(row[2]).trim() : '';
        const title = row[3] ? String(row[3]).trim() : 'Khoản thu';
        const amount = parseSheetNumber(row[4]) || 0;
        const targetWalletStr = row[5] ? String(row[5]).trim() : '';

        if (!title && amount === 0) return;

        const { month, year, sheetId, label } = parseMonthAndYear(monthLabel, rawDate);
        const date = normalizeDate(rawDate, year, month);
        const targetWallet = parseWalletKey(targetWalletStr, wallets);

        const voucher: IncomeVoucher = {
          id,
          sheetId,
          title,
          amount,
          targetWallet,
          date,
        };

        result.incomes.push(voucher);
        const group = ensureSheetGroup(sheetId, month, year, label);
        group.incomes.push(voucher);
      });
    } else if (rangeName.includes('Tiết kiệm') || rangeName.includes('Savings')) {
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const id = row[0] ? String(row[0]).trim() : `sav-${Date.now()}-${idx}`;
        if (id.toLowerCase().includes('mã phiếu')) return;

        const monthLabel = row[1] ? String(row[1]).trim() : '';
        const rawDate = row[2] ? String(row[2]).trim() : '';
        const title = row[3] ? String(row[3]).trim() : 'Gửi tiết kiệm';
        const amount = parseSheetNumber(row[4]) || 0;
        const fromWalletStr = row[5] ? String(row[5]).trim() : '';
        const toWalletStr = row[6] ? String(row[6]).trim() : '';

        if (!title && amount === 0) return;

        const { month, year, sheetId, label } = parseMonthAndYear(monthLabel, rawDate);
        const date = normalizeDate(rawDate, year, month);
        const fromWallet = parseWalletKey(fromWalletStr, wallets);
        const toWallet = parseWalletKey(toWalletStr, wallets) || 'savings';

        const voucher: SavingsVoucher = {
          id,
          sheetId,
          title,
          amount,
          fromWallet,
          toWallet,
          date,
        };

        result.savings.push(voucher);
        const group = ensureSheetGroup(sheetId, month, year, label);
        group.savings.push(voucher);
      });
    } else if (rangeName.includes('Khoản cố định') || rangeName.includes('Presets')) {
      const seenPresets = new Set<string>();
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const preset = parsePresetRow(row, wallets, idx);
        if (preset && preset.title) {
          const normTitle = preset.title
            .normalize('NFC')
            .toLowerCase()
            .replace(/[\s\u00A0]+/g, ' ')
            .trim();
          const dedupKey = `${preset.type}_${normTitle}`;
          if (!seenPresets.has(dedupKey)) {
            seenPresets.add(dedupKey);
            result.presets.push({
              ...preset,
              title: preset.title.normalize('NFC').trim(),
            });
          }
        }
      });
    } else if (rangeName.includes('Tỷ lệ') || rangeName.includes('Proportions')) {
      const parsedProps: ProportionRowPayload[] = [];
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const name = String(row[1] || '').trim();
        if (!name || name.toLowerCase().includes('tên danh mục')) return;
        const pct = parseSheetNumber(row[2]) || 0;
        if (pct <= 0) return;
        parsedProps.push({
          id: row[0] && String(row[0]).trim() ? String(row[0]).trim() : `seg-${idx}`,
          name: name.normalize('NFC'),
          percentage: pct,
          colorHex: row[3] ? String(row[3]).trim() : undefined,
          gradient: row[4] ? String(row[4]).trim() : undefined,
        });
      });
      if (parsedProps.length >= 2) {
        result.proportions = parsedProps;
      }
    } else if (rangeName.includes('Phiếu đầu') || rangeName.includes('Initial')) {
      const discoveredWalletsMap = new Map<string, WalletMeta>();
      const discoveredDebtsMap = new Map<string, DebtMeta>();

      rows.forEach((row) => {
        if (!row || row.length === 0) return;
        const id = row[0] ? String(row[0]).trim() : '';
        if (!id || id.toLowerCase().includes('mã định danh') || id.toLowerCase().includes('mã')) return;

        const typeStr = row[1] ? String(row[1]).trim().toLowerCase() : '';
        const name = row[2] ? String(row[2]).trim() : id;
        const shortName = row[3] ? String(row[3]).trim() : name;
        const monthLabel = row[4] ? String(row[4]).trim() : '';
        const initialAmount = parseSheetNumber(row[5]) || 0;

        const isDebt = typeStr.includes('nợ') || typeStr.includes('debt') || typeStr.includes('công nợ');
        const isSavings = typeStr.includes('tiết kiệm') || typeStr.includes('savings');

        if (isDebt) {
          discoveredDebtsMap.set(id, {
            key: id,
            name,
            shortName: shortName || name,
            provider: shortName || name,
            isCustom: true,
          });
        } else {
          discoveredWalletsMap.set(id, {
            key: id,
            name,
            shortName: shortName || name,
            bankCode: isSavings ? 'SAVINGS' : (shortName || 'BANK'),
            isCustom: true,
          });
        }

        if (monthLabel) {
          const { month, year, sheetId, label } = parseMonthAndYear(monthLabel);
          const group = ensureSheetGroup(sheetId, month, year, label);
          if (!group.initialBalances) group.initialBalances = {};
          group.initialBalances[id] = initialAmount;
        }

        if (!result.initialAccounts) result.initialAccounts = [];
        result.initialAccounts.push({
          id,
          type: isDebt ? 'Công nợ' : isSavings ? 'Tiết kiệm' : 'Nguồn tiền',
          name,
          shortName,
          monthLabel,
          initialAmount,
        });
      });

      result.discoveredWallets = Array.from(discoveredWalletsMap.values());
      result.discoveredDebts = Array.from(discoveredDebtsMap.values());
    } else if (rangeName.includes('điều hướng') || rangeName.includes('Navigation')) {
      const parsedNav: BottomNavItemKey[] = [];
      const validKeys: BottomNavItemKey[] = [
        'dashboard',
        'initial_voucher',
        'scan',
        'fixed_presets',
        'expense_vouchers',
        'financial_goals',
      ];
      rows.forEach((row) => {
        if (!row || row.length === 0) return;
        const key = row[1] ? (String(row[1]).trim() as BottomNavItemKey) : null;
        if (key && validKeys.includes(key)) {
          if (!parsedNav.includes(key) && parsedNav.length < 5) {
            parsedNav.push(key);
          }
        }
      });
      if (parsedNav.length === 5) {
        result.bottomNavOrder = parsedNav;
      }
    } else if (rangeName.includes('Mục tiêu') || rangeName.includes('Goals')) {
      const parsedGoals: FinancialGoal[] = [];
      rows.forEach((row, idx) => {
        if (!row || row.length === 0) return;
        const id = row[0] ? String(row[0]).trim() : `goal-${Date.now()}-${idx}`;
        if (id.toLowerCase().includes('mã mục tiêu') || id.toLowerCase().includes('mã định danh')) return;

        const title = row[1] ? String(row[1]).trim() : '';
        if (!title) return;

        const targetAmount = parseSheetNumber(row[2]) || 0;
        const currentAmount = parseSheetNumber(row[3]) || 0;
        const catStr = row[4] ? String(row[4]).trim().toLowerCase() : '';
        const deadline = row[5] ? String(row[5]).trim() : undefined;
        const linkedWalletKey = row[6] ? String(row[6]).trim() : undefined;
        const linkedDebtKey = row[7] ? String(row[7]).trim() : undefined;
        const notes = row[8] ? String(row[8]).trim() : undefined;

        let category: FinancialGoal['category'] = 'savings';
        if (catStr.includes('khẩn cấp') || catStr.includes('emergency')) {
          category = 'emergency_fund';
        } else if (catStr.includes('trả nợ') || catStr.includes('nợ') || catStr.includes('debt')) {
          category = 'debt_payoff';
        } else if (catStr.includes('mua sắm') || catStr.includes('purchase')) {
          category = 'purchase';
        }

        parsedGoals.push({
          id,
          title,
          targetAmount,
          currentAmount,
          category,
          deadline: deadline || undefined,
          linkedWalletKey: linkedWalletKey || undefined,
          linkedDebtKey: linkedDebtKey || undefined,
          notes: notes || undefined,
          createdAt: new Date().toISOString(),
        });
      });
      result.goals = parsedGoals;
    }
  });

  result.totalItems =
    result.expenses.length +
    result.incomes.length +
    result.savings.length +
    result.presets.length +
    (result.initialAccounts?.length || 0) +
    (result.proportions?.length || 0) +
    (result.goals?.length || 0);

  return result;
}

