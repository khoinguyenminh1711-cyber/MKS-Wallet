import React from 'react';
import { ArrowRight, CheckCircle2, FileSpreadsheet, ShieldCheck, Sparkles, X } from 'lucide-react';
import { GoogleSheetsSyncBar } from './GoogleSheetsSyncBar';
import { GoogleSpreadsheetInfo } from '../services/googleSheets';
import { AppGoogleUser } from '../services/googleAuth';

interface InitialSyncModalProps {
  isOpen: boolean;
  user: AppGoogleUser | null;
  spreadsheetInfo: GoogleSpreadsheetInfo | null;
  isConnecting: boolean;
  isSyncing: boolean;
  autoSync: boolean;
  toastMessage: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleAutoSync: () => void;
  onRequestBulkSync: () => void;
  onEnterDashboard: () => void;
}

export const InitialSyncModal: React.FC<InitialSyncModalProps> = ({
  isOpen,
  user,
  spreadsheetInfo,
  isConnecting,
  isSyncing,
  autoSync,
  toastMessage,
  onSignIn,
  onSignOut,
  onToggleAutoSync,
  onRequestBulkSync,
  onEnterDashboard,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 shadow-xs mb-1">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Chào mừng bạn đến với MKS Wallet
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Hệ thống quản lý tài chính cá nhân 50-30-20. Kết nối Google Sheets để tự động đồng bộ và lưu trữ an toàn các phiếu chi tiêu lên Google Drive của bạn.
          </p>
        </div>

        {/* Sync Card (Hình 1 khi chưa kết nối / Hình 2 khi đã kết nối) */}
        <div className="pt-2">
          <GoogleSheetsSyncBar
            user={user}
            spreadsheetInfo={spreadsheetInfo}
            isConnecting={isConnecting}
            isSyncing={isSyncing}
            autoSync={autoSync}
            toastMessage={toastMessage}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            onToggleAutoSync={onToggleAutoSync}
            onRequestBulkSync={onRequestBulkSync}
          />
        </div>

        {/* Benefits Highlight */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Tự động đẩy phiếu chi lên Drive</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80">
            <ShieldCheck className="w-4 h-4 text-teal-500 shrink-0" />
            <span>Bảo mật, sở hữu 100% dữ liệu</span>
          </div>
        </div>

        {/* Bottom Navigation Buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onEnterDashboard}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer py-1.5"
          >
            {user ? 'Bỏ qua bước này' : 'Dùng thử ngoại tuyến (Bỏ qua)'}
          </button>

          <button
            type="button"
            onClick={onEnterDashboard}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
              user
                ? 'bg-teal-600 hover:bg-teal-500 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900'
            }`}
          >
            <span>{user ? 'Tiếp tục vào Trang chủ' : 'Vào Trang chủ'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
