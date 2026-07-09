import React, { useState, useMemo } from "react";
import "../styles/AllNotificationsModal.css";
import { clearAll, deleteNotification } from "../services/notificationService";
import { formatRelativeTime } from "../utils/timeUtils";

const TYPE_LABELS = {
  share: "🤝 Partage",
  permission: "🔑 Permission",
  warning: "⚠️ Suppression",
  info: "ℹ️ Info",
  upload: "📤 Upload",
  archive: "📦 Archive",
};

const PAGE_SIZE = 10;

export default function AllNotificationsModal({ notifications, onClose, onRefresh }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let result = [...notifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (search.trim()) {
      result = result.filter(n => n.message.toLowerCase().includes(search.toLowerCase()));
    }
    if (typeFilter) {
      result = result.filter(n => n.type === typeFilter);
    }
    if (daysFilter) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(daysFilter));
      result = result.filter(n => new Date(n.created_at) >= cutoff);
    }
    return result;
  }, [notifications, search, typeFilter, daysFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          <h3>🔔 Toutes les notifications ({filtered.length})</h3>
          <button className="notif-modal-close" onClick={onClose}>✖</button>
        </div>

        {/* Filtres */}
        <div className="notif-filters">
          <input
            className="notif-filter-input"
            placeholder="🔍 Rechercher..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            className="notif-filter-select"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className="notif-filter-select"
            value={daysFilter}
            onChange={e => { setDaysFilter(e.target.value); setPage(1); }}
          >
            <option value="">Toute période</option>
            <option value="1">Aujourd'hui</option>
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
          </select>
        </div>

        <div className="notif-modal-list">
          {paginated.length === 0 ? (
            <p className="no-notif">Aucune notification trouvée.</p>
          ) : (
            paginated.map((n) => (
              <div className={`notif-item${!n.is_read ? " unread" : ""}`} key={n.id}>
                <div className="notif-body">
                  <div className="notif-type-badge">{TYPE_LABELS[n.type] || n.type}</div>
                  <div className="notif-text">{n.message}</div>
                  <div
                    className="notif-time-right"
                    title={new Date(n.created_at).toLocaleString("fr-FR", {
                      weekday: "long", day: "numeric", month: "long",
                      year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  >
                    {formatRelativeTime(n.created_at)} ⏰
                  </div>
                </div>
                <button
                  className="notif-delete-one"
                  onClick={() => handleDeleteOne(n.id)}
                  title="Supprimer"
                >
                  ❌
                </button>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="notif-pagination">
            <button onClick={() => setPage(1)} disabled={page === 1}>⏮</button>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>←</button>
            <span>Page {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>→</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>⏭</button>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="notif-modal-footer">
            <button className="notif-clear-all" onClick={() => setConfirmClear(true)}>
              🗑️ Effacer tout ({notifications.length})
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
