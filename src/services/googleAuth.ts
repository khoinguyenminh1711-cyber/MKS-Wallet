import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Configure persistent authentication: tries indexedDBLocalPersistence with fallback to browserLocalPersistence
// This ensures user session is kept permanently on the device and refreshes tokens silently in the background
try {
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch((err) => console.warn('[Firebase Auth] Persistence configuration notice:', err));
} catch (err) {
  console.warn('[Firebase Auth] Failed to initialize persistence:', err);
}

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

export const GOOGLE_AUTH_TOKEN_KEY = 'mks_google_oauth_token';
export const GOOGLE_AUTH_EXPIRES_AT_KEY = 'mks_google_oauth_expires_at';
export const GOOGLE_AUTH_USER_KEY = 'mks_google_oauth_user';
export const CUSTOM_CLIENT_ID_KEY = 'mks_custom_google_client_id';
export const ONBOARDING_STORAGE_KEY = 'mks_wallet_onboarding_v3';

export interface SavedGoogleUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export type AppGoogleUser = SavedGoogleUser;

let cachedAccessToken: string | null = null;

export const getCustomOAuthClientId = (): string => {
  try {
    return localStorage.getItem(CUSTOM_CLIENT_ID_KEY)?.trim() || '';
  } catch {
    return '';
  }
};

export const setCustomOAuthClientId = (clientId: string) => {
  try {
    if (clientId.trim()) {
      localStorage.setItem(CUSTOM_CLIENT_ID_KEY, clientId.trim());
    } else {
      localStorage.removeItem(CUSTOM_CLIENT_ID_KEY);
    }
  } catch {
    // ignore
  }
};

export const getEffectiveClientId = (): string => {
  return getCustomOAuthClientId() || firebaseConfig.oAuthClientId;
};

/**
 * Returns the exact clean redirect URI without trailing slashes.
 */
export const getOAuthRedirectUri = (): string => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin.replace(/\/+$/, '');
  const pathname = window.location.pathname.replace(/\/+$/, '');
  if (!pathname || pathname === '/') {
    return origin;
  }
  return `${origin}${pathname}`;
};

/**
 * Generates the clean Google OAuth 2.0 Authorization URL for external browser flow
 */
export const getOAuthAuthorizationUrl = (overrideClientId?: string): string => {
  const clientId = overrideClientId || getEffectiveClientId();
  const redirectUri = getOAuthRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: WORKSPACE_SCOPES.join(' '),
    include_granted_scopes: 'true',
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Direct OAuth 2.0 Implicit Redirect flow on the same window.
 */
export const initiateGoogleOAuthRedirect = (overrideClientId?: string) => {
  if (typeof window === 'undefined') return;
  const oauthUrl = getOAuthAuthorizationUrl(overrideClientId);
  console.log('[OAuth Direct Redirect] Redirecting same window to:', oauthUrl);
  window.location.href = oauthUrl;
};

/**
 * Reads and stores access_token from window.location.hash if returning from direct OAuth
 */
export const autoDetectAndSaveOAuthTokenFromHash = (): { accessToken: string } | null => {
  if (typeof window === 'undefined' || !window.location.hash) return null;

  try {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;

    if (!rawHash || !rawHash.includes('access_token')) return null;

    const params = new URLSearchParams(rawHash);
    const accessToken = params.get('access_token');
    if (!accessToken) return null;

    cachedAccessToken = accessToken;
    localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, accessToken);
    const expiresIn = params.get('expires_in');
    const seconds = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const expiresAt = Date.now() + (isNaN(seconds) ? 3600 : seconds) * 1000;
    localStorage.setItem(GOOGLE_AUTH_EXPIRES_AT_KEY, String(expiresAt));
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');

    try {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, document.title, cleanUrl);
    } catch {
      window.location.hash = '';
    }

    console.log('[OAuth 2.0] Successfully read access_token from URL hash.');
    return { accessToken };
  } catch (err) {
    console.warn('[OAuth 2.0] Failed to parse access_token from hash:', err);
    return null;
  }
};

const initialOAuthResult = typeof window !== 'undefined' ? autoDetectAndSaveOAuthTokenFromHash() : null;

// Populate initial cache from localStorage
try {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
  }
} catch {
  // ignore
}

/**
 * Checks whether a token string is a valid Google OAuth access token (not a Firebase ID Token JWT)
 */
export const isGoogleOAuthToken = (token: string | null): boolean => {
  if (!token) return false;
  // A Firebase ID token is a 3-part JWT starting with 'ey'
  if (token.startsWith('ey') && token.includes('.')) {
    return false;
  }
  return true;
};

/**
 * Checks whether the Google OAuth accessToken has expired.
 */
