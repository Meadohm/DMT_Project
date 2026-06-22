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
} from "../services/adminService";

import { getUser, getToken } from "../services/authService";
import { updatePassword } from "../services/passwordService";
import { validatePassword } from "../services/validators";

import { getHistorique, deleteHistorique } from "../services/fileService";
import AdminFileManager from "../services/AdminFileManager";

import API_BASE_URL from "../config";
import logo from "../assets/dmt.png";
import "../styles/AdminPanel.css";

const getRelativeTime = (dateStr) => {
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
    localStorage.getItem('adminActiveSection') || "users"
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
  const [confirmDeleteHistoriqueId, setConfirmDeleteHistoriqueId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

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
    const refreshInterval = setInterval(() => {
      fetchData();
    }, 5000);
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
      if (localStorage.getItem('adminActiveSection') === 'submissions') {
        fetchHistorique(1, '', '', '', '');
      }
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
      setHistoriquePage(res.data.page);
    } catch (e) {
      console.error('Erreur historique', e);
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
      showToast(`Utilisateur mis à jour.`);
    } catch (e) {
      setError("Erreur mise à jour utilisateur");
    }
  };

  // Gestion services
  const handleCreateService = async (e) => {
    e.preventDefault();
    if (!newService.trim()) return;
    try {
      await createService(newService.trim());
      fetchServices();
      setNewService("");
      setActiveSection("users");
    } catch (e) {
      console.error("Erreur création service", e);
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm("Supprimer ce service ?")) return;
    try {
      await deleteService(id);
      fetchServices();
    } catch (e) {
      console.error("Erreur suppression service", e);
    }
  };

  // Gestion création utilisateur
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (formData.password !== formData.confirmPassword) {
      setFormError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (formData.password.length < 6) {
      setFormError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    try {
      await createUser(formData);
      setFormSuccess(`✅ Utilisateur "${formData.username}" créé avec succès.`);
      showToast(`Utilisateur "${formData.username}" créé avec succès.`);
      setShowCreateModal(false);
      setFormData({ username: '', email: '', password: '', confirmPassword: '', role: 'employe', service: '' });
      fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erreur lors de la création.');
    }
  };

  if (loading) return <p>Chargement...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className="admin-panel-container">
      <aside className={`admin-sidebar${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Déplier' : 'Replier'}>
          {sidebarCollapsed ? '→' : '←'}
        </button>
        <button className={activeSection === "users" ? "active" : ""} onClick={() => setActiveSection("users")}>Gestion utilisateurs</button>
        <button className={activeSection === "files" ? "active" : ""} onClick={() => setActiveSection("files")}>Gestion fichiers</button>
        <button className={activeSection === "submissions" ? "active" : ""} onClick={() => { setActiveSection("submissions"); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, dateFin); }}>Journal d'activité</button>
        <button className={activeSection === "createService" ? "active" : ""} onClick={() => setActiveSection("createService")}>Créer un service</button>
        <button className={activeSection === "account" ? "active" : ""} onClick={() => setActiveSection("account")}>Compte utilisateur</button>
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
                      const { label: statusLabel, type: statusType } = getRelativeTime(u.last_seen);
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
                          <td data-label="Service"><input value={editUserData.service} onChange={(e) => setEditUserData({ ...editUserData, service: e.target.value })} /></td>
                          <td data-label="Email"><input value={editUserData.email} onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })} /></td>
                          <td data-label="Statut"><span className={`status-badge ${statusType}`}>{statusLabel}</span></td>
                          <td data-label="Actions">
                            <button className="btn-save" onClick={() => handleEditSubmit(u.id)}>Sauvegarder</button>
                            <button className="btn-cancel" onClick={() => setEditingUser(null)}>Annuler</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={u.id}>
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
                            <button className="edit-user-button" onClick={() => handleEditStart(u)}>Éditer</button>
                            {u.id !== userInfo?.id && (
                              <>
                                <button
                                  className="reset-password-button"
                                  onClick={() => handleResetPassword(u.id, u.username)}
                                  disabled={resettingId === u.id}
                                >
                                  {resettingId === u.id ? '⏳ Réinitialisation...' : 'Réinitialiser Mdp'}
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
            <div className="historique-filters">
              <input
                className="historique-search"
                placeholder="Rechercher par utilisateur..."
                value={historiqueSearch}
                onChange={(e) => { setHistoriqueSearch(e.target.value); fetchHistorique(1, historiqueAction, e.target.value); setHistoriquePage(1); }}
              />
              <select
                className="historique-select"
                value={historiqueAction}
                onChange={(e) => { setHistoriqueAction(e.target.value); fetchHistorique(1, e.target.value, historiqueSearch); setHistoriquePage(1); }}
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
                onChange={(e) => { setDateDebut(e.target.value); fetchHistorique(1, historiqueAction, historiqueSearch, e.target.value, dateFin); }}
                title="Date début"
              />
              <input
                type="date"
                className="historique-date"
                value={dateFin}
                onChange={(e) => { setDateFin(e.target.value); fetchHistorique(1, historiqueAction, historiqueSearch, dateDebut, e.target.value); }}
                title="Date fin"
              />
              <button className="btn-cancel" onClick={() => { setHistoriqueSearch(''); setHistoriqueAction(''); setDateDebut(''); setDateFin(''); fetchHistorique(1, '', '', '', ''); showToast('Filtres réinitialisés.', 'success'); }}>
                Réinitialiser
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
                        <span className="objet-text" data-tooltip={h.objet}>{h.objet}</span>
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
            <div className="pagination">
              <button className="btn-cancel" disabled={historiquePage === 1} onClick={() => { const p = historiquePage - 1; fetchHistorique(p, historiqueAction, historiqueSearch); }}>← Précédent</button>
              <span className="pagination-info">Page {historiquePage} / {Math.ceil(historiqueTotal / 20) || 1}</span>
              <button className="btn-cancel" disabled={historiquePage * 20 >= historiqueTotal} onClick={() => { const p = historiquePage + 1; fetchHistorique(p, historiqueAction, historiqueSearch); }}>Suivant →</button>
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

        {activeSection === "createService" && (
          <>
            <form onSubmit={handleCreateService}>
              <input value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="Nom du service" />
              <button type="submit">Créer</button>
            </form>
            <h2>Services existants</h2>
            <ul>
              {services.map((s) => (
                <li key={s.id}>
                  {s.nom}
                  <button onClick={() => handleDeleteService(s.id)}>Supprimer</button>
                </li>
              ))}
            </ul>
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
          <div className="account-info">
            <h2>Mon Compte</h2>
            <p>Email : {userInfo?.email}</p>
            <button className="change-password-button" onClick={() => setShowPasswordForm(!showPasswordForm)}>
              Changer mot de passe
            </button>
            {showPasswordForm && (
              <div className="password-form">
                <input type={passwordVisible ? "text" : "password"} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Ancien mot de passe" />
                <input type={passwordVisible ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nouveau mot de passe" />
                <input type={passwordVisible ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmer" />
                <button type="button" onClick={handlePasswordVisibilityToggle}>
                  {passwordVisible ? "Masquer" : "Afficher"}
                </button>
                {Array.isArray(passwordError) && passwordError.length > 0 && (
                  <div className="error-box">
                    <ul>{passwordError.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
                <button onClick={handlePasswordChange}>Valider</button>
              </div>
            )}
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
            <h3>➕ Créer un utilisateur</h3>
            {formError && <div className="error-box"><p>{formError}</p></div>}
            {formSuccess && <div className="success-box"><p>{formSuccess}</p></div>}
            <form onSubmit={async (e) => { await handleFormSubmit(e); if (!formError) setShowCreateModal(false); }}>
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
    </div>
  );
}

export default AdminPanel;
