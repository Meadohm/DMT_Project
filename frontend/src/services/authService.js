// src/services/AuthService.js
import API_BASE_URL from "../config"; //centralisation API

// Fonction pour se connecter
export const login = async (username, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("Token reçu:", data.token); // Log du token reçu
      localStorage.setItem("token", data.token); // Stocke le token dans le localStorage
      return data;
    } else {
      const errorData = await response.json();
      throw new Error(errorData.message || "Échec de la connexion");
    }
  } catch (error) {
    console.error("Erreur dans le service d'authentification:", error.message);
    throw error;
  }
};

// Fonction pour récupérer les infos utilisateur
export const getUser = async () => {
  const token = getToken(); // Utilise getToken pour récupérer le token
  console.log("Token utilisé pour la requête utilisateur:", token); // Log du token utilisé

  if (token) {
    try {
      const response = await fetch(`${API_BASE_URL}/user/`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`, // Ajoute le token dans les headers
        },
      });

      if (response.ok) {
        const user = await response.json();
        return user;
      } else if (response.status === 401) {
        throw new Error("Non autorisé. Token invalide ou expiré.");
      } else {
        const errorData = await response.json();
        throw new Error(
          errorData.message ||
            "Impossible de récupérer les informations utilisateur"
        );
      }
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des infos utilisateur:",
        error.message
      );
      throw error;
    }
  } else {
    throw new Error("Aucun token trouvé, veuillez vous reconnecter.");
  }
};

// Fonction pour récupérer le token (ajoutée pour centralisation)
export const getToken = () => localStorage.getItem("token"); //Récupère le token depuis le localStorage

export const checkTokenValidity = async () => {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/user/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
};
