// src/pages/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, getUser } from "../services/authService";
import "../styles/Login.css";
import logo from "../assets/dmt.png";

// Ajout des 4 images de fond
import bg1 from "../assets/PARC_1.jpg";
import bg2 from "../assets/PARC_2.jpg";
import bg3 from "../assets/PARC_3.jpg";
import bg6 from "../assets/PARC_6.jpg";
import bg4 from "../assets/PARC_4.jpg";


function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      const user = await getUser();

      if (user.role === "super_admin") {
        navigate("/super-admin");
      } else if (user.role === "admin") {
        navigate("/admin");
      } else if (user.role === "responsable") {
        navigate("/dashboard-responsable");
      } else {
        navigate("/dashboard");
      }
    } catch (e) {
      const status = e.response?.status;
      const message = e.response?.data?.error || 'Erreur de connexion.';
      if (status === 403) {
        setError('🚫 ' + message);
      } else {
        setError('⚠️ ' + message);
      }
    } finally {
      setLoading(false);
    }
  };

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100); // attend 100ms pour laisser le fond se charger
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="login-page">
      {/*Slideshow en arrière-plan */}
      <div className="login-bg-slideshow">
        <img src={bg1} alt="Fond 1" />
        <img src={bg2} alt="Fond 2" />
        <img src={bg3} alt="Fond 3" />
        <img src={bg6} alt="Fond 6" />
        <img src={bg4} alt="Fond 4" />
        
      </div>

      {/*Contenu centré */}
      <div className={`login-container ${visible ? "fade-in" : "hidden"}`}>
        {/* Logo */}
        <img src={logo} alt="Logo de l'entreprise" className="company-logo" />

        {/* Message de bienvenue */}
        <div className="welcome-message">
          <div className="product-brand" style={{width:'100%', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center'}}>
            <h1 className="product-name" style={{textAlign:'center', width:'100%', margin:0}}>DocFlow <span className="product-pro">Pro</span></h1>
            <p className="product-by" style={{textAlign:'center', width:'100%', margin:'2px 0 12px'}}>by DMT GENICI GROUPE</p>
          </div>
          <p className="product-tagline">
            Gérez, partagez et sécurisez vos documents d'entreprise en toute sérénité
          </p>
          <div className="product-features">
            <div className="feature-item">
              <span className="feature-icon">🔒</span>
              <span>Sécurité enterprise</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">📂</span>
              <span>Collaboration fluide</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <span>Multi-rôles intelligent</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && <div className="alert error">{error}</div>}
        {loading && <div className="alert loading">⏳ Chargement en cours...</div>}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="login-form slide-up">
          {/* Username */}
          <div className="input-group">
            <input
              type="text"
              placeholder="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <span className="input-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5.121 17.804A9 9 0 1118.364 4.56M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </span>
          </div>

          {/* Password */}
          <div className="input-group">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="input-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zM2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </span>

            {/* Bouton affichage mot de passe */}
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              <span className={`eye-icon ${showPassword ? "hide" : "show"}`}>
                {showPassword ? "🙈" : "👁️"}
              </span>
            </button>
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading} className="login-btn">
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
