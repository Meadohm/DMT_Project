// src/components/Modal.js
import React from "react";
import "../styles/Modal.css";

function Modal({
  title,
  children,
  onClose,
  onConfirm,
  confirmText = "Confirmer",
  className = "",
  showCancel = true,
  mode = "default",
}) {
  return (
    <div className="modal-overlay">
      <div className={`modal-content ${className}`}>
        {/* Bouton ✖ en haut */}
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Fermer la fenêtre"
        >
          ✖
        </button>

        {/* Titre */}
        {title && <h3>{title}</h3>}

        {/* Contenu */}
        <div className="modal-body">{children}</div>

        {/* Actions */}
        <div className="modal-actions">
          {mode === "default" && showCancel && (
            <button className="btn-cancel" onClick={onClose}>
              Annuler
            </button>
          )}
          <button
            className="btn-confirm"
            onClick={onConfirm || onClose}
          >
            {mode === "notif" ? "OK" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Modal;
