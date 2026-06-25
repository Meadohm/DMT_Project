// src/components/ContextMenu.js — version Gemini+ v3 (Octobre 2025)
/* eslint-disable no-unused-expressions */
import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import ReactDOM from "react-dom";
import "../styles/SidebarGemini.css";

/**
 * Modes :
 * - "owner" : menu complet (Renommer, Partager, Supprimer)
 * - "child" : menu réduit (Renommer, Supprimer)
 * - "shared" : utilisé pour dossiers partagés (hérité du code existant)
 */

const ContextMenu = ({ onRename, onShare, onDelete, onLeave, anchorRef, onClose, mode = "owner" }) => {
  const menuEl = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });

  /* === Calcul position du menu === */
  useLayoutEffect(() => {
    const anchorEl = anchorRef?.current || anchorRef;
    if (!anchorEl || !anchorEl.getBoundingClientRect) {
      console.warn("⚠️ ContextMenu: anchorRef invalide ou non monté");
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const width = 190;
    const height =
      mode === "owner" ? 140 : mode === "child" ? 100 : 130;
    let top = rect.bottom + 6;
    let left = rect.left + rect.width + 6;

    //Ajustement pour éviter débordement écran
    if (left + width > window.innerWidth) left = rect.left - width - 8;
    if (top + height > window.innerHeight) top = window.innerHeight - height - 8;

    setPos({ top, left, visible: true });
  }, [anchorRef, mode]);

  /* === Fermeture clic extérieur === */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuEl.current && !menuEl.current.contains(e.target)) {
        requestAnimationFrame(() => onClose?.());
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  /* === Mode "shared" = pointerEvents activé === */
  useEffect(() => {
    if (mode === "shared" && menuEl.current) {
      menuEl.current.style.pointerEvents = "auto";
    }
  }, [mode]);

  if (!pos.visible) return null;

  /* === Gestion des clics sur action === */
  const handleAction = (callback, e) => {
    e.stopPropagation();
    onClose?.();
    callback?.();
  };

  /* === Menu JSX === */
  const menu = (
    <div
      ref={menuEl}
      className="context-menu modern-menu glass-effect scale-fade"
      style={{
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        position: "fixed",
        zIndex: 999999,
        pointerEvents: "auto",
      }}
    >
      {/* === Mode propriétaire : complet === */}
      {mode === "owner" && (
        <>
          <button onPointerDown={(e) => handleAction(onRename, e)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            Renommer
          </button>

          <button onPointerDown={(e) => handleAction(onShare, e)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Partager
          </button>

          <button onPointerDown={(e) => handleAction(onDelete, e)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3-3h8a1 1 0 011 1v2H7V4a1 1 0 011-1z" />
            </svg>
            Supprimer
          </button>
        </>
      )}

      {/* === Mode sous-dossier : réduit === */}
      {mode === "child" && (
        <>
          <button onPointerDown={(e) => handleAction(onRename, e)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            Renommer
          </button>

          <button onPointerDown={(e) => handleAction(onDelete, e)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3-3h8a1 1 0 011 1v2H7V4a1 1 0 011-1z" />
            </svg>
            Supprimer
          </button>
        </>
      )}

      {/* === Mode partagé (hérité de l'ancien code) === */}
      {mode === "shared" && (
        <>
          {onDelete && (
            <button onPointerDown={(e) => handleAction(onDelete, e)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3-3h8a1 1 0 011 1v2H7V4a1 1 0 011-1z" />
              </svg>
              Supprimer
            </button>
          )}

          <button onPointerDown={(e) => handleAction(onLeave, e)}>
            🚪 Quitter ce dossier
          </button>
        </>
      )}
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
};

export default ContextMenu;
