// src/pages/AdminPanel.js

import React, { useEffect, useState } from "react";
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

import { getUser } from "../services/authService";
import { updatePassword } from "../services/passwordService";
import { validatePassword } from "../services/validators";

import { getHistorique, deleteHistorique } from "../services/fileService"; // ✅ Uniformisation
import AdminFileManager from "../services/AdminFileManager"; // ✅ Composant admin moderne

import logo from "../assets/dmt.png";
import "../styles/AdminPanel.css";

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
  const [showPassword, setShowPassword] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserData, setEditUserData] = useState({
    username: "",
    email: "",
    service: "",
  });

  useEffect(() => {
    fetchData();
    fetchServices();
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
    localStorage.removeItem("token");
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
    if (!window.confirm("Supprimer cet utilisateur ?")) return;
    try {
      await deleteUserAccount(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      alert(e.message);
    }
  };

  const handleResetPassword = async (id) => {
    try {
      await resetUserPassword(id);
      alert("Mot de passe réinitialisé.");
    } catch (e) {
      alert(e.message);
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
        <button onClick={() => setActiveSection("submissions")}>Historique</button>
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
            <h2>Utilisateurs</h2>
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Rôle</th>
                  <th>Service</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>
                      <select value={u.role} onChange={(e) => handleUpdateRole(u.id, e.target.value)}>
                        <option value="employe">Employé</option>
                        <option value="responsable">Responsable</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>{u.service}</td>
                    <td>
                      <button onClick={() => handleResetPassword(u.id)}>Reset Mdp</button>
                      <button onClick={() => handleDeleteUser(u.id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <form onSubmit={handleCreateService}>
            <input value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="Nom du service" />
            <button type="submit">Créer</button>
          </form>
        )}

        {activeSection === "register" && (
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
        )}

        {activeSection === "account" && (
          <div>
            <h2>Mon Compte</h2>
            <p>Email : {userInfo?.email}</p>
            <button onClick={() => setShowPasswordForm(!showPasswordForm)}>Changer mot de passe</button>
            {showPasswordForm && (
              <div>
                <input type={passwordVisible ? "text" : "password"} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Ancien mot de passe" />
                <input type={passwordVisible ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nouveau mot de passe" />
                <input type={passwordVisible ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmer" />
                <button onClick={handlePasswordChange}>Valider</button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminPanel;
