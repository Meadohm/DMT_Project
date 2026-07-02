import { useEffect, useRef, useCallback } from "react";

const TIMEOUTS = {
  super_admin: 10 * 60 * 1000,  // 10 min
  admin: 15 * 60 * 1000,         // 15 min
  responsable: 30 * 60 * 1000,   // 30 min
  employe: 30 * 60 * 1000,       // 30 min
};
const WARNING_BEFORE = 2 * 60 * 1000; // avertissement 2 min avant

export default function useAutoLogout(role, onLogout, onWarning) {
  const timerRef = useRef(null);
  const warningRef = useRef(null);
  const warnedRef = useRef(false);

  const timeout = TIMEOUTS[role] || TIMEOUTS.employe;

  const logout = useCallback(() => {
    localStorage.setItem('logout', Date.now().toString());
    localStorage.clear();
    window.location.replace("/");
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
      if (e.key === 'logout') {
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