export const isGoogleOAuthTokenExpired = (): boolean => {
  try {
    const token = cachedAccessToken || (typeof window !== 'undefined' ? localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY) : null);
    if (!token || !isGoogleOAuthToken(token)) return true;
    const expiresAtStr = typeof window !== 'undefined' ? localStorage.getItem(GOOGLE_AUTH_EXPIRES_AT_KEY) : null;
    if (expiresAtStr) {
      const expiresAt = parseInt(expiresAtStr, 10);
      if (!isNaN(expiresAt) && Date.now() >= expiresAt - 30000) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
};

export const isTokenExpired = (): boolean => {
  return isGoogleOAuthTokenExpired();
};

/**
 * Marks the current token as expired and clears it from cache.
 */
export const markTokenExpired = () => {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
      localStorage.removeItem(GOOGLE_AUTH_EXPIRES_AT_KEY);
    } catch {
      // ignore
    }
  }
};

/**
 * Returns a valid, fresh Firebase ID token.
 * Firebase automatically refreshes the token in the background before expiry.
 */
export const getFirebaseIdToken = async (forceRefresh: boolean = false): Promise<string | null> => {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[Firebase Auth] Failed to retrieve fresh ID token:', err);
    return null;
  }
};

/**
 * Persists user profile to localStorage
 */
export const saveAuthSession = (
  user: SavedGoogleUser,
  token?: string | null,
  expiresInSeconds: number = 3600
) => {
  try {
    if (token) {
      cachedAccessToken = token;
      localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, token);
      const expiresAt = Date.now() + expiresInSeconds * 1000;
      localStorage.setItem(GOOGLE_AUTH_EXPIRES_AT_KEY, String(expiresAt));
    }
    const userInfo: SavedGoogleUser = {
      uid: user.uid,
      displayName: user.displayName || 'Tài khoản Google',
      email: user.email || null,
      photoURL: user.photoURL || null,
    };
    localStorage.setItem(GOOGLE_AUTH_USER_KEY, JSON.stringify(userInfo));
    if (user.email) {
      localStorage.setItem('mks_last_login_email', user.email);
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
  } catch (err) {
    console.warn('Failed to save auth session to storage:', err);
  }
};

/**
 * Returns saved authentication session from localStorage
 */
export const getSavedAuthSession = (): {
  user: SavedGoogleUser | null;
  token: string | null;
  isExpired: boolean;
} => {
  try {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem(GOOGLE_AUTH_USER_KEY) : null;
    const user = userStr ? (JSON.parse(userStr) as SavedGoogleUser) : null;
    let token = cachedAccessToken;
    if (!token && typeof window !== 'undefined') {
      token = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
    }
    if (!isGoogleOAuthToken(token)) {
      token = null;
    }
    const isExpired = !token || isGoogleOAuthTokenExpired();
    return { user, token: token || null, isExpired };
  } catch {
    return { user: null, token: null, isExpired: true };
  }
};

/**
 * Clears user session ONLY when user explicitly logs out
 */
export const clearAuthSession = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_AUTH_EXPIRES_AT_KEY);
    localStorage.removeItem(GOOGLE_AUTH_USER_KEY);
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    localStorage.removeItem('mks_last_login_email');
    localStorage.removeItem('mks_google_sheet_info');
    sessionStorage.removeItem('mks_captured_browser_token');
  } catch (err) {
    console.warn('Failed to clear auth session:', err);
  }
};

export const clearAuthTokenOnly = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_AUTH_EXPIRES_AT_KEY);
  } catch (err) {
    console.warn('Failed to clear auth token:', err);
  }
};

/**
 * Fetches user profile from Google OAuth2 UserInfo endpoint using Bearer access token
 */
export const fetchGoogleUserInfo = async (accessToken: string): Promise<SavedGoogleUser> => {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      return {
        uid: data.sub || `google_${Date.now()}`,
        displayName: data.name || data.given_name || 'Người dùng Google',
        email: data.email || null,
        photoURL: data.picture || null,
      };
    }
  } catch (err) {
    console.warn('[OAuth 2.0] Failed to fetch Google user profile:', err);
  }

  // Fallback: Check if user was previously saved
  try {
    const prevStr = localStorage.getItem(GOOGLE_AUTH_USER_KEY);
    if (prevStr) {
      const prev = JSON.parse(prevStr);
      if (prev && prev.uid) return prev;
    }
  } catch {
    // ignore
  }

  return {
    uid: `google_${Date.now()}`,
    displayName: 'Người dùng Google',
    email: null,
    photoURL: null,
  };
};

export const createGoogleAuthProvider = (): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  for (const scope of WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return provider;
};

export interface GoogleSignInResult {
  user: AppGoogleUser | null;
  accessToken: string | null;
  error?: string;
}

export const saveDirectAccessToken = async (
  tokenOrUrl: string
): Promise<{ user: SavedGoogleUser; accessToken: string } | null> => {
  if (!tokenOrUrl || !tokenOrUrl.trim()) return null;

  let rawToken = tokenOrUrl.trim();
  if (rawToken.includes('access_token=')) {
    const match = rawToken.match(/access_token=([^&]+)/);
    if (match) {
      rawToken = decodeURIComponent(match[1]);
    }
  }

  try {
    const user = await fetchGoogleUserInfo(rawToken);
    saveAuthSession(user, rawToken);
    cachedAccessToken = rawToken;
    return { user, accessToken: rawToken };
  } catch (err) {
    console.warn('Failed to validate direct access token:', err);
    return null;
  }
};

