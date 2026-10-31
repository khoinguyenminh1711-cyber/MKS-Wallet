import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Code,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Download,
  UploadCloud,
  Trash2,
} from 'lucide-react';
import {
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  testWebhookConnection,
  getStoredWebhookUrl,
  setStoredWebhookUrl,
  WebhookTestResult,
} from '../services/googleAppsScriptWebhook';

interface WebhookSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveWebhookUrl: (url: string) => void;
  onSyncNow?: () => Promise<void>;
  onPullNow?: () => Promise<void>;
  isSyncing?: boolean;
}

export const WebhookSyncModal: React.FC<WebhookSyncModalProps> = ({
  isOpen,
  onClose,
  onSaveWebhookUrl,
  onSyncNow,
  onPullNow,
  isSyncing = false,
}) => {
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showCodePreview, setShowCodePreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = getStoredWebhookUrl();
      setWebhookUrl(saved);
      setTestResult(null);
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = GOOGLE_APPS_SCRIPT_TEMPLATE;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    }
  };

  const handleTestConnection = async () => {
    if (!webhookUrl.trim()) {
      setStatusMessage({ type: 'error', text: 'Vui lòng dán Webhook URL trước khi kiểm tra.' });
      return;
    }

    setIsTesting(true);
    setStatusMessage(null);
    try {
      const res = await testWebhookConnection(webhookUrl.trim());
      setTestResult(res);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Kết nối thành công với "${res.sheetName || 'Google Sheet'}"!`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.message || 'Không thể kết nối tới Google Apps Script Webhook.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Lỗi mạng khi kiểm tra kết nối Webhook.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndSync = async () => {
    const clean = webhookUrl.trim();
    if (!clean) {
      setStatusMessage({ type: 'error', text: 'Vui lòng nhập đường dẫn Webhook URL.' });
      return;
    }

    setStoredWebhookUrl(clean);
    onSaveWebhookUrl(clean);
    setStatusMessage({ type: 'success', text: 'Đã lưu cấu hình Webhook thành công!' });

    if (onSyncNow) {
      try {
        await onSyncNow();
        setStatusMessage({ type: 'success', text: 'Đã lưu và đồng bộ toàn bộ dữ liệu lên Google Sheet thành công!' });
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err?.message || 'Đã lưu URL nhưng đồng bộ gặp lỗi.' });
      }
    }
  };

  const handleRemoveWebhook = () => {
    if (window.confirm('Bạn có chắc chắn muốn ngắt kết nối Webhook Google Sheet này không?')) {
      setStoredWebhookUrl('');
      setWebhookUrl('');
      setTestResult(null);
      onSaveWebhookUrl('');
      setStatusMessage({ type: 'info', text: 'Đã gỡ bỏ Webhook Google Sheet.' });
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setWebhookUrl(text.trim());
      }
    } catch {
      // ignore
    }
  };

  const isCurrentUrlSaved = webhookUrl.trim() && webhookUrl.trim() === getStoredWebhookUrl();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-800 dark:text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  Đồng bộ Google Sheets qua Webhook
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Vĩnh viễn
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Hoạt động 100% trên Điện thoại APK & Web • Không cần OAuth • Không lo hết hạn phiên
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Alert Banner */}
        {statusMessage && (
          <div
            className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2.5 animate-in fade-in duration-150 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
            )}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* Webhook Connected State Card */}
        {isCurrentUrlSaved && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div>
                <span className="font-bold">Đang kết nối Webhook hoạt động</span>
                {testResult?.sheetName && (
                  <span className="block text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                    Trang tính: {testResult.sheetName}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onSyncNow && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Đang gửi...' : 'Đẩy lên Sheet'}</span>
                </button>
              )}
              {onPullNow && (
                <button
                  type="button"
                  onClick={onPullNow}
                  disabled={isSyncing}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-semibold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Kéo dữ liệu từ Google Sheet về app"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Kéo về App</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleRemoveWebhook}
                className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Hủy kết nối Webhook"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 3 Step Instructions */}
        <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-xs sm:text-sm">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>3 bước thiết lập trong 1 phút (Chỉ cần làm 1 lần):</span>
          </div>

          <div className="space-y-2.5">
            {/* Step 1 */}
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                1
              </span>
              <div className="flex-1">
                <span>Mở Google Sheet của bạn trên máy tính hoặc trình duyệt web, vào menu:</span>
                <div className="mt-1 font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1 flex-wrap">
                  <span>Tiện ích mở rộng (Extensions)</span>
                  <span>➔</span>
                  <span className="bg-teal-500/10 px-1.5 py-0.5 rounded-md">Apps Script</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                2
              </span>
              <div className="flex-1 space-y-1.5">
                <span>Xóa hết mã có sẵn trong Apps Script và dán đoạn mã bên dưới vào:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Đã chép mã thành công!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép mã Apps Script</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCodePreview(!showCodePreview)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>{showCodePreview ? 'Thu gọn mã' : 'Xem mã'}</span>
                    {showCodePreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Collapsible code preview */}
                {showCodePreview && (
                  <pre className="max-h-48 overflow-y-auto p-2.5 rounded-xl bg-slate-900 text-slate-200 text-[10px] font-mono whitespace-pre leading-relaxed border border-slate-700">
                    {GOOGLE_APPS_SCRIPT_TEMPLATE}
                  </pre>
                )}
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px] mt-0.5">
                3
              </span>
              <div className="flex-1 space-y-1">
                <span>
                  Bấm nút <strong>Triển khai (Deploy)</strong> ở góc trên bên phải ➔ <strong>Tùy chọn triển khai mới (New deployment)</strong>:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-400 pl-1 text-[11px]">
                  <li>Chọn loại: <strong>Ứng dụng web (Web app)</strong></li>
                  <li>Thực thi dưới dạng: <strong>Tôi (email của bạn)</strong></li>
                  <li>Ai có quyền truy cập: <strong className="text-teal-600 dark:text-teal-400">Bất kỳ ai (Anyone)</strong> (Quan trọng để điện thoại kết nối được)</li>
                </ul>
                <div className="pt-0.5 text-slate-500 dark:text-slate-400 text-[11px]">
                  Bấm <em>Triển khai</em> ➔ Cấp quyền nếu có ➔ Sao chép <strong>URL của ứng dụng web</strong> và dán vào bên dưới:
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input Webhook URL */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Dán URL của ứng dụng web (Webhook URL):
          </label>
          <div className="relative flex items-center">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => {
                setWebhookUrl(e.target.value);
                setTestResult(null);
                setStatusMessage(null);
              }}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3 py-2.5 pr-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              {webhookUrl && (
                <button
                  type="button"
                  onClick={() => setWebhookUrl('')}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Xóa nội dung"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                title="Dán từ bộ nhớ tạm"
              >
                Dán
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !webhookUrl.trim()}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs hover:border-teal-500 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-teal-500' : ''}`} />
            <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-xs transition-colors cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveAndSync}
              disabled={!webhookUrl.trim() || isSyncing}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
            >
              <UploadCloud className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : 'Lưu & Đồng bộ ngay'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
