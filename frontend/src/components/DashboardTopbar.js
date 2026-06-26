// src/components/DashboardTopbar.js
import React, { useState, useRef, useEffect } from "react";
import { markAllRead } from "../services/notificationService";
import { formatRelativeTime } from "../utils/timeUtils";
import "../styles/DashboardTopbar.css";

/**
 * DashboardTopbar — Barre supérieure partagée Employé / Responsable
 *
 * Props :
 *  userInfo          { username, service, ... }
 *  role              'employe' | 'responsable'     (défaut : 'employe')
 *  colorScheme       'blue' | 'teal'               (défaut : 'blue')
 *  searchTerm        string
 *  onSearch          (value: string) => void
 *  now               Date  (depuis useClock)
 *  notifications     array
 *  onClearNotifications  () => void
 *  onOpenAllNotif    () => void
 *  onLogout          () => void
 *  onOpenPasswordModal   () => void
 *  toggleTheme       () => void
 *  theme             'light' | 'dark'
 *  onOpenArchives    () => void
 *  onOpenHistorique  () => void
 */
function DashboardTopbar({
  userInfo,
  role = "employe",
  colorScheme = "blue",
  searchTerm,
  onSearch,
  now,
  notifications = [],
  onClearNotifications,
  onOpenAllNotif,
  onLogout,
  onOpenPasswordModal,
  toggleTheme,
  theme,
  onOpenArchives,
  onOpenHistorique,
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const notifRef = useRef(null);
  const accountRef = useRef(null);
  const searchRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Fermeture sur clic extérieur
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleNotif = () => {
    setNotifOpen((prev) => !prev);
    setAccountOpen(false);
    if (!notifOpen) markAllRead().catch(() => {});
  };

  const toggleAccount = () => {
    setAccountOpen((prev) => !prev);
    setNotifOpen(false);
  };

  if (!userInfo) return null;

  return (
    <div className="emp-topbar" data-scheme={colorScheme}>

      {/* ——— GAUCHE : avatar + nom + badge ——— */}
      <div className="emp-topbar-left">
        <div className="emp-topbar-welcome">
          <span className="emp-welcome-avatar">
            {userInfo.username?.charAt(0).toUpperCase()}
          </span>
          <div>
            <span className="emp-topbar-greeting">BIENVENUE,</span>
            <span className="emp-topbar-username">{userInfo.username}</span>
            {role === "responsable" && (
              <span
                className="topbar-role-badge"
                title={userInfo.service ? `Responsable · ${userInfo.service}` : "Responsable"}
              >
                🏢 {userInfo.service ? `Responsable · ${userInfo.service}` : "Responsable"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ——— CENTRE : recherche ——— */}
      <div
        ref={searchRef}
        className={`emp-topbar-search${searchExpanded ? " expanded" : ""}`}
      >
        <div className="emp-topbar-search-wrapper">
          <span
            className="emp-topbar-search-icon"
            onClick={() => {
              setSearchExpanded(true);
              setTimeout(() => searchRef.current?.querySelector("input")?.focus(), 50);
            }}
            style={{ cursor: "pointer" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            type="text"
            placeholder="Rechercher un dossier..."
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearchExpanded(false)}
            style={{ display: searchExpanded ? "block" : "none" }}
          />
        </div>
      </div>

      {/* ——— DROITE : horloge + actions ——— */}
      <div className="emp-topbar-right">
        <div className="emp-topbar-clock">
          <span className="emp-topbar-date">
            {now.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span className="emp-topbar-time">
            {now.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        <div className="emp-topbar-actions">

          {/* —— Notifications —— */}
          <div className="notif-wrapper" ref={notifRef}>
            <button className="notif-btn" onClick={toggleNotif} title="Notifications">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="icon-bell"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.25 18.75a1.5 1.5 0 01-3 0m6-6V9a6 6 0 00-12 0v3a6 6 0 01-1.8 4.2c-.3.3-.45.9-.15 1.35.3.45.9.45 1.35.45h16.2c.45 0 1.05 0 1.35-.45.3-.45.15-1.05-.15-1.35A6 6 0 0117.25 12.75z"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="notif-count">{unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <div className="notif-dropdown">
                <p className="notif-title">🔔 Notifications</p>
                <ul className="notif-list">
                  {notifications.length === 0 ? (
                    <li>Aucune notification</li>
                  ) : (
                    notifications.slice(0, 5).map((n) => {
                      const tooltipDate = new Date(n.created_at).toLocaleString(
                        "fr-FR",
                        {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        }
                      );
                      return (
                        <li key={n.id} className="notif-item" title={tooltipDate}>
                          <div className="notif-message">
                            {n.type === "share" && <>{n.message}</>}
                            {n.type === "permission" && <>{n.message}</>}
                            {n.type === "upload" && <>{n.message}</>}
                            {n.type === "archive" && <>{n.message}</>}
                            {n.type === "info" && <>ℹ️ {n.message}</>}
                          </div>
                          <div className="notif-time-right">
                            {formatRelativeTime(n.created_at)} ⏰
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>

                {notifications.length > 5 && (
                  <button
                    className="notif-more"
                    onClick={() => {
                      setNotifOpen(false);
                      onOpenAllNotif();
                    }}
                  >
                    Voir toutes les notifications
                  </button>
                )}

                <button className="notif-clear" onClick={onClearNotifications}>
                  Effacer tout
                </button>
              </div>
            )}
          </div>

          {/* —— Compte —— */}
          <div className="account-wrapper" ref={accountRef}>
            <button className="account-btn" onClick={toggleAccount}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="icon-account"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0v.75H4.5v-.75z"
                />
              </svg>
            </button>

            {accountOpen && (
              <div className="account-dropdown">
                <p className="account-title">👤 Mon Compte</p>
                <ul>
                  <li onClick={onLogout}>🔓 Déconnexion</li>
                  <li
                    onClick={() => {
                      setAccountOpen(false);
                      onOpenPasswordModal();
                    }}
                  >
                    🔑 Modifier le mot de passe
                  </li>
                  <li onClick={toggleTheme}>
                    {theme === "light" ? "🌙 Mode sombre" : "☀️ Mode clair"}
                  </li>
                  <li
                    onClick={() => {
                      setAccountOpen(false);
                      onOpenArchives();
                    }}
                  >
                    📦 Archives
                  </li>
                  <li
                    onClick={() => {
                      setAccountOpen(false);
                      onOpenHistorique();
                    }}
                  >
                    📜 Historique partagés
                  </li>
                  <li
                    style={{ opacity: 0.45, cursor: "not-allowed" }}
                    title="Bientôt disponible"
                  >
                    ❓ Aide
                  </li>
                </ul>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default DashboardTopbar;