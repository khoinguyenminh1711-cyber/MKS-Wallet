import {
  ArrowRight,
  CheckCircle2,
  LogOut,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { GoogleSpreadsheetInfo } from '../services/googleSheets';
import { AppGoogleUser } from '../services/googleAuth';

interface OnboardingScreenProps {
  user: AppGoogleUser | null;
  spreadsheetInfo?: GoogleSpreadsheetInfo | null;
  isConnecting: boolean;
  toastMessage: string | null;
  isTokenExpired?: boolean;
  onSignIn: () => Promise<void>;
  onSignOut?: () => void;
  onEnterDashboard?: () => void;
  onOpenWebhook?: () => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  user,
  spreadsheetInfo,
  isConnecting,
  toastMessage,
  isTokenExpired = false,
  onSignIn,
  onSignOut,
  onEnterDashboard,
}) => {
  const handleSignInClick = () => {
    onSignIn();
  };

  const handleStartApp = () => {
    if (onEnterDashboard) {
      onEnterDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-[#070e1b] text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-teal-500/15 via-cyan-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 w-[400px] h-[300px] bg-sky-500/10 blur-3xl pointer-events-none" />

      {/* Top spacer */}
      <div className="relative z-10 h-6 sm:h-12" />

      {/* Main Container */}
      <main className="relative z-10 max-w-sm sm:max-w-md mx-auto w-full my-auto py-6 space-y-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Branding header matching Image 1 exactly */}
        <div className="text-center space-y-2.5">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight leading-snug">
            Chào mừng đến với
          </h1>
          <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-teal-400 via-cyan-300 to-teal-300 bg-clip-text text-transparent pb-1">
            MKS Wallet
          </div>
          <div className="inline-flex items-center justify-center gap-2 text-slate-400 text-sm sm:text-base font-normal pt-1">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Smart Spending Starts Here</span>
          </div>
        </div>

        {/* Action card */}
        <div className="rounded-3xl border border-slate-800/90 bg-slate-900/80 backdrop-blur-xl p-5 sm:p-7 shadow-2xl space-y-4">
          {user ? (
            /* STATE: USER IS LOGGED IN (ACTIVE OR EXPIRED) */
            <div className="space-y-4">
              <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                isTokenExpired
                  ? 'bg-amber-950/40 border-amber-500/30'
                  : 'bg-teal-950/40 border-teal-500/30'
              }`}>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google User'}
                    className={`w-11 h-11 rounded-full border-2 object-cover shrink-0 ${
                      isTokenExpired ? 'border-amber-400/60' : 'border-teal-400/60'
                    }`}
                  />
                ) : (
                  <div className={`w-11 h-11 rounded-full border flex items-center justify-center font-bold text-base shrink-0 ${
                    isTokenExpired
                      ? 'bg-amber-600/30 text-amber-300 border-amber-500/40'
                      : 'bg-teal-600/30 text-teal-300 border-teal-500/40'
                  }`}>
                    {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isTokenExpired ? (
                      <>
                        <span className="text-[11px] text-amber-400 font-semibold tracking-wide uppercase">
                          Phiên đăng nhập đã hết hạn
                        </span>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] text-teal-400 font-semibold tracking-wide uppercase">
                          Đã đăng nhập
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                      </>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-100 truncate">
                    {user.displayName || 'Tài khoản Google'}
                  </p>
                  <p className="text-xs text-slate-400 truncate font-mono">{user.email}</p>
                </div>
              </div>

              {/* Action Buttons */}
              {isTokenExpired ? (
                /* Session Expired: Primary action is to Sign in / Re-authenticate */
                <button
                  type="button"
                  onClick={handleSignInClick}
                  disabled={isConnecting}
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-60"
                >
                  {isConnecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Đang đăng nhập & gia hạn tài khoản...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 text-slate-950 shrink-0" />
                      <span>Đăng nhập & Gia hạn Google</span>
                    </>
                  )}
                </button>
              ) : (
                /* Active Session: Direct Enter App */
                <button
                  type="button"
                  onClick={handleStartApp}
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/25 transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-[0.99]"
                >
                  <span>Vào MKS Wallet ngay</span>
                  <ArrowRight className="w-4 h-4 text-slate-950" />
                </button>
              )}

              {/* Sign out / switch */}
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full py-2.5 px-4 rounded-xl text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800/40 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đổi tài khoản khác</span>
                </button>
              )}
            </div>
          ) : (
            /* STATE: NOT LOGGED IN */
            <div className="space-y-3.5">
              {/* 1. Google / Gmail Sign-In Button */}
              <button
                type="button"
                onClick={handleSignInClick}
                disabled={isConnecting}
                className="w-full py-3.5 px-5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold shadow-lg shadow-white/10 transition-all cursor-pointer flex items-center justify-center gap-3 disabled:opacity-60 active:scale-[0.99]"
              >
                {isConnecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" />
                    <span>Đang đăng nhập & gia hạn tài khoản...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    <span>Đăng nhập bằng Gmail</span>
                  </>
                )}
              </button>

              {/* 2. Guest Mode: "Tiếp tục với chế độ khách" */}
              <button
                type="button"
                onClick={handleStartApp}
                className="w-full py-3.5 px-5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-teal-500/50 text-slate-200 hover:text-white text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <span>Tiếp tục với chế độ khách</span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-400" />
              </button>
            </div>
          )}

          {/* Toast Notification message if any */}
          {toastMessage && (
            <div className="p-3 rounded-xl bg-teal-950/60 border border-teal-800 text-xs text-teal-200 flex items-center gap-2 animate-in fade-in duration-150">
              <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
              <span className="leading-snug">{toastMessage}</span>
            </div>
          )}
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="relative z-10 text-center py-3 text-xs text-slate-500">
        <p>MKS Wallet • Quản lý tài chính cá nhân</p>
      </footer>
    </div>
  );
};
