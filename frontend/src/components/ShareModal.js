// src/components/ShareModal.js
import React, { useEffect, useState } from "react";
import "../styles/FileManager.css";
//import "../styles/ShareModal.css";
import API_BASE_URL from "../config";

function ShareModal({ folder, onClose, onConfirm, onRevoke }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permissionsMap, setPermissionsMap] = useState({});
  const [existingShares, setExistingShares] = useState([]);
  const [revoking, setRevoking] = useState(null);
  const [confirmRevokeShare, setConfirmRevokeShare] = useState(null);

  // Charger utilisateurs (sans admins)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/users/`, {
          headers: { Authorization: `Token ${localStorage.getItem("token")}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch (err) {
        console.error("❌ Erreur récupération utilisateurs", err);
      }
    };
    fetchUsers();
  }, []);

  // Charger partages existants
  useEffect(() => {
    if (folder?.shares?.length > 0) {
      const mapped = folder.shares.map(s => ({
        id: s.id,
        user_id: s.user_id,
        username: s.username,
        write: s.can_write,
        update: s.can_update,
        delete: s.can_delete,
        delete_folder: s.can_delete_folder,
      }));
      setExistingShares(mapped);
    }
  }, [folder]);

  const existingUserIds = existingShares.map(s => s.user_id);

  // Filtrer utilisateurs sans accès + recherche
  const availableUsers = users.filter(u =>
    !existingUserIds.includes(u.id) &&
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  // Groupement par service
  const folderService = folder?.service || "";
  const ownerUser = users.find(u => u.id === folder?.proprietaire?.id);

  const sameServiceUsers = availableUsers.filter(
    u => u.service && u.service === folderService && u.id !== ownerUser?.id
  );
  const otherServiceUsers = availableUsers.filter(
    u => (!u.service || u.service !== folderService) && u.id !== ownerUser?.id
  );

  const renderUserCard = (user, showService = false) => {
    const isSelected = selectedUsers.find(u => u.id === user.id);
    return (
      <div
        key={user.id}
        className={`user-item ${isSelected ? "active" : ""}`}
        onClick={() => toggleUser(user)}
      >
        <div className="user-avatar small svg-avatar">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0v.75H4.5v-.75z" />
          </svg>
        </div>
        <div className="user-info-block">
          <span className="user-info-name">{user.username}</span>
          {showService && user.service && (
            <span className="user-info-service">{user.service}</span>
          )}
        </div>
        {isSelected && <span className="badge-selected">✓</span>}
      </div>
    );
  };

  const toggleUser = (user) => {
    if (selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(prev => prev.filter(u => u.id !== user.id));
      setPermissionsMap(prev => { const p = { ...prev }; delete p[user.id]; return p; });
    } else {
      setSelectedUsers(prev => [...prev, user]);
      setPermissionsMap(prev => ({
        ...prev,
        [user.id]: { write: false, update: false, delete: false, delete_folder: false },
      }));
    }
  };

  const togglePermission = (userId, perm) => {
    setPermissionsMap(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [perm]: !prev[userId][perm] },
    }));
  };

  const toggleAllPerms = (userId) => {
    const current = permissionsMap[userId] || {};
    const allChecked = Object.keys(PERM_LABELS).every(p => current[p]);
    const newPerms = Object.keys(PERM_LABELS).reduce((acc, p) => ({ ...acc, [p]: !allChecked }), {});
    setPermissionsMap(prev => ({ ...prev, [userId]: newPerms }));
  };

  const toggleAllExistingPerms = (share) => {
    const allChecked = Object.keys(PERM_LABELS).every(p => share[p]);
    setExistingShares(prev => prev.map(s =>
      s.user_id === share.user_id
        ? { ...s, ...Object.keys(PERM_LABELS).reduce((acc, p) => ({ ...acc, [p]: !allChecked }), {}) }
        : s
    ));
  };

  // Modifier permissions utilisateur existant
  const updateExistingPerm = (share, perm) => {
    setExistingShares(prev => prev.map(s =>
      s.user_id === share.user_id ? { ...s, [perm]: !s[perm] } : s
    ));
  };

  const handleRevokeShare = async (share) => {
    setRevoking(share.user_id);
    try {
      const res = await fetch(`${API_BASE_URL}/shares/${share.id}/revoke/`, {
        method: "DELETE",
        headers: { Authorization: `Token ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        setExistingShares(prev => prev.filter(s => s.user_id !== share.user_id));
        if (onRevoke) await onRevoke();
      }
    } catch (err) {
      console.error("❌ Erreur révocation", err);
    } finally {
      setRevoking(null);
      setConfirmRevokeShare(null);
    }
  };

  const handleSavePermissions = async () => {
    try {
      const existingPayload = existingShares.map(share => ({
        user_id: share.user_id,
        permissions: {
          read: true,
          write: share.write,
          update: share.update,
          delete: share.delete,
          delete_folder: share.delete_folder,
        },
      }));
      await onConfirm(existingPayload, "update");
      onClose();
    } catch (err) {
      console.error("❌ Erreur sauvegarde permissions", err);
    }
  };

  const handleConfirm = () => {
    if (selectedUsers.length === 0) return;
    const newPayload = selectedUsers.map(user => ({
      user_id: user.id,
      permissions: { read: true, ...permissionsMap[user.id] },
    }));
    // Inclure les existants pour ne pas les effacer
    const existingPayload = existingShares.map(share => ({
      user_id: share.user_id,
      permissions: {
        read: true,
        write: share.write,
        update: share.update,
        delete: share.delete,
        delete_folder: share.delete_folder,
      },
    }));
    onConfirm([...existingPayload, ...newPayload], "new");
  };

  const PERM_LABELS = {
    write: "✏️ Ajouter fichiers",
    update: "🔄 Renommer fichiers",
    delete: "🗑️ Supprimer fichiers",
    delete_folder: "📁 Supprimer dossier",
  };

  if (!folder) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content share-modal">
        <div className="share-modal-header">
          <h3>📤 Partager : <span className="highlight">{folder.nom}</span></h3>
          <button className="share-modal-close" onClick={onClose} title="Fermer">✖</button>
        </div>

        {/* Zone 1 — Accès actifs */}
        {existingShares.length > 0 && (
          <div className="share-zone">
            <h4 className="share-zone-title">👥 Accès actifs ({existingShares.length})</h4>
            {existingShares.map(share => (
              <div key={share.user_id} className="existing-share-item">
                <div className="existing-share-header">
                  <span className="existing-share-username">👤 {share.username}</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className="btn-toggle-all"
                      onClick={() => toggleAllExistingPerms(share)}
                      title="Tout cocher / décocher"
                    >
                      {Object.keys(PERM_LABELS).every(p => share[p]) ? "☐ Tout décocher" : "☑ Tout cocher"}
                    </button>
                    <button
                      className="btn-revoke"
                      onClick={() => setConfirmRevokeShare(share)}
                      title="Révoquer l'accès de cet utilisateur"
                    >
                      🚫 Révoquer
                    </button>
                  </div>
                </div>
                <div className="existing-share-perms">
                  {Object.keys(PERM_LABELS).map(perm => (
                    <label key={perm} className="checkbox-modern small">
                      <input type="checkbox" checked={share[perm] || false} onChange={() => updateExistingPerm(share, perm)} />
                      <span className="checkmark"></span>
                      <span>{PERM_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Zone 2 — Ajouter accès */}
        <div className="share-zone">
          <h4 className="share-zone-title">➕ Ajouter un accès</h4>
          <input
            className="share-search"
            placeholder="🔍 Rechercher un utilisateur..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="user-list">
            {availableUsers.length === 0 && !ownerUser ? (
              <p className="no-users-msg">Aucun utilisateur disponible.</p>
            ) : (
              <>
                {/* Propriétaire — non sélectionnable */}
                {ownerUser && (
                  <>
                    <p className="share-group-label">👑 Propriétaire</p>
                    <div className="user-item user-item-owner disabled">
                      <div className="user-avatar small svg-avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0v.75H4.5v-.75z" />
                        </svg>
                      </div>
                      <div className="user-info-block">
                        <span className="user-info-name">{ownerUser.username}</span>
                        {ownerUser.service && (
                          <span className="user-info-service">{ownerUser.service}</span>
                        )}
                      </div>
                      <span className="badge-owner">Propriétaire</span>
                    </div>
                  </>
                )}

                {/* Même service */}
                {sameServiceUsers.length > 0 && (
                  <>
                    <p className="share-group-label">🏢 {folderService || "Mon service"}</p>
                    {sameServiceUsers.map(u => renderUserCard(u, false))}
                  </>
                )}

                {/* Autres services */}
                {otherServiceUsers.length > 0 && (
                  <>
                    <p className="share-group-label">🌐 Autres services</p>
                    {otherServiceUsers.map(u => renderUserCard(u, true))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Permissions nouveaux utilisateurs */}
          {selectedUsers.length > 0 && (
            <div className="permissions-grid">
              {selectedUsers.map(user => (
                <div key={user.id} className="permission-block">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4>👤 {user.username} {user.service && <span className="user-info-service-inline">· {user.service}</span>}</h4>
                    <button className="btn-toggle-all" onClick={() => toggleAllPerms(user.id)}>
                      {Object.keys(PERM_LABELS).every(p => permissionsMap[user.id]?.[p]) ? "☐ Tout décocher" : "☑ Tout cocher"}
                    </button>
                  </div>
                  {Object.keys(PERM_LABELS).map(perm => (
                    <label key={perm} className="checkbox-modern">
                      <input type="checkbox" checked={permissionsMap[user.id]?.[perm] || false} onChange={() => togglePermission(user.id, perm)} />
                      <span className="checkmark"></span>
                      <span>{PERM_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {existingShares.length > 0 && (
          <div className="share-zone-footer">
            <button className="btn-save-perms" onClick={handleSavePermissions}>
              💾 Sauvegarder les droits
            </button>
          </div>
        )}

        <div className="modal-actions centered">
          <button className="cancel-btn" onClick={onClose}>✖ Annuler</button>
          <button className="confirm-btn" onClick={handleConfirm} disabled={selectedUsers.length === 0}>
            📤 Partager
          </button>
        </div>
      </div>

      {confirmRevokeShare && (
        <div className="archive-confirm-overlay">
          <div className="archive-confirm-box">
            <p>🚫 Révoquer l'accès de <strong>{confirmRevokeShare.username}</strong> ?</p>
            <small style={{ color: "#888", display: "block", marginBottom: "16px" }}>
              Cet utilisateur perdra immédiatement l'accès au dossier.
            </small>
            <div className="archive-confirm-actions">
              <button className="btn-cancel-confirm" onClick={() => setConfirmRevokeShare(null)}>
                Annuler
              </button>
              <button
                className="btn-delete-confirm"
                onClick={() => handleRevokeShare(confirmRevokeShare)}
                disabled={revoking === confirmRevokeShare.user_id}
              >
                {revoking === confirmRevokeShare.user_id ? "⏳..." : "🚫 Confirmer révocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShareModal;