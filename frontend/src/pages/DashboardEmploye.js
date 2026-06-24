// src/pages/DashboardEmploye.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getUserInfo } from "../services/fileService";
import { checkTokenValidity } from "../services/authService";
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  shareFolder,
} from "../services/folderService";
import { updatePassword } from "../services/passwordService";
import useTheme from "../hooks/useTheme";
import "../styles/theme.css";
import Toast from "../components/Toast";
import FileManager from "../components/FileManager";
import Modal from "../components/Modal";
import ShareModal from "../components/ShareModal";
import ArchivesModal from "../components/ArchivesModal";
import FolderTree from "../components/FolderTree";
import ContextMenu from "../components/ContextMenu";
import AllNotificationsModal from "../components/AllNotificationsModal";
import useNotifications from "../hooks/useNotifications";
import { markAllRead, clearAll } from "../services/notificationService";
import useClock from "../hooks/useClock";
  
import "../styles/FileManager.css";
import "../styles/SidebarGemini.css";
import { formatRelativeTime } from "../utils/timeUtils";
import logo from "../assets/dmt.png";

function DashboardEmploye() {
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [archivesOpen, setArchivesOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const now = useClock();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Favoris
  const [favorites, setFavorites] = useState(
    JSON.parse(localStorage.getItem("favorites")) || []
  );

  const navigate = useNavigate();

   // Authentification et récupération données
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }
    setIsAuthenticated(true);
    fetchUserInfo();
    fetchFolders();
  }, [navigate]);


  useEffect(() => {
  (async () => {
    const valid = await checkTokenValidity();
    if (!valid) {
      localStorage.clear();
      navigate("/");
    }
  })();
}, []);


  const fetchUserInfo = async () => {
    try {
      const data = await getUserInfo();
      setUserInfo(data);
    } catch (err) {
      console.error("❌ Erreur récupération utilisateur", err);
    }
  };

  // === Fonction pour charger les dossiers (optimisée & triée) ===
  const fetchFolders = async () => {
    try {
      const res = await listFolders();
      const data = res || [];

      // 🔹 Tri du plus récent au plus ancien (par date de création)
      const sorted = [...data].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      // 🔹 Construction hiérarchique parent → enfants
      const byId = Object.fromEntries(sorted.map(f => [f.id, { ...f, children: [] }]));
      const roots = [];

      sorted.forEach(f => {
        if (f.parent && byId[f.parent]) {
          byId[f.parent].children.push(byId[f.id]);
        } else {
          roots.push(byId[f.id]);
        }
      });

      // 🔹 Trie récursif des enfants
      const sortRecursively = (folders) => {
        folders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        folders.forEach(f => f.children && sortRecursively(f.children));
      };
      sortRecursively(roots);

      setFolders(roots);
      if (roots.length > 0) setActiveFolder(roots[0]);

      // 🔹 Restauration automatique de l’expansion sauvegardée
      const saved = JSON.parse(localStorage.getItem("expandedFolders") || "[]");
      if (saved.length > 0) {
        setTimeout(() => {
          const evt = new CustomEvent("restore-expansion", { detail: saved });
          window.dispatchEvent(evt);
        }, 400);
      }

    } catch (err) {
      console.error("Erreur de chargement des dossiers :", err);
    } finally {
      setLoading(false);
    }
  };


  
  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    navigate("/");
  };

  // ==== Gestion modales ====
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [currentFolder, setCurrentFolder] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [notif, setNotif] = useState(null);
  const [alertPermission, setAlertPermission] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [allNotifOpen, setAllNotifOpen] = useState(false);

  const notifRef = useRef(null);
  const accountRef = useRef(null);

// Fermeture si clic extérieur
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };

  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);

