import { useEffect, useRef, useCallback } from "react";

const TIMEOUTS = {
  super_admin: 20 * 1000,   // 20 secondes
  admin: 20 * 1000,
  responsable: 20 * 1000,
  employe: 20 * 1000,
};
const WARNING_BEFORE = 10 * 1000; // warning 10 secondes avant

export default function useAutoLogout(role, onLogout, onWarning) {
  const timerRef = useRef(null);
  const warningRef = useRef(null);
  const warnedRef = useRef(false);

  const timeout = TIMEOUTS[role] || TIMEOUTS.employe;

  const logout = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${process.env.REACT_APP_API_URL || 'http://192.168.1.116:8000/api'}/logout/`, {
          method: 'POST',
          headers: { Authorization: `Token ${token}` }
        });
      }
    } catch (e) {}
    localStorage.setItem('logout_signal', Date.now().toString());
    setTimeout(() => {
      localStorage.clear();
      window.location.replace("/");
    }, 100);
  }, []);

  const resetTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);
    warnedRef.current = false;

    warningRef.current = setTimeout(() => {
      if (!warnedRef.current) {
        warnedRef.current = true;
        onWarning && onWarning();
      }
    }, timeout - WARNING_BEFORE);

    timerRef.current = setTimeout(() => {
      logout();
    }, timeout);
  }, [timeout, logout, onWarning]);

  useEffect(() => {
    // Écoute déconnexion depuis un autre onglet
    const handleStorageEvent = (e) => {
      if (e.key === 'logout_signal') {
        localStorage.clear();
        window.location.replace("/");
      }
    };
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
    };
  }, [resetTimer]);
}