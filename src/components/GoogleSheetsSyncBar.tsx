import React from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { GoogleSpreadsheetInfo } from '../services/googleSheets';
import { AppGoogleUser } from '../services/googleAuth';

interface GoogleSheetsSyncBarProps {
  user: AppGoogleUser | null;
  spreadsheetInfo: GoogleSpreadsheetInfo | null;
  isConnecting: boolean;
  isSyncing: boolean;
  autoSync?: boolean;
  toastMessage?: string | null;
  onSignIn: () => void;
  onSignOut?: () => void;
  onToggleAutoSync?: () => void;
  onRequestBulkSync?: () => void;
  onPullFromSheet?: () => void;
  lastSyncTime?: Date | null;
  syncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  needsReauth?: boolean;
  webhookUrl?: string;
  onOpenWebhookModal?: () => void;
}

export const GoogleSheetsSyncBar: React.FC<GoogleSheetsSyncBarProps> = ({
  user,
  spreadsheetInfo: _spreadsheetInfo,
  isConnecting,
  isSyncing,
  autoSync = true,
  toastMessage: _toastMessage,
  onSignIn,
  onToggleAutoSync: _onToggleAutoSync,
  onRequestBulkSync,
  onPullFromSheet: _onPullFromSheet,
  lastSyncTime: _lastSyncTime,
  syncStatus: _syncStatus = 'idle',
  needsReauth: _needsReauth = false,
  webhookUrl: _webhookUrl,
  onOpenWebhookModal: _onOpenWebhookModal,
}) => {
  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 shadow-xs">
        <button
          type="button"
          onClick={onSignIn}
          disabled={isConnecting}
          className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2.5 disabled:opacity-60 active:scale-[0.99]"
        >
          <div className="w-6 h-6 rounded-lg bg-teal-700/60 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="whitespace-nowrap">
            {isConnecting ? 'Đang kết nối...' : 'Kết nối & Đồng bộ Google Drive'}
          </span>
        </button>
      </div>
    );
  }

  const isReauthNeeded = _syncStatus === 'error' || _needsReauth;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 shadow-xs space-y-2.5">
      {/* Auto-Sync Status Banner */}
      {isReauthNeeded ? (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-800 dark:text-amber-300">
                Phiên đồng bộ cần làm mới
              </div>
              <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 truncate">
                Token Google Sheets hết hạn (401). Bấm để gia hạn.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignIn}
            disabled={isConnecting}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-xs"
          >
            {isConnecting ? 'Đang kết nối...' : 'Gia hạn phiên'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              {isSyncing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </div>
            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              {isSyncing ? 'Đang tự động lưu...' : 'Tự động đồng bộ'}
            </div>
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isSyncing ? 'bg-teal-500 animate-spin' : 'bg-emerald-500 animate-pulse'
            } shrink-0`}
          />
        </div>
      )}

      {_spreadsheetInfo && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center truncate px-1">
          Bảng tính: <span className="text-teal-600 dark:text-teal-400 font-medium">{_spreadsheetInfo.name}</span>
          {_lastSyncTime && (
            <span className="ml-1 text-slate-400 dark:text-slate-500">
              • Vừa lưu: {_lastSyncTime.toLocaleTimeString('vi-VN')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
