import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, setSessionEndHandler } from '../api/client.js';
import { useLang } from './LangContext.jsx';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

// Log out after this long with no touch, tap or keypress.
const IDLE_LIMIT_MS = 10 * 60 * 1000;
const WARN_BEFORE_MS = 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [idleWarning, setIdleWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

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
    setToken(null);
    setUser(null);
    showWarning(false);
    if (message) toastRef.current.info(message);
  }, [clearTimers, showWarning]);

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

    const startCountdown = () => {
      showWarning(true);
      setSecondsLeft(Math.round(WARN_BEFORE_MS / 1000));
      tickTimer.current = setInterval(() => {
        setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      }, 1000);
      outTimer.current = setTimeout(() => {
        logout(tRef.current('idle.loggedOut'));
      }, WARN_BEFORE_MS);
    };

    const reset = () => {
      clearTimers();
      showWarning(false);
      warnTimer.current = setTimeout(startCountdown, IDLE_LIMIT_MS - WARN_BEFORE_MS);
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
  }, [user, clearTimers, logout, showWarning]);

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
        const { user: me } = await api.get('/auth/me');
        if (!cancelled) applyUser(me);
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
      idleWarning, secondsLeft,
      stayLoggedIn: () => resetRef.current && resetRef.current(),
      // Chairperson, treasurer, secretary: can see the books.
      isCommittee: !!user && ['admin', 'treasurer', 'secretary'].includes(user.role),
      // Treasurer and secretary: the two who write everything in the books.
      isRecorder: !!user && ['treasurer', 'secretary'].includes(user.role),
      isAdmin: user?.role === 'admin',
    }),
    [user, checking, login, logout, refresh, idleWarning, secondsLeft]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};