import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardCheck,
  ExternalLink,
  Globe,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { getOAuthAuthorizationUrl } from '../services/googleAuth';

interface TokenRenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAutoRenew: () => Promise<void>;
  onDirectTokenSubmit: (token: string) => Promise<boolean>;
  isConnecting: boolean;
  onOpenWebhookModal?: () => void;
}

export const TokenRenewModal: React.FC<TokenRenewModalProps> = ({
  isOpen,
  onClose,
  onAutoRenew,
  onDirectTokenSubmit,
  isConnecting,
  onOpenWebhookModal,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const authUrl = getOAuthAuthorizationUrl();

  const handleOpenBrowser = () => {
    // Attempt multiple strategies to open external browser on Android WebView
    try {
      window.open(authUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = authUrl;
    }
  };

  const handlePasteFromClipboard = async () => {
    setErrorMessage(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setTokenInput(text.trim());
          await processToken(text.trim());
          return;
        }
      }
      setErrorMessage('Không thể tự động đọc bộ nhớ tạm. Vui lòng nhấn giữ vào ô bên dưới rồi chọn "Dán" (Paste).');
    } catch {
      setErrorMessage('Vui lòng nhấn giữ vào ô bên dưới và chọn "Dán" (Paste).');
    }
  };

  const processToken = async (rawInput: string) => {
    if (!rawInput.trim()) {
      setErrorMessage('Vui lòng nhập hoặc dán mã Token.');
      return;
    }
    setErrorMessage(null);
    setIsSubmittingToken(true);
    try {
      const ok = await onDirectTokenSubmit(rawInput.trim());
      if (ok) {
        setSuccessMessage('Đã kết nối thành công và đồng bộ Google Sheets!');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMessage('Mã Token không hợp lệ hoặc đã hết hạn. Vui lòng lấy mã mới từ trình duyệt.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Có lỗi khi kiểm tra mã Token.');
    } finally {
      setIsSubmittingToken(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processToken(tokenInput);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-7 space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Gia hạn kết nối Google (Dành cho APK & Web)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Giải pháp đồng bộ không lỗi trên điện thoại
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explain Card */}
        <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 space-y-1">
          <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-teal-500 shrink-0" />
            Tại sao cần thao tác này trên APK?
          </p>
          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            Google chặn cửa sổ popup trong các ứng dụng đóng gói APK (lỗi disallowed_useragent). Bằng cách mở Google trên Chrome một lần, bạn có thể lấy mã xác thực mà không bao giờ bị lỗi.
          </p>
        </div>

        {/* Alert Messages */}
        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0 text-emerald-500" />
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Permanent Webhook Solution Banner */}
        {onOpenWebhookModal && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border border-emerald-500/30 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Giải pháp vĩnh viễn (Khuyên dùng cho APK):
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white">
                Không cần OAuth
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Dùng Google Apps Script Webhook: không bao giờ hết hạn token, không cần cấp quyền OAuth, hoạt động mượt mà 100% trên cả điện thoại và máy tính.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWebhookModal();
              }}
              className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>⚡ Chuyển sang Webhook Google Sheet (1 phút thiết lập)</span>
            </button>
          </div>
        )}

        {/* 2-Step Simple Flow */}
        <div className="space-y-3">
          {/* Step 1 */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-teal-500/30 bg-teal-500/5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-teal-800 dark:text-teal-300">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[11px] font-black">1</span>
                Mở Google trên trình duyệt máy (Chrome)
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Đăng nhập tài khoản Google của bạn trên Chrome. Khi đăng nhập xong, trang web sẽ có nút <strong>"Sao chép mã Token"</strong>.
            </p>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenBrowser}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Mở Google trên Chrome ngay</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>

          {/* Step 2 */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-700 dark:bg-slate-300 text-white dark:text-slate-900 flex items-center justify-center text-[11px] font-black">2</span>
                Dán mã xác thực & Kích hoạt
              </span>
            </div>

            {/* Quick 1-click paste button */}
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={isSubmittingToken}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-sky-600 hover:from-teal-400 hover:to-sky-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Dán nhanh từ bộ nhớ tạm & Đồng bộ ngay</span>
            </button>

            {/* Manual input fallback */}
            <form onSubmit={handleFormSubmit} className="space-y-2 pt-1">
              <input
                type="text"
                placeholder="Hoặc dán toàn bộ đường link / mã ya29... vào đây"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={isSubmittingToken || !tokenInput.trim()}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {isSubmittingToken ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang kiểm tra & đồng bộ...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Xác nhận mã & Đồng bộ</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Desktop Web Popup Option */}
        <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={async () => {
              setErrorMessage(null);
              try {
                await onAutoRenew();
              } catch (err: any) {
                setErrorMessage(err?.message || 'Không thể mở popup trên thiết bị này.');
              }
            }}
            disabled={isConnecting}
            className="hover:text-teal-600 dark:hover:text-teal-400 underline cursor-pointer"
          >
            Thử cửa sổ Popup tự động (chỉ dùng được trên máy tính)
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer font-medium"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
