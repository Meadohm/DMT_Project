// src/pages/DashboardResponsable.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useCallback } from "react";
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
import useAutoLogout from "../hooks/useAutoLogout";
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
import API_BASE_URL from "../config";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
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
  const [showLogoutWarning, setShowLogoutWarning] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const now = useClock();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Favoris
  const [favorites, setFavorites] = useState([]);

  const navigate = useNavigate();

  const handleWarning = useCallback(() => setShowLogoutWarning(true), []);
  const handleAutoLogout = useCallback(() => {
    const favKey = `favorites_${userInfo?.id}`;
    const favs = localStorage.getItem(favKey);
    localStorage.clear();
    if (favs && favKey !== 'favorites_undefined') localStorage.setItem(favKey, favs);
    navigate("/");
  }, [navigate, userInfo?.id]);

  useAutoLogout(
    userInfo?.role || 'employe',
    handleAutoLogout,
    handleWarning
  );

  useEffect(() => {
    if (userInfo?.id) {
      const saved = JSON.parse(localStorage.getItem(`favorites_${userInfo.id}`)) || [];
      setFavorites(saved);
    }
  }, [userInfo?.id]);

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

  const heartbeatIntervalRef = useRef(null);

  // Heartbeat last-seen toutes les 30s
  useEffect(() => {
    const heartbeat = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          await fetch(`${API_BASE_URL}/last-seen/`, {
            method: 'POST',
            headers: { Authorization: `Token ${token}` }
          });
        }
      } catch (err) {}
    };
    heartbeat();
    heartbeatIntervalRef.current = setInterval(heartbeat, 30000);
    return () => clearInterval(heartbeatIntervalRef.current);
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
      console.error("Erreur récupération utilisateur", err);
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

  const handleLogout = async () => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    const favKey = `favorites_${userInfo?.id}`;
    const favs = localStorage.getItem(favKey);
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${process.env.REACT_APP_API_URL || 'http://192.168.1.116:8000/api'}/logout/`, {
          method: 'POST',
          headers: { Authorization: `Token ${token}` }
        });
      }
    } catch (e) {}
    localStorage.clear();
    if (favs && favKey !== 'favorites_undefined') localStorage.setItem(favKey, favs);
    window.location.replace("/");
  };

  // ==== Gestion modales ====
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [currentFolder, setCurrentFolder] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [serviceStats, setServiceStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsTab, setStatsTab] = useState('service');
  const [detailModal, setDetailModal] = useState(null);

  const fetchUserStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/user-stats/`, {
        headers: { Authorization: `Token ${localStorage.getItem('token')}` }
      });
      if (res.ok) setUserStats(await res.json());
    } catch (err) {
      console.error('Erreur stats user', err);
    }
  };

  const fetchServiceStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/service-stats/`, {
        headers: { Authorization: `Token ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setServiceStats(data);
      }
    } catch (err) {
      console.error('Erreur stats service', err);
    }
  };
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
      console.error("Erreur suppression notifications", err);
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
          `favorites_${userInfo?.id}`,
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
      setNotif({ type: "success", title: "Succès 🎉", message: `Sous-dossier « ${name} » créé.` });
    } catch (err) {
      setNotif({ type: "error", title: "Erreur", message: "⛔ Impossible de créer le sous-dossier." });
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
      setActiveFolder(prev => prev?.id === folder.id ? null : prev);
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
    localStorage.setItem(`favorites_${userInfo?.id}`, JSON.stringify(updated));
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
      style={{ paddingLeft: isMobile ? 0 : (sidebarCollapsed ? "48px" : "240px"), transition: "padding-left 0.2s ease" }}
    >

      {/* --- SIDEBAR --- */}
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
        myFolders={myFolders}
        sharedFolders={sharedFolders}
        favoriteFolders={favoriteFolders}
        activeFolder={activeFolder}
        onSelect={(folder) => { setActiveFolder(folder); if (isMobile) setSidebarMobileOpen(false); }}
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
        <button
          className="sidebar-hamburger"
          onClick={() => setSidebarMobileOpen(prev => !prev)}
          style={{position:'fixed', top:'12px', left:'12px', zIndex:201}}
        >
          ☰
        </button>
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
          onOpenStats={() => { fetchServiceStats(); fetchUserStats(); setStatsOpen(true); }}
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
        <div className="footer-inner">
          <span className="footer-brand"><strong>DMT</strong> - Filiale de <strong>GENICI GROUPE</strong></span>
          <span className="footer-sep">•</span>
          <span className="footer-contact">+225 01 02 19 19 55 • dmt-genici@gmail.com</span>
          <span className="footer-sep">•</span>
          <span className="footer-copy">© {new Date().getFullYear()}</span>
        </div>
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
          onClose={() => {
            const favKey = `favorites_${userInfo?.id}`;
            const favs = localStorage.getItem(favKey);
            setNotif(null); localStorage.clear();
            if (favs && favKey !== 'favorites_undefined') localStorage.setItem(favKey, favs);
            navigate("/");
          }}
          onConfirm={() => {
            const favKey = `favorites_${userInfo?.id}`;
            const favs = localStorage.getItem(favKey);
            setNotif(null); localStorage.clear();
            if (favs && favKey !== 'favorites_undefined') localStorage.setItem(favKey, favs);
            navigate("/");
          }}
          className={notif.type === "success" ? "success-modal" : "error-modal"}
          mode="notif"
        >
          <p className={notif.type === "success" ? "success-message" : "error-message"}>
            {notif.message}
          </p>
        </Modal>
      )}

      {statsOpen && (
        <div className="modal-overlay" onClick={() => setStatsOpen(false)}>
          <div className="service-stats-panel" onClick={e => e.stopPropagation()}>
            <div className="service-stats-header">
              <h2>📊 Stats — {userInfo?.username}</h2>
              <button onClick={() => setStatsOpen(false)}>✕</button>
            </div>
            {/* Onglets */}
            <div className="stats-tabs">
              <button
                className={`stats-tab${statsTab === 'service' ? ' active' : ''}`}
                onClick={() => setStatsTab('service')}
              >
                🏢 Mon service
              </button>
              <button
                className={`stats-tab${statsTab === 'perso' ? ' active' : ''}`}
                onClick={() => setStatsTab('perso')}
              >
                👤 Mes stats
              </button>
            </div>
            {statsTab === 'service' && serviceStats && (
            <>
            <div className="service-stats-cards">
              <div className="service-stat-card">
                <div className="service-stat-icon">👥</div>
                <div className="service-stat-value stat-clickable"
                  onClick={() => setDetailModal({
                    title: '👥 Membres du service',
                    rows: [
                      ...( serviceStats.membres.en_ligne_noms?.map(n => ({ label: n, value: '🟢 En ligne' })) || []),
                      ...( serviceStats.membres.non_connectes_aujourdhui?.map(n => ({ label: n, value: '💤 Absent' })) || []),
                    ]
                  })}
                >
                  {serviceStats.membres.total}
                </div>
                <div className="service-stat-label">Membres</div>
                <div className="service-stat-sub">🟢 {serviceStats.membres.en_ligne} en ligne</div>
              </div>
              <div className="service-stat-card">
                <div className="service-stat-icon">📅</div>
                <div className="service-stat-value stat-clickable"
                  onClick={() => setDetailModal({
                    title: '📅 Connectés aujourd\'hui',
                    rows: serviceStats.membres.connectes_aujourdhui?.map(n => ({ label: n, value: '✅' })) || []
                  })}
                >
                  {serviceStats.membres.connectes_aujourdhui?.length ?? 0}
                </div>
                <div className="service-stat-label">Connectés aujourd'hui</div>
                <div className="service-stat-sub">
                  {serviceStats.membres.connectes_aujourdhui?.length > 0 ? '✅' : '—'}
                </div>
              </div>
              <div className="service-stat-card">
                <div className="service-stat-icon">💤</div>
                <div className="service-stat-value stat-clickable"
                  onClick={() => setDetailModal({
                    title: '💤 Absents aujourd\'hui',
                    rows: serviceStats.membres.non_connectes_aujourdhui?.map(n => ({ label: n, value: '❌' })) || []
                  })}
                >
                  {serviceStats.membres.non_connectes_aujourdhui?.length ?? 0}
                </div>
                <div className="service-stat-label">Absents aujourd'hui</div>
                <div className="service-stat-sub">
                  {serviceStats.membres.non_connectes_aujourdhui?.length === 0
                    ? <span style={{color:'#16a34a'}}>✅ Tous connectés</span>
                    : '❌'
                  }
                </div>
              </div>
              <div className="service-stat-card">
                <div className="service-stat-icon">📁</div>
                <div className="service-stat-value stat-clickable"
                  onClick={() => setDetailModal({
                    title: '📁 Dossiers du service',
                    rows: [
                      { label: '🤝 Partagés', value: `${serviceStats.dossiers.partages}` },
                      { label: '🔒 Privés', value: `${serviceStats.dossiers.prives}` },
                    ]
                  })}
                >
                  {serviceStats.dossiers.total}
                </div>
                <div className="service-stat-label">Dossiers</div>
                <div className="service-stat-sub">🤝 {serviceStats.dossiers.partages} · 🔒 {serviceStats.dossiers.prives}</div>
              </div>
              <div className="service-stat-card">
                <div className="service-stat-icon">📄</div>
                <div className="service-stat-value stat-clickable"
                  onClick={() => setDetailModal({
                    title: '📄 Fichiers du service',
                    rows: [
                      { label: '📊 Total', value: `${serviceStats.fichiers.total} fichiers` },
                      { label: '💾 Taille', value: `${serviceStats.fichiers.size_mb} MB` },
                    ]
                  })}
                >
                  {serviceStats.fichiers.total}
                </div>
                <div className="service-stat-label">Fichiers</div>
                <div className="service-stat-sub">💾 {serviceStats.fichiers.size_mb} MB</div>
              </div>
            </div>
            <div className="service-stats-activity">
              <h3>🕐 Activité récente (7 jours)</h3>
              <div className="table-scroll-wrapper">
                <table>
                  <thead>
                    <tr><th>Utilisateur</th><th>Action</th><th>Objet</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {serviceStats.activite_recente.map((log, idx) => (
                      <tr key={idx}>
                        <td>{log.utilisateur}</td>
                        <td><span className={`action-badge action-${log.action.toLowerCase()}`}>{log.action}</span></td>
                        <td>{log.objet}</td>
                        <td>{log.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
            )}
            {/* Onglet Mes stats */}
            {statsTab === 'perso' && userStats && (
              <>
                <div className="service-stats-cards">
                  <div className="service-stat-card">
                    <div className="service-stat-icon">📁</div>
                    <div
                      className="service-stat-value stat-clickable"
                      onClick={() => setDetailModal({
                        title: '📁 Mes dossiers',
                        rows: userStats.dossiers.detail?.map(d => ({
                          label: d.niveau === 1 ? `　└ 📁 ${d.nom}` : `📁 ${d.nom}`,
                          value: `${d.nb_fichiers} fichier${d.nb_fichiers > 1 ? 's' : ''}`
                        }))
                      })}
                    >
                      {userStats.dossiers.total}
                    </div>
                    <div className="service-stat-label">Mes dossiers</div>
                  </div>
                  <div className="service-stat-card">
                    <div className="service-stat-icon">📄</div>
                    <div
                      className="service-stat-value stat-clickable"
                      onClick={() => setDetailModal({
                        title: '📄 Types de fichiers',
                        rows: userStats.fichiers.detail?.map(d => ({ label: `.${d.ext}`, value: `${d.count} fichier${d.count > 1 ? 's' : ''}` }))
                      })}
                    >
                      {userStats.fichiers.total}
                    </div>
                    <div className="service-stat-label">Fichiers uploadés</div>
                    <div className="service-stat-sub">💾 {userStats.fichiers.size_mb} MB</div>
                  </div>
                  <div className="service-stat-card">
                    <div className="service-stat-icon">🤝</div>
                    <div
                      className="service-stat-value stat-clickable"
                      onClick={() => setDetailModal({
                        title: '🤝 Partagés reçus',
                        rows: userStats.partages.recus_detail?.map(d => ({
                          label: d.parent_nom ? `　└ 📁 ${d.dossier} (${d.parent_nom})` : `📁 ${d.dossier}`,
                          value: d.proprietaire
                        }))
                      })}
                    >
                      {userStats.partages.recus}
                    </div>
                    <div className="service-stat-label">Partagés reçus</div>
                  </div>
                  <div className="service-stat-card">
                    <div className="service-stat-icon">📤</div>
                    <div
                      className="service-stat-value stat-clickable"
                      onClick={() => setDetailModal({
                        title: '📤 Partagés donnés',
                        rows: userStats.partages.donnes_detail?.map(d => ({
                          label: d.parent_nom ? `　└ 📁 ${d.dossier} (${d.parent_nom})` : `📁 ${d.dossier}`,
                          value: d.destinataire
                        }))
                      })}
                    >
                      {userStats.partages.donnes}
                    </div>
                    <div className="service-stat-label">Partagés donnés</div>
                  </div>
                  {(userStats.partages.recus > 0 || userStats.partages.donnes > 0) && (
                    <div className="service-stat-card" style={{minWidth:'200px'}}>
                      <div className="service-stat-icon">📊</div>
                      <div className="service-stat-label" style={{marginBottom:'8px'}}>Mes partages</div>
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart margin={{top:8, bottom:8}}>
                          <Pie
                            data={[
                              { name: 'Reçus', value: userStats.partages.recus },
                              { name: 'Donnés', value: userStats.partages.donnes },
                            ]}
                            cx="50%" cy="50%"
                            innerRadius={30} outerRadius={50}
                            dataKey="value"
                          >
                            <Cell fill="#6c63ff" />
                            <Cell fill="#0e9e87" />
                          </Pie>
                          <Tooltip formatter={(v, n) => [v, n]} />
                          <Legend iconSize={8} style={{fontSize:'0.72rem'}} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                {userStats.top_dossiers?.length > 0 && (
                  <div className="service-stats-activity" style={{marginBottom:'16px'}}>
                    <h3>Top dossiers par taille</h3>
                    <div className="table-scroll-wrapper">
                      <table>
                        <thead>
                          <tr><th>Dossier</th><th>Fichiers</th><th>Taille</th></tr>
                        </thead>
                        <tbody>
                          {userStats.top_dossiers.map((d, idx) => (
                            <tr key={idx}>
                              <td>
                                {d.parent ? `　└ 📁 ${d.nom}` : `📁 ${d.nom}`}
                                {d.parent && <span style={{fontSize:'0.72rem', color:'#9ca3af', marginLeft:'4px'}}>({d.parent})</span>}
                              </td>
                              <td>{d.nb_fichiers}</td>
                              <td>{d.size_mb} MB</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="service-stats-activity">
                  <h3>🕐 Mon activité récente (30 jours)</h3>
                  <div className="table-scroll-wrapper">
                    <table>
                      <thead>
                        <tr><th>Action</th><th>Objet</th><th>Date</th></tr>
                      </thead>
                      <tbody>
                        {userStats.activite_recente.map((log, idx) => (
                          <tr key={idx}>
                            <td><span className={`action-badge action-${log.action.toLowerCase()}`}>{log.action}</span></td>
                            <td>{log.objet}</td>
                            <td>{log.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {detailModal && (
        <div className="detail-modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="detail-modal-box" onClick={e => e.stopPropagation()}>
            <div className="detail-modal-header">
              <span>{detailModal.title}</span>
              <button onClick={() => setDetailModal(null)}>✕</button>
            </div>
            <div className="detail-modal-list">
              {detailModal.rows?.map((row, i) => (
                <div key={i} className="detail-modal-row">
                  <span className="detail-modal-label">{row.label}</span>
                  <span className="detail-modal-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {shareModalOpen && (
        <ShareModal
          folder={currentFolder}
          onClose={() => setShareModalOpen(false)}
          currentUser={userInfo}
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
              setPasswordError("Le nouveau mot de passe doit être différent de l'ancien.");
              return;
            }
            if (newPassword !== confirmPassword) {
              setPasswordError("La confirmation du mot de passe ne correspond pas.");
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
                  {newPassword === confirmPassword ? "Les mots de passe correspondent" : "Les mots de passe ne correspondent pas"}
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

      {showLogoutWarning && (
        <div className="auto-logout-warning">
          ⚠️ Votre session expire dans 2 minutes. Cliquez n'importe où pour rester connecté.
          <button onClick={() => setShowLogoutWarning(false)}>✖</button>
        </div>
      )}

    </div>
  );
}

export default DashboardResponsable;