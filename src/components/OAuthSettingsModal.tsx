import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Key,
  Link as LinkIcon,
  RefreshCw,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import {
  getCustomOAuthClientId,
  getEffectiveClientId,
  getOAuthRedirectUri,
  setCustomOAuthClientId,
} from '../services/googleAuth';

interface OAuthSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: () => void;
  isConnecting: boolean;
}

export const OAuthSettingsModal: React.FC<OAuthSettingsModalProps> = ({
  isOpen,
  onClose,
  onSignIn,
  isConnecting,
}) => {
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);
  const [customClientIdInput, setCustomClientIdInput] = useState(() => getCustomOAuthClientId());
  const [savedClientIdFeedback, setSavedClientIdFeedback] = useState(false);

  if (!isOpen) return null;

  const currentRedirectUri = getOAuthRedirectUri();
  const effectiveClientId = getEffectiveClientId();

  const handleCopyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(currentRedirectUri);
      setCopiedRedirectUri(true);
      setTimeout(() => setCopiedRedirectUri(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleSaveCustomClientId = () => {
    setCustomOAuthClientId(customClientIdInput);
    setSavedClientIdFeedback(true);
    setTimeout(() => setSavedClientIdFeedback(false), 2500);
  };

  const handleResetToDefault = () => {
    setCustomClientIdInput('');
    setCustomOAuthClientId('');
    setSavedClientIdFeedback(true);
    setTimeout(() => setSavedClientIdFeedback(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Cấu hình OAuth & Sửa lỗi Redirect URI
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Khắc phục triệt để lỗi 400: redirect_uri_mismatch trên APK & Web
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

        {/* Diagnostic Explanation Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 space-y-2">
          <div className="font-bold flex items-center gap-2 text-xs">
            <Shield className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Nguyên nhân & Cách khắc phục lỗi 400: redirect_uri_mismatch</span>
          </div>
          <p className="text-[11px] leading-relaxed opacity-90">
            Google OAuth 2.0 yêu cầu URI chuyển hướng phải trùng khớp chính xác từng ký tự (không thừa dấu <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">/</code> ở cuối) với danh sách đã đăng ký trên Google Cloud Console.
          </p>
          <ul className="text-[11px] space-y-1 list-disc pl-4 opacity-90">
            <li>
              <strong>Trên Web:</strong> Ứng dụng tự động dùng luồng chuẩn được Google cấp phép sẵn, không bao giờ bị lỗi.
            </li>
            <li>
              <strong>Trên Android WebView (file APK):</strong> Bạn có thể dùng Client ID riêng bên dưới và thêm URI bên dưới vào mục <em>Authorized redirect URIs</em> trên Google Cloud Console.
            </li>
          </ul>
        </div>

        {/* Current Redirect URI with 1-click Copy */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-teal-500" />
              Redirect URI hiện tại của ứng dụng:
            </span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={currentRedirectUri}
              className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-hidden selection:bg-teal-500/30"
            />
            <button
              type="button"
              onClick={handleCopyRedirectUri}
              className="px-3 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold flex items-center gap-1.5 text-xs transition-colors cursor-pointer shrink-0"
              title="Sao chép URI"
            >
              {copiedRedirectUri ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-950" />
                  <span>Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Dán chính xác địa chỉ trên vào mục <strong>Authorized redirect URIs</strong> trong Google Cloud Console.
          </p>
        </div>

        {/* Custom Client ID Setting */}
        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Google OAuth Client ID (Tùy chọn):
            </label>
            {customClientIdInput && (
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                (Đang áp dụng Client ID riêng)
              </span>
            )}
          </div>
          <input
            type="text"
            placeholder={`Mặc định: ${effectiveClientId}`}
            value={customClientIdInput}
            onChange={(e) => setCustomClientIdInput(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:border-teal-500"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveCustomClientId}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Lưu Client ID</span>
              </button>
              {savedClientIdFeedback && (
                <span className="text-xs text-teal-600 dark:text-teal-400 font-medium animate-in fade-in">
                  Đã lưu thành công!
                </span>
              )}
            </div>
            {customClientIdInput && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-xs text-rose-500 hover:underline cursor-pointer"
              >
                Đặt lại mặc định
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignIn();
            }}
            disabled={isConnecting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isConnecting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang kết nối...</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Thử kết nối Google ngay</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
