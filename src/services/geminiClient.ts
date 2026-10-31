import { GoogleGenAI } from '@google/genai';
import { ReceiptScanResult } from '../types/finance';

/**
 * Retrieve Gemini API Key in strict priority order:
 * 1. User personal API key in localStorage (if configured)
 * 2. import.meta.env.VITE_GEMINI_API_KEY
 * 3. process.env.GEMINI_API_KEY
 * 4. process.env.VITE_GEMINI_API_KEY
 */
export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const customKey =
      localStorage.getItem('mks_gemini_api_key') ||
      localStorage.getItem('gemini_api_key') ||
      localStorage.getItem('VITE_GEMINI_API_KEY');
    if (customKey && customKey.trim()) {
      return customKey.trim();
    }
  }

  const envKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.VITE_GEMINI_API_KEY) ||
    '';

  return String(envKey || '').trim();
}

/**
 * Compress image using HTML5 Canvas to max dimension 1024px, JPEG quality 0.8
 * ensuring lightweight payload and high OCR recognition fidelity.
 */
export async function compressImageToMax1024(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<{ base64: string; mimeType: string }> {
  if (typeof window === 'undefined' || !imageBase64) {
    return {
      base64: imageBase64.replace(/^data:[^;]+;base64,/, '').trim(),
      mimeType: mimeType || 'image/jpeg',
    };
  }

  const MAX_DIM = 1024;
  const QUALITY = 0.8;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
        const cleanData = dataUrl.replace(/^data:[^;]+;base64,/, '').trim();
        resolve({ base64: cleanData, mimeType: 'image/jpeg' });
        return;
      }
      resolve({
        base64: imageBase64.replace(/^data:[^;]+;base64,/, '').trim(),
        mimeType: 'image/jpeg',
      });
    };
    img.onerror = () => {
      resolve({
        base64: imageBase64.replace(/^data:[^;]+;base64,/, '').trim(),
        mimeType: 'image/jpeg',
      });
    };
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:${mimeType};base64,${imageBase64}`;
  });
}

/**
 * Safely parse JSON returned from Gemini, stripping markdown code block fences (```json ... ```)
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

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Scan receipt and invoice directly on the client using the @google/genai SDK.
 * Runs completely client-side for static hostings (Vercel, Android WebView, AI Studio).
 */
export async function scanReceiptWithGemini(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ReceiptScanResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Chưa tìm thấy Gemini API Key. Vui lòng thiết lập biến môi trường VITE_GEMINI_API_KEY hoặc nhập API Key trong phần Cài đặt.'
    );
  }

  // Compress image to max 1024px, JPEG quality 0.8
  const { base64: cleanBase64, mimeType: actualMimeType } = await compressImageToMax1024(
    imageBase64,
    mimeType
  );

  if (!cleanBase64) {
    throw new Error('Hình ảnh hóa đơn trống hoặc không thể đọc được.');
  }

  // Initialize SDK directly on browser without httpOptions to prevent CORS errors
  const ai = new GoogleGenAI({
    apiKey,
  });

  const promptText = `Bạn là chuyên gia phân tích chứng từ và kế toán cá nhân cho ứng dụng MKS Wallet tại Việt Nam.
Hãy đọc kỹ hình ảnh được cung cấp (đây có thể là: biên lai chuyển khoản ngân hàng VietQR/Vietcombank/Techcombank/MBBank/BIDV/MoMo/ZaloPay, hóa đơn siêu thị/nhà hàng/quán cà phê, thông báo trừ tiền thẻ tín dụng/MasterCard/Visa/Google Play/App Store, vé xe/vé máy bay, hoặc hóa đơn tiện ích điện nước mạng...).
Hãy trích xuất chính xác thông tin giao dịch dưới dạng JSON:

QUY TẮC BẮT BUỘC VỀ THẺ TÍN DỤNG (CREDIT CARD):
- Nếu trong hình có bất kỳ từ ngữ nào liên quan tới thẻ tín dụng như: "MasterCard", "MasterCard (IPM)", "Master Card", "Visa", "JCB", "Credit Card", "Thẻ tín dụng", "Giao dịch mua hàng - Retail", hoặc có dòng "Số thẻ: **** ****":
  + BẮT BUỘC đặt: "debtTarget": "creditCard"
  + BẮT BUỘC đặt: "debtAction": "spend"
  + BẮT BUỘC đặt: "voucherType": "expense"
  + "suggestedWallet": "creditCard"

QUY TẮC PHÂN BIỆT TIỀN VÀO (INCOME) VÀ TIỀN RA (EXPENSE):
- Nếu hình ảnh thể hiện giao dịch NHẬN TIỀN / TIỀN VÀO TÀI KHOẢN (ví dụ có các từ: "Nhận chuyển khoản", "Giao dịch nhận tiền", "Cộng tiền", "Tiền vào", "+ [số tiền]", "Người gửi", "Người chuyển", "Tài khoản nhận", "Tài khoản thụ hưởng", "Đã nhận tiền", "Hoàn tiền", "Lương"):
  + BẮT BUỘC đặt: "voucherType": "income"
