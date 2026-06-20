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

import { getHistorique, deleteHistorique } from "../services/fileService"; // ✅ Uniformisation
import AdminFileManager from "../services/AdminFileManager"; // ✅ Composant admin moderne

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
  const [activeSection, setActiveSection] = useState("users");
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
    } catch (e) {
      setError("Erreur récupération données");
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
  const fetchHistorique = async () => {
    try {
      const response = await getHistorique();
      setHistorique(response);
    } catch (e) {
      setError("Erreur récupération historique");
    }
  };

  const handleDeleteHistorique = async (id) => {
    try {
      await deleteHistorique(id);
      setHistorique(historique.filter((h) => h.id !== id));
    } catch (e) {
      setError("Erreur suppression historique");
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
    if (formData.password !== formData.confirmPassword) {
      setFormError("Mots de passe différents");
      return;
    }
    try {
      await createUser(formData);
      fetchData();
      setFormData({
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "employe",
        service: "",
      });
    } catch (e) {
      setFormError("Erreur création utilisateur");
    }
  };

  if (loading) return <p>Chargement...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div className="admin-panel-container">
      <aside className="admin-sidebar">
        <div className="logo">
          <img src={logo} alt="Logo" className="app-logo" />
        </div>
        <button onClick={() => setActiveSection("users")}>Gestion utilisateurs</button>
        <button onClick={() => setActiveSection("files")}>Gestion fichiers</button>
        <button onClick={() => { setActiveSection("submissions"); fetchHistorique(); }}>Historique</button>
        <button onClick={() => setActiveSection("createService")}>Créer un service</button>
        <button onClick={() => setActiveSection("register")}>Créer utilisateur</button>
        <button onClick={() => setActiveSection("account")}>Compte utilisateur</button>
        <button onClick={handleLogout} className="logout-button">Déconnexion</button>
      </aside>

      <main className="admin-content">
        <h1>Panneau Administrateur</h1>
        <p>Bienvenue, {userInfo?.username}</p>

        {activeSection === "users" && (
          <>
            <div className="section-header">
              <h2>Gestion des utilisateurs</h2>
              <span className="user-count-badge">
                {users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase())).length} / {users.length} utilisateur{users.length !== 1 ? 's' : ''}
              </span>
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
                            <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)}>
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
                          <td data-label="Actions">
                            <button className="edit-user-button" onClick={() => handleEditStart(u)}>Éditer</button>
                            <button
                              className="reset-password-button"
                              onClick={() => handleResetPassword(u.id, u.username)}
                              disabled={resettingId === u.id}
                            >
                              {resettingId === u.id ? '⏳' : 'Reset Mdp'}
                            </button>
                            <button className="delete-user-button" onClick={() => setConfirmDeleteId(u.id)}>Supprimer</button>
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
            <h2>Historique des actions</h2>
            <table>
              <thead>
                <tr><th>Fichier</th><th>Action</th><th>Date</th><th>Supprimer</th></tr>
              </thead>
              <tbody>
                {historique.map((h) => (
                  <tr key={h.id}>
                    <td>{h.fichier}</td>
                    <td>{h.action}</td>
                    <td>{h.date}</td>
                    <td><button onClick={() => handleDeleteHistorique(h.id)}>❌</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <div className="admin-register-container">
            {formError && <div className="error-box"><p>{formError}</p></div>}
            <form onSubmit={handleFormSubmit}>
              <input name="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="Nom utilisateur" />
              <input name="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email" />
              <input type="password" name="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Mot de passe" />
              <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} placeholder="Confirmer mot de passe" />
              <select name="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                <option value="employe">Employé</option>
                <option value="responsable">Responsable</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit">Créer</button>
            </form>
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
    </div>
  );
}

export default AdminPanel;