// Ferme le menu contextuel si clic extérieur
useEffect(() => {
  const closeMenu = (e) => {
    if (!e.target.closest(".folder-menu-wrapper")) setOpenMenuId(null);
  };
  document.addEventListener("click", closeMenu);
  return () => document.removeEventListener("click", closeMenu);
}, []);


  // Un seul menu peut rester ouvert à la fois
  const toggleNotif = () => {
    setNotifOpen((prev) => !prev);
    setAccountOpen(false);
    if (!notifOpen) markAllRead().catch(() => {});
  };

  const toggleAccount = () => {
    setAccountOpen((prev) => !prev);
    setNotifOpen(false);
    setPasswordModalOpen(false); // ferme modal si menu réouvert
  };


  const handleCreateFolder = () => {
    setModalType("create");
    setInputValue("");
    setModalOpen(true);
  };

  const handleRenameFolder = (folder) => {
    setModalType("rename");
    setInputValue(folder.nom);
    setCurrentFolder(folder);
    setModalOpen(true);
  };

  const handleDeleteFolder = (folder) => {
    setModalType("delete");
    setCurrentFolder(folder);
    setModalOpen(true);
  };


  const { notifications, refresh, setNotifications } = useNotifications();

  // 🔁 Force le rafraîchissement du temps toutes les 60 secondes
    useEffect(() => {
      const interval = setInterval(() => {
        setNotifications((prev) => [...prev]); // redéclenche un rendu
      }, 60000);
      return () => clearInterval(interval);
    }, []);