- Nếu hình ảnh thể hiện giao dịch CHI TIỀN / TIỀN RA (ví dụ: chuyển khoản đi, mua sắm, thanh toán, trả tiền, trừ tiền thẻ, trừ tiền ví):
  + BẮT BUỘC đặt: "voucherType": "expense"

QUY TẮC XÁC ĐỊNH NGÂN HÀNG HOẶC VÍ GIAO DỊCH (bankName & bankCode):
- Dựa trên logo, watermark, tiêu đề app, hoặc dòng thông tin ngân hàng trong bill để xác định chính xác:
  + "bankName": Tên ngân hàng hoặc ví điện tử (ví dụ: "Vietcombank", "MBBank", "Techcombank", "ACB", "BIDV", "VietinBank", "VPBank", "TPBank", "Sacombank", "Agribank", "VIB", "HDBank", "OCB", "SHB", "MoMo", "ZaloPay", "Viettel Money"...).
  + "bankCode": Mã viết tắt (ví dụ: "VCB", "MB", "TCB", "ACB", "BIDV", "CTG", "VPB", "TPB", "STB", "VBA", "VIB", "HDB", "MOMO", "ZALOPAY"...).

Quy tắc chi tiết các trường trong JSON kết quả:
1. "voucherType": 'income' nếu là nhận tiền/tiền vào; 'expense' nếu là chi tiền/mua hàng/quẹt thẻ.
2. "amount": Số tiền giao dịch tính bằng VNĐ (kiểu số nguyên dương, ví dụ 145000, 135556, 50000, 245000, 3200000). Tuyệt đối không thêm chữ đ, dấu âm (-) hay dấu phẩy.
3. "title": Tiêu đề ngắn gọn mô tả giao dịch (ví dụ: "Nhận chuyển khoản", "Google One", "Ăn trưa Kichi", "Highlands Coffee", "Chuyển tiền tiền nhà", "Mua đồ Winmart", "Thanh toán Shopee").
4. "date": Ngày giao dịch theo định dạng YYYY-MM-DD (Ví dụ: "2026-10-22"). Nếu không có năm trên ảnh, mặc định dùng năm hiện tại (${new Date().getFullYear()}). Nếu không tìm thấy ngày, hãy dùng ngày hôm nay.
5. "category": Phân loại 50-30-20 (chỉ áp dụng nếu là expense): "needs_50", "wants_30", hoặc "savings_debt_20". Nếu là "income", có thể để null hoặc "needs_50".
6. "subCategory": Hạng mục con cụ thể.
7. "merchantName": Tên đơn vị bán hàng, người chuyển hoặc người nhận tiền.
8. "bankName": Tên ngân hàng hoặc ví xác định từ chứng từ.
9. "bankCode": Mã ngân hàng (ví dụ: "MB", "VCB", "TCB", "ACB", "BIDV", "VPB", "TPB", "MOMO"...).
10. "debtTarget": "creditCard" (nếu là MasterCard, Visa, thẻ tín dụng), "shopeePayLater" (nếu là Shopee PayLater), hoặc null nếu không phải ghi nợ.
11. "debtAction": "spend" (nếu quẹt thẻ/ghi nợ), hoặc "pay" (nếu trả nợ thẻ), hoặc null.
12. "suggestedWallet": "bank" (nếu chuyển khoản ngân hàng), "cash" (nếu tiền mặt), hoặc "creditCard" (nếu quẹt thẻ tín dụng).
13. "notes": Ghi chú nội dung chuyển khoản hoặc mã giao dịch.
14. "confidence": Số từ 0 đến 1 thể hiện độ rõ ràng của chứng từ trích xuất.`;

  // Standard model as requested: gemini-2.5-flash with resilient fallback chain
  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
  ];

  let response: any = null;
  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: actualMimeType,
                  data: cleanBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
          },
        }),
        25000,
        `Quá thời gian phản hồi (25s) từ mô hình ${modelName}.`
      );

      if (response && response.text) {
        break;
      }
    } catch (attemptErr: any) {
      console.warn(`[ClientScan] Model ${modelName} notice:`, attemptErr?.message || attemptErr);
      lastError = attemptErr;
    }
  }

  if (!response || !response.text) {
    const errorDetails = lastError?.message || 'Không nhận được phản hồi từ AI.';
    throw new Error(`Lỗi quét hóa đơn: ${errorDetails}`);
  }

  const responseText = (response.text || '').trim();
  const parsedData = parseGeminiJson<any>(responseText);
  const item = Array.isArray(parsedData) ? parsedData[0] || {} : parsedData;

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
