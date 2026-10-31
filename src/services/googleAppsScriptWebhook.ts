import { FullSyncPayload, PulledSheetData } from './googleSheets';
import { ExpenseVoucher, IncomeVoucher, MonthlySheet, SavingsVoucher, FixedPresetItem } from '../types/finance';

export const GOOGLE_SHEETS_WEBHOOK_KEY = 'mks_google_sheets_webhook_url';

export const getStoredWebhookUrl = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(GOOGLE_SHEETS_WEBHOOK_KEY)?.trim() || '';
  } catch {
    return '';
  }
};

export const setStoredWebhookUrl = (url: string) => {
  if (typeof window === 'undefined') return;
  try {
    if (url && url.trim()) {
      localStorage.setItem(GOOGLE_SHEETS_WEBHOOK_KEY, url.trim());
    } else {
      localStorage.removeItem(GOOGLE_SHEETS_WEBHOOK_KEY);
    }
  } catch {
    // ignore
  }
};

/**
 * Ready-to-use Google Apps Script code to paste into Google Sheets
 * Extensions -> Apps Script -> Paste this code -> Deploy -> New Deployment -> Web App (Access: Anyone)
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * MKS Wallet - Google Sheets Webhook Synchronizer
 * Hỗ trợ đồng bộ 2 chiều (Đẩy dữ liệu và Kéo dữ liệu) vĩnh viễn không cần OAuth.
 */

function setupHeadersIfEmpty(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e6f4ea");
  }
}

function ensureTabs(ss) {
  var tabConfigs = [
    { name: "Chi tiêu (Outflow)", headers: ["ID", "Tháng", "Ngày", "Tên khoản chi", "Số tiền (VNĐ)", "Nhóm 50/30/20", "Danh mục con", "Ví nguồn", "Nguồn nợ / Trả nợ", "Thời gian ghi"] },
    { name: "Thu nhập (Inflow)", headers: ["ID", "Tháng", "Ngày", "Tên khoản thu", "Số tiền (VNĐ)", "Ví nhận", "Thời gian ghi"] },
    { name: "Tiết kiệm (Savings)", headers: ["ID", "Tháng", "Ngày", "Mục tiêu tiết kiệm", "Số tiền (VNĐ)", "Ví trích", "Quỹ đích", "Thời gian ghi"] },
    { name: "Khoản cố định (Presets)", headers: ["ID", "Tên khoản cố định", "Số tiền (VNĐ)", "Nhóm", "Danh mục con", "Ví trích"] }
  ];

  tabConfigs.forEach(function(cfg) {
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.name);
    }
    setupHeadersIfEmpty(sheet, cfg.headers);
  });
}

// Nhận yêu cầu PUSH dữ liệu từ App MKS Wallet
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    if (!contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Không có dữ liệu gửi lên" })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureTabs(ss);

    // Kiểm tra kết nối Ping
    if (data.action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        sheetName: ss.getName(),
        sheetUrl: ss.getUrl(),
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Đồng bộ toàn bộ dữ liệu (Full Sync)
    if (data.action === "sync_all" && data.payload) {
      var payload = data.payload;
      var nowStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

      // 1. Chi tiêu
      var outSheet = ss.getSheetByName("Chi tiêu (Outflow)");
      if (outSheet.getLastRow() > 1) {
        outSheet.getRange(2, 1, outSheet.getLastRow() - 1, 10).clearContent();
      }
      if (payload.expenses && payload.expenses.length > 0) {
        var expenseRows = payload.expenses.map(function(item) {
          return [item.id, item.monthLabel || "", item.date || "", item.title || "", Number(item.amount) || 0, item.categoryLabel || "", item.subCategory || "", item.sourceWalletName || "", item.debtTargetLabel || "", nowStr];
        });
        outSheet.getRange(2, 1, expenseRows.length, 10).setValues(expenseRows);
      }

      // 2. Thu nhập
      var inSheet = ss.getSheetByName("Thu nhập (Inflow)");
      if (inSheet.getLastRow() > 1) {
        inSheet.getRange(2, 1, inSheet.getLastRow() - 1, 7).clearContent();
      }
      if (payload.incomes && payload.incomes.length > 0) {
        var incomeRows = payload.incomes.map(function(item) {
          return [item.id, item.monthLabel || "", item.date || "", item.title || "", Number(item.amount) || 0, item.targetWalletName || "", nowStr];
        });
        inSheet.getRange(2, 1, incomeRows.length, 7).setValues(incomeRows);
      }

      // 3. Tiết kiệm
      var savSheet = ss.getSheetByName("Tiết kiệm (Savings)");
      if (savSheet.getLastRow() > 1) {
        savSheet.getRange(2, 1, savSheet.getLastRow() - 1, 8).clearContent();
      }
      if (payload.savings && payload.savings.length > 0) {
        var savRows = payload.savings.map(function(item) {
          return [item.id, item.monthLabel || "", item.date || "", item.title || "", Number(item.amount) || 0, item.fromWalletName || "", item.targetFundName || "", nowStr];
        });
        savSheet.getRange(2, 1, savRows.length, 8).setValues(savRows);
      }

      // 4. Khoản cố định
      var preSheet = ss.getSheetByName("Khoản cố định (Presets)");
      if (preSheet.getLastRow() > 1) {
        preSheet.getRange(2, 1, preSheet.getLastRow() - 1, 6).clearContent();
      }
      if (payload.presets && payload.presets.length > 0) {
        var preRows = payload.presets.map(function(item) {
          return [item.id, item.title || "", Number(item.amount) || 0, item.category || "", item.subCategory || "", item.sourceWallet || ""];
        });
        preSheet.getRange(2, 1, preRows.length, 6).setValues(preRows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Đồng bộ toàn bộ thành công!",
        sheetName: ss.getName(),
        sheetUrl: ss.getUrl(),
        timestamp: nowStr,
        totalItems: (payload.expenses ? payload.expenses.length : 0) + (payload.incomes ? payload.incomes.length : 0) + (payload.savings ? payload.savings.length : 0)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Hành động không xác định" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Nhận yêu cầu PULL dữ liệu từ Google Sheet về App
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureTabs(ss);

    var pullData = {
      expenses: [],
      incomes: [],
      savings: [],
      presets: [],
      sheetName: ss.getName(),
      sheetUrl: ss.getUrl(),
      status: "success"
    };

    var outSheet = ss.getSheetByName("Chi tiêu (Outflow)");
    if (outSheet && outSheet.getLastRow() > 1) {
      var rows = outSheet.getRange(2, 1, outSheet.getLastRow() - 1, 10).getValues();
      pullData.expenses = rows.map(function(r) {
        return { id: r[0], monthLabel: r[1], date: r[2], title: r[3], amount: r[4], category: r[5], subCategory: r[6], sourceWallet: r[7], debtTarget: r[8] };
      });
    }

    var inSheet = ss.getSheetByName("Thu nhập (Inflow)");
    if (inSheet && inSheet.getLastRow() > 1) {
      var inRows = inSheet.getRange(2, 1, inSheet.getLastRow() - 1, 7).getValues();
      pullData.incomes = inRows.map(function(r) {
        return { id: r[0], monthLabel: r[1], date: r[2], title: r[3], amount: r[4], targetWallet: r[5] };
      });
    }

    var savSheet = ss.getSheetByName("Tiết kiệm (Savings)");
    if (savSheet && savSheet.getLastRow() > 1) {
      var savRows = savSheet.getRange(2, 1, savSheet.getLastRow() - 1, 8).getValues();
      pullData.savings = savRows.map(function(r) {
        return { id: r[0], monthLabel: r[1], date: r[2], title: r[3], amount: r[4], sourceWallet: r[5], targetFund: r[6] };
      });
    }

    return ContentService.createTextOutput(JSON.stringify(pullData)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;

export interface WebhookTestResult {
  success: boolean;
  sheetName?: string;
  sheetUrl?: string;
  message?: string;
}

/**
 * Tests connection with the Google Apps Script Webhook URL
 */
export async function testWebhookConnection(webhookUrl: string): Promise<WebhookTestResult> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl.startsWith('https://script.google.com/macros/s/')) {
    return {
      success: false,
      message: 'URL không đúng định dạng. Webhook phải bắt đầu bằng: https://script.google.com/macros/s/.../exec',
    };
  }

  try {
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ action: 'ping' }),
    });

    if (!res.ok) {
      return {
        success: false,
        message: `Máy chủ Google Apps Script trả về mã lỗi: ${res.status} (${res.statusText})`,
      };
    }

    const data = await res.json();
    if (data.status === 'success') {
      return {
        success: true,
        sheetName: data.sheetName || 'Google Sheet của bạn',
        sheetUrl: data.sheetUrl || '',
      };
    }

    return {
      success: false,
      message: data.message || 'Không thể phản hồi từ Apps Script.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Không thể kết nối tới Google Webhook. Kiểm tra lại quyền "Ai có quyền truy cập: Bất kỳ ai".',
    };
  }
}

/**
 * Pushes all financial data to Google Sheets via Webhook
 */
export async function syncAllDataViaWebhook(
  webhookUrl: string,
  payload: FullSyncPayload
): Promise<{ success: boolean; totalItems: number; timestamp: string; sheetName?: string; sheetUrl?: string }> {
  const cleanUrl = webhookUrl.trim();
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const res = await fetch(cleanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'sync_all',
      payload,
    }),
  });

  if (!res.ok) {
    throw new Error(`Lỗi kết nối Webhook Google Sheets: ${res.status}`);
  }

  const data = await res.json();
  if (data.status !== 'success') {
    throw new Error(data.message || 'Lỗi khi đồng bộ lên Google Sheet qua Webhook');
  }

  return {
    success: true,
    totalItems: data.totalItems || 0,
    timestamp: data.timestamp || now,
    sheetName: data.sheetName,
    sheetUrl: data.sheetUrl,
  };
}

/**
 * Pulls all financial data from Google Sheets via Webhook
 */
export async function pullDataViaWebhook(
  webhookUrl: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const cleanUrl = webhookUrl.trim();

  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
    });

    if (!res.ok) {
      return { success: false, error: `Lỗi kết nối Webhook: ${res.status}` };
    }

    const data = await res.json();
    if (data.status === 'success') {
      return { success: true, data };
    }
    return { success: false, error: data.message || 'Không đọc được dữ liệu' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi mạng khi kéo dữ liệu từ Webhook' };
  }
}