const handleClearNotifications = async () => {
  try {
    await clearAll();  // ⚡ supprime réellement du backend
    setNotifications([]); // vide localement
  } catch (err) {
    console.error("❌ Erreur suppression notifications", err);
  }
};

  // === Confirmation modale universelle (création / renommage / suppression) ===
  const handleConfirm = async () => {
    try {
      if (modalType === "create") {
        const newFolder = await createFolder(inputValue);

        // 🔹 Insertion du dossier en haut de la liste
        setFolders(prev => [newFolder, ...prev]);
        setActiveFolder(newFolder);

        setNotif({
          type: "success",
          title: "Succès 🎉",
          message: `📁 Dossier "${newFolder.nom}" créé avec succès.`,
        });

      }

      if (modalType === "rename" && currentFolder) {
        if (inputValue.length > 255) {
          setAlertPermission({
            title: "Nom trop long 🚫",
            message: "Le nom du dossier ne peut pas dépasser 255 caractères.",
          });
          return;
        }

        const updated = await renameFolder(currentFolder.id, inputValue);
        setFolders(prev =>
          prev.map(f =>
            f.id === currentFolder.id ? { ...f, nom: updated.nom } : f
          )
        );
      }

      if (modalType === "delete" && currentFolder) {
        await deleteFolder(currentFolder.id);
        setFolders(prev => prev.filter(f => f.id !== currentFolder.id));
        if (activeFolder?.id === currentFolder.id) setActiveFolder(null);

        // 🔹 Supprime aussi des favoris
        setFavorites(prev => prev.filter(favId => favId !== currentFolder.id));
        localStorage.setItem(
          "favorites",
          JSON.stringify(favorites.filter(favId => favId !== currentFolder.id))
        );
      }
    } catch (err) {

      setNotif({
        type: "error",
        title: "Erreur",
        message: "⛔ Erreur lors de l’action sur le dossier.",
      });

      console.error(err);
    } finally {
      setModalOpen(false);
      setModalType(null);
      setInputValue("");
      setCurrentFolder(null);
    }
  };


  const handleShareFolder = (folder) => {
    setCurrentFolder(folder);
    setShareModalOpen(true);
  };

  const confirmShare = async (shares) => {
  try {
    await shareFolder(currentFolder.id, shares);
    setNotif({
      type: "success",
      title: "Succès 🎉",
      message: "Le dossier a été partagé avec succès."
    });
  } catch (err) {
    console.error("❌ Erreur partage dossier", err);
    setNotif({
      type: "error",
      title: "Erreur",
      message: "⛔ Vous n'avez pas la permission de partager ce dossier."
    });
  } finally {
    setShareModalOpen(false);
    setCurrentFolder(null);
  }
};


  // ⭐ Gestion Favoris
  const toggleFavorite = (folderId) => {
    let updated;
    if (favorites.includes(folderId)) {
      updated = favorites.filter((id) => id !== folderId);
    } else {
      updated = [...favorites, folderId];
    }
    setFavorites(updated);
    localStorage.setItem("favorites", JSON.stringify(updated));
  };

  // 🔍 Filtrage et regroupement dossiers
  const { myFolders, sharedFolders, favoriteFolders } = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = folders.filter((f) =>
      f.nom.toLowerCase().includes(lowerSearch)
    );
    return {
      myFolders: filtered.filter((f) => f.proprietaire?.id === userInfo?.id),
      sharedFolders: filtered.filter((f) => f.proprietaire?.id !== userInfo?.id),
      favoriteFolders: filtered.filter((f) => favorites.includes(f.id)),
    };
  }, [folders, searchTerm, userInfo, favorites]);

  const menuRef = useRef(null);
  const menuRefs = useRef({});

  // === 🔧 Gestion du menu contextuel universel pour "Partagés avec moi" ===
  const handleRenameShared = (folder) => {
    // Ouvre ta modale de renommage réutilisable
    setModalType("rename");
    setInputValue(folder.nom);
    setCurrentFolder(folder);
    setModalOpen(true);
  };

  const handleShareShared = (folder) => {
    // Utilise ta logique existante
    handleShareFolder(folder);
  };

  const handleDeleteShared = (folder) => {
    // Réutilise ta logique existante de suppression
    handleDeleteFolder(folder);
  };


  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div
      className={`dashboard-container ${theme === "dark" ? "dark" : ""}`}
      style={{ paddingLeft: sidebarCollapsed ? "48px" : "240px", transition: "padding-left 0.2s ease" }}
    >

      {/* --- SIDEBAR --- */}
      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-top-fixed">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            title={sidebarCollapsed ? "Déplier" : "Replier"}
          >
            <span>{sidebarCollapsed ? "▶" : "◀"}</span>
          </button>

          {!sidebarCollapsed && (
            <button className="new-folder-btn" onClick={handleCreateFolder}>+ Nouveau</button>
          )}
        </div>

        <div className="sidebar-layout-fix">

        {/* ⭐ Favoris */}
        <h4 className="sidebar-section">⭐ Favoris</h4>
        <div className="section-scroll">
        {favoriteFolders.length === 0 ? (
          <p className="no-folder-msg1">Aucun favori</p>
        ) : (
          <ul className="folder-list">
            {favoriteFolders.map((folder) => (
              <li
                key={folder.id}
                className={`${
                  activeFolder?.id === folder.id ? "active" : ""
                } favorite`}
                onClick={() => setActiveFolder(folder)}
                title={folder.nom}
              >
                📂 <span className="folder-name">{folder.nom}</span>
                <button
                  className="star"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(folder.id);
                  }}
                  title="Retirer des favoris"
                >
                  ❌
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>

        {/* Mes dossiers */}
        <h4 className="sidebar-section">📂 Mes dossiers</h4>
        <div className="section-scroll">
        {myFolders.length === 0 ? (
          <p className="no-folder-msg1">Aucun dossier</p>
        ) : (
          myFolders
            .filter((f) => !f.parent)
            .map((folder) => (
              <FolderTree
                key={folder.id}
                folder={folder}
                activeFolder={activeFolder}
                onSelect={setActiveFolder}
                onCreateSubfolder={async (parentId, name) => {
                  try {
                    const baseURL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
                    const res = await fetch(`${baseURL}/folders/${parentId}/subfolders/`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Token ${localStorage.getItem("token")}`,
                      },
                      body: JSON.stringify({ nom: name }),
                    });

                    if (!res.ok) throw new Error("Erreur création sous-dossier");

                    const newSub = await res.json();
                      setFolders((prev) => {
                        return prev.map((f) =>
                          f.id === parentId
                            ? { ...f, children: [...(f.children || []), newSub] }
                            : f
                        );
                      });

                  } catch (err) {
                    alert("⛔ Impossible de créer le sous-dossier.");
                  }
                }}

                onRename={handleRenameFolder}
                onDelete={handleDeleteFolder}
                onShare={handleShareFolder}
                onToggleFavorite={toggleFavorite}
                isFavorite={favorites.includes(folder.id)}
              />
            ))
        )}
        </div>

        {/* Dossiers partagés */}
        <h4 className="sidebar-section">🤝 Partagés avec moi</h4>
        <div className="section-scroll">
          {sharedFolders.length === 0 ? (
            <p className="no-folder-msg1">Aucun dossier partagé</p>
          ) : (
            <ul className="folder-list">
              {sharedFolders.map((folder) => {
                // 🔍 Détection robuste des permissions selon structure backend
                const canDeleteFolder =
                  folder.share_permissions?.can_delete_folder ??
                  folder.permissions?.can_delete_folder ??
                  folder.shares?.[0]?.can_delete_folder ??
                  folder.can_delete_folder ??
                  false;

                return (
                  <li
                    key={folder.id}
                    className={activeFolder?.id === folder.id ? "active" : ""}
                    onClick={() => setActiveFolder(folder)}
                    data-title={folder.nom}
                  >
                    <div className="folder-item">
                      <span className="folder-icon">📂</span>
                      <span className="folder-name" data-title={folder.nom}>
                        {folder.nom}
                      </span>

                      <div className="folder-actions">
                        {/* Favori */}
                        <button
                          className={`star ${favorites.includes(folder.id) ? "active" : "inactive"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(folder.id);
                          }}
                          title={
                            favorites.includes(folder.id)
                              ? "Retirer des favoris"
                              : "Ajouter aux favoris"
                          }
                        >
                          {favorites.includes(folder.id) ? "⭐" : "☆"}
                        </button>

                        {/* Menu contextuel si suppression autorisée */}
                        {canDeleteFolder ? (
                          <div
                            className="folder-menu-wrapper"
                            onClick={(e) => e.stopPropagation()}
                            ref={(el) => (menuRefs.current[folder.id] = el)}
                          >
                            <button
                              className="context-btn"
                              title="Options"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentFolder(folder);
                                setTimeout(() => {
                                  setOpenMenuId((prev) => (prev === folder.id ? null : folder.id));
                                }, 0);
                              }}
                            >
                              ⋮
                            </button>

                            {openMenuId === folder.id && (
                              <ContextMenu
                                anchorRef={menuRefs.current[folder.id]}
                                onDelete={async () => {
                                  try {
                                    await deleteFolder(folder.id);
                                    setFolders((prev) =>
                                      prev.filter((f) => f.id !== folder.id)
                                    );
                                    setOpenMenuId(null);

                                    // Toast success
                                    setNotif({
                                      type: "success",
                                      title: "Succès 🎉",
                                      message: `Le dossier « ${folder.nom} » a été supprimé.`,
                                    });
                                  } catch (err) {
                                    console.error("Erreur suppression dossier partagé", err);
                                    setNotif({
                                      type: "error",
                                      title: "Erreur",
                                      message:
                                        "⛔ Vous n'avez pas la permission de supprimer ce dossier.",
                                    });
                                  }
                                }}
                                onClose={() => setOpenMenuId(null)}
                                mode="shared"
                              />
                            )}
                          </div>
                        ) : (
                          // ⋮ inactif (grisé)
                          <span
                            className="context-btn disabled"
                            title="Suppression non autorisée"
                          >
                            ⋮
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        </div>
        <div className="sidebar-logo-bottom">
          <img src={logo} alt="DMT Logo" className="app-logoEmp" />
        </div>
      </aside>

      {/* --- MAIN --- */}
      <main className="main-content">
        {isAuthenticated && userInfo && (
          <div className="emp-topbar">
            <div className="emp-topbar-left">
              <div className="emp-topbar-welcome">
                <span className="emp-welcome-avatar">
                  {userInfo.username?.charAt(0).toUpperCase()}
                </span>
                <div>
                  <span className="emp-topbar-greeting">BIENVENUE,</span>
                  <span className="emp-topbar-username">{userInfo.username}</span>
                </div>
              </div>
            </div>

            <div className="emp-topbar-search">
              <div className="emp-topbar-search-wrapper">
                <svg className="emp-topbar-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                </svg>
                <input
                  type="text"
                  placeholder="Rechercher un dossier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="emp-topbar-right">
              <div className="emp-topbar-clock">
                <span className="emp-topbar-date">
                  {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
                <span className="emp-topbar-time">
                  {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>

              <div className="emp-topbar-actions">
                <div className="notif-wrapper" ref={notifRef}>
                  <button
                    className="notif-btn"
                    onClick={toggleNotif}
                    title="Notifications"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="icon-bell">
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M14.25 18.75a1.5 1.5 0 01-3 0m6-6V9a6 6 0 00-12 0v3a6 6 0 01-1.8 4.2c-.3.3-.45.9-.15 1.35.3.45.9.45 1.35.45h16.2c.45 0 1.05 0 1.35-.45.3-.45.15-1.05-.15-1.35A6 6 0 0117.25 12.75z" />
                    </svg>
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <span className="notif-count">
                        {notifications.filter(n => !n.is_read).length}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="notif-dropdown">
                      <p className="notif-title">🔔 Notifications</p>
                      <ul className="notif-list">
                        {notifications.length === 0 ? (
                          <li>Aucune notification</li>
                        ) : (
                          notifications
                            .slice(0, 5)
                            .map((n) => {
                              const tooltipDate = new Date(n.created_at).toLocaleString("fr-FR", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              });
                              return (
                                <li key={n.id} className="notif-item">
                                  <div className="notif-message">
                                    {n.type === "share" && <>{n.message}</>}
                                    {n.type === "permission" && <>{n.message}</>}
                                    {n.type === "upload" && <>{n.message}</>}
                                    {n.type === "archive" && <>{n.message}</>}
                                    {n.type === "info" && <>ℹ️{n.message}</>}
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
                        <button className="notif-more" onClick={() => setAllNotifOpen(true)}>
                          Voir toutes les notifications
                        </button>
                      )}

                      <button className="notif-clear" onClick={handleClearNotifications}>
                        Effacer tout
                      </button>
                    </div>
                  )}
                </div>

                <div className="account-wrapper" ref={accountRef}>
                  <button
                    className="account-btn"
                    onClick={toggleAccount}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                        stroke="currentColor"
                        className="icon-account">
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a8.25 8.25 0 1115 0v.75H4.5v-.75z" />
                    </svg>
                  </button>

                  {accountOpen && (
                    <div className="account-dropdown">
                      <p className="account-title">👤 Mon Compte</p>
                      <ul>
                        <li onClick={handleLogout}>🔓 Déconnexion</li>
                        <li onClick={() => {
                          setPasswordModalOpen(true);
                          setNotifOpen(false);
                          setAccountOpen(false);
                        }}>
                          🔑 Modifier le mot de passe
                        </li>
                        <li onClick={toggleTheme}>
                          {theme === "light" ? "🌙 Mode sombre" : "☀️ Mode clair"}
                        </li>
                        <li onClick={() => {
                          setAllNotifOpen(false);
                          setAccountOpen(false);
                          setArchivesOpen(true);
                        }}>
                          📦 Archives
                        </li>
                        <li style={{ opacity: 0.45, cursor: "not-allowed" }} title="Bientôt disponible">⚙️ Paramètres</li>
                        <li style={{ opacity: 0.45, cursor: "not-allowed" }} title="Bientôt disponible">❓ Aide</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeFolder ? (
          <FileManager
            activeFolder={activeFolder}
            setActiveFolder={setActiveFolder}
            userInfo={userInfo}
            sidebarCollapsed={sidebarCollapsed}
          />
        ) : (
          <div className="empty-state">
            <h3>Bienvenue dans votre espace collaboratif 📂</h3>
            <p>Sélectionnez un dossier ou créez-en un nouveau pour commencer.</p>
            <button className="create-btn" onClick={handleCreateFolder}>
              + Créer un dossier
            </button>
          </div>
        )}
      </main>

      {/* --- FOOTER --- */}
      <footer className="footer">
        <p className="footer-line">
          <strong>DMT</strong> – Filiale de <strong>GENICI GROUPE</strong>
        </p>
        <p className="footer-line">
          +225 01 02 19 19 55 • dmt-genici@gmail.com • © 2025 - Développé par{" "}
          <strong>M. Mohamed Fofana</strong>
        </p>
      </footer>

      {/* --- MODALES --- */}
      {modalOpen && (
        <Modal
          title={
            modalType === "create"
              ? "Créer un nouveau dossier"
              : modalType === "rename"
              ? "Renommer le dossier"
              : "Supprimer le dossier"
          }
          onClose={() => setModalOpen(false)}
          onConfirm={handleConfirm}
          confirmText={modalType === "delete" ? "Supprimer" : "Confirmer"}
          showCancel={true}
        >
          {modalType === "delete" ? (
            <p>Êtes-vous sûr de vouloir supprimer ce dossier ?</p>
          ) : (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Nom du dossier"
            />
          )}
        </Modal>
      )}

      {notif && notif.context === "password_change" && (
        <Modal
          title={notif.title}
          onClose={() => { setNotif(null); localStorage.clear(); navigate("/"); }}
          onConfirm={() => { setNotif(null); localStorage.clear(); navigate("/"); }}
          className={notif.type === "success" ? "success-modal" : "error-modal"}
          mode="notif"
        >
          <p className={notif.type === "success" ? "success-message" : "error-message"}>
            {notif.message}
          </p>
        </Modal>
      )}


      {shareModalOpen && (
        <ShareModal
          folder={currentFolder}
          onClose={() => setShareModalOpen(false)}
          onConfirm={confirmShare}
        />
      )}

            {passwordModalOpen && (
              <Modal
                title="🔑 Modifier le mot de passe"
                onClose={() => setPasswordModalOpen(false)}
                onConfirm={async () => {
                  // Vérification avant d'envoyer
                  if (oldPassword === newPassword) {
                    setPasswordError("❌ Le nouveau mot de passe doit être différent de l’ancien.");
                    return;
                  }

                  if (newPassword !== confirmPassword) {
                    setPasswordError("❌ La confirmation du mot de passe ne correspond pas.");
                    return;
                  }

                  try {
                    setLoadingPassword(true);
                    const res = await updatePassword(oldPassword, newPassword);
                    setNotif({
                      type: "success",
                      title: "Succès ✅",
                      message: res.success || "Mot de passe mis à jour.",
                      context: "password_change" //contexte ajouté
                    });


                    // Réinitialise les champs après succès
                    setPasswordModalOpen(false);
                    setOldPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordError("");
                  } catch (err) {
                    setPasswordError(err.message);
                  } finally {
                    setLoadingPassword(false);
                  }
                }}
                confirmText={loadingPassword ? "Chargement..." : "Confirmer"}
                showCancel={true}
              >
                <div className="password-modal-form">
                  <div className="form-group">
                    <label>Ancien mot de passe</label>
                    <div className="input-with-eye">
                      <input
                        type={showOldPwd ? "text" : "password"}
                        placeholder="Mot de passe actuel"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowOldPwd(p => !p)}>
                        {showOldPwd ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Nouveau mot de passe</label>
                    <div className="input-with-eye">
                      <input
                        type={showNewPwd ? "text" : "password"}
                        placeholder="Nouveau mot de passe"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowNewPwd(p => !p)}>
                        {showNewPwd ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Confirmer le mot de passe</label>
                    <div className="input-with-eye">
                      <input
                        type={showConfirmPwd ? "text" : "password"}
                        placeholder="Confirmer le mot de passe"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button type="button" className="eye-btn" onClick={() => setShowConfirmPwd(p => !p)}>
                        {showConfirmPwd ? "🙈" : "👁️"}
                      </button>
                    </div>

                    {confirmPassword && (
                      <small style={{ color: newPassword === confirmPassword ? "#22c55e" : "#ef4444", marginTop: "4px", display: "block" }}>
                        {newPassword === confirmPassword ? "✅ Les mots de passe correspondent" : "❌ Les mots de passe ne correspondent pas"}
                      </small>
                    )}
                  </div>

                  {passwordError && <p className="error-text">{passwordError}</p>}

                  <small className="password-hint">
                    ⚠️ Min. <strong>8 caractères</strong>, un <strong>chiffre</strong> et une <strong>majuscule</strong>.
                  </small>
                </div>
              </Modal>
            )}

                {allNotifOpen && (
                  <AllNotificationsModal
                    notifications={notifications}
                    onClose={() => setAllNotifOpen(false)}
                    onRefresh={refresh}
                  />
                )}

                {archivesOpen && (
                  <ArchivesModal
                    onClose={() => setArchivesOpen(false)}
                    onRefreshFolders={fetchFolders}
                    userInfo={userInfo}
                  />
                )}

                {alertPermission && (
                  <Modal
                    title={alertPermission.title}
                    className="alert-modal"
                    onClose={() => setAlertPermission(null)}
                    onConfirm={() => setAlertPermission(null)}
                  >
                    <p>{alertPermission.message}</p>
                  </Modal>
                )}

                {notif && (
                  <Toast
                    type={notif.type}
                    message={notif.message}
                    onClose={() => setNotif(null)}
                  />
                )}


    </div>
  );

}



export default DashboardEmploye;
