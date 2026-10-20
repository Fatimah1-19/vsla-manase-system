import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, fetchFile, getToken, setToken, setSessionEndHandler, logoutBeacon } from '../api/client.js';
import { useLang } from './LangContext.jsx';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

// Show the "still there?" box this long before a quiet session closes.
const WARN_BEFORE_MS = 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [idleWarning, setIdleWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  // How long a quiet session stays open. The administrator sets this on the
  // System settings page; 10 minutes is used until the first sign-in tells us.
  const [idleMinutes, setIdleMinutes] = useState(10);

  const { setLang, t } = useLang();
  const toast = useToast();

  const warnTimer = useRef(null);
  const outTimer = useRef(null);
  const tickTimer = useRef(null);
  const warningRef = useRef(false);   // is the "still there?" box showing right now?
  const resetRef = useRef(null);      // restarts the idle clock

  // Always point at the latest versions, so the timers never hold stale ones.
  const toastRef = useRef(toast);
  const tRef = useRef(t);
  toastRef.current = toast;
  tRef.current = t;

  const showWarning = useCallback((on) => {
    warningRef.current = on;
    setIdleWarning(on);
  }, []);

  const clearTimers = useCallback(() => {
    [warnTimer, outTimer, tickTimer].forEach((ref) => {
      if (ref.current) { clearTimeout(ref.current); clearInterval(ref.current); ref.current = null; }
    });
  }, []);

  const logout = useCallback((message) => {
    clearTimers();
    logoutBeacon();   // best effort: let the log record the sign-out time
    setToken(null);
    setUser(null);
    showWarning(false);
    if (message) toastRef.current.info(message);
  }, [clearTimers, showWarning]);

  // ---- her profile picture ----
  // The photo is private, so it is fetched with the same token as everything else
  // and held here as a temporary link that Avatar shows wherever her name appears.
  const [avatar, setAvatar] = useState(null);
  const avatarRef = useRef(null);
  const [avatarTick, setAvatarTick] = useState(0);

  const clearAvatar = useCallback(() => {
    if (avatarRef.current) { URL.revokeObjectURL(avatarRef.current); avatarRef.current = null; }
    setAvatar(null);
  }, []);

  // Fetch the picture whenever the account (or the "uploaded" flag) changes, and
  // again whenever something tells us a new one was uploaded.
  useEffect(() => {
    if (!user || !user.has_avatar || !getToken()) { clearAvatar(); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const url = await fetchFile('/profile/avatar');
        if (cancelled) { URL.revokeObjectURL(url); return; }
        if (avatarRef.current) URL.revokeObjectURL(avatarRef.current);
        avatarRef.current = url;
        setAvatar(url);
      } catch { /* no picture yet */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.has_avatar, avatarTick, clearAvatar]);

  // The API layer calls this when the server rejects an expired token.
  useEffect(() => {
    setSessionEndHandler((reason) => {
      logout(reason === 'expired' ? tRef.current('errors.sessionExpired') : null);
    });
  }, [logout]);

  // Watch for activity only while somebody is logged in.
  // This effect depends on `user` alone: when the warning box appears it must
  // not be torn down, or the countdown would be cancelled and nobody would
  // ever be logged out.
  useEffect(() => {
    if (!user) { clearTimers(); return undefined; }

    const idleMs = Math.max(1, Number(idleMinutes) || 10) * 60 * 1000;
    const warnMs = Math.min(WARN_BEFORE_MS, Math.max(15 * 1000, Math.floor(idleMs / 2)));

    const startCountdown = () => {
      showWarning(true);
      setSecondsLeft(Math.round(warnMs / 1000));
      tickTimer.current = setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
      outTimer.current = setTimeout(() => {
        logout(tRef.current('idle.loggedOut'));
      }, warnMs);
    };

    const reset = () => {
      clearTimers();
      showWarning(false);
      warnTimer.current = setTimeout(startCountdown, Math.max(0, idleMs - warnMs));
    };
    resetRef.current = reset;

    // Once the warning shows, touching the screen must not silently cancel it:
    // the person has to press the button.
    let lastSeen = 0;
    const onActivity = () => {
      if (warningRef.current) return;
      const now = Date.now();
      if (now - lastSeen < 1000) return;   // a moving mouse fires dozens of times a second
      lastSeen = now;
      reset();
    };
    // Capture phase, so scrolling inside any panel counts too (scroll events do not
    // travel up to the window on their own). Moving the mouse and reading count as use.
    const events = ['mousedown', 'mousemove', 'pointerdown', 'keydown', 'touchstart',
                    'touchmove', 'wheel', 'scroll', 'click', 'focus'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    reset();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      clearTimers();
      resetRef.current = null;
    };
  }, [user, idleMinutes, clearTimers, logout, showWarning]);

  const applyUser = useCallback((u) => {
    setUser(u);
    if (u?.language) setLang(u.language);
  }, [setLang]);

  // Restore the session on a page refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) { setChecking(false); return; }
      try {
        const { user: me, session_timeout_minutes } = await api.get('/auth/me');
        if (!cancelled) {
          applyUser(me);
          if (session_timeout_minutes) setIdleMinutes(session_timeout_minutes);
        }
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyUser]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password }, { auth: false });
    setToken(data.token);
    applyUser(data.user);
    if (data.session_timeout_minutes) setIdleMinutes(data.session_timeout_minutes);
    return data.user;
  }, [applyUser]);

  const refresh = useCallback(async () => {
    const { user: me } = await api.get('/auth/me');
    applyUser(me);
    return me;
  }, [applyUser]);

  const value = useMemo(
    () => ({
      user, checking, login, logout, refresh, setUser,
      avatar,
      reloadAvatar: () => setAvatarTick((t) => t + 1),
      idleWarning, secondsLeft,
      stayLoggedIn: () => resetRef.current && resetRef.current(),
      // Chairperson, treasurer, secretary: can see the books.
      isCommittee: !!user && ['admin', 'treasurer', 'secretary'].includes(user.role),
      // Treasurer and secretary: the recorders of the meeting book.
      isRecorder: !!user && ['treasurer', 'secretary'].includes(user.role),
      // The money books are the treasurer's to write in. The chairperson and the
      // secretary read them; the secretary never changes a transaction.
      canRecordMoney: user?.role === 'treasurer',
      // The secretary checks the treasurer's work: savings and recorded loans are
      // only money once she has verified them. She never approves a loan.
      canVerify: user?.role === 'secretary',
      // The members vote; the chairperson alone settles a join request. The
      // treasurer keeps the money, the secretary keeps the record of the result.
      isDecider: user?.role === 'admin',
      isAdmin: user?.role === 'admin',
      // The administrator looks after accounts and the system, never the books.
      isSystemAdmin: user?.role === 'system_admin',
    }),
    [user, checking, login, logout, refresh, avatar, idleWarning, secondsLeft]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};