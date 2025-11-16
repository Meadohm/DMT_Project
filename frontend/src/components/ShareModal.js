// src/components/ShareModal.js 
import React, { useEffect, useState } from "react";
import "../styles/FileManager.css";
import API_BASE_URL from "../config"; //centralisation URL API

function ShareModal({ folder, onClose, onConfirm }) {
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [permissionsMap, setPermissionsMap] = useState({});

  // Charger utilisateurs
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

  // Sélection / désélection utilisateur
  const toggleUser = (user) => {
    if (selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
      const updated = { ...permissionsMap };
      delete updated[user.id];
      setPermissionsMap(updated);
    } else {
      setSelectedUsers([...selectedUsers, user]);
      setPermissionsMap({
        ...permissionsMap,
        [user.id]: {
          read: true,
          write: false,
          update: false,
          delete: false,
          delete_folder: false,
        },
      });
    }
  };

  // Modifier permissions utilisateur
  const togglePermission = (userId, perm) => {
    setPermissionsMap((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [perm]: !prev[userId][perm] },
    }));
  };

  const handleConfirm = () => {
    if (selectedUsers.length === 0) {
      alert("⚠️ Veuillez sélectionner au moins un utilisateur.");
      return;
    }
    const payload = selectedUsers.map((user) => ({
      user_id: user.id,
      permissions: permissionsMap[user.id],
    }));
    onConfirm(payload);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content share-modal">
        <h3>
          📤 Partager le dossier :{" "}
          <span className="highlight">{folder.nom}</span>
        </h3>
        <p>
          Sélectionnez un ou plusieurs utilisateurs et attribuez leurs
          autorisations :
        </p>

        {/* Liste utilisateurs */}
        <div className="user-list">
          {users.map((user) => {
            const isActive = selectedUsers.find((u) => u.id === user.id);
            return (
              <div
                key={user.id}
                className={`user-item ${isActive ? "active" : ""}`}
                onClick={() => toggleUser(user)}
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="user-avatar small"
                  />
                ) : (
                  <div className="user-avatar small svg-avatar">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0v.75H4.5v-.75z"
                      />
                    </svg>
                  </div>
                )}
                <span>{user.username}</span>
              </div>
            );
          })}
        </div>

        {/* Permissions par utilisateur sélectionné */}
        {selectedUsers.length > 0 && (
          <div className="permissions-grid">
            {selectedUsers.map((user) => (
              <div key={user.id} className="permission-block">
                <h4>{user.username}</h4>
                {Object.keys(permissionsMap[user.id] || {}).map((perm) => (
                  <label key={perm} className="checkbox-modern">
                    <input
                      type="checkbox"
                      checked={permissionsMap[user.id][perm]}
                      onChange={() => togglePermission(user.id, perm)}
                    />
                    <span className="checkmark"></span>
                    {perm === "read" && "Lecture"}
                    {perm === "write" && "Ajouter des fichiers"}
                    {perm === "update" && "Renommer le fichier"}
                    {perm === "delete" && "Supprimer fichiers"}
                    {perm === "delete_folder" && "Supprimer dossier"}
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Boutons centrés avec hover distinct */}
        <div className="modal-actions centered">
          <button className="cancel-btn" onClick={onClose}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="icon-inline"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              width="18"
              height="18"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Annuler
          </button>

          <button className="confirm-btn" onClick={handleConfirm}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="icon-inline"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              width="18"
              height="18"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            Partager
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;
