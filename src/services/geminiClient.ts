import { ReceiptScanResult } from '../types/finance';

/**
 * Safely parse JSON returned from Gemini, stripping any markdown code fences (```json ... ```)
 */
export function parseGeminiJson<T = any>(responseText: string): T {
  if (!responseText) {
    throw new Error('Không nhận được dữ liệu phản hồi từ AI.');
  }

  let cleaned = responseText.trim();

  // Strip leading and trailing markdown code block fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    // Fallback: extract substring between first { or [ and last } or ]
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx > startIdx) {
      const jsonSub = cleaned.substring(startIdx, endIdx + 1);
      return JSON.parse(jsonSub) as T;
    }
    throw new Error(`Dữ liệu từ Gemini không phải định dạng JSON hợp lệ: ${cleaned.slice(0, 120)}`);
  }
}

/**
 * Scan receipt and invoice via server API endpoint (/api/gemini/scan-receipt).
 * The server handles all Gemini API authentication, fallback models, and image extraction.
 */
export async function scanReceiptWithGemini(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ReceiptScanResult> {
  const actualMimeType = mimeType && mimeType.includes('/') ? mimeType : 'image/jpeg';

  const cleanBase64 = String(imageBase64)
    .replace(/^data:[^;]+;base64,/, '')
    .trim();

  if (!cleanBase64) {
    throw new Error('Hình ảnh hóa đơn trống hoặc không thể đọc được.');
  }

  const response = await fetch('/api/gemini/scan-receipt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64: cleanBase64,
      mimeType: actualMimeType,
    }),
  });

  if (!response.ok) {
    let errorMsg = `Lỗi từ máy chủ (${response.status})`;
    try {
      const errData = await response.json();
      if (errData?.error) {
        errorMsg = errData.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const jsonResult = await response.json();
  const rawData = jsonResult.data || jsonResult;
  const item = Array.isArray(rawData) ? rawData[0] || {} : rawData;

  // Sanitize amount
  let parsedAmount = 0;
  if (typeof item.amount === 'number') {
    parsedAmount = Math.abs(item.amount);
  } else if (typeof item.amount === 'string') {
    const cleanNumStr = item.amount.replace(/[^0-9]/g, '');
    parsedAmount = Number(cleanNumStr) || 0;
  }

  const result: ReceiptScanResult = {
    title: String(item.title || 'Giao dịch hóa đơn').trim(),
    amount: parsedAmount,
    date: String(item.date || new Date().toISOString().slice(0, 10)).trim(),
    voucherType: item.voucherType === 'income' ? 'income' : 'expense',
    category: item.category || 'needs_50',
    subCategory: item.subCategory,
    bankName: item.bankName,
    bankCode: item.bankCode,
    debtTarget: item.debtTarget,
    debtAction: item.debtAction,
    suggestedWallet: item.suggestedWallet,
    merchantName: item.merchantName,
    notes: item.notes,
    confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
  };

  return result;
}
