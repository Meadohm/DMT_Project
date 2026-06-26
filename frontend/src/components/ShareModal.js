// src/components/ShareModal.js
import React, { useEffect, useState } from "react";
import "../styles/FileManager.css";
//import "../styles/ShareModal.css";
import API_BASE_URL from "../config";

function ShareModal({ folder, onClose, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permissionsMap, setPermissionsMap] = useState({});
  const [existingShares, setExistingShares] = useState([]);
  const [revoking, setRevoking] = useState(null);

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
      }
    } catch (err) {
      console.error("❌ Erreur révocation", err);
    } finally {
      setRevoking(null);
    }
  };

  const handleConfirm = () => {
    // Nouveaux partages
    const newPayload = selectedUsers.map(user => ({
      user_id: user.id,
      permissions: { read: true, ...permissionsMap[user.id] },
    }));
    // Modifications des existants
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
    onConfirm([...existingPayload, ...newPayload]);
  };

  const PERM_LABELS = {
    write: "✏️ Ajouter fichiers",
    update: "🔄 Renommer fichiers",
    delete: "🗑️ Supprimer fichiers",
    delete_folder: "📁 Supprimer dossier",
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content share-modal">
        <h3>📤 Partager : <span className="highlight">{folder.nom}</span></h3>

        {/* Zone 1 — Accès actifs */}
        {existingShares.length > 0 && (
          <div className="share-zone">
            <h4 className="share-zone-title">👥 Accès actifs ({existingShares.length})</h4>
            {existingShares.map(share => (
              <div key={share.user_id} className="existing-share-item">
                <div className="existing-share-header">
                  <span className="existing-share-username">👤 {share.username}</span>
                  <button
                    className="btn-revoke"
                    onClick={() => handleRevokeShare(share)}
                    disabled={revoking === share.user_id}
                    title="Révoquer l'accès"
                  >
                    {revoking === share.user_id ? "⏳" : "🚫 Révoquer"}
                  </button>
                </div>
                <div className="existing-share-perms">
                  {Object.keys(PERM_LABELS).map(perm => (
                    <label key={perm} className="checkbox-modern small">
                      <input
                        type="checkbox"
                        checked={share[perm] || false}
                        onChange={() => updateExistingPerm(share, perm)}
                      />
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
            {availableUsers.length === 0 ? (
              <p className="no-users-msg">Aucun utilisateur disponible.</p>
            ) : availableUsers.map(user => {
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
                  <span>{user.username}</span>
                  {isSelected && <span className="badge-selected">✓</span>}
                </div>
              );
            })}
          </div>

          {/* Permissions nouveaux utilisateurs */}
          {selectedUsers.length > 0 && (
            <div className="permissions-grid">
              {selectedUsers.map(user => (
                <div key={user.id} className="permission-block">
                  <h4>👤 {user.username}</h4>
                  {Object.keys(PERM_LABELS).map(perm => (
                    <label key={perm} className="checkbox-modern">
                      <input
                        type="checkbox"
                        checked={permissionsMap[user.id]?.[perm] || false}
                        onChange={() => togglePermission(user.id, perm)}
                      />
                      <span>{PERM_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions centered">
          <button className="cancel-btn" onClick={onClose}>✖ Annuler</button>
          <button
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={selectedUsers.length === 0 && existingShares.length === 0}
          >
            ✓ Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;