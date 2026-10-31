import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Scan,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Wallet,
  X,
  FileText,
  Layers,
} from 'lucide-react';
import {
  RuleCategory,
  RULE_50_30_20_META,
  WalletMeta,
  DebtMeta,
  ReceiptScanResult,
  AssetKey,
  DebtKey,
} from '../types/finance';
import { scanReceiptWithGemini } from '../services/geminiClient';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: WalletMeta[];
  debts: DebtMeta[];
  onSaveVoucher: (data: {
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
  }) => void;
}

interface AutoCreatedFeedback {
  title: string;
  amount: number;
  date: string;
  type: 'expense' | 'income';
  isCreditCard: boolean;
  debtName?: string;
  categoryLabel?: string;
  walletName?: string;
  bankName?: string;
  subCategory?: string;
}

export interface ScanItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  previewUrl: string;
  mimeType: string;
  status: 'pending' | 'scanning' | 'success' | 'error';
  result?: AutoCreatedFeedback;
  errorMsg?: string;
}

const VIETNAM_BANKS: Array<{ name: string; code: string; regex: RegExp }> = [
  { name: 'Vietcombank', code: 'VCB', regex: /vietcombank|vcb/i },
  { name: 'MBBank', code: 'MB', regex: /mbbank|mb\s*bank|ngân\s*hàng\s*quân\s*đội|\bmb\b/i },
  { name: 'Techcombank', code: 'TCB', regex: /techcombank|tcb/i },
  { name: 'ACB', code: 'ACB', regex: /\bacb\b|á\s*châu/i },
  { name: 'BIDV', code: 'BIDV', regex: /\bbidv\b|đầu\s*tư\s*và\s*phát\s*triển/i },
  { name: 'VietinBank', code: 'CTG', regex: /vietinbank|vietin\s*bank|\bctg\b/i },
  { name: 'VPBank', code: 'VPB', regex: /vpbank|vp\s*bank|\bcake\b/i },
  { name: 'TPBank', code: 'TPB', regex: /tpbank|tp\s*bank|tiên\s*phong/i },
  { name: 'Sacombank', code: 'STB', regex: /sacombank|\bstb\b/i },
  { name: 'Agribank', code: 'VBA', regex: /agribank|\bvba\b/i },
  { name: 'VIB', code: 'VIB', regex: /\bvib\b/i },
  { name: 'HDBank', code: 'HDB', regex: /hdbank|\bhdb\b/i },
  { name: 'OCB', code: 'OCB', regex: /\bocb\b/i },
  { name: 'SHB', code: 'SHB', regex: /\bshb\b/i },
  { name: 'MSB', code: 'MSB', regex: /\bmsb\b|hàng\s*hải/i },
  { name: 'SeABank', code: 'SEAB', regex: /seabank/i },
  { name: 'LPBank', code: 'LPB', regex: /lpbank|lienvietpostbank/i },
  { name: 'Timo', code: 'TIMO', regex: /timo/i },
  { name: 'Ví MoMo', code: 'MOMO', regex: /momo/i },
  { name: 'Ví ZaloPay', code: 'ZALOPAY', regex: /zalopay|zalo\s*pay/i },
  { name: 'Viettel Money', code: 'VTM', regex: /viettel\s*money/i },
];

async function optimizeImageForScan(file: File): Promise<{ base64: string; mimeType: string }> {
  const MAX_DIM = 1024; // Compress to max 1024px for optimal OCR recognition & lightweight memory
  const QUALITY = 0.8;

  // Method 1: Modern createImageBitmap (fastest & lowest memory overhead on mobile)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;
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
        ctx.drawImage(bitmap, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', QUALITY);
        return { base64: compressed, mimeType: 'image/jpeg' };
      }
    } catch (e) {
      console.warn('createImageBitmap failed, falling back to FileReader:', e);
    }
  }

  // Method 2: Traditional FileReader + Image
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawBase64 = e.target?.result as string;
      const img = new Image();
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
          const compressed = canvas.toDataURL('image/jpeg', QUALITY);
          resolve({ base64: compressed, mimeType: 'image/jpeg' });
          return;
        }
        resolve({ base64: rawBase64, mimeType: file.type || 'image/jpeg' });
      };
      img.onerror = () => {
        resolve({ base64: rawBase64, mimeType: file.type || 'image/jpeg' });
      };
      img.src = rawBase64;
    };
    reader.onerror = () => {
      resolve({ base64: '', mimeType: 'image/jpeg' });
    };
    reader.readAsDataURL(file);
  });
}

export function ReceiptScannerModal({
  isOpen,
  onClose,
  wallets,
  debts,
  onSaveVoucher,
}: ReceiptScannerModalProps) {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);
  const [previewingItemId, setPreviewingItemId] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isQueueRunningRef = useRef<boolean>(false);
  const itemsRef = useRef<ScanItem[]>([]);
  itemsRef.current = items;

  const handleReset = useCallback(() => {
    setItems([]);
    setIsProcessingQueue(false);
    setPreviewingItemId(null);
    setGeneralError(null);
    isQueueRunningRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  // Tự động dọn sạch ảnh và trạng thái mỗi khi cửa sổ modal bị đóng hoặc mở lại
  useEffect(() => {
    if (!isOpen) {
      handleReset();
    }
  }, [isOpen, handleReset]);

  // Hỗ trợ đóng & reset khi nhấn phím Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const processSingleReceipt = async (
    item: ScanItem
  ): Promise<AutoCreatedFeedback> => {
    const rawResult: any = await scanReceiptWithGemini(
      item.previewUrl,
      item.mimeType || 'image/jpeg'
    );

    // Support both single object and array returned by AI
    const data: ReceiptScanResult = Array.isArray(rawResult)
      ? (rawResult[0] || {})
      : (rawResult?.data && Array.isArray(rawResult.data))
      ? (rawResult.data[0] || {})
      : rawResult || {};

    const rawText = `${data.title || ''} ${data.notes || ''} ${data.merchantName || ''} ${data.subCategory || ''} ${data.bankName || ''}`.toLowerCase();

    // 1. Kiểm tra xem có liên quan tới thẻ tín dụng (MasterCard, Visa, JCB, Retail...) không
    const isCreditCard =
      data.debtTarget === 'creditCard' ||
      data.suggestedWallet === 'creditCard' ||
      /master\s*card|mastercard|visa|jcb|credit\s*card|thẻ\s*tín\s*dụng|retail|\(ipm\)|ipm/i.test(rawText);

    // 2. Nhận diện giao dịch nhận tiền / tiền vào (Income)
    const isExplicitIncome =
      !isCreditCard &&
      (data.voucherType === 'income' ||
        /nhận\s*chuyển\s*khoản|nhận\s*tiền|tiền\s*vào|giao\s*dịch\s*nhận|cộng\s*tiền|tiền\s*đến|hoàn\s*tiền|lương|người\s*chuyển|thụ\s*hưởng|\+\s*\d/i.test(rawText) ||
        /nhận\s*chuyển\s*khoản|nhận\s*tiền|tiền\s*vào|hoàn\s*tiền/i.test(data.title || ''));

    const vType: 'income' | 'expense' = isCreditCard ? 'expense' : isExplicitIncome ? 'income' : 'expense';

    // Parse amount robustly across numbers and formatted strings (e.g. 399.000, -399000, 399.000 VND)
    let cleanAmount = 0;
    if (typeof data.amount === 'number') {
      cleanAmount = Math.abs(data.amount);
    } else if (typeof data.amount === 'string') {
      const numOnly = (data.amount as string).replace(/[^0-9]/g, '');
      cleanAmount = Number(numOnly) || 0;
    }

    if (cleanAmount <= 0) {
      const textToSearch = `${data.title || ''} ${data.notes || ''} ${item.fileName || ''}`;
      const moneyMatch = textToSearch.match(/(\d+(?:[.,]\d+)?)\s*(?:k|vnđ|vnd|đ)/i) || textToSearch.match(/\b\d{2,3}[.,]\d{3}\b/);
      if (moneyMatch) {
        const parsed = Number(moneyMatch[0].replace(/[^0-9]/g, ''));
        if (parsed > 0) cleanAmount = parsed;
      }
    }

    if (cleanAmount <= 0) {
      throw new Error('AI không nhận diện được số tiền hợp lệ trên chứng từ này. Vui lòng kiểm tra lại ảnh chụp.');
    }

    // 3. Nhận diện ngân hàng hoặc ví giao dịch trực tiếp từ bill
    let detectedBankName = data.bankName;
    let detectedBankCode = data.bankCode;

    if (!detectedBankName) {
      for (const b of VIETNAM_BANKS) {
        if (b.regex.test(rawText)) {
          detectedBankName = b.name;
          detectedBankCode = b.code;
          break;
        }
      }
    }

    // Tìm ví khớp trong danh sách ví hiện tại của người dùng
    let matchedWallet: WalletMeta | undefined;
    if (detectedBankName || detectedBankCode) {
      const normName = (detectedBankName || '').toLowerCase().replace(/[\s\-_]/g, '');
      const normCode = (detectedBankCode || '').toLowerCase().replace(/[\s\-_]/g, '');
      matchedWallet = wallets.find((w) => {
        const wCode = (w.bankCode || '').toLowerCase().replace(/[\s\-_]/g, '');
        const wName = (w.name || '').toLowerCase().replace(/[\s\-_]/g, '');
        const wShort = (w.shortName || '').toLowerCase().replace(/[\s\-_]/g, '');
        const wKey = (w.key || '').toLowerCase().replace(/[\s\-_]/g, '');
        return (
          (normCode && wCode && wCode === normCode) ||
          (normCode && wKey.includes(normCode)) ||
          (normName && wName.includes(normName)) ||
          (normName && normName.includes(wName)) ||
          (normCode && wShort.includes(normCode))
        );
      });
    }

    if (!matchedWallet) {
      matchedWallet =
        wallets.find((w) => w.key === data.suggestedWallet) ||
        wallets.find((w) => w.key === 'bank') ||
        wallets[0];
    }

    const creditDebtMeta = debts.find((d) => d.key === 'creditCard') || debts[0];
    const resolvedDebtTarget = isCreditCard ? (creditDebtMeta?.key || 'creditCard') : undefined;
    const resolvedDebtAction = isCreditCard ? 'spend' : undefined;

    const resolvedSourceWallet = isCreditCard ? undefined : (matchedWallet?.key || 'bank');
    const resolvedTargetWallet = vType === 'income' ? (matchedWallet?.key || 'bank') : undefined;

    const finalTitle = data.title || (isCreditCard ? 'Chi tiêu thẻ tín dụng' : vType === 'income' ? 'Thu nhập' : 'Chi tiêu');
    const finalDate = data.date || new Date().toISOString().split('T')[0];
    const finalCategory: RuleCategory =
      data.category && (['needs_50', 'wants_30', 'savings_debt_20'] as RuleCategory[]).includes(data.category)
        ? data.category
        : isCreditCard
        ? 'wants_30'
        : 'needs_50';
    const finalSubCategory = data.subCategory || (isCreditCard ? 'Mua sắm quần áo/Đồ công nghệ' : vType === 'income' ? 'Khoản thu' : 'Ăn uống hàng ngày');

    const methodLabel = isCreditCard
      ? `Ghi nợ ${creditDebtMeta?.name || 'Thẻ tín dụng'}`
      : detectedBankName || matchedWallet?.name || 'Tài khoản Ngân hàng';

    const noteParts: string[] = [];
    if (detectedBankName && !isCreditCard) noteParts.push(detectedBankName);
    if (data.merchantName) noteParts.push(data.merchantName);
    if (data.notes) noteParts.push(data.notes);
    if (isCreditCard) noteParts.push('Thẻ tín dụng / MasterCard');
    const finalNote = noteParts.length > 0 ? `[AI Scan] ${noteParts.join(' · ')}` : '[AI Scan]';

    // TỰ ĐỘNG LƯU PHIẾU NGAY LẬP TỨC
    onSaveVoucher({
      type: vType,
      title: finalTitle,
      amount: cleanAmount,
      date: finalDate,
      category: finalCategory,
      subCategory: finalSubCategory,
      sourceWallet: resolvedSourceWallet,
      targetWallet: resolvedTargetWallet,
      bankName: detectedBankName,
      bankCode: detectedBankCode,
      debtTarget: resolvedDebtTarget,
      debtAction: resolvedDebtAction,
      note: finalNote,
    });

    return {
      title: finalTitle,
      amount: cleanAmount,
      date: finalDate,
      type: vType,
      isCreditCard,
      debtName: isCreditCard ? (creditDebtMeta?.name || 'Thẻ tín dụng') : undefined,
      categoryLabel: RULE_50_30_20_META[finalCategory]?.shortLabel,
      walletName: methodLabel,
      bankName: detectedBankName,
      subCategory: finalSubCategory,
    };
  };

  const runQueue = useCallback(async () => {
    if (isQueueRunningRef.current) return;
    isQueueRunningRef.current = true;
    setIsProcessingQueue(true);

    try {
      while (true) {
        const currentList = itemsRef.current;
        const nextPending = currentList.find((it) => it.status === 'pending');
        if (!nextPending) break;

        const itemId = nextPending.id;

        // Mark as scanning
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, status: 'scanning', errorMsg: undefined } : it))
        );

        try {
          const feedback = await processSingleReceipt(nextPending);
          setItems((prev) =>
            prev.map((it) => (it.id === itemId ? { ...it, status: 'success', result: feedback } : it))
          );
        } catch (err: any) {
          console.error(`Error processing image ${nextPending.fileName}:`, err);
          const rawErr = err?.message || String(err) || 'Lỗi không xác định';
          let cleanMsg = `Lỗi: ${rawErr}`;
          if (rawErr.includes('API Key') || rawErr.includes('API_KEY')) {
            cleanMsg = `Thiếu hoặc sai API Key: ${rawErr}. Vui lòng kiểm tra lại cấu hình API Key.`;
          } else if (rawErr.includes('25s') || rawErr.includes('Quá thời gian')) {
            cleanMsg = `Quá thời gian chờ phản hồi từ AI (${rawErr}). Nhấn Thử lại để quét lại.`;
          } else if (rawErr.includes('503') || rawErr.includes('high demand') || rawErr.includes('UNAVAILABLE')) {
            cleanMsg = `Mô hình AI đang bận tạm thời (503): ${rawErr}. Nhấn Thử lại sau giây lát.`;
          } else if (rawErr.includes('429') || rawErr.includes('quota') || rawErr.includes('RESOURCE_EXHAUSTED')) {
            cleanMsg = `Đạt hạn mức gọi tạm thời (429): ${rawErr}. Vui lòng thử lại sau giây lát.`;
          }

          setItems((prev) =>
            prev.map((it) => (it.id === itemId ? { ...it, status: 'error', errorMsg: cleanMsg } : it))
          );
        }

        // Brief delay between scans for smooth UX & API friendliness
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      isQueueRunningRef.current = false;
      setIsProcessingQueue(false);
    }
  }, [wallets, debts, onSaveVoucher]);

  const handleAddFiles = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    const validImageFiles = rawFiles.filter((f) => f.type.startsWith('image/'));

    if (validImageFiles.length === 0) {
      setGeneralError('Vui lòng chọn ít nhất một tệp hình ảnh (PNG, JPG, JPEG, WEBP).');
      return;
    }

    setGeneralError(null);

    // Optimize images in parallel
    const newItems: ScanItem[] = await Promise.all(
      validImageFiles.map(async (file, idx) => {
        const { base64, mimeType } = await optimizeImageForScan(file);
        return {
          id: `scan-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          fileName: file.name,
          fileSize: file.size,
          previewUrl: base64,
          mimeType: mimeType || 'image/jpeg',
          status: 'pending' as const,
        };
      })
    );

    setItems((prev) => [...prev, ...newItems]);

    // Trigger queue run
    setTimeout(() => {
      runQueue();
    }, 50);
  };

  const handleRetryItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'pending', errorMsg: undefined } : it))
    );
    setTimeout(() => {
      runQueue();
    }, 50);
  };

  const handleRetryAllErrors = () => {
    setItems((prev) =>
      prev.map((it) => (it.status === 'error' ? { ...it, status: 'pending', errorMsg: undefined } : it))
    );
    setTimeout(() => {
      runQueue();
    }, 50);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      handleAddFiles(e.clipboardData.files);
    }
  };

  const formatVND = (num: number) => {
    return (num || 0).toLocaleString('vi-VN') + ' đ';
  };

  if (!isOpen) return null;

  const totalCount = items.length;
  const successCount = items.filter((it) => it.status === 'success').length;
  const errorCount = items.filter((it) => it.status === 'error').length;
  const pendingOrScanningCount = items.filter(
    (it) => it.status === 'pending' || it.status === 'scanning'
  ).length;

  const totalExpenseCreated = items
    .filter((it) => it.status === 'success' && it.result?.type === 'expense')
    .reduce((sum, it) => sum + (it.result?.amount || 0), 0);

  const totalIncomeCreated = items
    .filter((it) => it.status === 'success' && it.result?.type === 'income')
    .reduce((sum, it) => sum + (it.result?.amount || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm cursor-pointer"
      onClick={handleClose}
      onPaste={handlePaste}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden Multi-file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Scan Hóa Đơn & Biên Lai (Đa Ảnh)
                </h2>
                {totalCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300">
                    {successCount}/{totalCount} phiếu
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI tự động nhận diện nhiều hóa đơn cùng lúc & ghi nhận trực tiếp vào sổ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Progress Bar (if processing) */}
        {isProcessingQueue && totalCount > 0 && (
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 overflow-hidden">
            <div
              className="bg-teal-500 h-full transition-all duration-300 animate-pulse"
              style={{
                width: `${Math.round((successCount / totalCount) * 100)}%`,
              }}
            />
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {generalError && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{generalError}</span>
              </div>
              <button
                type="button"
                onClick={() => setGeneralError(null)}
                className="text-xs underline hover:no-underline font-medium text-rose-600 dark:text-rose-400"
              >
                Bỏ qua
              </button>
            </div>
          )}

          {/* EMPTY STATE: Upload Box */}
          {items.length === 0 ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-400 rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all bg-slate-50/60 dark:bg-slate-800/20 hover:bg-teal-50/20 dark:hover:bg-teal-950/10 group"
            >
              <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-teal-50 dark:bg-slate-800 text-teal-600 dark:text-teal-400 border border-teal-200/50 dark:border-slate-700 group-hover:scale-105 group-hover:border-teal-500 flex items-center justify-center transition-all shadow-xs">
                <Layers className="w-7 h-7" />
              </div>
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                Nhấn để chọn hình
              </p>
            </div>
          ) : (
            /* POPULATED STATE: Batch Queue View */
            <div className="space-y-4">
              {/* Summary Stats & Action Toolbar */}
              <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Tổng ảnh: </span>
                    <strong className="text-slate-900 dark:text-white font-semibold">
                      {totalCount}
                    </strong>
                  </div>
                  {successCount > 0 && (
                    <div className="text-xs flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{successCount} thành công</span>
                    </div>
                  )}
                  {pendingOrScanningCount > 0 && (
                    <div className="text-xs flex items-center gap-1 text-teal-600 dark:text-teal-400">
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{pendingOrScanningCount} đang xử lý</span>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="text-xs flex items-center gap-1 text-rose-500">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errorCount} lỗi</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {errorCount > 0 && !isProcessingQueue && (
                    <button
                      type="button"
                      onClick={handleRetryAllErrors}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 hover:bg-rose-200 transition-colors flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" />
                      Thử lại {errorCount} ảnh lỗi
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingQueue}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nhấn để chọn thêm hình
                  </button>
                </div>
              </div>

              {/* Total Financial Result Badge if any vouchers created */}
              {(totalExpenseCreated > 0 || totalIncomeCreated > 0) && (
                <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                    Đã tự động tạo {successCount} phiếu vào sổ tháng:
                  </span>
                  <div className="flex items-center gap-3 font-mono font-bold">
                    {totalIncomeCreated > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        + {formatVND(totalIncomeCreated)}
                      </span>
                    )}
                    {totalExpenseCreated > 0 && (
                      <span className="text-rose-500 dark:text-rose-400">
                        - {formatVND(totalExpenseCreated)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {items.map((item, idx) => {
                  const isScanning = item.status === 'scanning';
                  const isSuccess = item.status === 'success';
                  const isError = item.status === 'error';
                  const isPending = item.status === 'pending';
                  const res = item.result;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isSuccess
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50'
                          : isError
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                          : isScanning
                          ? 'bg-teal-50/50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700 animate-pulse'
                          : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Left: Thumbnail & Main info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-700 cursor-pointer group"
                          onClick={() =>
                            setPreviewingItemId(
                              previewingItemId === item.id ? null : item.id
                            )
                          }
                          title="Nhấn để xem ảnh to hơn"
                        >
                          <img
                            src={item.previewUrl}
                            alt={item.fileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 flex items-center justify-center text-white text-[10px] font-mono">
                            #{idx + 1}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          {isSuccess && res ? (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                                  {res.title}
                                </span>
                                <span
                                  className={`text-xs font-bold font-mono shrink-0 ${
                                    res.type === 'income'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-500 dark:text-rose-400'
                                  }`}
                                >
                                  {res.type === 'income' ? '+ ' : '- '}
                                  {formatVND(res.amount)}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="font-mono">{res.date}</span>
                                <span>•</span>
                                <span className="font-medium text-indigo-600 dark:text-indigo-400">
                                  {res.walletName || 'Tài khoản Ngân hàng'}
                                </span>
                                <span>•</span>
                                <span>
                                  {res.type === 'income'
                                    ? 'Khoản thu'
                                    : res.categoryLabel || 'Thiết yếu'}
                                </span>
                              </div>
                            </>
                          ) : isError ? (
                            <>
                              <div className="font-medium text-xs text-rose-700 dark:text-rose-300 truncate">
                                {item.fileName}
                              </div>
                              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                                {item.errorMsg || 'Không thể trích xuất thông tin hóa đơn'}
                              </p>
                            </>
                          ) : isScanning ? (
                            <>
                              <div className="font-semibold text-xs text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                                <RotateCw className="w-3.5 h-3.5 animate-spin text-teal-500" />
                                <span>Đang phân tích chứng từ & tạo phiếu...</span>
                              </div>
                              <p className="text-[11px] text-teal-600/80 dark:text-teal-400/80 truncate">
                                Gemini AI siêu tốc · {item.fileName}
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="font-medium text-xs text-slate-700 dark:text-slate-300 truncate">
                                {item.fileName}
                              </div>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Đang xếp hàng chờ phân tích...
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions / Status Badge */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {isSuccess && (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Đã tạo</span>
                          </div>
                        )}

                        {isError && (
                          <button
                            type="button"
                            onClick={() => handleRetryItem(item.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            Thử lại
                          </button>
                        )}

                        {isPending && (
                          <span className="text-[11px] text-slate-400 italic">
                            Chờ lượt
                          </span>
                        )}

                        {!isScanning && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Xóa khỏi danh sách"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Large Image Preview Modal / Popover if user clicks thumbnail */}
              {previewingItemId && (
                <div
                  className="p-3 bg-slate-950 rounded-xl border border-slate-800 relative flex flex-col items-center justify-center animate-in fade-in duration-150"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewingItemId(null)}
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white bg-black/60 rounded-full"
                    title="Đóng xem ảnh"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <img
                    src={items.find((it) => it.id === previewingItemId)?.previewUrl}
                    alt="Xem trước ảnh hóa đơn"
                    className="max-h-56 object-contain rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 mt-2 font-mono">
                    {items.find((it) => it.id === previewingItemId)?.fileName}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {items.length > 0
              ? isProcessingQueue
                ? 'Đang trích xuất dữ liệu tự động...'
                : `Hoàn tất kiểm tra ${items.length} ảnh`
              : null}
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isProcessingQueue}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                Quét đợt khác
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {items.length > 0 ? 'Xong & Đóng' : 'Đóng'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
