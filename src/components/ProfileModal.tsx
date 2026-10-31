import React from 'react';
import {
  LogOut,
  User as UserIcon,
  X,
} from 'lucide-react';
import { GoogleSheetsSyncBar } from './GoogleSheetsSyncBar';
import { GoogleSpreadsheetInfo } from '../services/googleSheets';
import { AppGoogleUser } from '../services/googleAuth';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppGoogleUser | null;
  spreadsheetInfo: GoogleSpreadsheetInfo | null;
  isConnecting: boolean;
  isSyncing: boolean;
  autoSync: boolean;
  toastMessage?: string | null;
  lastSyncTime?: Date | null;
  syncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  needsReauth?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onToggleAutoSync: () => void;
  onRequestBulkSync: () => void;
  onPullFromSheet?: () => void;
  onOpenInitialSyncWindow?: () => void;
  webhookUrl?: string;
  onOpenWebhookModal?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  spreadsheetInfo,
  isConnecting,
  isSyncing,
  autoSync,
  toastMessage,
  lastSyncTime,
  syncStatus,
  needsReauth,
  onSignIn,
  onSignOut,
  onToggleAutoSync,
  onRequestBulkSync,
  onPullFromSheet,
  webhookUrl,
  onOpenWebhookModal,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Hồ sơ & Kết nối Google
              </h3>
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

        {/* User Card if logged in */}
        {user ? (
          <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Google Account'}
                className="w-11 h-11 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-teal-600 text-white font-bold text-base flex items-center justify-center shrink-0">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {user.displayName || 'Tài khoản Google'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                {user.email}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onSignOut}
                className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Đăng xuất khỏi Google"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Sync Card */}
        <div>
          <GoogleSheetsSyncBar
            user={user}
            spreadsheetInfo={spreadsheetInfo}
            isConnecting={isConnecting}
            isSyncing={isSyncing}
            autoSync={autoSync}
            toastMessage={toastMessage}
            lastSyncTime={lastSyncTime}
            syncStatus={syncStatus}
            needsReauth={needsReauth}
            webhookUrl={webhookUrl}
            onOpenWebhookModal={onOpenWebhookModal}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            onToggleAutoSync={onToggleAutoSync}
            onRequestBulkSync={onRequestBulkSync}
            onPullFromSheet={onPullFromSheet}
          />
        </div>

        {/* Close Button */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 text-xs font-semibold cursor-pointer transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
