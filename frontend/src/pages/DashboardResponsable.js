// DashboardResponsable.js
import React, { useEffect, useState } from "react";
import { getHistorique, deleteHistorique, getUserInfo } from "../services/fileService"; 
import { updatePassword } from "../services/passwordService";
import { useNavigate } from "react-router-dom";
import FileManager from "../components/FileManager";
import "../styles/DashboardResponsable.css";
import logo from "../assets/dmt.png";
import { validatePassword } from "../services/validators";
import defaultAvatar from "../assets/default_avatar.png";

function DashboardResponsable() {
  const [userInfo, setUserInfo] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [showHistorique, setShowHistorique] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showFileManager, setShowFileManager] = useState(true);

  const navigate = useNavigate();

  const resetViews = () => {
    setShowAccount(false);
    setShowHistorique(false);
    setShowFileManager(false);
  };

  const fetchHistorique = async () => {
    try {
      const response = await getHistorique();
      setHistorique(
        response.map((item) => ({
          id: item.id,
          fichier: item.fichier_nom || "Fichier inconnu",
          action: item.action === "valide" ? "Validé" : "Rejeté",
          date: new Date(item.date_action).toLocaleString(),
        }))
      );
    } catch (e) {
      console.error("Erreur récupération historique", e);
    }
  };

  useEffect(() => {
    if (showHistorique) fetchHistorique();
  }, [showHistorique]);

  const handleDeleteHistorique = async (mouvementId) => {
    try {
      await deleteHistorique(mouvementId);
      setHistorique(historique.filter((m) => m.id !== mouvementId));
    } catch (e) {
      console.error("Erreur suppression historique", e);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsAuthenticated(true);
      fetchUserInfo();
    } else {
      navigate("/");
    }
  }, [navigate]);

  const fetchUserInfo = async () => {
    try {
      const data = await getUserInfo();
      setUserInfo(data);
    } catch (e) {
      setAccountError(e.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    navigate("/");
  };

  const handlePasswordVisibilityToggle = () => {
    setPasswordVisible(!passwordVisible);
  };

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

  const handleResetForm = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="logoRespo">
          <img src={logo} alt="LogoRespo" className="app-logoRespo" />
          <h2>Espace Responsable - Gestion des Fichiers</h2>
        </div>
        {isAuthenticated && userInfo ? (
          <div className="user-info">
            <p>Bienvenue, {userInfo.username}</p>
            <img
              src={userInfo.avatar || defaultAvatar}
              alt="Avatar utilisateur"
              className="avatar"
            />
          </div>
        ) : (
          <p className="login-prompt">Connectez-vous pour accéder</p>
        )}
        <button onClick={handleLogout} className="logout-button">
          Déconnexion
        </button>
      </header>

      <aside className="sidebar">
        <button onClick={() => { resetViews(); setShowFileManager(true); }}>📁 Gestion des fichiers</button>
        <button onClick={() => { resetViews(); setShowAccount(true); }}>👤 Compte utilisateur</button>
        <button onClick={() => { resetViews(); setShowHistorique(true); }}>🕑 Historique</button>
      </aside>

      <div className="content-container">
        {showFileManager && <FileManager />}
        {showAccount && (
          <div className="account-info">
            <h2>Informations du compte</h2>
            {accountError ? (
              <p className="error-message">{accountError}</p>
            ) : userInfo ? (
              <div>
                <p><strong>Nom d'utilisateur :</strong> {userInfo.username}</p>
                <p><strong>Email :</strong> {userInfo.email}</p>
                <p><strong>Service :</strong> {userInfo.service}</p>
                <button onClick={() => setShowPasswordForm(!showPasswordForm)}>Modifier le mot de passe</button>
                {showPasswordForm && (
                  <div>
                    <input type={passwordVisible ? "text" : "password"} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Ancien mot de passe" />
                    <input type={passwordVisible ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nouveau mot de passe" />
                    <input type={passwordVisible ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirmer" />
                    <input type="checkbox" onChange={handlePasswordVisibilityToggle}/> Afficher
                    <button onClick={handlePasswordChange}>Confirmer</button>
                    <button onClick={handleResetForm}>Annuler</button>
                  </div>
                )}
              </div>
            ) : <p>Chargement...</p>}
          </div>
        )}
        {showHistorique && (
          <div>
            <h2>Historique</h2>
            <table>
              <thead><tr><th>Fichier</th><th>Action</th><th>Date</th><th>Supprimer</th></tr></thead>
              <tbody>
                {historique.map(m => (
                  <tr key={m.id}>
                    <td>{m.fichier}</td>
                    <td>{m.action}</td>
                    <td>{m.date}</td>
                    <td><button onClick={() => handleDeleteHistorique(m.id)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardResponsable;
