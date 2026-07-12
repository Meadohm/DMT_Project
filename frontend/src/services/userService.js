// src/services/userService.js
import axios from "axios";
import API_BASE_URL from "../config";
import { getToken } from "./authService";

/**
 * ============================
 * Informations utilisateur
 * ============================
 */

/**
 * Récupère les infos de l'utilisateur connecté (profil complet)
 * Appelle la vue Django : GET /api/user/
 */
export const getUserInfo = async () => {
  const token = getToken();
  try {
    const res = await axios.get(`${API_BASE_URL}/user/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data; // { id, username, email, role, service, avatar }
  } catch (error) {
    console.error("Erreur getUserInfo:", error);
    throw error;
  }
};

/**
 * ============================
 * Gestion du partage
 * ============================
 */

/**
 * Récupère la liste des utilisateurs disponibles pour le partage
 * (à l’exception de l’utilisateur connecté)
 * Appelle : GET /api/users/
 */
export const listUsersForSharing = async () => {
  const token = getToken();
  try {
    const res = await axios.get(`${API_BASE_URL}/users/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data; // format [{ id, username, role, service, avatar }]
  } catch (error) {
    console.error("Erreur récupération utilisateurs :", error);
    throw error;
  }
};

/**
 * ============================
 * Mise à jour du profil
 * ============================
 */

/**
 * Met à jour le profil utilisateur (nom, email, service)
 * Appelle : PUT /api/user/update/
 */
export const updateProfile = async (formData) => {
  const token = getToken();
  try {
    const res = await axios.put(`${API_BASE_URL}/user/update/`, formData, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("Erreur mise à jour profil :", error);
    throw error;
  }
};

/**
 * Met à jour le mot de passe de l’utilisateur
 * Appelle : POST /api/update-password/
 */
export const updatePassword = async (oldPassword, newPassword) => {
  const token = getToken();
  try {
    const res = await axios.post(
      `${API_BASE_URL}/update-password/`,
      { old_password: oldPassword, new_password: newPassword },
      {
        headers: { Authorization: `Token ${token}` },
      }
    );
    return res.data; // { success: "...", token: "new_token" }
  } catch (error) {
    console.error("Erreur mise à jour mot de passe :", error);
    throw error;
  }
};

/**
 * Supprime définitivement le compte utilisateur
 * Appelle : DELETE /api/user/delete/
 */
export const deleteAccount = async () => {
  const token = getToken();
  try {
    const res = await axios.delete(`${API_BASE_URL}/user/delete/`, {
      headers: { Authorization: `Token ${token}` },
    });
    return res.data;
  } catch (error) {
    console.error("Erreur suppression compte :", error);
    throw error;
  }
};