/**
 * Main Google Sign-In function:
 * Uses Firebase signInWithPopup.
 */
export const googleSignIn = async (): Promise<GoogleSignInResult | null> => {
  const provider = createGoogleAuthProvider();

  try {
    console.log('[Google Auth] Initiating signInWithPopup...');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken =
      credential?.accessToken ||
      (result as any)?._tokenResponse?.oauthAccessToken ||
      (result as any)?._tokenResponse?.accessToken ||
      null;

    const fbUser = result.user;
    const user: SavedGoogleUser = {
      uid: fbUser.uid,
      displayName: fbUser.displayName || 'Tài khoản Google',
      email: fbUser.email || null,
      photoURL: fbUser.photoURL || null,
    };

    if (accessToken) {
      cachedAccessToken = accessToken;
      localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, accessToken);
      localStorage.setItem(GOOGLE_AUTH_EXPIRES_AT_KEY, String(Date.now() + 3600 * 1000));
    }
    saveAuthSession(user, accessToken, 3600);
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    console.log('[Google Auth] Successfully signed in via Firebase Popup with Drive scopes.');
    return { user, accessToken };
  } catch (popupErr: any) {
    console.warn('[Google Auth] Popup signIn encountered issue:', popupErr?.code, popupErr?.message);

    if (popupErr?.code === 'auth/popup-closed-by-user' || popupErr?.code === 'auth/cancelled-popup-request') {
      return { user: null, accessToken: null, error: 'Đã hủy thao tác đăng nhập.' };
    }

    try {
      console.log('[Google Auth] Attempting signInWithRedirect fallback...');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('mks_pending_redirect_signin', 'true');
      }
      await signInWithRedirect(auth, provider);
      return null;
    } catch (redirectErr: any) {
      console.warn('[Google Auth] signInWithRedirect failed:', redirectErr?.code, redirectErr?.message);
      return { user: null, accessToken: null, error: redirectErr?.message || 'Không thể đăng nhập Google.' };
    }
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    try {
      cachedAccessToken = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null, expiresInSeconds: number = 3600) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, token);
        const expiresAt = Date.now() + expiresInSeconds * 1000;
        localStorage.setItem(GOOGLE_AUTH_EXPIRES_AT_KEY, String(expiresAt));
      } else {
        localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
        localStorage.removeItem(GOOGLE_AUTH_EXPIRES_AT_KEY);
      }
    } catch {
      // ignore
    }
  }
};

/**
 * Explicit user sign out:
 * The ONLY event that terminates user's session in the app.
 */
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[Firebase Auth] SignOut error:', err);
  }
  clearAuthSession();
};

/**
 * Initializes authentication using Firebase onAuthStateChanged as the SINGLE SOURCE OF TRUTH.
 * Keeps user logged in permanently on this device.
 */
export const initAuth = (
  onAuthSuccess?: (user: AppGoogleUser, token: string | null) => void,
  onAuthFailure?: () => void
): (() => void) => {
  // 1. Process any pending redirect results
  getRedirectResult(auth)
    .then((redirectResult) => {
      if (redirectResult) {
        const credential = GoogleAuthProvider.credentialFromResult(redirectResult);
        const accessToken =
          credential?.accessToken ||
          (redirectResult as any)?._tokenResponse?.oauthAccessToken ||
          (redirectResult as any)?._tokenResponse?.accessToken ||
          null;
        if (accessToken) {
          cachedAccessToken = accessToken;
          localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, accessToken);
          localStorage.setItem(GOOGLE_AUTH_EXPIRES_AT_KEY, String(Date.now() + 3600 * 1000));
        }
      }
    })
    .catch((err) => {
      console.warn('[Google Auth] getRedirectResult notice:', err?.message || err);
    });

  // 2. onAuthStateChanged is the authoritative listener
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      console.log('[Firebase Auth] User authenticated via onAuthStateChanged:', firebaseUser.email || firebaseUser.uid);
      const user: SavedGoogleUser = {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || 'Tài khoản Google',
        email: firebaseUser.email || null,
        photoURL: firebaseUser.photoURL || null,
      };

      // Retrieve Google OAuth accessToken if available
      let token = cachedAccessToken;
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
      }
      if (!isGoogleOAuthToken(token) || isGoogleOAuthTokenExpired()) {
        token = null;
      }

      saveAuthSession(user, token);

      if (onAuthSuccess) {
        onAuthSuccess(user, token);
      }
    } else {
      console.log('[Firebase Auth] No authenticated session found.');
      if (onAuthFailure) {
        onAuthFailure();
      }
    }
  });

  return unsubscribe;
};
