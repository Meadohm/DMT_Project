// src/services/passwordService.js
import axios from "axios";
import API_BASE_URL from "../config";

// Fonction pour mettre à jour le mot de passe de l'utilisateur
export const updatePassword = async (oldPassword, newPassword) => {
  const token = localStorage.getItem("token");

  try {
    const response = await axios.post(
      `${API_BASE_URL}/update_password/`,
      {
        old_password: oldPassword,
        new_password: newPassword,
      },
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(
        error.response.data.error ||
          "Erreur lors de la mise à jour du mot de passe."
      );
    }
    throw new Error("Une erreur inattendue est survenue.");
  }
};
