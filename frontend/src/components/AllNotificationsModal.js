import React, { useState } from "react";
import "../styles/AllNotificationsModal.css";
import { clearAll, deleteNotification } from "../services/notificationService";
import { formatRelativeTime } from "../utils/timeUtils";

export default function AllNotificationsModal({ notifications, onClose, onRefresh }) {
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearAll = async () => {
    try {
      await clearAll();
      onRefresh();
      onClose();
    } catch (err) {
      console.error("❌ Erreur suppression", err);
    } finally {
      setConfirmClear(false);
    }
  };

  const handleDeleteOne = async (id) => {
    try {
      await deleteNotification(id);
      onRefresh();
    } catch (err) {
      console.error("❌ Erreur suppression notification", err);
    }
  };

  return (
    <div className="notif-modal-overlay">
      <div className="notif-modal-content">
        <div className="notif-modal-header">
          <h3>🔔 Toutes les notifications</h3>
          <button className="notif-modal-close" onClick={onClose}>✖</button>
        </div>

        <div className="notif-modal-list">
          {notifications.length === 0 ? (
            <p className="no-notif">Aucune notification disponible.</p>
          ) : (
            notifications
              .slice()
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((n) => (
                <div className={`notif-item${!n.is_read ? " unread" : ""}`} key={n.id}>
                  <div className="notif-body">
                    <div className="notif-text">{n.message}</div>
                    <div
                      className="notif-time-right"
                      title={new Date(n.created_at).toLocaleString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    >
                      {formatRelativeTime(n.created_at)} ⏰
                    </div>
                  </div>

                  <button
                    className="notif-delete-one"
                    onClick={() => handleDeleteOne(n.id)}
                    title="Supprimer cette notification"
                  >
                    ❌
                  </button>
                </div>
              ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="notif-modal-footer">
            <button className="notif-clear-all" onClick={() => setConfirmClear(true)}>
              🗑️ Effacer tout
            </button>
          </div>
        )}
      </div>
      {confirmClear && (
        <div className="archive-confirm-overlay">
          <div className="archive-confirm-box">
            <p>🗑️ Effacer toutes les notifications ?</p>
            <div className="archive-confirm-actions">
              <button className="btn-cancel-confirm" onClick={() => setConfirmClear(false)}>Annuler</button>
              <button className="btn-delete-confirm" onClick={handleClearAll}>Effacer tout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
