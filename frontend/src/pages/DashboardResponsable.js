// src/pages/DashboardResponsable.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getUserInfo } from "../services/fileService";
import { checkTokenValidity } from "../services/authService";
import {
  listFolders,
  listFoldersService,
  createFolder,
  renameFolder,
  deleteFolder,
  shareFolder,
  leaveFolder,
} from "../services/folderService";
import { updatePassword } from "../services/passwordService";
import useTheme from "../hooks/useTheme";
import "../styles/theme.css";
import Toast from "../components/Toast";
import FileManager from "../components/FileManager";
import Modal from "../components/Modal";
import ShareModal from "../components/ShareModal";
import ArchivesModal from "../components/ArchivesModal";
import AllNotificationsModal from "../components/AllNotificationsModal";
import SharedFilesHistoryModal from "../components/SharedFilesHistoryModal";
import useNotifications from "../hooks/useNotifications";
import { clearAll } from "../services/notificationService";
import useClock from "../hooks/useClock";
import DashboardTopbar from "../components/DashboardTopbar";
import DashboardSidebar from "../components/DashboardSidebar";
import "../styles/FileManager.css";
import "../styles/SidebarGemini.css";
import "../styles/DashboardResponsable.css";

function DashboardResponsable() {
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
    const interval = setInterval(() => {
      fetchFolders();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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
      const res = await listFoldersService();
      const data = res || [];

      const sorted = [...data].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      const byId = Object.fromEntries(sorted.map(f => [f.id, { ...f, children: [] }]));
      const roots = [];

      sorted.forEach(f => {
        if (f.parent && byId[f.parent]) {
          byId[f.parent].children.push(byId[f.id]);
        } else {
          roots.push(byId[f.id]);
        }
      });

      const sortRecursively = (folders) => {
        folders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        folders.forEach(f => f.children && sortRecursively(f.children));
      };
      sortRecursively(roots);

      setFolders(roots);
      // Auto-sélectionner uniquement le premier dossier personnel
      const myRoots = roots.filter(
        (f) => f.proprietaire?.id === userInfo?.id
      );
      if (!activeFolder && myRoots.length > 0) setActiveFolder(myRoots[0]);

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

  const renameInTree = (folders, id, newName) =>
    folders.map(f => f.id === id
      ? { ...f, nom: newName }
      : { ...f, children: renameInTree(f.children || [], id, newName) }
    );

  const deleteFromTree = (folders, id) =>
    folders
      .filter(f => f.id !== id)
      .map(f => ({ ...f, children: deleteFromTree(f.children || [], id) }));

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    navigate("/");
  };

  // ==== Gestion modales ====
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
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
  const [allNotifOpen, setAllNotifOpen] = useState(false);
  const [historiqueSharedOpen, setHistoriqueSharedOpen] = useState(false);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) => [...prev]);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Polling sidebar — refresh dossiers toutes les 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFolders();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleClearNotifications = async () => {
    try {
      await clearAll();
      setNotifications([]);
    } catch (err) {
      console.error("❌ Erreur suppression notifications", err);
    }
  };

  // === Confirmation modale universelle ===
  const handleConfirm = async () => {
    try {
      if (modalType === "create") {
        const newFolder = await createFolder(inputValue);
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
        setFolders(prev => renameInTree(prev, currentFolder.id, updated.nom));
      }

      if (modalType === "delete" && currentFolder) {
        await deleteFolder(currentFolder.id);
        setFolders(prev => deleteFromTree(prev, currentFolder.id));
        if (activeFolder?.id === currentFolder.id) setActiveFolder(null);
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
        message: "⛔ Erreur lors de l'action sur le dossier.",
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

  const handleShareConfirm = async (payload, type = "new") => {
    try {
      await shareFolder(currentFolder.id, payload);
      await fetchFolders();
      setShareModalOpen(false);
      if (type === "new") {
        setNotif({ type: "success", title: "Succès", message: "📤 Dossier partagé avec succès." });
      } else {
        setNotif({ type: "success", title: "Succès", message: "💾 Permissions mises à jour." });
      }
    } catch (err) {
      setNotif({ type: "error", title: "Erreur", message: "⛔ Erreur lors du partage." });
    } finally {
      setCurrentFolder(null);
    }
  };

  const handleCreateSubfolder = async (parentId, name) => {
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
      setFolders((prev) =>
        prev.map((f) =>
          f.id === parentId
            ? { ...f, children: [...(f.children || []), newSub] }
            : f
        )
      );
    } catch (err) {
      alert("⛔ Impossible de créer le sous-dossier.");
    }
  };

  const handleLeaveFolder = async (folder) => {
    try {
      await leaveFolder(folder.id);
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      setNotif({
        type: "success",
        title: "Succès",
        message: `Vous avez quitté le dossier "${folder.nom}".`,
      });
      if (activeFolder?.id === folder.id) setActiveFolder(null);
    } catch (err) {
      setNotif({
        type: "error",
        title: "Erreur",
        message: "⛔ Impossible de quitter ce dossier.",
      });
    }
  };

  const handleDeleteSharedFolder = async (folder) => {
    try {
      await deleteFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
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
        message: "⛔ Vous n'avez pas la permission de supprimer ce dossier.",
      });
    }
  };

  // Gestion Favoris
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

  // Filtrage et regroupement dossiers
  const { myFolders, sharedFolders, externalFolders, favoriteFolders } = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = folders.filter((f) =>
      f.nom.toLowerCase().includes(lowerSearch)
    );
    const userService = userInfo?.service ?? null;
    return {
      myFolders: filtered.filter((f) => f.proprietaire?.id === userInfo?.id),
      sharedFolders: filtered.filter((f) =>
        f.proprietaire?.id !== userInfo?.id &&
        (userService ? f.service === userService : true)
      ),
      externalFolders: filtered.filter((f) =>
        f.proprietaire?.id !== userInfo?.id &&
        userService &&
        f.service !== userService
      ),
      favoriteFolders: filtered.filter((f) => favorites.includes(f.id)),
    };
  }, [folders, searchTerm, userInfo, favorites]);

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
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        myFolders={myFolders}
        sharedFolders={sharedFolders}
        favoriteFolders={favoriteFolders}
        activeFolder={activeFolder}
        onSelect={setActiveFolder}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onCreateFolder={handleCreateFolder}
        onCreateSubfolder={handleCreateSubfolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onShareFolder={handleShareFolder}
        onDeleteShared={handleDeleteSharedFolder}
        onLeaveFolder={handleLeaveFolder}
        externalFolders={externalFolders}
        role="responsable"
      />

      {/* --- MAIN --- */}
      <main className="main-content">
        <DashboardTopbar
          userInfo={userInfo}
          role="responsable"
          colorScheme="teal"
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          onSelectFolder={(folder) => {
            const found = folders.find(f => f.id === folder.id) ||
              (function findInTree(list) {
                for (const f of list) {
                  if (f.id === folder.id) return f;
                  if (f.children?.length) {
                    const r = findInTree(f.children);
                    if (r) return r;
                  }
                }
                return null;
              })(folders);
            if (found) setActiveFolder(found);
          }}
          now={now}
          notifications={notifications}
          onClearNotifications={handleClearNotifications}
          onOpenAllNotif={() => setAllNotifOpen(true)}
          onLogout={handleLogout}
          onOpenPasswordModal={() => setPasswordModalOpen(true)}
          toggleTheme={toggleTheme}
          theme={theme}
          onOpenArchives={() => setArchivesOpen(true)}
          onOpenHistorique={() => setHistoriqueSharedOpen(true)}
        />

        {activeFolder ? (
          <FileManager
            activeFolder={activeFolder}
            setActiveFolder={setActiveFolder}
            userInfo={userInfo}
            sidebarCollapsed={sidebarCollapsed}
            folders={folders}
            onRefreshNotifications={refresh}
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
          onConfirm={handleShareConfirm}
          onRevoke={async () => { await fetchFolders(); }}
        />
      )}

      {passwordModalOpen && (
        <Modal
          title="🔑 Modifier le mot de passe"
          onClose={() => setPasswordModalOpen(false)}
          onConfirm={async () => {
            if (oldPassword === newPassword) {
              setPasswordError("❌ Le nouveau mot de passe doit être différent de l'ancien.");
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
                context: "password_change"
              });
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

      {historiqueSharedOpen && (
        <SharedFilesHistoryModal
          onClose={() => setHistoriqueSharedOpen(false)}
          onOpen={(file) => {
            setHistoriqueSharedOpen(false);
          }}
        />
      )}

      {archivesOpen && (
        <ArchivesModal
          onClose={() => setArchivesOpen(false)}
          onRefreshFolders={fetchFolders}
          userInfo={userInfo}
          onRefreshNotifications={refresh}
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

export default DashboardResponsable;