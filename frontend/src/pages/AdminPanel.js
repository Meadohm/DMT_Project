// src/pages/AdminPanel.js

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  getUsers,
  updateUserRole,
  createUser,
  resetUserPassword,
  deleteUserAccount,
  updateUserAccount,
  createService,
  getServices,
  deleteService,
  updateService,
  toggleUserActive,
} from "../services/adminService";

import { getUser, getToken } from "../services/authService";
import { updatePassword } from "../services/passwordService";
import { validatePassword } from "../services/validators";

import { getHistorique, deleteHistorique } from "../services/fileService";
import AdminFileManager from "../services/AdminFileManager";

import API_BASE_URL from "../config";
import logo from "../assets/dmt.png";
import "../styles/AdminPanel.css";

const getRelativeTime = (dateStr, isActive = true) => {
  if (!isActive) return { label: 'Inactif', type: 'inactive' };
  if (!dateStr) return { label: 'Jamais connecté', type: 'inactive' };
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 10)  return { label: 'En ligne',          type: 'online' };
  if (mins < 60)  return { label: `Il y a ${mins} min`, type: 'recent' };
  if (hours < 24) return { label: `Il y a ${hours}h`,   type: 'today' };
  if (days === 1) return { label: 'Hier',               type: 'yesterday' };
  if (days < 30)  return { label: `Il y a ${days} j`,   type: 'old' };
  return { label: `Il y a ${Math.floor(days / 30)} mois`, type: 'old' };
};

function AdminPanel() {
  const [services, setServices] = useState([]);
  const [newService, setNewService] = useState("");
  const [users, setUsers] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState(
    localStorage.getItem('adminActiveSection') || "dashboard"
  );
  const [historique, setHistorique] = useState([]);

  // Formulaire utilisateur
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "employe",
    service: "",
  });

  const [formError, setFormError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordModal, setResetPasswordModal] = useState(null);
  const [editUserData, setEditUserData] = useState({
    username: "",
    email: "",
    service: "",
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [formSuccess, setFormSuccess] = useState("");
  const [formPasswordVisible, setFormPasswordVisible] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historiqueSearch, setHistoriqueSearch] = useState('');
  const [historiqueAction, setHistoriqueAction] = useState('');
  const [historiquePage, setHistoriquePage] = useState(1);
  const [historiqueTotal, setHistoriqueTotal] = useState(0);
  const [historiquePageInput, setHistoriquePageInput] = useState('');
  const [confirmDeleteHistoriqueId, setConfirmDeleteHistoriqueId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [auditDeletions, setAuditDeletions] = useState([]);
  const [deletionsLoading, setDeletionsLoading] = useState(false);
  const [journalTab, setJournalTab] = useState("journal");
  const [tooltip, setTooltip] = useState(null);
  const [showCreateServiceModal, setShowCreateServiceModal] = useState(false);
  const [confirmDeleteServiceId, setConfirmDeleteServiceId] = useState(null);
  const [serviceForm, setServiceForm] = useState({ nom: '', description: '', statut: 'actif', responsable_id: '' });
  const [serviceFormError, setServiceFormError] = useState('');
  const [editServiceModal, setEditServiceModal] = useState(null);
  const [editServiceForm, setEditServiceForm] = useState({ nom: '', description: '', statut: 'actif', responsable_id: '' });
  const [editServiceError, setEditServiceError] = useState('');
  const [dashboardStats, setDashboardStats] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  useEffect(() => {
    fetchData();
    fetchServices();
    fetchDashboardStats();
    const refreshInterval = setInterval(() => {
      fetchData();
      fetchServices();
      fetchDashboardStats();
    }, 5000);
    const section = localStorage.getItem('adminActiveSection');
    if (section === 'submissions') {
      const savedPage = parseInt(localStorage.getItem('historiquePage') || '1');
      setTimeout(() => fetchHistorique(savedPage, '', '', '', ''), 300);
      setHistoriquePage(savedPage);
    }
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const heartbeat = () => {
      axios.post(`${API_BASE_URL}/last-seen/`, {}, {
        headers: { Authorization: `Token ${token}` }
      }).catch(() => {});
    };
    heartbeat();
    const interval = setInterval(heartbeat, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('adminActiveSection', activeSection);
  }, [activeSection]);

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_BASE_URL}/dashboard-stats/`, {
        headers: { Authorization: `Token ${token}` }
      });
      setDashboardStats(res.data);
    } catch (e) {
      console.error('Erreur dashboard stats', e);
    }
  };

  const fetchServices = async () => {
    try {
      const servicesData = await getServices();
      setServices(servicesData);
    } catch (error) {
      console.error("Erreur récupération services", error);
    }
  };

  const fetchData = async () => {
    try {
      const usersData = await getUsers();
      setUsers(usersData);
      fetchUserInfo();
      setLoading(false);
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        localStorage.clear();
        window.location.href = '/';
      } else {
        setError("Erreur récupération données");
      }
      setLoading(false);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const data = await getUser();
      setUserInfo(data);
    } catch (e) {
      setError("Erreur récupération infos utilisateur");
    }
  };

  // Historique
  const fetchHistorique = async (page = 1, action = '', search = '', debut = '', fin = '') => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page,
        ...(action && { action }),
        ...(search && { search }),
        ...(debut && { date_debut: debut }),
        ...(fin && { date_fin: fin }),
      });
      const res = await axios.get(`${API_BASE_URL}/historique/?${params}`, {
        headers: { Authorization: `Token ${token}` }
      });
      setHistorique(res.data.results);
      setHistoriqueTotal(res.data.total);
      localStorage.setItem('historiquePage', page);
    } catch (e) {
      console.error('Erreur historique', e);
    }
  };

  const fetchAuditDeletions = async () => {
    setDeletionsLoading(true);
    try {
      const token = getToken();
      const res = await axios.get(`${API_BASE_URL}/historique/deletions/`, {
        headers: { Authorization: `Token ${token}` },
      });
      setAuditDeletions(res.data);
    } catch (e) {
      console.error('Erreur suppressions journal', e);
    } finally {
      setDeletionsLoading(false);
    }
  };

  const handleDeleteHistorique = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/historique/${id}/`, {
        headers: { Authorization: `Token ${token}` }
      });
      showToast('Entrée supprimée du journal.');
      fetchHistorique(historiquePage, historiqueAction, historiqueSearch);
    } catch (e) {
      alert('Erreur lors de la suppression.');
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      await toggleUserActive(userId);
      const action = currentStatus ? 'désactivé' : 'activé';
      showToast(`Compte ${action}.`);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Erreur lors de la modification.', 'error');
    }
  };

  const handleExportCSV = () => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    if (historiqueAction) params.append('action', historiqueAction);
    if (historiqueSearch) params.append('search', historiqueSearch);
    if (dateDebut) params.append('date_debut', dateDebut);
    if (dateFin) params.append('date_fin', dateFin);
    const url = `${API_BASE_URL}/historique/export-csv/?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Token ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `journal_activite_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Export CSV téléchargé.');
      })
      .catch(() => showToast('Erreur lors de l\'export.', 'error'));
  };

  const handleClearAllHistorique = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/historique/clear/`, {
        headers: { Authorization: `Token ${token}` }
      });
      showToast('Journal d\'activité effacé.');
      fetchHistorique(1, '', '');
      setHistoriqueSearch('');
      setHistoriqueAction('');
      setConfirmClearAll(false);
    } catch (e) {
      alert('Erreur lors de la suppression.');
      setConfirmClearAll(false);
    }
  };

  // Gestion mot de passe
  const handlePasswordChange = async () => {
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      setPasswordError(errors);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(["Les mots de passe ne correspondent pas."]);
      return;
    }
    try {
      await updatePassword(oldPassword, newPassword);
      showToast('Mot de passe changé avec succès.');
      handleLogout();
    } catch (error) {
      setPasswordError([error.message]);
    }
  };

  const handlePasswordVisibilityToggle = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.replace("/");
  };

  // Gestion utilisateurs
  const handleUpdateRole = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (e) {
      setError("Erreur mise à jour rôle");
    }
  };

  const handleDeleteUser = async (id) => {
    const token = getToken();
    try {
      await deleteUserAccount(id, token);
      setUsers(users.filter(u => u.id !== id));
      setConfirmDeleteId(null);
      showToast('Utilisateur supprimé.');
    } catch {
      alert("Erreur lors de la suppression.");
      setConfirmDeleteId(null);
    }
  };

  const handleResetPassword = async (id, username) => {
    setResettingId(id);
    try {
      const result = await resetUserPassword(id);
      setResetPasswordModal({
        username,
        newPassword: result.new_password,
        emailEnvoye: result.email_envoye,
      });
      showToast(`Mot de passe de "${username}" réinitialisé.`);
    } catch {
      alert("Erreur lors de la réinitialisation.");
    } finally {
      setResettingId(null);
    }
  };

  const handleEditStart = (u) => {
    setEditingUser(u.id);
    setEditUserData({ username: u.username, email: u.email || "", service: u.service || "" });
  };

  const handleEditSubmit = async (userId) => {
    try {
      await updateUserAccount(userId, editUserData);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...editUserData } : u)));
      setEditingUser(null);
      showToast('Utilisateur mis à jour.');
    } catch (e) {
      const msg = e.response?.data?.error || 'Erreur mise à jour utilisateur';
      showToast(msg, 'error');
    }
  };

  // Gestion services
  const handleUpdateService = async (e) => {
    e.preventDefault();
    setEditServiceError('');
    if (!editServiceForm.nom.trim()) {
      setEditServiceError('Le nom est obligatoire.');
      return;
    }
    try {
      await updateService(editServiceModal.id, editServiceForm);
      showToast(`Service "${editServiceForm.nom}" mis à jour.`);
      setEditServiceModal(null);
      fetchServices();
    } catch (err) {
      setEditServiceError(err.response?.data?.error || 'Erreur lors de la mise à jour.');
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    setServiceFormError('');
    if (!serviceForm.nom.trim()) {
      setServiceFormError('Le nom est obligatoire.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/services/create/`, serviceForm, {
        headers: { Authorization: `Token ${token}` }
      });
      showToast(`Service "${serviceForm.nom}" créé.`);
      setServiceForm({ nom: '', description: '', statut: 'actif', responsable_id: '' });
      setShowCreateServiceModal(false);
      fetchServices();
    } catch (err) {
      setServiceFormError(err.response?.data?.error || 'Erreur lors de la création.');
    }
  };

  const handleDeleteService = async (id) => {
    try {
      await deleteService(id);
      showToast('Service supprimé.');
      setConfirmDeleteServiceId(null);
      fetchServices();
    } catch {
      showToast('Erreur lors de la suppression.', 'error');
      setConfirmDeleteServiceId(null);
    }
  };

  // Gestion création utilisateur
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (formData.password !== formData.confirmPassword) {
      setFormError('Les mots de passe ne correspondent pas.');
      return false;
    }
    if (formData.password.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères.');
      return false;
    }
    try {
      await createUser(formData);
      setFormSuccess(`✅ Utilisateur "${formData.username}" créé avec succès.`);
      showToast(`Utilisateur "${formData.username}" créé avec succès.`);
      setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' });
      fetchData();
      return true;
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erreur lors de la création.');
      return false;
    }
  };

  const handleTooltipShow = (e, text) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: rect.left, y: rect.top });
  };

  const handleTooltipHide = () => setTooltip(null);

  if (loading) return <p>Chargement...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className="admin-panel-container">
      <aside className={`admin-sidebar${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Déplier' : 'Replier'}>
          {sidebarCollapsed ? '→' : '←'}
        </button>
        <button className={activeSection === "dashboard" ? "active" : ""} onClick={() => setActiveSection("dashboard")}>📊 Tableau de bord</button>
        <button className={activeSection === "users" ? "active" : ""} onClick={() => setActiveSection("users")}>Gestion utilisateurs</button>
        <button className={activeSection === "files" ? "active" : ""} onClick={() => setActiveSection("files")}>Gestion fichiers</button>
        <button className={activeSection === "submissions" ? "active" : ""} onClick={() => { setActiveSection("submissions"); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>Journal d'activité</button>
        <button className={activeSection === "createService" ? "active" : ""} onClick={() => setActiveSection("createService")}>Créer un service</button>
        <button className={activeSection === "account" ? "active" : ""} onClick={() => setActiveSection("account")}>Mon Profil</button>
        <div className="sidebar-bottom">
          <div className="sidebar-logo">
            <img src={logo} alt="Logo" className="app-logo" />
          </div>
        </div>
      </aside>

      <main className="admin-content">
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <span className="admin-topbar-title">Panneau Administrateur</span>
            <span className="admin-topbar-subtitle">DMT - Doumbia Moussa Transport</span>
            <div className="admin-topbar-stats">
              <span className="topbar-stat">👥 {users.length} utilisateur{users.length !== 1 ? 's' : ''}</span>
              <span className="topbar-stat">🏢 {services.length} service{services.length !== 1 ? 's' : ''}</span>
              <span className="topbar-stat">🟢 {users.filter(u => { const diff = u.last_seen ? Date.now() - new Date(u.last_seen).getTime() : Infinity; return diff < 600000; }).length} en ligne</span>
            </div>
          </div>
          <div className="admin-topbar-right">
            <div className="admin-topbar-clock">
              <span className="admin-topbar-date">{formatDate(currentTime)}</span>
              <span className="admin-topbar-time">{formatTime(currentTime)}</span>
            </div>
            <button onClick={handleLogout} className="topbar-logout-button">
              ⏻ Déconnexion
            </button>
          </div>
        </div>
        <div className="welcome-banner">
          <span className="welcome-avatar">{userInfo?.username?.charAt(0).toUpperCase()}</span>
          <div className="welcome-text">
            <span className="welcome-label">Bienvenue,</span>
            <span className="welcome-name">{userInfo?.username}</span>
          </div>
        </div>

        {activeSection === "dashboard" && (
          <>
            <div className="section-header">
              <h2>Tableau de bord</h2>
              <span className="user-count-badge">Vue d'ensemble</span>
            </div>
            <div className="dashboard-grid">
              <div className="dashboard-card dashboard-card-users" onClick={() => setActiveSection("users")}>
                <div className="dashboard-card-icon">👥</div>
                <div className="dashboard-card-content">
                  <h3>Utilisateurs</h3>
                  <div className="dashboard-card-main">{dashboardStats?.users?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">🟢 {dashboardStats?.users?.online ?? 0} en ligne</span>
                    <span className="dash-detail inactive">🔴 {dashboardStats?.users?.inactive ?? 0} désactivés</span>
                    <span className="dash-detail inactive">⚫ {dashboardStats?.users?.never_connected ?? 0} jamais connectés</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-services" onClick={() => setActiveSection("createService")}>
                <div className="dashboard-card-icon">🏢</div>
                <div className="dashboard-card-content">
                  <h3>Services</h3>
                  <div className="dashboard-card-main">{dashboardStats?.services?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">✅ {dashboardStats?.services?.active ?? 0} actifs</span>
                    <span className="dash-detail inactive">⏸ {dashboardStats?.services?.inactive ?? 0} inactifs</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-files" onClick={() => setActiveSection("files")}>
                <div className="dashboard-card-icon">📁</div>
                <div className="dashboard-card-content">
                  <h3>Fichiers</h3>
                  <div className="dashboard-card-main">{dashboardStats?.files?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail">💾 {dashboardStats?.files?.size_mb ?? 0} MB utilisés</span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>

              <div className="dashboard-card dashboard-card-journal" onClick={() => { setActiveSection("submissions"); fetchHistorique(1, '', '', '', ''); }}>
                <div className="dashboard-card-icon">📋</div>
                <div className="dashboard-card-content">
                  <h3>Journal d'activité</h3>
                  <div className="dashboard-card-main">{dashboardStats?.journal?.total ?? '—'}</div>
                  <div className="dashboard-card-details">
                    <span className="dash-detail online">📅 {dashboardStats?.journal?.today ?? 0} aujourd'hui</span>
                    <span className="dash-detail" style={{fontSize:'0.75em', marginTop:'4px'}}>
                      Dernière : {dashboardStats?.journal?.last_user ?? '—'} - {dashboardStats?.journal?.last_date ?? '-'}
                    </span>
                  </div>
                </div>
                <div className="dashboard-card-arrow">→</div>
              </div>
            </div>
          </>
        )}

        {activeSection === "users" && (
          <>
            <div className="section-header">
              <h2>Gestion des utilisateurs</h2>
              <span className="user-count-badge">
                {users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase())).length} / {users.length} utilisateur{users.length !== 1 ? 's' : ''}
              </span>
              <button className="btn-create-user" onClick={() => { setShowCreateModal(true); setFormError(''); setFormSuccess(''); setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' }); }}>
                + Créer un utilisateur
              </button>
            </div>
            <div className="admin-search-bar">
              <input
                placeholder="Rechercher par nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Service</th>
                    <th>Email</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()))
                    .sort((a, b) => {
                      if (a.id === userInfo?.id) return -1;
                      if (b.id === userInfo?.id) return 1;
                      return 0;
                    })
                    .map((u, index) => {
                      const { label: statusLabel, type: statusType } = getRelativeTime(u.last_seen, u.is_active);
                      return editingUser === u.id ? (
                        <tr key={u.id} className="editing-row">
                          <td data-label="#">{index + 1}</td>
                          <td data-label="Nom"><input value={editUserData.username} onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })} /></td>
                          <td data-label="Rôle">
                            <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)} disabled={u.id === userInfo?.id}>
                              <option value="employe">Employé</option>
                              <option value="responsable">Responsable</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td data-label="Service">
                            <select value={editUserData.service} onChange={(e) => setEditUserData({ ...editUserData, service: e.target.value })}>
                              <option value="">— Aucun service —</option>
                              {services.map(s => (
                                <option key={s.id} value={s.nom}>{s.nom}</option>
                              ))}
                            </select>
                          </td>
                          <td data-label="Email"><input value={editUserData.email} onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })} /></td>
                          <td data-label="Statut"><span className={`status-badge ${statusType}`}>{statusLabel}</span></td>
                          <td data-label="Actions">
                            <button className="btn-save" onClick={() => handleEditSubmit(u.id)}>Sauvegarder</button>
                            <button className="btn-cancel" onClick={() => setEditingUser(null)}>Annuler</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={u.id} className={!u.is_active ? 'user-inactive' : ''}>
                          <td data-label="#">{index + 1}</td>
                          <td data-label="Nom">{u.username}</td>
                          <td data-label="Rôle">
                            <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)}>
                              <option value="employe">Employé</option>
                              <option value="responsable">Responsable</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td data-label="Service">{u.service || '—'}</td>
                          <td data-label="Email">{u.email || '—'}</td>
                          <td data-label="Statut"><span className={`status-badge ${statusType}`}>{statusLabel}</span></td>
                          <td data-label="Actions" className={u.id === userInfo?.id ? 'actions-cell-solo' : ''}>
                            <button className="edit-user-button" onClick={() => handleEditStart(u)} disabled={!u.is_active} style={{opacity: !u.is_active ? 0.4 : 1, cursor: !u.is_active ? 'not-allowed' : 'pointer'}}>Éditer</button>
                            {u.id !== userInfo?.id && (
                              <>
                                <button
                                  className="reset-password-button"
                                  onClick={() => handleResetPassword(u.id, u.username)}
                                  disabled={resettingId === u.id || !u.is_active}
                                  style={{opacity: !u.is_active ? 0.4 : 1, cursor: !u.is_active ? 'not-allowed' : 'pointer'}}
                                >
                                  {resettingId === u.id ? '⏳ Réinitialisation...' : 'Réinitialiser Mdp'}
                                </button>
                                <button
                                  style={{
                                    padding:'4px 8px',
                                    fontSize:'0.78em',
                                    borderRadius:'5px',
                                    border:'none',
                                    cursor:'pointer',
                                    background: u.is_active ? '#fd7e14' : '#28a745',
                                    color:'white',
                                    marginLeft:'4px'
                                  }}
                                  onClick={() => handleToggleActive(u.id, u.is_active)}
                                  disabled={u.id === userInfo?.id}
                                  title={u.is_active ? 'Désactiver ce compte' : 'Réactiver ce compte'}
                                >
                                  {u.is_active ? '⏸ Désactiver' : '▶ Réactiver'}
                                </button>
                                <button className="delete-user-button" onClick={() => setConfirmDeleteId(u.id)}>Supprimer</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeSection === "files" && <AdminFileManager />}

        {activeSection === "submissions" && (
          <>
            <div className="section-header">
              <h2>Journal d'activité</h2>
              <span className="user-count-badge">{historiqueTotal} entrée{historiqueTotal !== 1 ? 's' : ''}</span>
            </div>

            {/* Onglets journal */}
            <div className="journal-tabs">
              <button
                className={`journal-tab${journalTab === "journal" ? " active" : ""}`}
                onClick={() => setJournalTab("journal")}
              >
                📋 Journal ({historiqueTotal})
              </button>
              <button
                className={`journal-tab${journalTab === "suppressions" ? " active" : ""}`}
                onClick={() => { setJournalTab("suppressions"); fetchAuditDeletions(); }}
              >
                🔍 Suppressions {auditDeletions.length > 0 && <span className="tab-badge-red">{auditDeletions.length}</span>}
              </button>
            </div>

            {journalTab === "journal" && (
              <>
            <div className="historique-filters">
              <input
                className="historique-search"
                placeholder="Rechercher par utilisateur..."
                value={historiqueSearch}
                onChange={(e) => { setHistoriqueSearch(e.target.value); fetchHistorique(1, historiqueAction, e.target.value); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
              />
              <select
                className="historique-select"
                value={historiqueAction}
                onChange={(e) => { setHistoriqueAction(e.target.value); fetchHistorique(1, e.target.value, historiqueSearch); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
              >
                <option value="">Toutes les actions</option>
                <option value="LOGIN">Connexion</option>
                <option value="UPDATE">Modification</option>
                <option value="DELETE">Suppression</option>
                <option value="CREATE">Création</option>
                <option value="UPLOAD">Upload</option>
                <option value="SHARE">Partage</option>
              </select>
              <input
                type="date"
                className="historique-date"
                value={dateDebut}
                onChange={(e) => { setDateDebut(e.target.value); fetchHistorique(1, historiqueAction, historiqueSearch, e.target.value, dateFin); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
                title="Date début"
              />
              <input
                type="date"
                className="historique-date"
                value={dateFin}
                onChange={(e) => { setDateFin(e.target.value); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, e.target.value); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); }}
                title="Date fin"
              />
              <button className="btn-cancel" onClick={() => { setHistoriqueSearch(''); setHistoriqueAction(''); setDateDebut(''); setDateFin(''); setHistoriquePage(1); localStorage.setItem('historiquePage', 1); fetchHistorique(1, '', '', '', ''); showToast('Filtres réinitialisés.', 'success'); }}>
                Réinitialiser
              </button>
              <button className="btn-cancel" style={{background:'#28a745', color:'white', border:'none', fontSize:'0.85em'}} onClick={handleExportCSV}>
                ⬇️ CSV
              </button>
              <button className="btn-danger" onClick={() => setConfirmClearAll(true)}>
                🗑️ Tout effacer
              </button>
            </div>
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Utilisateur</th>
                    <th>Action</th>
                    <th>Objet</th>
                    <th>Date</th>
                    <th>Supprimer</th>
                  </tr>
                </thead>
                <tbody>
                  {historique.map((h, index) => (
                    <tr key={h.id}>
                      <td>{(historiquePage - 1) * 20 + index + 1}</td>
                      <td>{h.utilisateur}</td>
                      <td><span className={`action-badge action-${h.action.toLowerCase()}`}>{h.action_display}</span></td>
                      <td className="objet-cell">
                        <span
                          className="objet-text"
                          onMouseEnter={(e) => handleTooltipShow(e, h.objet)}
                          onMouseLeave={handleTooltipHide}
                        >
                          {h.objet}
                        </span>
                      </td>
                      <td>{h.date}</td>
                      <td>
                        {h.utilisateur !== userInfo?.username && (
                          <button className="delete-user-button" onClick={() => setConfirmDeleteHistoriqueId(h.id)}>Supprimer</button>
                        )}
                        {h.utilisateur === userInfo?.username && (
                          <span className="protected-log">🔒</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-controls">
              <button className="btn-cancel" disabled={historiquePage === 1}
                onClick={() => { setHistoriquePage(1); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                ⏮ Première
              </button>
              <button className="btn-cancel" disabled={historiquePage === 1}
                onClick={() => { const p = historiquePage - 1; setHistoriquePage(p); fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                ← Précédent
              </button>
              <span className="pagination-info">Page {historiquePage} / {Math.ceil(historiqueTotal / 20) || 1}</span>
              <button className="btn-cancel" disabled={historiquePage * 20 >= historiqueTotal}
                onClick={() => { const p = historiquePage + 1; setHistoriquePage(p); fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                Suivant →
              </button>
              <button className="btn-cancel" disabled={historiquePage >= Math.ceil(historiqueTotal / 20)}
                onClick={() => { const p = Math.ceil(historiqueTotal / 20); setHistoriquePage(p); fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>
                Dernière ⏭
              </button>
              <div className="pagination-goto">
                <input
                  type="number"
                  min="1"
                  max={Math.ceil(historiqueTotal / 20)}
                  placeholder="Page..."
                  value={historiquePageInput}
                  onChange={(e) => setHistoriquePageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = Math.min(Math.max(1, parseInt(historiquePageInput) || 1), Math.ceil(historiqueTotal / 20));
                      setHistoriquePage(p);
                      setHistoriquePageInput('');
                      fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin);
                    }
                  }}
                />
                <button className="btn-primary" onClick={() => {
                  const p = Math.min(Math.max(1, parseInt(historiquePageInput) || 1), Math.ceil(historiqueTotal / 20));
                  setHistoriquePage(p);
                  setHistoriquePageInput('');
                  fetchHistorique(p, historiqueAction, historiqueSearch, dateDebut, dateFin);
                }}>Aller</button>
              </div>
            </div>

            {confirmDeleteHistoriqueId && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>⚠️ Supprimer cette entrée ?</h3>
                  <p>Cette action est <strong>irréversible</strong>.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={() => { handleDeleteHistorique(confirmDeleteHistoriqueId); setConfirmDeleteHistoriqueId(null); }}>Supprimer</button>
                    <button className="btn-cancel" onClick={() => setConfirmDeleteHistoriqueId(null)}>Annuler</button>
                  </div>
                </div>
              </div>
            )}

            {confirmClearAll && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>⚠️ Effacer tout le journal ?</h3>
                  <p>Cette action supprime <strong>toutes les {historiqueTotal} entrées</strong> de façon irréversible.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={handleClearAllHistorique}>Tout effacer</button>
                    <button className="btn-cancel" onClick={() => setConfirmClearAll(false)}>Annuler</button>
                  </div>
                </div>
              </div>
            )}
              </>
            )}

            {journalTab === "suppressions" && (
              <div className="audit-deletions-section">
                {deletionsLoading ? (
                  <p>Chargement...</p>
                ) : auditDeletions.length === 0 ? (
                  <p className="no-data">✅ Aucune suppression enregistrée.</p>
                ) : (
                  <div className="users-table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Admin</th>
                          <th>Log supprimé</th>
                          <th>Utilisateur concerné</th>
                          <th>Action supprimée</th>
                          <th>Objet</th>
                          <th>Date suppression</th>
                          <th>IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditDeletions.map((d, idx) => (
                          <tr key={d.id}>
                            <td>{idx + 1}</td>
                            <td><span className="badge-admin">👑 {d.admin}</span></td>
                            <td><span className="badge-log-id">#{d.deleted_log_id}</span></td>
                            <td>{d.deleted_utilisateur || "—"}</td>
                            <td><span className={`action-badge action-${d.deleted_action?.toLowerCase()}`}>{d.deleted_action}</span></td>
                            <td>{d.deleted_objet}</td>
                            <td>{new Date(d.deleted_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                            <td><code>{d.adresse_ip || "—"}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeSection === "createService" && (
          <>
            <div className="section-header">
              <h2>Gestion des services</h2>
              <span className="user-count-badge">{services.length} service{services.length !== 1 ? 's' : ''}</span>
              <button className="btn-create-user" onClick={() => { setShowCreateServiceModal(true); setServiceFormError(''); }}>
                + Créer un service
              </button>
            </div>
            <div className="users-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nom du service</th>
                    <th>Description</th>
                    <th>Responsable</th>
                    <th>Employés</th>
                    <th>Statut</th>
                    <th>Créé le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, index) => (
                    <tr key={s.id}>
                      <td>{index + 1}</td>
                      <td><strong>{s.nom}</strong></td>
                      <td className="objet-cell">
                        <span className="objet-text"
                          onMouseEnter={(e) => handleTooltipShow(e, s.description || '—')}
                          onMouseLeave={handleTooltipHide}>
                          {s.description || '—'}
                        </span>
                      </td>
                      <td>{s.responsable}</td>
                      <td><span className="user-count-badge">{s.nb_employes}</span></td>
                      <td>
                        <span className={`status-badge ${s.statut === 'actif' ? 'online' : 'inactive'}`}>
                          {s.statut === 'actif' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>{s.date_creation}</td>
                      <td>
                        <button className="edit-user-button" style={{marginRight:'5px'}} onClick={() => {
                          setEditServiceModal(s);
                          setEditServiceForm({ nom: s.nom, description: s.description || '', statut: s.statut, responsable_id: s.responsable_id || '' });
                          setEditServiceError('');
                        }}>Éditer</button>
                        <button className="delete-user-button" onClick={() => setConfirmDeleteServiceId(s.id)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showCreateServiceModal && (
              <div className="modal-overlay">
                <div className="modal-box modal-box-large">
                  <h3>🏢 Créer un service</h3>
                  {serviceFormError && <div className="error-box"><p>{serviceFormError}</p></div>}
                  <form onSubmit={handleCreateService}>
                    <div className="form-group">
                      <label>Nom du service *</label>
                      <input value={serviceForm.nom} onChange={(e) => setServiceForm({...serviceForm, nom: e.target.value})} placeholder="ex: Service Informatique" />
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <textarea value={serviceForm.description} onChange={(e) => setServiceForm({...serviceForm, description: e.target.value})} placeholder="Rôle et mission du service..." rows={3} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #dde3ea', resize:'vertical'}} />
                    </div>
                    <div className="form-group">
                      <label>Responsable</label>
                      <select value={serviceForm.responsable_id} onChange={(e) => setServiceForm({...serviceForm, responsable_id: e.target.value})}>
                        <option value="">— Aucun responsable —</option>
                        {users.filter(u => u.role === 'responsable' || u.role === 'admin').map(u => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Statut</label>
                      <select value={serviceForm.statut} onChange={(e) => setServiceForm({...serviceForm, statut: e.target.value})}>
                        <option value="actif">Actif</option>
                        <option value="inactif">Inactif</option>
                      </select>
                    </div>
                    <div className="modal-actions">
                      <button type="submit" className="btn-primary">Créer le service</button>
                      <button type="button" className="btn-cancel" onClick={() => setShowCreateServiceModal(false)}>Annuler</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDeleteServiceId && (
              <div className="modal-overlay">
                <div className="modal-box">
                  <h3>⚠️ Supprimer ce service ?</h3>
                  <p>Les utilisateurs rattachés à ce service ne seront <strong>pas supprimés</strong> mais perdront leur service assigné.</p>
                  <div className="modal-actions">
                    <button className="btn-danger" onClick={() => handleDeleteService(confirmDeleteServiceId)}>Supprimer</button>
                    <button className="btn-cancel" onClick={() => setConfirmDeleteServiceId(null)}>Annuler</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeSection === "register" && (
          <div className="register-section">
            <div className="section-header">
              <h2>Créer un utilisateur</h2>
            </div>
            {formError && <div className="error-box"><p>{formError}</p></div>}
            {formSuccess && <div className="success-box"><p>{formSuccess}</p></div>}
            <div className="register-form-card">
              <form onSubmit={handleFormSubmit}>
                <div className="form-group">
                  <label>Nom d'utilisateur *</label>
                  <input
                    name="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="ex: namisata.diomande"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ex: namisata.diomande@dmt.ci"
                  />
                </div>
                <div className="form-group">
                  <label>Mot de passe *</label>
                  <div className="input-with-eye">
                    <input
                      type={formPasswordVisible ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Minimum 6 caractères"
                    />
                    <button type="button" className="eye-btn" onClick={() => setFormPasswordVisible(!formPasswordVisible)}>
                      {formPasswordVisible ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirmer le mot de passe *</label>
                  <div className="input-with-eye">
                    <input
                      type={formPasswordVisible ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Répéter le mot de passe"
                    />
                  </div>
                  {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="field-error">Les mots de passe ne correspondent pas</p>
                  )}
                  {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && (
                    <p className="field-success">✓ Les mots de passe correspondent</p>
                  )}
                </div>
                <div className="form-group">
                  <label>Rôle *</label>
                  <select name="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                    <option value="employe">Employé</option>
                    <option value="responsable">Responsable</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Service</label>
                  <select name="service" value={formData.service || ''} onChange={(e) => setFormData({ ...formData, service: e.target.value })}>
                    <option value="">— Aucun service —</option>
                    {services.map(s => (
                      <option key={s.id} value={s.nom}>{s.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="register-form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={formData.password !== formData.confirmPassword || !formData.username || !formData.password}
                  >
                    Créer l'utilisateur
                  </button>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' });
                      setFormError('');
                      setFormSuccess('');
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeSection === "account" && (
          <div className="account-section">
            <div className="section-header">
              <h2>Mon Compte</h2>
            </div>
            <div className="account-layout">
              <div className="account-profile-card">
                <div className="account-avatar-large">
                  {userInfo?.username?.charAt(0).toUpperCase()}
                </div>
                <div className="account-profile-info">
                  <h3 className="account-username">{userInfo?.username}</h3>
                  <p className="account-email">{userInfo?.email || 'Aucun email renseigné'}</p>
                  <div className="account-badges">
                    <span className={`status-badge ${userInfo?.role === 'admin' ? 'online' : 'recent'}`}>
                      {userInfo?.role === 'admin' ? '👑 Admin' : userInfo?.role === 'responsable' ? '🎯 Responsable' : '👤 Employé'}
                    </span>
                    {userInfo?.service && (
                      <span className="status-badge today">🏢 {userInfo.service}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="account-form-card">
                <h4 className="account-form-title">🔐 Changer le mot de passe</h4>
                <button
                  className={showPasswordForm ? 'btn-cancel' : 'btn-primary'}
                  style={{marginBottom:'16px', width:'100%'}}
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  {showPasswordForm ? 'Annuler' : 'Modifier mon mot de passe'}
                </button>
                {showPasswordForm && (
                  <div className="account-password-form">
                    <div className="form-group">
                      <label>Ancien mot de passe</label>
                      <div className="input-with-eye">
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          placeholder="Votre mot de passe actuel"
                        />
                        <button type="button" className="eye-btn" onClick={handlePasswordVisibilityToggle}>
                          {passwordVisible ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Nouveau mot de passe</label>
                      <div className="input-with-eye">
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 caractères"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Confirmer le nouveau mot de passe</label>
                      <div className="input-with-eye">
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Répéter le nouveau mot de passe"
                        />
                      </div>
                      {newPassword && confirmPassword && newPassword !== confirmPassword && (
                        <p className="field-error">Les mots de passe ne correspondent pas</p>
                      )}
                      {newPassword && confirmPassword && newPassword === confirmPassword && (
                        <p className="field-success">✓ Les mots de passe correspondent</p>
                      )}
                    </div>
                    {Array.isArray(passwordError) && passwordError.length > 0 && (
                      <div className="error-box">
                        <ul>{passwordError.map((e, i) => <li key={i}>{e}</li>)}</ul>
                      </div>
                    )}
                    <button
                      className="btn-primary"
                      style={{width:'100%'}}
                      onClick={handlePasswordChange}
                      disabled={!oldPassword || !newPassword || newPassword !== confirmPassword}
                    >
                      ✓ Valider le changement
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {resetPasswordModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>🔑 Mot de passe réinitialisé</h3>
            <p>Utilisateur : <strong>{resetPasswordModal.username}</strong></p>
            <p>Nouveau mot de passe :</p>
            <div className="password-display">{resetPasswordModal.newPassword}</div>
            {resetPasswordModal.emailEnvoye
              ? <p className="modal-note success-note">✅ Email envoyé à l'utilisateur.</p>
              : <p className="modal-note">⚠️ Email non envoyé — communiquez ce mot de passe manuellement.</p>
            }
            <button className="btn-primary" onClick={() => setResetPasswordModal(null)}>Fermer</button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>⚠️ Confirmer la suppression</h3>
            <p>Cette action est <strong>irréversible</strong>. Supprimer cet utilisateur ?</p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={() => handleDeleteUser(confirmDeleteId)}>Supprimer</button>
              <button className="btn-cancel" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-large">
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px"}}>
              <h3 style={{margin:0}}>➕ Créer un utilisateur</h3>
              <button
                type="button"
                style={{background:"none", border:"none", fontSize:"1.2rem", cursor:"pointer", color:"#666", padding:"4px 8px", borderRadius:"6px"}}
                onClick={() => { setShowCreateModal(false); setFormError(''); setFormSuccess(''); }}
                title="Fermer"
              >
                ✖
              </button>
            </div>
            {formError && <div className="error-box"><p>{formError}</p></div>}
            {formSuccess && <div className="success-box"><p>{formSuccess}</p></div>}
            <form onSubmit={async (e) => { const success = await handleFormSubmit(e); if (success) setShowCreateModal(false); }}>
              <div className="form-group">
                <label>Nom d'utilisateur *</label>
                <input name="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="ex: namisata.diomande" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input name="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="ex: namisata.diomande@dmt.ci" />
              </div>
              <div className="form-group">
                <label>Mot de passe *</label>
                <div className="input-with-eye">
                  <input type={formPasswordVisible ? "text" : "password"} name="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Minimum 6 caractères" />
                  <button type="button" className="eye-btn" onClick={() => setFormPasswordVisible(!formPasswordVisible)}>
                    {formPasswordVisible ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirmer le mot de passe *</label>
                <input type={formPasswordVisible ? "text" : "password"} name="confirmPassword" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} placeholder="Répéter le mot de passe" />
                {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="field-error">Les mots de passe ne correspondent pas</p>
                )}
                {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && (
                  <p className="field-success">✓ Les mots de passe correspondent</p>
                )}
              </div>
              <div className="form-group">
                <label>Rôle *</label>
                <select name="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="employe">Employé</option>
                  <option value="responsable">Responsable</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label>Service</label>
                <select name="service" value={formData.service || ''} onChange={(e) => setFormData({ ...formData, service: e.target.value })}>
                  <option value="">— Aucun service —</option>
                  {services.map(s => (
                    <option key={s.id} value={s.nom}>{s.nom}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary" disabled={formData.password !== formData.confirmPassword || !formData.username || !formData.password}>
                  Créer l'utilisateur
                </button>
                <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✅' : '❌'}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {editServiceModal && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-large">
            <h3>✏️ Modifier le service</h3>
            {editServiceError && <div className="error-box"><p>{editServiceError}</p></div>}
            <form onSubmit={handleUpdateService}>
              <div className="form-group">
                <label>Nom du service *</label>
                <input value={editServiceForm.nom} onChange={(e) => setEditServiceForm({...editServiceForm, nom: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={editServiceForm.description} onChange={(e) => setEditServiceForm({...editServiceForm, description: e.target.value})} rows={3} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #dde3ea', resize:'vertical'}} />
              </div>
              <div className="form-group">
                <label>Responsable</label>
                <select value={editServiceForm.responsable_id} onChange={(e) => setEditServiceForm({...editServiceForm, responsable_id: e.target.value})}>
                  <option value="">— Aucun responsable —</option>
                  {users.filter(u => u.role === 'responsable' || u.role === 'admin').map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select value={editServiceForm.statut} onChange={(e) => setEditServiceForm({...editServiceForm, statut: e.target.value})}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Sauvegarder</button>
                <button type="button" className="btn-cancel" onClick={() => setEditServiceModal(null)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y - 40,
          background: '#003366',
          color: 'white',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '0.82em',
          maxWidth: '320px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 99999,
          pointerEvents: 'none',
          lineHeight: '1.4',
          whiteSpace: 'normal',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
